import Link from "next/link";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { formatEventDateTime, formatPriceFrom } from "@/lib/format";
import type { EventCard as EventCardModel } from "@/lib/data/types";

import { EventBadge } from "./event-badge";
import { EventPoster } from "./event-poster";

export function EventCard({
  event,
  locale,
  t,
}: {
  event: EventCardModel;
  locale: Locale;
  t: Dictionary;
}) {
  const href = localePath(locale, `/events/${event.slug}`);
  const price = formatPriceFrom(
    event.priceFrom,
    event.currency,
    locale,
    t.event.priceFrom,
  );

  return (
    <article className="group flex flex-col">
      <Link
        href={href}
        className="relative aspect-[3/4] overflow-hidden rounded-card bg-surface"
      >
        <EventPoster
          src={event.posterUrl}
          alt={event.title}
          sizes="(max-width: 640px) 70vw, (max-width: 1024px) 33vw, 25vw"
        />

        {event.badge !== "none" && (
          <div className="absolute left-3 top-3">
            <EventBadge badge={event.badge} t={t} />
          </div>
        )}
      </Link>

      <div className="mt-4 flex flex-1 flex-col">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-coral">
          {formatEventDateTime(event.startsAt, locale, event.timezone)}
        </p>

        <h3 className="mt-2 font-display text-lg font-semibold leading-tight text-fg">
          <Link href={href} className="transition-colors hover:text-coral">
            {event.title}
          </Link>
        </h3>

        {(event.venueName || event.city) && (
          <p className="mt-1.5 text-sm text-fg-muted">
            {[event.city, event.venueName].filter(Boolean).join(" · ")}
          </p>
        )}

        <p className="mt-3 text-sm text-fg-subtle">
          {event.isSoldOut ? t.actions.soldOut : (price ?? t.actions.soon)}
        </p>
      </div>
    </article>
  );
}
