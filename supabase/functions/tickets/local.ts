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

/** Занятые места и брони: оплаченные заказы + неоплаченные, у которых бронь ещё жива. */
async function heldItems(db: SupabaseClient, eventId: string) {
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
const pendingQty = (held: Awaited<ReturnType<typeof heldItems>>, code: string) =>
  held.filter((h) => !h.paid && h.category_id === code).reduce((s, h) => s + h.quantity, 0);

export const local = {
  async getCategories(db: SupabaseClient, eventId: string, locale = "ru") {
    const { data: event } = await db.from("events").select("currency, is_sold_out").eq("id", eventId).single();
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
        available: event?.is_sold_out ? 0 : c.available === null ? null : Math.max(0, c.available - pending),
        maxPerOrder: c.max_per_order,
      };
    });
  },

  async reserve(db: SupabaseClient, draft: Draft): Promise<Reservation> {
    const { data: event } = await db
      .from("events")
      .select("id, currency, status, is_sold_out")
      .eq("id", draft.eventId)
      .single();
    if (!event || event.status !== "published" || event.is_sold_out) throw new SaleError("event_not_on_sale");

    const { data: cats } = await db
      .from("ticket_categories")
      .select("code, name, price, available, max_per_order")
      .eq("event_id", draft.eventId)
      .eq("is_active", true);
    const held = await heldItems(db, draft.eventId);
    const takenSeats = new Set(held.map((h) => h.seat_label).filter(Boolean));

    const items: Reservation["items"] = [];
    for (const want of draft.items ?? []) {
      const cat = (cats as CategoryRow[] | null)?.find((c) => c.code === want.categoryId);
      const qty = Math.floor(Number(want.quantity));
      if (!cat || !(Number(cat.price) > 0)) throw new SaleError("category_unavailable");
      if (!(qty > 0) || qty > cat.max_per_order) throw new SaleError("bad_quantity");
      if (cat.available !== null) {
        const pending = pendingQty(held, cat.code);
        if (cat.available - pending < qty) throw new SaleError("not_enough_tickets");
      }
      const name = cat.name.ru || cat.code;
      const seats = (want.seats ?? []).map(String).filter((s) => /^[a-z0-9-]{1,32}$/.test(s));
      if (seats.length) {
        if (seats.length !== qty) throw new SaleError("bad_seats");
        for (const seat of seats) {
          if (takenSeats.has(seat)) throw new SaleError("seat_taken");
          items.push({ category_id: cat.code, category_name: name, quantity: 1, unit_price: Number(cat.price), seat_label: seat });
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
