import type { EventDetail } from "@/lib/data/types";

import type {
  Order,
  OrderDraft,
  PaymentStart,
  TicketCategory,
} from "./types";

/**
 * Адрес нашего сервера продаж. Это Supabase Edge Functions
 * (supabase/functions) или api.concerts.kz. Ключи Ticketon и
 * эквайринга хранятся только там.
 */
const apiUrl = (import.meta.env.VITE_TICKETS_API_URL as string | undefined) ?? "";

export const isSalesEnabled = Boolean(apiUrl);

export interface TicketProvider {
  /** Категории и цены билетов на событие (из Ticketon). */
  getCategories(event: EventDetail): Promise<TicketCategory[]>;
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
  getCategories: (event) =>
    call(`/tickets/categories?event=${encodeURIComponent(event.id)}`),
  createOrder: (draft) =>
    call("/orders", { method: "POST", body: JSON.stringify(draft) }),
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

const demoProvider: TicketProvider = {
  async getCategories(event) {
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

export const tickets: TicketProvider = isSalesEnabled ? apiProvider : demoProvider;

/** Сервисный сбор. Точная сумма приходит с сервера, здесь — для предпросмотра. */
export const SERVICE_FEE_RATE = 0;
