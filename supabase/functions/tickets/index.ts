// Сервер продаж билетов: Freedom Ticketon + банк-эквайер.
// Ключи читаются из секретов функции и никогда не попадают в браузер.
import { createClient } from "npm:@supabase/supabase-js@2";

import { acquiring } from "./acquiring.ts";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  // /functions/v1/tickets/<route>
  const route = url.pathname.replace(/^.*\/tickets/, "") || "/";

  try {
    // Уведомление FreedomPay проверяем первым: у него своя подпись и ответ в XML.
    if (req.method === "POST" && route === "/payments/callback") {
      const xml = (body: string) => new Response(body, { headers: { "content-type": "application/xml" } });
      const result = await acquiring.handleCallback(req);
      if (!result) return xml(await acquiring.callbackResponse("error", "bad signature"));
      const supabase = db();
      const { data: order } = await supabase.from("orders").select("id, status, total").eq("id", result.orderId).single();
      if (!order) return xml(await acquiring.callbackResponse("error", "order not found"));
      await supabase
        .from("payments")
        .update({ status: result.succeeded ? "succeeded" : "failed", raw: result.raw })
        .eq("provider", acquiring.name())
        .eq("provider_payment_id", result.paymentId);
      // Повторное уведомление по уже оплаченному заказу ничего не меняет.
      if (order.status !== "paid") {
        if (result.succeeded && Number(result.raw.pg_amount) + 0.001 < Number(order.total)) {
          return xml(await acquiring.callbackResponse("error", "amount mismatch"));
        }
        await supabase.from("orders").update({ status: result.succeeded ? "paid" : "failed" }).eq("id", order.id);
        if (result.succeeded) {
          if (ticketon.isConfigured()) await ticketon.confirmOrder(order.id);
          else await local.confirmOrder(supabase, order.id);
        }
      }
      return xml(await acquiring.callbackResponse("ok", "Order accepted"));
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
      const reservation = useTicketon ? await ticketon.reserve(draft) : await local.reserve(supabase, draft);
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          event_id: draft.eventId,
          buyer_name: draft.buyer.name,
          buyer_phone: draft.buyer.phone,
          buyer_email: draft.buyer.email,
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
      const { data: order } = await db()
        .from("orders")
        .select("id, status, total, service_fee, currency, expires_at")
        .eq("id", orderMatch[1])
        .single();
      if (!order) return json({ error: "not_found" }, 404);
      return json({
        id: order.id,
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
