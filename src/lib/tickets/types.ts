import type { CurrencyCode } from "@/lib/supabase/types";

/**
 * Модель продажи билетов, общая для сайта и сервера.
 *
 * Сайт ничего не знает про Freedom Ticketon и банк-эквайер напрямую:
 * все ключи живут на сервере (supabase/functions), а сайт говорит с ним
 * через TicketProvider. Пока сервер не подключён, работает демо-режим.
 */

export type TicketCategory = {
  id: string;
  name: string;
  /** Цена за один билет в валюте события. */
  price: number;
  currency: CurrencyCode;
  /** Сколько билетов ещё можно купить; null — неизвестно. */
  available: number | null;
  /** Ограничение на один заказ. */
  maxPerOrder: number;
};

export type Buyer = {
  name: string;
  phone: string;
  email: string;
};

export type OrderDraft = {
  eventId: string;
  eventSlug: string;
  items: { categoryId: string; quantity: number }[];
  buyer: Buyer;
  locale: string;
  /** Согласие с офертой и политикой: без него сервер заказ не примет. */
  acceptedTerms: boolean;
};

export type OrderStatus =
  | "pending" // создан, места забронированы, ждём оплату
  | "paid" // банк подтвердил оплату, билеты выпущены
  | "failed" // оплата не прошла
  | "expired" // бронь истекла
  | "refunded";

export type Order = {
  id: string;
  status: OrderStatus;
  total: number;
  serviceFee: number;
  currency: CurrencyCode;
  /** До какого момента держится бронь мест. */
  expiresAt: string | null;
};

export type PaymentStart = {
  /** Страница банка или Ticketon, куда уходит покупатель. */
  paymentUrl: string;
};
