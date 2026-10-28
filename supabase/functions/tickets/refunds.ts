// Возврат денег: база готовит строки возврата по каждому платежу, банк
// возвращает деньги, после этого база аннулирует билеты (refund_prepare →
// acquiring.refund → refund_apply). Если банк отказал, ничего не аннулируется:
// можно повторить или отметить, что деньги вернули вручную в кабинете банка.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { acquiring } from "./acquiring.ts";
import { button, esc, letter, money, sendMail, SITE } from "./mail.ts";

export type RefundInput = {
  orderId: string;
  ticketIds?: string[];
  reason: string;
  requestId?: string | null;
  /** Деньги уже вернули в кабинете банка: банк не вызываем. */
  manual?: boolean;
  /** Вернуть, даже если по билетам уже прошли вход. */
  force?: boolean;
};

type RefundRow = { id: string; order_id: string; amount: number; provider_payment_id: string | null; status: string };

export class RefundError extends Error {
  constructor(message: string, public hint?: string) {
    super(message);
  }
}

/** Проводит возвраты пачки через банк, затем отмечает билеты. */
async function settleBatch(db: SupabaseClient, batchId: string, manual: boolean) {
  const { data } = await db.from("refunds").select("id, order_id, amount, provider_payment_id, status").eq("batch_id", batchId).order("created_at");
  const rows = (data ?? []) as RefundRow[];
  const errors: string[] = [];
  for (const r of rows) {
    if (r.status === "succeeded" || r.status === "manual" || r.status === "applied") continue;
    if (manual) {
      await db.from("refunds").update({ status: "manual", error: null }).eq("id", r.id);
      continue;
    }
    if (!r.provider_payment_id || !acquiring.isConfigured()) {
      await db.from("refunds").update({ status: "failed", error: "Нет платежа в банке для автоматического возврата" }).eq("id", r.id);
      errors.push(`${money(Number(r.amount), "KZT")}: нет платежа в банке`);
      continue;
    }
    const res = await acquiring.refund(r.provider_payment_id, Number(r.amount)).catch((e) => ({ ok: false, raw: "", error: String(e) }));
    await db.from("refunds").update({ status: res.ok ? "succeeded" : "failed", bank_raw: res.raw, error: res.ok ? null : res.error }).eq("id", r.id);
    if (!res.ok) errors.push(`${money(Number(r.amount), "KZT")}: ${res.error}`);
  }
  if (errors.length) {
    throw new RefundError(`Банк не вернул деньги (${errors.join("; ")}). Повторите или отметьте возврат вручную.`, `batch:${batchId}`);
  }
  const { data: applied, error } = await db.rpc("refund_apply", { p_batch: batchId });
  if (error) throw new RefundError(`Деньги вернулись, но отметка в базе не записалась: ${error.message}. Нажмите «Повторить».`, `batch:${batchId}`);
  return applied as { voided: number };
}

/** Новый возврат по заказу. */
export async function refund(db: SupabaseClient, actorId: string, input: RefundInput) {
  const { data: prep, error } = await db.rpc("refund_prepare", {
    p_actor: actorId,
    p_order: input.orderId,
    p_ticket_ids: input.ticketIds?.length ? input.ticketIds : null,
    p_reason: input.reason,
    p_request: input.requestId ?? null,
    p_force: Boolean(input.force),
  });
  if (error) throw new RefundError(error.message, (error as { hint?: string }).hint);
  const batchId = (prep as { batch_id: string }).batch_id;
  try {
    const result = await settleBatch(db, batchId, Boolean(input.manual));
    await emailRefund(db, batchId).catch((e) => console.error("refund email", e));
    return { batchId, ...result };
  } catch (e) {
    // Неудачные строки закрываем, чтобы по заказу можно было начать заново.
    if (e instanceof RefundError) {
      const { data: rows } = await db.from("refunds").select("status").eq("batch_id", batchId);
      const anyMoneyBack = (rows ?? []).some((r) => r.status === "succeeded" || r.status === "manual");
      if (!anyMoneyBack) await db.from("refunds").update({ status: "failed" }).eq("batch_id", batchId).eq("status", "pending");
    }
    throw e;
  }
}

/** Повтор незавершённой пачки: банк ещё раз (только где не вернул) или «вернули вручную». */
export async function retryRefund(db: SupabaseClient, batchId: string, manual: boolean) {
  const { data: rows } = await db.from("refunds").select("status").eq("batch_id", batchId);
  if (!rows?.length) throw new RefundError("Возврат не найден");
  if (rows.every((r) => r.status === "applied")) return { batchId, voided: 0 };
  await db.from("refunds").update({ status: "pending", error: null }).eq("batch_id", batchId).eq("status", "failed");
  const result = await settleBatch(db, batchId, manual);
  await emailRefund(db, batchId).catch((e) => console.error("refund email", e));
  return { batchId, ...result };
}

/** Письмо покупателю: возврат оформлен. */
async function emailRefund(db: SupabaseClient, batchId: string) {
  const { data: rows } = await db.from("refunds").select("order_id, amount, reason").eq("batch_id", batchId);
  if (!rows?.length) return;
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const { data: o } = await db
    .from("orders")
    .select("id, number, parent_order_id, buyer_name, buyer_email, currency, event_id, event:events(slug, translations:event_translations(locale, title))")
    .eq("id", rows[0].order_id)
    .single();
  if (!o) return;
  const ev = o.event as unknown as { slug: string; translations: { locale: string; title: string }[] } | null;
  const title = ev?.translations.find((t) => t.locale === "ru")?.title ?? ev?.slug ?? "";
  const html = letter({
    eyebrow: "Возврат оформлен",
    title,
    body: `<p style="margin:0 0 12px">Здравствуйте, ${esc(o.buyer_name)}! Мы оформили возврат по заказу № ${o.number}.</p>
<p style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0d0d0d">${money(total, o.currency)}</p>
<p style="margin:0 0 12px">Деньги вернутся на карту, с которой была оплата. Обычно это занимает от 1 до 10 рабочих дней, срок зависит от вашего банка. Возвращённые билеты больше не действуют.</p>
${button(`${SITE()}/ru/account`, "Мои заказы", true)}`,
  });
  await sendMail(db, { to: o.buyer_email, subject: `Возврат по заказу № ${o.number}: ${title}`, html, kind: "refund", orderId: o.id, eventId: o.event_id });
}
