// Сервер продаж билетов: Freedom Ticketon + банк-эквайер.
// Ключи читаются из секретов функции и никогда не попадают в браузер.
import { createClient } from "npm:@supabase/supabase-js@2";

import { acquiring } from "./acquiring.ts";
import { emailTickets, qrGif, ticketByCode } from "./delivery.ts";
import { ChangeError, changeEvent, resendChangeMail } from "./event-change.ts";
import { local, SaleError, takenSeats } from "./local.ts";
import { button, esc, letter, sendMail, SITE } from "./mail.ts";
import { refund, RefundError, retryRefund } from "./refunds.ts";
import { ticketon } from "./ticketon.ts";
import { createUpgradeOrder, upgradeOptions } from "./upgrades.ts";

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

type Staff = { id: string; email: string; name: string; permissions: string[] };

/** Сотрудник по токену входа: активный, не тикетор. */
async function staffFrom(req: Request, supabase: ReturnType<typeof db>): Promise<Staff | null> {
  const user = await userFrom(req, supabase);
  if (!user) return null;
  const { data } = await supabase
    .from("admins")
    .select("position, permissions, is_active, full_name, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || !data.is_active || data.position === "scanner") return null;
  return { id: user.id, email: user.email ?? data.email ?? "", name: data.full_name || data.email || user.email || "", permissions: data.permissions ?? [] };
}

const can = (s: Staff | null, ...perms: string[]) => Boolean(s && perms.some((p) => s.permissions.includes(p)));

/** Повтор неудачных писем: 5 минут и час после ошибки. Ничего не отправляет повторно, если письмо ушло. */
async function retryMail(supabase: ReturnType<typeof db>) {
  const { data: rows } = await supabase
    .from("email_log")
    .select("id, kind, order_id, mailing_id, attempts")
    .eq("status", "failed")
    .not("next_try_at", "is", null)
    .lte("next_try_at", new Date().toISOString())
    .limit(30);
  let sent = 0;
  for (const r of rows ?? []) {
    // Сначала снимаем строку из очереди: два одновременных запуска не отправят письмо дважды.
    const { data: taken } = await supabase.from("email_log").update({ next_try_at: null }).eq("id", r.id).not("next_try_at", "is", null).select("id");
    if (!taken?.length) continue;
    let ok = false;
    if ((r.kind === "tickets" || r.kind === "upgrade") && r.order_id) {
      // emailTickets пишет новую строку журнала; старую закрываем как повторённую.
      ok = await emailTickets(supabase, r.order_id);
      await supabase.from("email_log").update({ error: ok ? "Отправлено повторно" : "Повтор не удался" }).eq("id", r.id);
    } else if (r.kind === "event_change" && r.mailing_id && r.order_id) {
      ok = await resendChangeMail(supabase, r.mailing_id, r.order_id, r.id, r.attempts + 1);
    }
    if (ok) sent++;
  }
  return { checked: rows?.length ?? 0, sent };
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

type RefundTicket = { id: string; code: string; category: string; seat: string | null; status: string; paid: number };

/** Можно ли подать заявку на возврат по заказу: только после переноса или отмены события. */
async function refundInfo(supabase: ReturnType<typeof db>, userId: string, orderId: string) {
  const empty = { canRequest: false, reason: "not_found", order: null, event: null, tickets: [] as RefundTicket[], request: null };
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return empty;
  const { data: o } = await supabase
    .from("orders")
    .select("id, number, status, kind, user_id, currency, total, refunded_amount, event:events(id, slug, starts_at, change_kind, original_starts_at, changed_at, poster_url, venue:venues(name, city, timezone), translations:event_translations(locale, title))")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.user_id !== userId || o.kind !== "sale") return empty;
  const e = o.event as unknown as {
    id: string; slug: string; starts_at: string; change_kind: string | null; original_starts_at: string | null; poster_url: string | null;
    venue: { name: string; city: string; timezone: string } | null; translations: { locale: string; title: string }[];
  };
  const { data: list } = await supabase.rpc("order_current_tickets", { p_order: o.id });
  const tickets: RefundTicket[] = ((list ?? []) as { ticket_id: string; code: string; category_name: string; seat_label: string | null; status: string; paid: number }[])
    .map((t) => ({ id: t.ticket_id, code: t.code, category: t.category_name, seat: t.seat_label, status: t.status, paid: Number(t.paid) }));
  const { data: request } = await supabase
    .from("refund_requests")
    .select("id, status, amount, created_at, decision_note")
    .eq("order_id", o.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const event = {
    id: e.id,
    slug: e.slug,
    title: e.translations.find((t) => t.locale === "ru")?.title ?? e.slug,
    startsAt: e.starts_at,
    originalStartsAt: e.original_starts_at,
    changeKind: e.change_kind,
    posterUrl: e.poster_url,
    venue: e.venue?.name ?? null,
    city: e.venue?.city ?? null,
    timezone: e.venue?.timezone ?? "Asia/Almaty",
  };
  const order = { id: o.id, number: o.number, status: o.status, currency: o.currency };
  const usable = tickets.filter((t) => t.status === "valid");
  let reason: string | null = null;
  if (!e.change_kind) reason = "event_not_changed";
  else if (e.change_kind === "postponed" && Date.parse(e.starts_at) <= Date.now()) reason = "deadline_passed";
  else if (o.status !== "paid" || !usable.length) reason = "nothing_to_refund";
  else if (request?.status === "new") reason = "request_exists";
  return { canRequest: !reason, reason, order, event, tickets: usable, request };
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

    // Повтор неудачных писем. Безопасно вызывать кому угодно: отправляются только ещё не ушедшие.
    if (req.method === "POST" && route === "/mail/retry") {
      return json(await retryMail(db()));
    }

    /* ---------- личный кабинет ---------- */

    // Варианты апгрейда для выбранных билетов.
    if (req.method === "GET" && route === "/me/upgrade-options") {
      const supabase = db();
      const user = await userFrom(req, supabase);
      if (!user) return json({ error: "login_required" }, 401);
      const ids = (url.searchParams.get("tickets") ?? "").split(",").filter(Boolean);
      const { options, until } = await upgradeOptions(supabase, user.id, ids);
      return json({ options, until });
    }

    // Заказ-доплата за апгрейд и ссылка на оплату.
    if (req.method === "POST" && route === "/me/upgrades") {
      if (!acquiring.isConfigured()) return json({ error: "sales_not_configured" }, 503);
      const supabase = db();
      const user = await userFrom(req, supabase);
      if (!user?.email) return json({ error: "login_required" }, 401);
      const { ticketIds, target, returnUrl } = await req.json();
      if (!Array.isArray(ticketIds) || typeof target !== "string") return json({ error: "bad_request" }, 400);
      const order = await createUpgradeOrder(supabase, { id: user.id, email: user.email }, ticketIds.map(String), target);
      // Номер заказа доплаты известен только здесь: {order} в адресе возврата заменяем на него.
      const back = typeof returnUrl === "string" ? returnUrl.replace("{order}", order.id) : returnUrl;
      return json({ orderId: order.id, paymentUrl: await startPayment(supabase, order, back) });
    }

    // Данные для страницы заявки на возврат.
    if (req.method === "GET" && route === "/me/refund-info") {
      const supabase = db();
      const user = await userFrom(req, supabase);
      if (!user) return json({ error: "login_required" }, 401);
      return json(await refundInfo(supabase, user.id, url.searchParams.get("order") ?? ""));
    }

    // Заявка покупателя на возврат после переноса или отмены.
    if (req.method === "POST" && route === "/me/refund-requests") {
      const supabase = db();
      const user = await userFrom(req, supabase);
      if (!user) return json({ error: "login_required" }, 401);
      const { orderId, ticketIds, reason } = await req.json();
      const info = await refundInfo(supabase, user.id, String(orderId ?? ""));
      if (!info.canRequest) return json({ error: info.reason ?? "refund_unavailable" }, 409);
      const ids = Array.isArray(ticketIds) && ticketIds.length ? ticketIds.map(String) : info.tickets.map((t) => t.id);
      const chosen = info.tickets.filter((t) => ids.includes(t.id));
      if (!chosen.length || chosen.length !== ids.length) return json({ error: "bad_tickets" }, 400);
      // Стол возвращается целиком.
      const tables = new Set(chosen.map((t) => t.seat?.match(/^table-(\d+)/)?.[1]).filter(Boolean));
      if (info.tickets.some((t) => tables.has(t.seat?.match(/^table-(\d+)/)?.[1]) && !ids.includes(t.id))) {
        return json({ error: "whole_table" }, 400);
      }
      const { data: created, error } = await supabase
        .from("refund_requests")
        .insert({
          order_id: info.order!.id,
          user_id: user.id,
          event_id: info.event!.id,
          ticket_ids: chosen.map((t) => t.id),
          amount: chosen.reduce((s, t) => s + t.paid, 0),
          kind: info.event!.changeKind,
          reason: String(reason ?? "").trim().slice(0, 500) || null,
        })
        .select("id")
        .single();
      if (error) return json({ error: /refund_requests_one_open/.test(error.message) ? "request_exists" : "internal" }, 409);
      return json({ id: created.id });
    }

    /* ---------- админка ---------- */

    if (route.startsWith("/admin/")) {
      const supabase = db();
      const staff = await staffFrom(req, supabase);
      if (!staff) return json({ error: "Нет доступа" }, 403);
      const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

      // Отправить билеты заказа повторно.
      const resendMatch = route.match(/^\/admin\/orders\/([0-9a-f-]{36})\/resend$/);
      if (req.method === "POST" && resendMatch) {
        if (!can(staff, "orders")) return json({ error: "Нет права на заказы" }, 403);
        const sent = await emailTickets(supabase, resendMatch[1]);
        return sent ? json({ sent }) : json({ error: "Письмо не отправилось. Подробности в журнале писем заказа" }, 502);
      }

      // Действующие билеты заказа с учётом апгрейдов (для выбора при возврате).
      const ticketsMatch = route.match(/^\/admin\/orders\/([0-9a-f-]{36})\/tickets$/);
      if (req.method === "POST" && ticketsMatch) {
        if (!can(staff, "orders", "refunds", "finance")) return json({ error: "Нет права на заказы" }, 403);
        const { data, error } = await supabase.rpc("order_current_tickets", { p_order: ticketsMatch[1] });
        if (error) throw error;
        return json({ tickets: data ?? [] });
      }

      // Перенос или отмена события с рассылкой.
      const changeMatch = route.match(/^\/admin\/events\/([0-9a-f-]{36})\/change$/);
      if (req.method === "POST" && changeMatch) {
        const kind = body.kind === "cancelled" ? "cancelled" : "postponed";
        if (!can(staff, kind === "cancelled" ? "events.cancel" : "events.postpone")) {
          return json({ error: kind === "cancelled" ? "Отменить событие может владелец или тех. специалист" : "Нет права переносить события" }, 403);
        }
        try {
          return json(await changeEvent(supabase, staff, {
            eventId: changeMatch[1], kind, startsAt: body.startsAt, doorsAt: body.doorsAt, message: body.message, test: Boolean(body.test),
          }));
        } catch (e) {
          if (e instanceof ChangeError) return json({ error: e.message }, 400);
          throw e;
        }
      }

      // Возврат: через банк или отметка ручного возврата.
      if (req.method === "POST" && route === "/admin/refunds") {
        if (!can(staff, "refunds")) return json({ error: "Нет права оформлять возвраты" }, 403);
        try {
          return json(await refund(supabase, staff.id, {
            orderId: String(body.orderId ?? ""),
            ticketIds: Array.isArray(body.ticketIds) ? body.ticketIds.map(String) : [],
            reason: String(body.reason ?? ""),
            requestId: body.requestId ? String(body.requestId) : null,
            manual: Boolean(body.manual),
            force: Boolean(body.force),
          }));
        } catch (e) {
          if (e instanceof RefundError) return json({ error: e.message, hint: e.hint }, 409);
          throw e;
        }
      }
      const retryRefundMatch = route.match(/^\/admin\/refunds\/([0-9a-f-]{36})\/retry$/);
      if (req.method === "POST" && retryRefundMatch) {
        if (!can(staff, "refunds")) return json({ error: "Нет права оформлять возвраты" }, 403);
        try {
          return json(await retryRefund(supabase, retryRefundMatch[1], Boolean(body.manual)));
        } catch (e) {
          if (e instanceof RefundError) return json({ error: e.message, hint: e.hint }, 409);
          throw e;
        }
      }

      // Отклонить заявку на возврат (с объяснением в письме не уведомляем: сотрудник связывается сам).
      const rejectMatch = route.match(/^\/admin\/refund-requests\/([0-9a-f-]{36})\/reject$/);
      if (req.method === "POST" && rejectMatch) {
        if (!can(staff, "refunds")) return json({ error: "Нет права оформлять возвраты" }, 403);
        const note = String(body.note ?? "").trim().slice(0, 500);
        if (!note) return json({ error: "Укажите причину отказа" }, 400);
        const { data } = await supabase
          .from("refund_requests")
          .update({ status: "rejected", decided_by: staff.id, decided_by_name: staff.name, decided_at: new Date().toISOString(), decision_note: note })
          .eq("id", rejectMatch[1])
          .eq("status", "new")
          .select("id");
        return data?.length ? json({ ok: true }) : json({ error: "Заявка уже рассмотрена" }, 409);
      }

      // Письмо подтверждающим о новом запросе на удаление события.
      const notifyMatch = route.match(/^\/admin\/deletion-requests\/([0-9a-f-]{36})\/notify$/);
      if (req.method === "POST" && notifyMatch) {
        const { data: q } = await supabase
          .from("event_deletion_requests")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", notifyMatch[1])
          .eq("requested_by", staff.id)
          .eq("status", "pending")
          .is("notified_at", null)
          .select("id, reason, requested_by_name, event:events(slug, starts_at, translations:event_translations(locale, title))")
          .maybeSingle();
        if (!q) return json({ sent: 0 });
        const { data: confirmers } = await supabase
          .from("admins")
          .select("user_id, email, full_name")
          .eq("is_active", true)
          .contains("permissions", ["events.delete_confirm"])
          .neq("user_id", staff.id);
        const ev = q.event as unknown as { slug: string; translations: { locale: string; title: string }[] } | null;
        const title = ev?.translations.find((t) => t.locale === "ru")?.title ?? ev?.slug ?? "";
        let sent = 0;
        for (const c of confirmers ?? []) {
          if (!c.email) continue;
          const html = letter({
            eyebrow: "Нужно ваше подтверждение",
            title,
            body: `<p style="margin:0 0 12px">${esc(q.requested_by_name ?? "Сотрудник")} просит удалить событие, по которому были продажи.</p>
<p style="margin:0 0 12px;padding:12px 14px;background:#f4f4f4;border-radius:10px">Причина: ${esc(q.reason)}</p>
<p style="margin:0 0 12px">Событие уйдёт в архив и пропадёт с сайта, данные о продажах останутся. Запрос действует 48 часов.</p>
${button(`${SITE()}/admin/approvals`, "Открыть в админке")}`,
          });
          if (await sendMail(supabase, { to: c.email, subject: `Подтвердите удаление: ${title}`, html, kind: "deletion_request", refId: q.id })) sent++;
        }
        return json({ sent });
      }

      return json({ error: "not_found" }, 404);
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
      // Оплату начинает только владелец заказа.
      const user = await userFrom(req, supabase);
      if (!user) return json({ error: "login_required" }, 401);
      const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (order && order.user_id && order.user_id !== user.id) return json({ error: "not_found" }, 404);
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
        // Доплату за апгрейд не переоформляем: цена зависит от билета, проще начать заново.
        if (useTicketon || order.kind === "upgrade") return json({ error: "order_not_payable" }, 409);
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
