// Апгрейд купленного билета в другой тариф с доплатой разницы.
//
// Доплата оформляется отдельным заказом (kind = upgrade), связанным с исходным.
// Исходный заказ не меняется. После оплаты база выдаёт новый билет, старый
// аннулирует с пометкой «Улучшен до …» и возвращает место в продажу
// (apply_upgrade_items в миграции positions_events_upgrades).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { heldItems, isTableCategory, pendingQty, SaleError } from "./local.ts";

const HOLD_MINUTES = 15;

type Cat = { code: string; name: Record<string, string>; price: number; available: number | null; is_active: boolean; upgrade_to: string[] };

export type UpgradeOption = {
  code: string;
  name: string;
  price: number;
  /** Сколько доплатить за один билет (за самый дорогой из выбранных). */
  diff: number;
  /** Доплата за все выбранные билеты. */
  total: number;
  available: number | null;
};

type TicketRow = {
  id: string;
  code: string;
  status: string;
  kind: string;
  event_id: string;
  order_id: string;
  category_code: string | null;
  category_name: string;
  seat_label: string | null;
  price: number;
  paid_total: number | null;
  upgraded_to: string | null;
  order: { user_id: string | null; status: string; kind: string; parent_order_id: string | null; currency: string } | null;
};

/** Билеты покупателя, которые можно улучшить, с вариантами и доплатой. Пустой список: апгрейда нет. */
export async function upgradeOptions(db: SupabaseClient, userId: string, ticketIds: string[]) {
  if (!ticketIds.length || ticketIds.length > 20 || ticketIds.some((id) => !/^[0-9a-f-]{36}$/.test(id))) {
    throw new SaleError("bad_tickets");
  }
  const { data: rows } = await db
    .from("tickets")
    .select("id, code, status, kind, event_id, order_id, category_code, category_name, seat_label, price, paid_total, upgraded_to, order:orders!tickets_order_id_fkey(user_id, status, kind, parent_order_id, currency)")
    .in("id", ticketIds);
  const tickets = (rows ?? []) as unknown as TicketRow[];
  if (tickets.length !== ticketIds.length) throw new SaleError("bad_tickets");
  for (const t of tickets) {
    if (t.kind !== "sale" || t.order?.user_id !== userId || t.order?.status !== "paid") throw new SaleError("bad_tickets");
    if (t.status !== "valid" || t.upgraded_to) throw new SaleError("ticket_not_upgradable");
    if (t.seat_label) throw new SaleError("ticket_not_upgradable");
  }
  const eventId = tickets[0].event_id;
  const from = tickets[0].category_code;
  if (tickets.some((t) => t.event_id !== eventId || t.category_code !== from)) throw new SaleError("mixed_tickets");

  const { data: event } = await db
    .from("events")
    .select("id, status, starts_at, doors_open_at, upgrades_enabled, change_kind, deleted_at, currency, venue:venues(name)")
    .eq("id", eventId)
    .single();
  if (!event?.upgrades_enabled || event.status !== "published" || event.deleted_at || event.change_kind === "cancelled") {
    return { eventId, tickets, options: [] as UpgradeOption[], until: null as string | null };
  }
  // Апгрейд доступен до открытия входа (если не указано, до начала).
  const until = (event.doors_open_at ?? event.starts_at) as string;
  if (Date.parse(until) <= Date.now()) return { eventId, tickets, options: [] as UpgradeOption[], until };

  const { data: catsData } = await db
    .from("ticket_categories")
    .select("code, name, price, available, is_active, upgrade_to")
    .eq("event_id", eventId);
  const cats = (catsData ?? []) as Cat[];
  const source = cats.find((c) => c.code === from);
  if (!source) return { eventId, tickets, options: [] as UpgradeOption[], until };
  const held = await heldItems(db, eventId);
  const venue = (event as unknown as { venue: { name: string } | null }).venue;
  const atMotor = /motor/i.test(venue?.name ?? "");

  // Доплата: текущая цена нового тарифа минус то, что заплачено за билет (самый дорогой из выбранных).
  const paid = Math.max(...tickets.map((t) => Number(t.paid_total ?? t.price)));
  const options: UpgradeOption[] = [];
  for (const code of source.upgrade_to ?? []) {
    const c = cats.find((x) => x.code === code && x.is_active);
    if (!c || (atMotor && isTableCategory(c as never))) continue;
    const diff = Math.round((Number(c.price) - paid) * 100) / 100;
    if (!(diff > 0)) continue;
    const total = tickets.reduce((sum, t) => sum + Math.round((Number(c.price) - Number(t.paid_total ?? t.price)) * 100) / 100, 0);
    const available = c.available === null ? null : Math.max(0, c.available - pendingQty(held, c.code));
    options.push({ code: c.code, name: c.name.ru || c.code, price: Number(c.price), diff, total, available });
  }
  return { eventId, tickets, options, until };
}

/** Создаёт заказ-доплату. Сумма считается только здесь, браузер цену не передаёт. */
export async function createUpgradeOrder(
  db: SupabaseClient,
  user: { id: string; email: string },
  ticketIds: string[],
  target: string,
) {
  const { eventId, tickets, options } = await upgradeOptions(db, user.id, ticketIds);
  const option = options.find((o) => o.code === target);
  if (!option) throw new SaleError("upgrade_unavailable");
  if (option.available !== null && option.available < tickets.length) throw new SaleError("not_enough_tickets");

  // Уже есть неоплаченная доплата по этому билету: не держим два места.
  const { data: pending } = await db
    .from("order_items")
    .select("id, orders!inner(status, expires_at)")
    .in("upgrade_from", ticketIds)
    .eq("orders.status", "pending")
    .gt("orders.expires_at", new Date().toISOString());
  if (pending?.length) throw new SaleError("upgrade_pending");

  const root = tickets[0].order?.parent_order_id ?? tickets[0].order_id;
  const { data: rootOrder } = await db.from("orders").select("buyer_name, buyer_phone, locale, currency").eq("id", root).single();
  const items = tickets.map((t) => ({
    category_id: option.code,
    category_name: option.name,
    quantity: 1,
    unit_price: Math.round((option.price - Number(t.paid_total ?? t.price)) * 100) / 100,
    upgrade_from: t.id,
  }));
  if (items.some((i) => !(i.unit_price > 0))) throw new SaleError("upgrade_unavailable");
  const total = items.reduce((s, i) => s + i.unit_price, 0);

  const { data: order, error } = await db
    .from("orders")
    .insert({
      event_id: eventId,
      user_id: user.id,
      kind: "upgrade",
      parent_order_id: root,
      buyer_name: rootOrder?.buyer_name ?? "",
      buyer_phone: rootOrder?.buyer_phone ?? "",
      buyer_email: user.email,
      locale: rootOrder?.locale ?? "ru",
      total,
      service_fee: 0,
      currency: rootOrder?.currency ?? "KZT",
      accepted_terms_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
    })
    .select("id, number, total, currency, buyer_email, buyer_phone")
    .single();
  if (error) throw error;
  const { error: itemsError } = await db.from("order_items").insert(items.map((i) => ({ ...i, order_id: order.id })));
  if (itemsError) {
    await db.from("orders").delete().eq("id", order.id);
    throw itemsError;
  }
  return order as { id: string; number: number; total: number; currency: string; buyer_email: string; buyer_phone: string };
}
