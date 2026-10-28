import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/i18n/config";
import { toEventCard } from "@/lib/data/mappers";
import type { RawEvent } from "@/lib/data/types";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { claimMyOrders } from "@/lib/tickets/provider";

import { demoOrders } from "./demo";
import type { AccountOrder, AccountTicket, AccountUser } from "./types";
import { displayPrice } from "@/lib/tickets/seats";

/**
 * Данные кабинета покупателя.
 *
 * Заказы читаем прямо из таблицы orders: политика RLS отдаёт
 * покупателю только его строки. Сотрудникам та же политика отдаёт все
 * заказы, поэтому фильтр по user_id ставим явно. Профиль (имя и
 * телефон) лежит в user_metadata учётной записи Supabase Auth.
 */

const ORDER_FIELDS = `
  id, number, status, kind, refunded_amount, total, service_fee, currency, created_at,
  items:order_items ( id, category_name, seat_label, quantity, unit_price, ticket_code ),
  event:events (
    id, slug, category, starts_at, age_limit, poster_url, cover_url,
    price_from, currency, badge, is_featured, is_sold_out, sales_closed, ticketon_url,
    change_kind, original_starts_at,
    venue:venues ( name, city, city_i18n, address, timezone ),
    translations:event_translations ( locale, title, subtitle, description )
  )
`;

type RawOrder = {
  id: string;
  number: number;
  status: AccountOrder["status"];
  kind?: AccountOrder["kind"];
  refunded_amount?: number | string | null;
  total: number | string;
  service_fee: number | string;
  currency: AccountOrder["currency"];
  created_at: string;
  items: {
    id: string;
    category_name: string;
    seat_label: string | null;
    quantity: number;
    unit_price: number | string;
    ticket_code: string | null;
  }[];
  event: RawEvent | null;
};

// Таблиц заказов пока нет в сгенерированных типах — работаем без них.
const client = () => createBrowserSupabase() as unknown as SupabaseClient;

export async function getMyOrders(userId: string, locale: Locale): Promise<AccountOrder[]> {
  if (!isSupabaseConfigured) return demoOrders(locale);
  await claimMyOrders();

  const { data, error } = await client()
    .from("orders")
    .select(ORDER_FIELDS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as RawOrder[]).map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    kind: o.kind ?? "sale",
    refundedAmount: Number(o.refunded_amount ?? 0),
    total: Number(o.total),
    serviceFee: Number(o.service_fee),
    currency: o.currency,
    createdAt: o.created_at,
    event: o.event ? toEventCard(o.event, locale) : null,
    items: o.items.map((i) => ({
      id: i.id,
      categoryName: i.category_name,
      seatLabel: i.seat_label,
      quantity: i.quantity,
      unitPrice: Number(i.unit_price),
      ticketCode: i.ticket_code,
    })),
  }));
}

/** Оплаченные заказы, развёрнутые в отдельные входные билеты. */
export function ticketsFromOrders(orders: AccountOrder[]): AccountTicket[] {
  const out: AccountTicket[] = [];
  for (const order of orders) {
    if (order.status !== "paid" || !order.event) continue;
    for (const item of order.items) {
      // У мест за столом показываем цену всего стола, а не долю места.
      const price = displayPrice(item, order.items);
      for (let n = 0; n < item.quantity; n++) {
        const base = item.ticketCode ?? `${order.number}-${item.id.slice(0, 6)}`;
        out.push({
          id: `${item.id}-${n}`,
          ticketId: null,
          status: "valid",
          upgraded: false,
          code: item.quantity > 1 ? `${base}-${n + 1}` : base,
          categoryName: item.categoryName,
          seatLabel: item.seatLabel,
          price,
          currency: order.currency,
          orderId: order.id,
          orderNumber: order.number,
          event: order.event,
        });
      }
    }
  }
  return out.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
}

type RawTicket = {
  id: string;
  code: string;
  status: "valid" | "used" | "void";
  category_name: string;
  seat_label: string | null;
  price: number | string;
  paid_total: number | string | null;
  currency: string | null;
  upgraded_from: string | null;
  upgraded_to: string | null;
  order_id: string;
};

/**
 * Действующие билеты из таблицы tickets: учитывают апгрейды и возвраты
 * (аннулированные не показываем). Если таблица недоступна, собираем из заказов.
 */
export async function getMyTickets(orders: AccountOrder[]): Promise<AccountTicket[]> {
  const paid = orders.filter((o) => o.status === "paid" || o.status === "refunded");
  if (!isSupabaseConfigured || !paid.length) return ticketsFromOrders(orders);
  const { data, error } = await client()
    .from("tickets")
    .select("id, code, status, category_name, seat_label, price, paid_total, currency, upgraded_from, upgraded_to, order_id")
    .in("order_id", paid.map((o) => o.id))
    .eq("kind", "sale")
    .in("status", ["valid", "used"]);
  if (error || !data?.length) return ticketsFromOrders(orders);
  const byId = new Map(orders.map((o) => [o.id, o]));
  // Билет из доплаты относится к событию исходного заказа: событие у них одно.
  const out: AccountTicket[] = [];
  for (const t of data as RawTicket[]) {
    if (t.status === "void" || t.upgraded_to) continue;
    const order = byId.get(t.order_id);
    if (!order?.event) continue;
    out.push({
      id: t.id,
      ticketId: t.id,
      code: t.code,
      status: t.status,
      upgraded: Boolean(t.upgraded_from),
      categoryName: t.category_name,
      seatLabel: t.seat_label,
      price: Number(t.paid_total ?? t.price),
      currency: (t.currency ?? order.currency) as AccountTicket["currency"],
      orderId: order.id,
      orderNumber: order.number,
      event: order.event,
    });
  }
  return out.sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt) || a.code.localeCompare(b.code));
}

export function isPast(iso: string) {
  // Событие считаем прошедшим через 6 часов после начала.
  return new Date(iso).getTime() + 6 * 3600_000 < Date.now();
}

export async function updateProfile(patch: Pick<AccountUser, "fullName" | "phone">) {
  if (!isSupabaseConfigured) return;
  const { error } = await createBrowserSupabase().auth.updateUser({
    data: { full_name: patch.fullName.trim(), phone: patch.phone.trim() },
  });
  if (error) throw error;
}

export async function changePassword(password: string) {
  if (!isSupabaseConfigured) return;
  const { error } = await createBrowserSupabase().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  await createBrowserSupabase().auth.signOut();
}

/** Есть ли у пользователя роль в админке — тогда покажем ссылку туда. Тикетор в админку не ходит. */
export async function isStaff(userId: string): Promise<boolean> {
  return (await staffHome(userId)) === "/admin";
}

/** Куда вести сотрудника после входа: админка, сканер билетов или никуда (покупатель). */
export async function staffHome(userId: string): Promise<"/admin" | "/scanner" | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await client()
    .from("admins")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return data.role === "scanner" ? "/scanner" : "/admin";
}

/** Адрес, на который Supabase вернёт из письма. */
export function authRedirect(path: string) {
  return `${window.location.origin}${path}`;
}
