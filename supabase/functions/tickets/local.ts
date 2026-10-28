// Продажа своими силами, без Freedom Ticketon: тарифы и остатки берём
// из таблицы ticket_categories (админка), цены считаем только здесь,
// на сервере, а не в браузере. Столы схемы зала держим по seat_label.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Reservation } from "./ticketon.ts";

/** Сколько минут держим бронь, пока покупатель платит. */
const HOLD_MINUTES = 15;

type Draft = {
  eventId: string;
  items: { categoryId: string; quantity: number; seats?: string[] }[];
};

type CategoryRow = {
  code: string;
  name: Record<string, string>;
  price: number;
  available: number | null;
  max_per_order: number;
};

export class SaleError extends Error {}

/** Места за столами: "table-7-3" — стол 7, место 3; "table-7" — стол целиком (старые заказы). */
const TABLES = 15;
const SEATS = 6;
const seatRe = /^table-(\d{1,2})(?:-([1-6]))?$/;

/** Все места, которые занимает метка: место — само себя, стол целиком — все 6 мест. */
function seatsOf(label: string): string[] {
  const m = label.match(seatRe);
  if (!m) return [label];
  if (m[2]) return [label];
  return Array.from({ length: SEATS }, (_, i) => `table-${m[1]}-${i + 1}`);
}

/**
 * Столы продаются целиком: цена тарифа — за стол, «макс. в заказе» — число столов,
 * отмеченные места — гости (билет на каждого). Стол, где занято хоть одно место,
 * другим недоступен. База держит то же правило (миграция table_seats_guard).
 */
const TABLES_SOLD_WHOLE = true;
const tableOf = (label: string) => label.match(seatRe)?.[1] ?? null;

/** Делит цену стола на билеты гостей без потери копеек: остаток — на первый билет. */
function splitPrice(price: number, n: number): number[] {
  const cents = Math.round(price * 100);
  const each = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? cents - each * (n - 1) : each) / 100);
}

/** Тариф со столами схемы Motor Club: код vip-table или «стол» в названии. */
export function isTableCategory(cat: CategoryRow) {
  if (cat.code === "vip-table") return true;
  const names = Object.values(cat.name ?? {}).join(" ").toLowerCase();
  return /стол|table|үстел/.test(names);
}

/** Занятые места события (оплаченные и живые брони) — без данных покупателей. */
export async function takenSeats(db: SupabaseClient, eventId: string) {
  const held = await heldItems(db, eventId);
  const out = new Set<string>();
  for (const h of held) if (h.seat_label) for (const s of seatsOf(h.seat_label)) out.add(s);
  return [...out].sort();
}

/** Занятые места и брони: оплаченные заказы + неоплаченные, у которых бронь ещё жива. */
export async function heldItems(db: SupabaseClient, eventId: string) {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("order_items")
    .select("category_id, quantity, seat_label, orders!inner(event_id, status, expires_at)")
    .eq("orders.event_id", eventId)
    .or(`status.eq.paid,and(status.eq.pending,expires_at.gt.${now})`, { referencedTable: "orders" });
  if (error) throw error;
  return ((data ?? []) as unknown as {
    category_id: string;
    quantity: number;
    seat_label: string | null;
    orders: { status: string };
  }[]).map((r) => ({ ...r, paid: r.orders.status === "paid" }));
}

/** Неоплаченные брони по тарифу (оплаченные уже списаны из available). */
export const pendingQty = (held: Awaited<ReturnType<typeof heldItems>>, code: string) =>
  held.filter((h) => !h.paid && h.category_id === code).reduce((s, h) => s + h.quantity, 0);

export const local = {
  async getCategories(db: SupabaseClient, eventId: string, locale = "ru") {
    const { data: event } = await db.from("events").select("currency, is_sold_out, change_kind").eq("id", eventId).single();
    const { data, error } = await db
      .from("ticket_categories")
      .select("code, name, price, available, max_per_order")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    const held = await heldItems(db, eventId);
    return ((data ?? []) as CategoryRow[]).map((c) => {
      const pending = pendingQty(held, c.code);
      return {
        id: c.code,
        name: c.name[locale] || c.name.ru || c.code,
        price: Number(c.price),
        currency: event?.currency ?? "KZT",
        available: event?.is_sold_out || event?.change_kind === "cancelled" ? 0 : c.available === null ? null : Math.max(0, c.available - pending),
        maxPerOrder: c.max_per_order,
      };
    });
  },

  async reserve(db: SupabaseClient, draft: Draft): Promise<Reservation> {
    const { data: event } = await db
      .from("events")
      .select("id, currency, status, is_sold_out, change_kind, deleted_at, venue:venues(name)")
      .eq("id", draft.eventId)
      .single();
    if (!event || event.status !== "published" || event.is_sold_out || event.change_kind === "cancelled" || event.deleted_at) {
      throw new SaleError("event_not_on_sale");
    }
    // Схема со столами есть только у Motor Club (как и на сайте).
    const venue = (event as unknown as { venue: { name: string } | { name: string }[] | null }).venue;
    const atMotor = /motor/i.test((Array.isArray(venue) ? venue[0]?.name : venue?.name) ?? "");

    const { data: cats } = await db
      .from("ticket_categories")
      .select("code, name, price, available, max_per_order")
      .eq("event_id", draft.eventId)
      .eq("is_active", true);
    const held = await heldItems(db, draft.eventId);
    const taken = new Set(held.flatMap((h) => (h.seat_label ? seatsOf(h.seat_label) : [])));
    const takenTables = new Set(held.map((h) => (h.seat_label ? tableOf(h.seat_label) : null)).filter(Boolean));

    const items: Reservation["items"] = [];
    for (const want of draft.items ?? []) {
      const cat = (cats as CategoryRow[] | null)?.find((c) => c.code === want.categoryId);
      const qty = Math.floor(Number(want.quantity));
      if (!cat || !(Number(cat.price) > 0)) throw new SaleError("category_unavailable");
      const wholeTables = TABLES_SOLD_WHOLE && atMotor && isTableCategory(cat);
      // У столов лимит считаем в столах (ниже), у остальных — в билетах.
      if (!(qty > 0) || (!wholeTables && qty > cat.max_per_order)) throw new SaleError("bad_quantity");
      if (cat.available !== null) {
        const pending = pendingQty(held, cat.code);
        if (cat.available - pending < qty) throw new SaleError("not_enough_tickets");
      }
      const name = cat.name.ru || cat.code;
      const seats = Array.isArray(want.seats) ? want.seats.map(String) : [];
      // На столы продаём только конкретные места: иначе места продались бы сверх схемы.
      if (atMotor && isTableCategory(cat) && !seats.length) throw new SaleError("bad_seats");
      if (seats.length) {
        if (seats.length !== qty || new Set(seats).size !== seats.length) throw new SaleError("bad_seats");
        for (const seat of seats) {
          const m = seat.match(seatRe);
          if (!m || Number(m[1]) < 1 || Number(m[1]) > TABLES) throw new SaleError("bad_seats");
        }
        // Место в заказе не должно пересекаться ни с проданными, ни с другими местами этого же заказа.
        const mine = new Set<string>();
        for (const seat of seats) {
          for (const one of seatsOf(seat)) {
            if (taken.has(one) || mine.has(one)) throw new SaleError("seat_taken");
            mine.add(one);
          }
        }
        if (wholeTables) {
          // Стол целиком: занятый кем-то стол не продаём, цену стола делим между билетами гостей.
          const byTable = new Map<string, string[]>();
          for (const seat of seats) {
            const t = tableOf(seat)!;
            if (takenTables.has(t)) throw new SaleError("seat_taken");
            byTable.set(t, [...(byTable.get(t) ?? []), seat]);
          }
          if (byTable.size > cat.max_per_order) throw new SaleError("bad_quantity");
          for (const list of byTable.values()) {
            const prices = splitPrice(Number(cat.price), list.length);
            list.forEach((seat, i) =>
              items.push({ category_id: cat.code, category_name: name, quantity: 1, unit_price: prices[i], seat_label: seat }),
            );
          }
        } else {
          for (const seat of seats) {
            items.push({ category_id: cat.code, category_name: name, quantity: 1, unit_price: Number(cat.price), seat_label: seat });
          }
        }
      } else {
        // Каждый билет отдельной строкой: у каждого свой код и свой QR.
        for (let n = 0; n < qty; n++) {
          items.push({ category_id: cat.code, category_name: name, quantity: 1, unit_price: Number(cat.price) });
        }
      }
    }
    if (!items.length) throw new SaleError("empty_order");

    const total = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    return {
      ticketonOrderId: "",
      total,
      serviceFee: 0,
      currency: event.currency,
      expiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString(),
      items,
      raw: null,
    };
  },

  /** После оплаты: коды билетов и списание остатков. */
  async confirmOrder(db: SupabaseClient, orderId: string) {
    const { data: order } = await db.from("orders").select("event_id").eq("id", orderId).single();
    const { data: items } = await db.from("order_items").select("id, category_id, quantity, ticket_code").eq("order_id", orderId);
    for (const item of items ?? []) {
      if (!item.ticket_code) {
        // База сама переносит билет в общий список для сканера. Если код
        // случайно совпал с уже выданным, запись отклоняется: берём другой.
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
          const { error } = await db.from("order_items").update({ ticket_code: code }).eq("id", item.id).is("ticket_code", null);
          if (!error) break;
          console.error("ticket code retry", item.id, error.message);
        }
      }
      // Списание одной операцией в базе: две оплаты подряд не потеряют билет из остатка.
      const { error: stockErr } = await db.rpc("consume_category", { p_event: order?.event_id, p_code: item.category_id, p_qty: item.quantity });
      if (stockErr) console.error("consume_category", item.id, stockErr.message);
    }
  },
};
