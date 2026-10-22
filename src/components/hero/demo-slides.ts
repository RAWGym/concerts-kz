import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

import type { HeroSlide } from "./types";

/**
 * Наполнение кинематографичного героя: текущее главное событие.
 *
 * Компонент рассчитан на обтравленный портрет с прозрачным фоном, а у
 * реальных событий в базе лежат прямоугольные афиши — в этой сцене они
 * смотрятся неправильно. Поэтому пока показываем заготовленный слайд,
 * а на данные Supabase перейдём, когда появятся обтравленные PNG.
 */
export function demoHeroSlides(locale: Locale): HeroSlide[] {
  return [
    {
      id: "lucaveros-almaty",
      name: "Lucaveros",
      subtitle: "Special guest",
      city: "Алматы",
      venue: "Motor Club",
      schedule: "24 октября / 19:00",
      price: "от 15 000 ₸",
      portraitUrl: null,
      posterUrl: "/events/lucaveros-almaty.jpg",
      ticketonUrl: localePath(locale, "/events/lucaveros-almaty/tickets"),
      detailsHref: localePath(locale, "/events/lucaveros-almaty"),
      mood: {
        accent: "#FF4D4D",
        glow: "rgba(255, 77, 77, 0.22)",
      },
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
