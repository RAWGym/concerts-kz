import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventDetail } from "@/lib/data/types";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import type {
  Order,
  OrderDraft,
  PaymentStart,
  TicketCategory,
  TicketView,
} from "./types";

/**
 * Адрес нашего сервера продаж. Это Supabase Edge Functions
 * (supabase/functions) или api.concerts.kz. Ключи Ticketon и
 * эквайринга хранятся только там.
 */
// Адрес публичный (ключи только в секретах функции), поэтому есть запасной вариант.
const apiUrl =
  (import.meta.env.VITE_TICKETS_API_URL as string | undefined) ||
  "https://jlpfqasntsnuzxlouqvq.supabase.co/functions/v1/tickets";

export const isSalesEnabled = Boolean(apiUrl);

export interface TicketProvider {
  /** Категории и цены билетов на событие (из Ticketon). */
  getCategories(event: EventDetail, locale?: string): Promise<TicketCategory[]>;
  /** Бронирует места и создаёт заказ со статусом pending. */
  createOrder(draft: OrderDraft): Promise<Order>;
  /** Ссылка на оплату заказа у банка-эквайера. */
  startPayment(orderId: string, returnUrl: string): Promise<PaymentStart>;
  /** Статус заказа после возврата с оплаты. */
  getOrder(orderId: string): Promise<Order>;
}

/* ---------------- сервер продаж ---------------- */

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`tickets api ${res.status}`);
  return (await res.json()) as T;
}

const apiProvider: TicketProvider = {
  // Если сервер продаж недоступен, показываем тарифы из базы, как раньше.
  getCategories: (event, locale) =>
    call<TicketCategory[]>(`/tickets/categories?event=${encodeURIComponent(event.id)}&locale=${encodeURIComponent(locale ?? "ru")}`)
      .then((list) => (list.length ? list : demoProvider.getCategories(event, locale)))
      .catch(() => demoProvider.getCategories(event, locale)),
  // Заказ привязываем к учётной записи: сервер проверяет токен входа.
  createOrder: async (draft) => {
    const { data } = await createBrowserSupabase().auth.getSession();
    const token = data.session?.access_token;
    return call("/orders", {
      method: "POST",
      body: JSON.stringify(draft),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  },
  startPayment: (orderId, returnUrl) =>
    call("/payments", {
      method: "POST",
      body: JSON.stringify({ orderId, returnUrl }),
    }),
  getOrder: (orderId) => call(`/orders/${encodeURIComponent(orderId)}`),
};

/* ---------------- без сервера продаж ---------------- */

/**
 * Тарифы событий, пока нет сервера продаж и Ticketon. Цены и остатки
 * взяты с текущей страницы продаж. Потом их отдаст /tickets/categories.
 */
const knownCategories: Record<string, { id: string; name: string; price: number; available: number | null }[]> = {
  "lucaveros-almaty": [
    { id: "standard", name: "Стандартный", price: 15000, available: 200 },
    { id: "vip", name: "VIP", price: 25000, available: 18 },
  ],
};

type CategoryRow = {
  code: string;
  name: Record<string, string>;
  price: number;
  available: number | null;
  max_per_order: number;
};

/** Тарифы из таблицы ticket_categories (их правят в админке). */
async function dbCategories(event: EventDetail, locale: string): Promise<TicketCategory[] | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await (createPublicClient() as unknown as SupabaseClient)
    .from("ticket_categories")
    .select("code, name, price, available, max_per_order")
    .eq("event_id", event.id)
    .eq("is_active", true)
    .order("sort_order")
    .returns<CategoryRow[]>();
  if (error || !data) return null;
  return data.map((c) => ({
    id: c.code,
    name: c.name[locale] || c.name.ru || c.code,
    price: Number(c.price),
    currency: event.currency,
    available: event.isSoldOut ? 0 : c.available,
    maxPerOrder: c.max_per_order,
  }));
}

const demoProvider: TicketProvider = {
  async getCategories(event, locale = "ru") {
    const fromDb = await dbCategories(event, locale);
    if (fromDb && fromDb.length) return fromDb;
    const list =
      knownCategories[event.slug] ??
      (event.priceFrom
        ? [{ id: "standard", name: "Входной билет", price: event.priceFrom, available: null }]
        : []);
    return list.map((c) => ({
      ...c,
      currency: event.currency,
      available: event.isSoldOut ? 0 : c.available,
      maxPerOrder: 6,
    }));
  },
  async createOrder() {
    throw new Error("sales disabled");
  },
  async startPayment() {
    throw new Error("sales disabled");
  },
  async getOrder(orderId) {
    return {
      id: orderId,
      status: "pending",
      total: 0,
      serviceFee: 0,
      currency: "KZT",
      expiresAt: null,
    };
  },
};

/** Привязывает к аккаунту заказы, оформленные на его почту. */
export async function claimMyOrders() {
  const { data } = await createBrowserSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch(`${apiUrl}/me/claim`, { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => {});
}

/** Ещё раз отправить билеты заказа на почту. */
export async function resendTickets(orderId: string) {
  const { data } = await createBrowserSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  const res = await fetch(`${apiUrl}/me/resend`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ orderId }),
  }).catch(() => null);
  if (!res?.ok) return false;
  return Boolean(((await res.json()) as { sent?: boolean }).sent);
}

/**
 * Повторная оплата своего заказа. Если бронь истекла, сервер проверит,
 * что места свободны, и забронирует их заново. Возвращает ссылку банка
 * или код ошибки: login_required, not_enough_tickets, seat_taken и т.п.
 */
export async function retryPayment(orderId: string, returnUrl: string): Promise<{ paymentUrl?: string; error?: string }> {
  const { data } = await createBrowserSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: "login_required" };
  const res = await fetch(`${apiUrl}/orders/${encodeURIComponent(orderId)}/retry`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ returnUrl }),
  }).catch(() => null);
  if (!res) return { error: "network" };
  const body = (await res.json().catch(() => ({}))) as { paymentUrl?: string; error?: string };
  return res.ok && body.paymentUrl ? { paymentUrl: body.paymentUrl } : { error: body.error ?? "internal" };
}

/** Билет по коду для страницы билета. */
export const getTicket = (code: string, locale: string) =>
  call<TicketView>(`/tickets/view?code=${encodeURIComponent(code)}&locale=${encodeURIComponent(locale)}`);

/** QR-картинка билета (для письма и печати). */
export const ticketQrUrl = (code: string) => `${apiUrl}/tickets/qr?code=${encodeURIComponent(code)}`;

export const tickets: TicketProvider = isSalesEnabled ? apiProvider : demoProvider;

/** Сервисный сбор. Точная сумма приходит с сервера, здесь — для предпросмотра. */
export const SERVICE_FEE_RATE = 0;
