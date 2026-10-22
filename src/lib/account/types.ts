import type { EventCard } from "@/lib/data/types";
import type { CurrencyCode } from "@/lib/supabase/types";
import type { OrderStatus } from "@/lib/tickets/types";

/** Модель личного кабинета покупателя. */

export type AccountUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  createdAt: string | null;
};

export type AccountOrderItem = {
  id: string;
  categoryName: string;
  seatLabel: string | null;
  quantity: number;
  unitPrice: number;
  /** Код для прохода; появляется после оплаты. */
  ticketCode: string | null;
};

export type AccountOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  total: number;
  serviceFee: number;
  currency: CurrencyCode;
  createdAt: string;
  event: EventCard | null;
  items: AccountOrderItem[];
};

/** Один входной билет: позиция заказа × количество. */
export type AccountTicket = {
  id: string;
  code: string;
  categoryName: string;
  seatLabel: string | null;
  price: number;
  currency: CurrencyCode;
  orderId: string;
  orderNumber: number;
  event: EventCard;
};
