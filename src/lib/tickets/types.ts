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
  /** Цена ещё не объявлена: тариф виден, но купить нельзя. */
  priceTbd?: boolean;
  /** Код тарифа на сервере, если на сайте он показан под другим id (зона схемы). */
  serverId?: string;
};

export type Buyer = {
  name: string;
  phone: string;
  email: string;
};

export type OrderDraft = {
  eventId: string;
  eventSlug: string;
  /** seats: выбранные места или столы по схеме зала, например "table-7". */
  items: { categoryId: string; quantity: number; seats?: string[] }[];
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
  /** Короткий номер заказа для покупателя. */
  number?: number;
  status: OrderStatus;
  total: number;
  serviceFee: number;
  currency: CurrencyCode;
  /** До какого момента держится бронь мест. */
  expiresAt: string | null;
};

/** Билет для отдельной страницы: всё, что печатается на билете. */
export type TicketView = {
  code: string;
  index: number;
  count: number;
  category: string;
  seat: string | null;
  price: number;
  currency: CurrencyCode;
  orderNumber: number;
  purchasedAt: string | null;
  buyer: { name: string; email: string; phone: string };
  event: {
    title: string;
    startsAt: string;
    doorsOpenAt: string | null;
    timezone: string;
    ageLimit: number | null;
    posterUrl: string | null;
    venue: string | null;
    city: string | null;
    address: string | null;
    slug: string;
  };
};

export type PaymentStart = {
  /** Страница банка или Ticketon, куда уходит покупатель. */
  paymentUrl: string;
};
