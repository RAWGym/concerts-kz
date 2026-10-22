import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import Link from "next/link";
import { EventPoster } from "@/components/event/event-poster";
import { EASE_OUT } from "@/components/motion/reveal";
import { fill, type AccountDictionary } from "@/i18n/account";
import { intlLocale, type Locale } from "@/i18n/config";
import { localePath } from "@/i18n/routing";
import type { AccountOrder } from "@/lib/account/types";
import { formatEventDateTime, formatMoney } from "@/lib/format";

import { EmptyPanel, StatusPill } from "./ui";

/** Вкладка «Заказы»: список с раскрывающимися деталями. */
export function OrdersTab({
  orders,
  locale,
  t,
}: {
  orders: AccountOrder[];
  locale: Locale;
  t: AccountDictionary["account"];
}) {
  const [open, setOpen] = useState<string | null>(orders[0]?.id ?? null);

  if (orders.length === 0) {
    return <EmptyPanel text={t.emptyOrders} action={{ href: localePath(locale, "/events"), label: t.toEvents }} />;
  }

  const created = new Intl.DateTimeFormat(intlLocale[locale], { day: "numeric", month: "long", year: "numeric" });

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
      {orders.map((order, i) => {
        const isOpen = open === order.id;
        const e = order.event;
        return (
          <motion.li
            key={order.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT, delay: i * 0.05 }}
            className={`transition-colors ${isOpen ? "bg-surface/60" : "hover:bg-surface/30"}`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : order.id)}
              className="flex w-full items-center gap-4 p-4 text-left sm:p-5"
            >
              <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-[8px] bg-ink">
                {e && <EventPoster src={e.posterUrl} alt={e.title} sizes="60px" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                  {fill(t.orderNo, { n: order.number })}
                </p>
                <p className="mt-1 truncate font-display text-sm font-semibold uppercase text-fg sm:text-base">
                  {e?.title ?? "—"}
                </p>
                <p className="mt-0.5 truncate text-xs text-fg-muted">
                  {fill(t.created, { date: created.format(new Date(order.createdAt)) })}
                </p>
              </div>
              <div className="hidden flex-col items-end gap-2 sm:flex">
                <StatusPill status={order.status} label={t.status[order.status]} />
                <span className="font-display text-sm font-semibold text-fg">
                  {formatMoney(order.total, order.currency, locale)}
                </span>
              </div>
              <motion.svg
                animate={{ rotate: isOpen ? 180 : 0 }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4 shrink-0 text-fg-subtle"
              >
                <path d="M6 9l6 6 6-6" />
              </motion.svg>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-6 px-4 pb-6 sm:grid-cols-[1fr_260px] sm:px-5 sm:pl-[84px]">
                    <div>
                      <div className="mb-4 sm:hidden">
                        <StatusPill status={order.status} label={t.status[order.status]} />
                      </div>
                      {e && (
                        <p className="text-sm text-fg-muted">
                          {formatEventDateTime(e.startsAt, locale, e.timezone)}
                          {e.venueName ? ` · ${[e.city, e.venueName].filter(Boolean).join(", ")}` : ""}
                        </p>
                      )}
                      <p className="mt-5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                        {t.items}
                      </p>
                      <ul className="mt-2 space-y-2">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex items-baseline justify-between gap-4 text-sm">
                            <span className="text-fg">
                              {item.categoryName}
                              {item.seatLabel ? ` · ${item.seatLabel}` : ""}
                              <span className="text-fg-subtle"> × {item.quantity}</span>
                            </span>
                            <span className="text-fg-muted">
                              {formatMoney(item.unitPrice * item.quantity, order.currency, locale)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="h-fit rounded-btn border border-line bg-ink p-4 text-sm">
                      {order.serviceFee > 0 && (
                        <div className="flex justify-between text-fg-muted">
                          <span>{t.fee}</span>
                          <span>{formatMoney(order.serviceFee, order.currency, locale)}</span>
                        </div>
                      )}
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-fg-muted">{t.total}</span>
                        <span className="font-display text-lg font-bold text-fg">
                          {formatMoney(order.total, order.currency, locale)}
                        </span>
                      </div>
                      {order.status === "pending" ? (
                        <Link href={localePath(locale, `/orders/${order.id}`)} className="btn btn-primary mt-4 w-full !py-3">
                          {t.pay}
                        </Link>
                      ) : (
                        <Link href={localePath(locale, `/orders/${order.id}`)} className="btn btn-secondary mt-4 w-full !py-3">
                          {t.details}
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}
