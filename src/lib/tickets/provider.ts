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

/* ---------------- демо-режим ---------------- */

/** Округление до 500, чтобы демо-цены выглядели как настоящие. */
const round = (n: number) => Math.round(n / 500) * 500;

const demoProvider: TicketProvider = {
  async getCategories(event) {
    const base = event.priceFrom ?? 5000;
    const make = (id: string, name: string, price: number): TicketCategory => ({
      id,
      name,
      price,
      currency: event.currency,
      available: event.isSoldOut ? 0 : null,
      maxPerOrder: 6,
    });
    return [
      make("vip", "VIP Fan Zone", round(base * 2.9)),
      make("standard", "Standard", round(base * 1.6)),
      make("balcony", "Balcony", base),
    ];
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
