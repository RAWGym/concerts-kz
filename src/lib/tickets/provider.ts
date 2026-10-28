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
export const apiUrl =
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

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createBrowserSupabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new TicketApiError(res.status, body.error ?? "internal");
  }
  return (await res.json()) as T;
}

/** Ошибка сервера продаж с кодом: seat_taken, not_enough_tickets и т.п. */
export class TicketApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`tickets api ${status}: ${code}`);
  }
}

/** Занятые места за столами (оплаченные и в брони). При сбое — пустой список. */
export async function getTakenSeats(eventId: string): Promise<string[]> {
  if (!apiUrl) return [];
  try {
    const { taken } = await call<{ taken: string[] }>(`/tickets/seats?event=${encodeURIComponent(eventId)}`);
    return Array.isArray(taken) ? taken : [];
  } catch {
    return [];
  }
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
  // Оплату начинает только владелец заказа: передаём токен входа.
  startPayment: async (orderId, returnUrl) =>
    call("/payments", {
      method: "POST",
      body: JSON.stringify({ orderId, returnUrl }),
      headers: await authHeaders(),
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

export type UpgradeOption = { code: string; name: string; price: number; diff: number; total: number; available: number | null };

/** Варианты апгрейда для билетов покупателя. */
export async function getUpgradeOptions(ticketIds: string[]) {
  return call<{ options: UpgradeOption[]; until: string | null }>(
    `/me/upgrade-options?tickets=${encodeURIComponent(ticketIds.join(","))}`,
    { headers: await authHeaders() },
  );
}

/** Оформляет доплату за апгрейд и возвращает ссылку банка. */
export async function startUpgrade(ticketIds: string[], target: string, returnUrl: string) {
  return call<{ orderId: string; paymentUrl: string }>("/me/upgrades", {
    method: "POST",
    body: JSON.stringify({ ticketIds, target, returnUrl }),
    headers: await authHeaders(),
  });
}

export type RefundInfo = {
  canRequest: boolean;
  /** Почему нельзя: event_not_changed, deadline_passed, nothing_to_refund, request_exists, not_found. */
  reason: string | null;
  order: { id: string; number: number; status: string; currency: string } | null;
  event: {
    id: string; slug: string; title: string; startsAt: string; originalStartsAt: string | null;
    changeKind: "postponed" | "cancelled" | null; posterUrl: string | null; venue: string | null; city: string | null; timezone: string;
  } | null;
  tickets: { id: string; code: string; category: string; seat: string | null; status: string; paid: number }[];
  request: { id: string; status: "new" | "refunded" | "rejected" | "cancelled"; amount: number; created_at: string; decision_note: string | null } | null;
};

/** Данные для заявки на возврат после переноса или отмены. */
export async function getRefundInfo(orderId: string) {
  return call<RefundInfo>(`/me/refund-info?order=${encodeURIComponent(orderId)}`, { headers: await authHeaders() });
}

export async function requestRefund(orderId: string, ticketIds: string[], reason: string) {
  return call<{ id: string }>("/me/refund-requests", {
    method: "POST",
    body: JSON.stringify({ orderId, ticketIds, reason }),
    headers: await authHeaders(),
  });
}

/** Билет по коду для страницы билета. */
export const getTicket = (code: string, locale: string) =>
  call<TicketView>(`/tickets/view?code=${encodeURIComponent(code)}&locale=${encodeURIComponent(locale)}`);

/** QR-картинка билета (для письма и печати). */
export const ticketQrUrl = (code: string) => `${apiUrl}/tickets/qr?code=${encodeURIComponent(code)}`;

export const tickets: TicketProvider = isSalesEnabled ? apiProvider : demoProvider;

/** Сервисный сбор. Точная сумма приходит с сервера, здесь — для предпросмотра. */
export const SERVICE_FEE_RATE = 0;
