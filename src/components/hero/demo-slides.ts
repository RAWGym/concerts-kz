import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

import type { EventCard } from "@/lib/data/types";
import { formatEventDateTime, formatPriceFrom } from "@/lib/format";

import type { HeroSlide } from "./types";

/**
 * Слайд героя из события «на главной» (is_featured, иначе ближайшее).
 * У событий прямоугольные афиши, поэтому показываем их карточкой.
 */
export function heroSlideFromEvent(
  event: EventCard | null,
  locale: Locale,
  t: Dictionary,
): HeroSlide[] {
  if (!event) return [];
  return [
    {
      id: event.id,
      name: event.title,
      subtitle: event.subtitle,
      city: event.city,
      venue: event.venueName,
      schedule: formatEventDateTime(event.startsAt, locale, event.timezone),
      price: formatPriceFrom(event.priceFrom, event.currency, locale, t.event.priceFrom),
      portraitUrl: null,
      posterUrl: event.posterUrl,
      ticketonUrl: event.isSoldOut
        ? null
        : (event.ticketonUrl ?? localePath(locale, `/events/${event.slug}/tickets`)),
      detailsHref: localePath(locale, `/events/${event.slug}`),
      mood: { accent: "#FF4D4D", glow: "rgba(255, 77, 77, 0.22)" },
    },
  ];
}

/** Подписи кнопок и меток героя — одинаковые для всех страниц. */
export function heroLabels(t: Dictionary) {
  return {
    overline: t.home.heroOverline,
    buyTicket: t.actions.buyTicket,
    details: t.actions.details,
    soon: t.actions.soon,
    soldOut: t.actions.soldOut,
  };
}
