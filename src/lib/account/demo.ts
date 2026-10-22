import type { Locale } from "@/i18n/config";
import { demoEvents } from "@/lib/data/fixtures";
import { toEventCard } from "@/lib/data/mappers";

import type { AccountOrder, AccountUser } from "./types";

/**
 * Примеры для кабинета, когда база не подключена (локальная вёрстка).
 * На боевом сайте Supabase настроен всегда, и сюда код не заходит.
 */

export const demoUser: AccountUser = {
  id: "demo",
  email: "guest@concerts.kz",
  fullName: "Алия Сеитова",
  phone: "+7 700 000 00 00",
  createdAt: "2026-09-01T10:00:00Z",
};

export function demoOrders(locale: Locale): AccountOrder[] {
  const event = demoEvents[0] ? toEventCard(demoEvents[0], locale) : null;
  return [
    {
      id: "demo-1042",
      number: 1042,
      status: "paid",
      total: 42500,
      serviceFee: 2500,
      currency: "KZT",
      createdAt: "2026-10-12T14:20:00Z",
      event,
      items: [
        { id: "demo-item-vip", categoryName: "VIP", seatLabel: null, quantity: 1, unitPrice: 25000, ticketCode: "CP-1042-VIP7" },
        { id: "demo-item-fan", categoryName: "Танцпол", seatLabel: null, quantity: 1, unitPrice: 15000, ticketCode: "CP-1042-FAN3" },
      ],
    },
    {
      id: "demo-1057",
      number: 1057,
      status: "pending",
      total: 15000,
      serviceFee: 0,
      currency: "KZT",
      createdAt: "2026-10-21T09:05:00Z",
      event,
      items: [
        { id: "demo-item-2", categoryName: "Танцпол", seatLabel: null, quantity: 1, unitPrice: 15000, ticketCode: null },
      ],
    },
    {
      id: "demo-1013",
      number: 1013,
      status: "expired",
      total: 30000,
      serviceFee: 0,
      currency: "KZT",
      createdAt: "2026-10-03T18:40:00Z",
      event,
      items: [
        { id: "demo-item-3", categoryName: "Танцпол", seatLabel: null, quantity: 2, unitPrice: 15000, ticketCode: null },
      ],
    },
  ];
}
