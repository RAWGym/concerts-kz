// Сервер продаж билетов: Freedom Ticketon + банк-эквайер.
// Ключи читаются из секретов функции и никогда не попадают в браузер.
import { createClient } from "npm:@supabase/supabase-js@2";

import { acquiring } from "./acquiring.ts";
import { emailTickets, qrGif, ticketByCode } from "./delivery.ts";
import { local, SaleError } from "./local.ts";
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
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
      const user = auth?.user;
      if (!user?.email || !user.email_confirmed_at) return json({ error: "login_required" }, 401);
      const { data } = await supabase
        .from("orders")
        .update({ user_id: user.id })
        .is("user_id", null)
        .ilike("buyer_email", user.email.replace(/[\\%_]/g, (c) => `\\${c}`))
        .select("id");
      return json({ claimed: data?.length ?? 0 });
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
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
      const user = auth?.user;
      if (!user?.email) return json({ error: "login_required" }, 401);
      const reservation = useTicketon ? await ticketon.reserve(draft) : await local.reserve(supabase, draft);
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          event_id: draft.eventId,
          user_id: user.id,
          buyer_name: String(draft.buyer?.name ?? "").slice(0, 120),
          buyer_phone: String(draft.buyer?.phone ?? "").slice(0, 40),
          buyer_email: user.email,
          locale: draft.locale,
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
      await supabase.from("order_items").insert(
        reservation.items.map((item) => ({ ...item, order_id: order.id })),
      );
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
        const { data: pay } = await supabase
          .from("payments")
          .select("provider_payment_id")
          .eq("order_id", order.id)
          .eq("provider", acquiring.name())
          .not("provider_payment_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pay?.provider_payment_id) {
          const st = await acquiring.getStatus(pay.provider_payment_id).catch((e) => (console.error(e), null));
          if (st && (st.succeeded || st.failed)) {
            await settle(supabase, order, pay.provider_payment_id, st.succeeded, st.raw);
            ({ data: order } = await supabase.from("orders").select(select).eq("id", order.id).single());
          }
        }
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
      const payment = await acquiring.createPayment({
        orderId,
        orderNumber: String(order.number),
        amount: Number(order.total),
        currency: order.currency,
        description: `Билеты, заказ ${order.number}`,
        email: order.buyer_email,
        phone: order.buyer_phone,
        returnUrl: /^https:\/\/(www\.)?concerts\.kz\//.test(returnUrl) ? returnUrl : `${Deno.env.get("SITE_URL") ?? "https://concerts.kz"}/ru/orders/${orderId}`,
      });
      await supabase.from("payments").insert({
        order_id: orderId,
        provider: acquiring.name(),
        provider_payment_id: payment.paymentId,
        amount: order.total,
        currency: order.currency,
      });
      return json({ paymentUrl: payment.paymentUrl });
    }

    return json({ error: "not_found" }, 404);
  } catch (error) {
    if (error instanceof SaleError) return json({ error: error.message }, 409);
    console.error(error);
    return json({ error: "internal" }, 500);
  }
});
