import { useEffect, useState } from "react";
import { useParams } from "react-router";

import Link from "next/link";
import { Section } from "@/components/ui/section";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { tickets } from "@/lib/tickets/provider";
import type { Order } from "@/lib/tickets/types";

/** Сюда банк возвращает покупателя после оплаты. */
export default function OrderPage() {
  const params = useParams();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const t = getDictionary(locale);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!params.id) return;
    let stop = false;
    // Подтверждение от банка приходит на сервер не мгновенно — опрашиваем.
    const poll = async (attempt = 0) => {
      try {
        const next = await tickets.getOrder(params.id!);
        if (stop) return;
        setOrder(next);
        if (next.status === "pending" && attempt < 20) setTimeout(() => poll(attempt + 1), 3000);
      } catch {
        if (!stop && attempt < 20) setTimeout(() => poll(attempt + 1), 3000);
      }
    };
    poll();
    return () => {
      stop = true;
    };
  }, [params.id]);

  const statusText = order ? t.checkout[`status_${order.status}`] : "…";

  return (
    <Section>
      <div className="mx-auto max-w-md text-center">
        <p className="overline">{t.checkout.statusTitle}</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-fg">№ {params.id}</h1>
        <p className={`mt-6 text-base ${order?.status === "paid" ? "text-teal" : "text-fg-muted"}`}>
          {statusText}
        </p>
        {order && order.total > 0 && (
          <p className="mt-2 text-sm text-fg-subtle">
            {t.checkout.total}: {formatMoney(order.total, order.currency, locale)}
          </p>
        )}
        <Link href={localePath(locale, "/events")} className="btn btn-secondary mt-10">
          {t.nav.events}
        </Link>
      </div>
    </Section>
  );
}
