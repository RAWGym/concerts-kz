// Сервер продаж билетов: Freedom Ticketon + банк-эквайер.
// Ключи читаются из секретов функции и никогда не попадают в браузер.
import { createClient } from "npm:@supabase/supabase-js@2";

import { acquiring } from "./acquiring.ts";
import { emailTickets, qrGif, ticketByCode } from "./delivery.ts";
import { local, SaleError, takenSeats } from "./local.ts";
import { ticketon } from "./ticketon.ts";

const cors = {
  "access-control-allow-origin": Deno.env.get("SITE_URL") ?? "https://concerts.kz",
  "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const db = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type OrderRow = { id: string; status: string; total: number | string };

/** Записывает результат оплаты и после успеха выдаёт билеты. Повтор ничего не меняет. */
async function settle(
  supabase: ReturnType<typeof db>,
  order: OrderRow,
  paymentId: string,
  succeeded: boolean,
  raw: Record<string, string>,
) {
  await supabase
    .from("payments")
    .update({ status: succeeded ? "succeeded" : "failed", raw })
    .eq("provider", acquiring.name())
    .eq("provider_payment_id", paymentId);
  if (order.status === "paid") return "ok";
  if (succeeded && Number(raw.pg_amount) + 0.001 < Number(order.total)) return "amount_mismatch";
  // Меняем только ожидающий заказ: два одновременных запроса не выдадут билеты дважды.
  const { data: changed } = await supabase
    .from("orders")
    .update({ status: succeeded ? "paid" : "failed" })
    .eq("id", order.id)
    .in("status", ["pending", "failed"])
    .select("id");
  if (succeeded && changed?.length) {
    if (ticketon.isConfigured()) await ticketon.confirmOrder(order.id);
    else await local.confirmOrder(supabase, order.id);
    await emailTickets(supabase, order.id).catch((e) => console.error("tickets email", e));
  }
  return "ok";
}

/** Пользователь по токену входа из заголовка Authorization. */
async function userFrom(req: Request, supabase: ReturnType<typeof db>) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data?.user ?? null;
}

/** Спрашивает у FreedomPay статус последнего платежа заказа и проводит его. */
async function refreshPending(supabase: ReturnType<typeof db>, order: OrderRow) {
  if (order.status !== "pending") return;
  const { data: pay } = await supabase
    .from("payments")
    .select("provider_payment_id")
    .eq("order_id", order.id)
    .eq("provider", acquiring.name())
    .not("provider_payment_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pay?.provider_payment_id) return;
  const st = await acquiring.getStatus(pay.provider_payment_id).catch((e) => (console.error(e), null));
  if (st && (st.succeeded || st.failed)) await settle(supabase, order, pay.provider_payment_id, st.succeeded, st.raw);
}

/** Создаёт платёж FreedomPay и возвращает ссылку на страницу оплаты. */
async function startPayment(
  supabase: ReturnType<typeof db>,
  order: { id: string; number: number; total: number | string; currency: string; buyer_email: string; buyer_phone: string },
  returnUrl: unknown,
) {
  // Номер для банка уникален на каждую попытку: банк не принимает один и тот же дважды.
  const { count } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("order_id", order.id);
  const site = Deno.env.get("SITE_URL") ?? "https://concerts.kz";
  const payment = await acquiring.createPayment({
    orderId: order.id,
    orderNumber: count ? `${order.number}-${count + 1}` : String(order.number),
    amount: Number(order.total),
    currency: order.currency,
    description: `Билеты, заказ ${order.number}`,
    email: order.buyer_email,
    phone: order.buyer_phone,
    returnUrl:
      typeof returnUrl === "string" && /^https:\/\/(www\.)?concerts\.kz\//.test(returnUrl)
        ? returnUrl
        : `${site}/ru/orders/${order.id}`,
  });
  await supabase.from("payments").insert({
    order_id: order.id,
    provider: acquiring.name(),
    provider_payment_id: payment.paymentId,
    amount: order.total,
    currency: order.currency,
  });
  return payment.paymentUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  // /functions/v1/tickets/<route>
  const route = url.pathname.replace(/^(\/functions\/v1)?\/tickets(?=\/|$)/, "") || "/";

  try {
    // Уведомление FreedomPay проверяем первым: у него своя подпись и ответ в XML.
    if (req.method === "POST" && route === "/payments/callback") {
      const xml = (body: string) => new Response(body, { headers: { "content-type": "application/xml" } });
      const result = await acquiring.handleCallback(req);
      if (!result) return xml(await acquiring.callbackResponse("error", "bad signature"));
      const supabase = db();
      const { data: order } = await supabase.from("orders").select("id, status, total").eq("id", result.orderId).maybeSingle();
      if (!order) return xml(await acquiring.callbackResponse("error", "order not found"));
      const outcome = await settle(supabase, order, result.paymentId, result.succeeded, result.raw);
      if (outcome === "amount_mismatch") return xml(await acquiring.callbackResponse("error", "amount mismatch"));
      return xml(await acquiring.callbackResponse("ok", "Order accepted"));
    }

    // Страница билета и QR для письма: код билета и есть пропуск.
    if (req.method === "GET" && route === "/tickets/view") {
      const ticket = await ticketByCode(db(), url.searchParams.get("code") ?? "", url.searchParams.get("locale") ?? undefined);
      return ticket ? json(ticket) : json({ error: "not_found" }, 404);
    }
    if (req.method === "GET" && route === "/tickets/qr") {
      const code = (url.searchParams.get("code") ?? "").toUpperCase();
      if (!/^[0-9A-F]{12}(-\d{1,3})?$/.test(code)) return new Response("bad code", { status: 400 });
      return new Response(qrGif(code), {
        headers: { "content-type": "image/gif", "cache-control": "public, max-age=31536000, immutable" },
      });
    }

    // Заказы, купленные на почту аккаунта до входа, привязываем к нему.
    if (req.method === "POST" && route === "/me/claim") {
      const supabase = db();
      const user = await userFrom(req, supabase);
      if (!user?.email || !user.email_confirmed_at) return json({ error: "login_required" }, 401);
      const { data } = await supabase
        .from("orders")
        .update({ user_id: user.id })
        .is("user_id", null)
        .ilike("buyer_email", user.email.replace(/[\\%_]/g, (c) => `\\${c}`))
        .select("id");
      // Неоплаченные заказы с начатой оплатой: вдруг банк уже провёл платёж.
      const { data: pending } = await supabase
        .from("orders")
        .select("id, status, total")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .gt("created_at", new Date(Date.now() - 3 * 86400_000).toISOString());
      for (const o of pending ?? []) await refreshPending(supabase, o);
      return json({ claimed: data?.length ?? 0 });
    }

    // Повторно отправить билеты заказа на почту владельца.
    if (req.method === "POST" && route === "/me/resend") {
      const supabase = db();
      const user = await userFrom(req, supabase);
      if (!user) return json({ error: "login_required" }, 401);
      const { orderId } = await req.json();
      const { data: order } = await supabase.from("orders").select("id, status").eq("id", orderId).eq("user_id", user.id).maybeSingle();
      if (!order || order.status !== "paid") return json({ error: "not_found" }, 404);
      return json({ sent: await emailTickets(supabase, order.id) });
    }

    // Занятые места за столами для схемы зала: только метки мест, без данных покупателей.
    if (req.method === "GET" && route === "/tickets/seats") {
      const eventId = url.searchParams.get("event") ?? "";
      if (!/^[0-9a-f-]{36}$/.test(eventId)) return json({ error: "event_required" }, 400);
      return json({ taken: await takenSeats(db(), eventId) });
    }

    // Ticketon необязателен: без него продаём по тарифам из админки.
    if (!acquiring.isConfigured()) {
      return json({ error: "sales_not_configured" }, 503);
    }
    const useTicketon = ticketon.isConfigured();

    if (req.method === "GET" && route === "/tickets/categories") {
      const eventId = url.searchParams.get("event");
      if (!eventId) return json({ error: "event_required" }, 400);
      const locale = url.searchParams.get("locale") ?? "ru";
      return json(useTicketon ? await ticketon.getCategories(eventId) : await local.getCategories(db(), eventId, locale));
    }

    if (req.method === "POST" && route === "/orders") {
      const draft = await req.json();
      if (!draft.acceptedTerms) return json({ error: "terms_required" }, 400);
      const supabase = db();
      // Покупка только после входа: билеты потом видны в личном кабинете.
      const user = await userFrom(req, supabase);
      if (!user?.email) return json({ error: "login_required" }, 401);
      // Защита от захвата билетов: не больше 3 неоплаченных броней на человека.
      const { count: holds } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());
      if ((holds ?? 0) >= 3) return json({ error: "too_many_holds" }, 429);
      if (!Array.isArray(draft.items) || draft.items.length > 10) return json({ error: "bad_items" }, 400);
      const reservation = useTicketon ? await ticketon.reserve(draft) : await local.reserve(supabase, draft);
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          event_id: draft.eventId,
          user_id: user.id,
          buyer_name: String(draft.buyer?.name ?? "").slice(0, 120),
          buyer_phone: String(draft.buyer?.phone ?? "").slice(0, 40),
          buyer_email: user.email,
          locale: ["ru", "kz", "en"].includes(draft.locale) ? draft.locale : "ru",
          total: reservation.total,
          service_fee: reservation.serviceFee,
          currency: reservation.currency,
          accepted_terms_at: new Date().toISOString(),
          expires_at: reservation.expiresAt,
          ticketon_order_id: reservation.ticketonOrderId || null,
          ticketon_payload: reservation.raw,
        })
        .select("id, status, total, service_fee, currency, expires_at")
        .single();
      if (error) throw error;
      // База ещё раз проверяет места под блокировкой: два одновременных заказа
      // не получат одно место. Если не вышло, заказ без билетов не оставляем.
      const { error: itemsError } = await supabase.from("order_items").insert(
        reservation.items.map((item) => ({ ...item, order_id: order.id })),
      );
      if (itemsError) {
        await supabase.from("orders").delete().eq("id", order.id);
        if (/seat_taken/.test(itemsError.message)) throw new SaleError("seat_taken");
        throw itemsError;
      }
      return json({
        id: order.id,
        status: order.status,
        total: Number(order.total),
        serviceFee: Number(order.service_fee),
        currency: order.currency,
        expiresAt: order.expires_at,
      });
    }

    const orderMatch = route.match(/^\/orders\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && orderMatch) {
      const supabase = db();
      const select = "id, number, status, total, service_fee, currency, expires_at";
      let { data: order } = await supabase.from("orders").select(select).eq("id", orderMatch[1]).single();
      // Уведомление FreedomPay может задержаться: спрашиваем статус сами.
      if (order && order.status === "pending") {
        await refreshPending(supabase, order);
        ({ data: order } = await supabase.from("orders").select(select).eq("id", order.id).single());
      }
      if (!order) return json({ error: "not_found" }, 404);
      return json({
        id: order.id,
        number: order.number,
        status: order.status,
        total: Number(order.total),
        serviceFee: Number(order.service_fee),
        currency: order.currency,
        expiresAt: order.expires_at,
      });
    }

    if (req.method === "POST" && route === "/payments") {
      const { orderId, returnUrl } = await req.json();
      const supabase = db();
      const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (!order || order.status !== "pending") return json({ error: "order_not_payable" }, 409);
      if (order.expires_at && new Date(order.expires_at) < new Date()) return json({ error: "order_expired" }, 409);
      return json({ paymentUrl: await startPayment(supabase, order, returnUrl) });
    }

    // Повторная оплата заказа владельцем: после отказа банка или истёкшей брони.
    const retryMatch = route.match(/^\/orders\/([0-9a-f-]{36})\/retry$/);
    if (req.method === "POST" && retryMatch) {
      const { returnUrl } = await req.json().catch(() => ({}));
      const supabase = db();
      const user = await userFrom(req, supabase);
      if (!user) return json({ error: "login_required" }, 401);
      const { data: order } = await supabase.from("orders").select("*").eq("id", retryMatch[1]).single();
      if (!order || order.user_id !== user.id) return json({ error: "not_found" }, 404);
      if (order.status === "paid" || order.status === "refunded") return json({ error: "order_not_payable" }, 409);
      // Вдруг прошлая попытка всё же прошла: сначала уточняем у банка.
      if (order.status === "pending") {
        await refreshPending(supabase, order);
        const { data: fresh } = await supabase.from("orders").select("status").eq("id", order.id).single();
        if (fresh?.status === "paid") return json({ error: "already_paid" }, 409);
        order.status = fresh?.status ?? order.status;
      }
      const alive = order.status === "pending" && order.expires_at && new Date(order.expires_at) > new Date();
      if (!alive) {
        if (useTicketon) return json({ error: "order_not_payable" }, 409);
        // Бронь снята: проверяем, что места ещё свободны, и бронируем заново.
        const { data: items } = await supabase.from("order_items").select("category_id, quantity, seat_label").eq("order_id", order.id);
        const byCat = new Map<string, { categoryId: string; quantity: number; seats: string[] }>();
        for (const it of items ?? []) {
          const row = byCat.get(it.category_id) ?? { categoryId: it.category_id, quantity: 0, seats: [] as string[] };
          row.quantity += it.quantity;
          if (it.seat_label) row.seats.push(it.seat_label);
          byCat.set(it.category_id, row);
        }
        const reservation = await local.reserve(supabase, {
          eventId: order.event_id,
          items: [...byCat.values()].map((r) => ({ categoryId: r.categoryId, quantity: r.quantity, ...(r.seats.length ? { seats: r.seats } : {}) })),
        });
        const { data: reopened } = await supabase
          .from("orders")
          .update({ status: "pending", expires_at: reservation.expiresAt })
          .eq("id", order.id)
          .in("status", ["pending", "failed", "expired"])
          .select("*")
          .single();
        if (!reopened) return json({ error: "seat_taken" }, 409);
        Object.assign(order, reopened);
      }
      return json({ paymentUrl: await startPayment(supabase, order, returnUrl) });
    }

    return json({ error: "not_found" }, 404);
  } catch (error) {
    if (error instanceof SaleError) return json({ error: error.message }, 409);
    console.error(error);
    return json({ error: "internal" }, 500);
  }
});
