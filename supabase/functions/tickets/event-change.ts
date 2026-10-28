// Перенос и отмена события: меняет событие и рассылает письма всем покупателям
// со ссылкой на заявку о возврате.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { button, dateTime, esc, letter, type Mail, sendMail, sendMany, SITE } from "./mail.ts";

export type ChangeInput = {
  eventId: string;
  kind: "postponed" | "cancelled";
  /** Новое начало (ISO), только для переноса. */
  startsAt?: string | null;
  doorsAt?: string | null;
  message?: string | null;
  /** Тестовое письмо себе: событие не меняется. */
  test?: boolean;
};

export class ChangeError extends Error {}

type EventRow = {
  id: string;
  slug: string;
  starts_at: string;
  doors_open_at: string | null;
  original_starts_at: string | null;
  change_kind: string | null;
  deleted_at: string | null;
  venue: { name: string; city: string; address: string | null; timezone: string } | null;
  translations: { locale: string; title: string }[];
};

type Buyer = { orderId: string; number: number; name: string; email: string; tickets: number };

function changeMail(e: EventRow, kind: ChangeInput["kind"], b: Buyer, opts: { newStarts?: string | null; newDoors?: string | null; message?: string | null; oldStarts: string }): Omit<Mail, "mailingId"> {
  const tz = e.venue?.timezone ?? "Asia/Almaty";
  const title = e.translations.find((t) => t.locale === "ru")?.title ?? e.slug;
  const place = [e.venue?.name, e.venue?.city].filter(Boolean).join(", ");
  const refundUrl = `${SITE()}/ru/refund?order=${b.orderId}`;
  const note = opts.message?.trim() ? `<p style="margin:0 0 12px;padding:12px 14px;background:#f4f4f4;border-radius:10px">${esc(opts.message.trim())}</p>` : "";
  const order = `заказ № ${b.number}${b.tickets ? `, ${b.tickets} ${plural(b.tickets, "билет", "билета", "билетов")}` : ""}`;
  const law = "по Закону Республики Казахстан «О защите прав потребителей»";
  const body =
    kind === "postponed"
      ? `<p style="margin:0 0 12px">Здравствуйте, ${esc(b.name)}! Концерт, на который у вас есть билеты (${order}), переносится.</p>
<p style="margin:0 0 12px"><span style="color:#999;text-decoration:line-through">${esc(dateTime(opts.oldStarts, tz))}</span><br>
<b style="font-size:18px;color:#0d0d0d">${esc(dateTime(opts.newStarts!, tz))}</b>${opts.newDoors ? `<br><span style="color:#555">вход с ${esc(new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(opts.newDoors)))}</span>` : ""}</p>
${note}
<p style="margin:0 0 12px"><b>Ваши билеты действуют на новую дату</b>, ничего делать не нужно. Если новая дата вам не подходит, ${law} вы можете вернуть полную стоимость билетов. Заявку можно подать до начала концерта.</p>
${button(`${SITE()}/ru/account`, "Мои билеты", true)}${button(refundUrl, "Оформить возврат")}`
      : `<p style="margin:0 0 12px">Здравствуйте, ${esc(b.name)}! К сожалению, концерт ${esc(dateTime(opts.oldStarts, tz))} отменён. У вас есть билеты на него (${order}).</p>
${note}
<p style="margin:0 0 12px">${law[0].toUpperCase() + law.slice(1)} мы вернём полную стоимость билетов. Оформите заявку по кнопке ниже, деньги вернутся на карту, с которой была оплата.</p>
${button(refundUrl, "Оформить возврат")}`;
  return {
    to: b.email,
    subject: kind === "postponed"
      ? `${title}: концерт перенесён на ${new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "long" }).format(new Date(opts.newStarts!))}`
      : `${title}: концерт отменён, вернём деньги`,
    html: letter({ eyebrow: kind === "postponed" ? "Мероприятие перенесено" : "Мероприятие отменено", title, place, body }),
    kind: "event_change",
    orderId: b.orderId,
    eventId: e.id,
  };
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};

/** Покупатели события: по письму на оплаченный заказ с действующими билетами. */
export async function eventBuyers(db: SupabaseClient, eventId: string): Promise<Buyer[]> {
  const { data: orders } = await db
    .from("orders")
    .select("id, number, buyer_name, buyer_email, kind, parent_order_id, status")
    .eq("event_id", eventId)
    .in("status", ["paid", "refunded"])
    .range(0, 9999);
  const { data: tickets } = await db
    .from("tickets")
    .select("order_id")
    .eq("event_id", eventId)
    .eq("kind", "sale")
    .in("status", ["valid", "used"])
    .range(0, 99999);
  const rootOf = new Map((orders ?? []).map((o) => [o.id as string, (o.parent_order_id as string | null) ?? (o.id as string)]));
  const count = new Map<string, number>();
  for (const t of tickets ?? []) {
    const root = rootOf.get(t.order_id as string);
    if (root) count.set(root, (count.get(root) ?? 0) + 1);
  }
  return (orders ?? [])
    .filter((o) => o.kind === "sale" && (count.get(o.id as string) ?? 0) > 0)
    .map((o) => ({ orderId: o.id, number: o.number, name: o.buyer_name, email: o.buyer_email, tickets: count.get(o.id as string) ?? 0 }));
}

export async function changeEvent(db: SupabaseClient, actor: { id: string; email: string; name: string }, input: ChangeInput) {
  const { data } = await db
    .from("events")
    .select("id, slug, starts_at, doors_open_at, original_starts_at, change_kind, deleted_at, venue:venues(name, city, address, timezone), translations:event_translations(locale, title)")
    .eq("id", input.eventId)
    .single();
  const e = data as unknown as EventRow | null;
  if (!e || e.deleted_at) throw new ChangeError("Событие не найдено");
  if (e.change_kind === "cancelled") throw new ChangeError("Событие уже отменено");
  const message = (input.message ?? "").trim().slice(0, 1000) || null;

  let newStarts: string | null = null;
  let newDoors: string | null = null;
  if (input.kind === "postponed") {
    newStarts = input.startsAt && !Number.isNaN(Date.parse(input.startsAt)) ? new Date(input.startsAt).toISOString() : null;
    if (!newStarts) throw new ChangeError("Укажите новую дату и время");
    if (Date.parse(newStarts) <= Date.now()) throw new ChangeError("Новая дата должна быть в будущем");
    newDoors = input.doorsAt && !Number.isNaN(Date.parse(input.doorsAt)) ? new Date(input.doorsAt).toISOString() : null;
    if (newDoors && Date.parse(newDoors) > Date.parse(newStarts)) throw new ChangeError("Вход не может открываться позже начала");
  }

  const buyers = await eventBuyers(db, e.id);
  const opts = { newStarts, newDoors, message, oldStarts: e.starts_at };

  if (input.test) {
    const sample = buyers[0] ?? { orderId: "00000000-0000-0000-0000-000000000000", number: 1, name: actor.name || "Покупатель", email: actor.email, tickets: 2 };
    const mail = changeMail(e, input.kind, { ...sample, email: actor.email }, opts);
    const ok = await sendMail(db, { ...mail, subject: `[Тест] ${mail.subject}`, orderId: null });
    return { test: true, sent: ok ? 1 : 0, failed: ok ? 0 : 1, recipients: buyers.length };
  }

  const patch =
    input.kind === "postponed"
      ? { starts_at: newStarts, doors_open_at: newDoors, change_kind: "postponed", original_starts_at: e.original_starts_at ?? e.starts_at, change_note: message, changed_at: new Date().toISOString() }
      : { change_kind: "cancelled", change_note: message, changed_at: new Date().toISOString(), is_featured: false };
  const { error } = await db.from("events").update(patch).eq("id", e.id);
  if (error) throw error;
  const { data: mailing } = await db
    .from("event_mailings")
    .insert({ event_id: e.id, kind: input.kind, message, old_starts_at: e.starts_at, new_starts_at: newStarts, new_doors_at: newDoors, created_by: actor.id, created_by_name: actor.name, recipients: buyers.length })
    .select("id")
    .single();
  await db.rpc("audit_as", {
    p_actor: actor.id, p_table: "events", p_record: e.id, p_action: "update",
    p_label: `${e.slug}: ${input.kind === "postponed" ? `перенос на ${newStarts}` : "отмена"}, писем ${buyers.length}`,
    p_changed: input.kind === "postponed" ? ["starts_at", "change_kind"] : ["change_kind"],
  });

  const mails = buyers.map((b) => ({ ...changeMail(e, input.kind, b, opts), mailingId: mailing?.id ?? null }));
  const result = await sendMany(db, mails);
  return { test: false, recipients: buyers.length, ...result };
}

/** Повторная отправка письма об изменении одному заказу (из повтора неудачных писем). */
export async function resendChangeMail(db: SupabaseClient, mailingId: string, orderId: string, logId: number, attempt: number) {
  const { data: m } = await db.from("event_mailings").select("event_id, kind, message, old_starts_at, new_starts_at, new_doors_at").eq("id", mailingId).single();
  if (!m) return false;
  const { data } = await db
    .from("events")
    .select("id, slug, starts_at, doors_open_at, original_starts_at, change_kind, deleted_at, venue:venues(name, city, address, timezone), translations:event_translations(locale, title)")
    .eq("id", m.event_id)
    .single();
  const buyer = (await eventBuyers(db, m.event_id)).find((b) => b.orderId === orderId);
  if (!data || !buyer) return false;
  const mail = changeMail(data as unknown as EventRow, m.kind, buyer, { newStarts: m.new_starts_at, newDoors: m.new_doors_at, message: m.message, oldStarts: m.old_starts_at });
  return sendMail(db, { ...mail, mailingId }, logId, attempt);
}
