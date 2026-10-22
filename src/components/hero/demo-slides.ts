import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

import type { HeroSlide } from "./types";

/**
 * Временное наполнение кинематографичного героя.
 *
 * Компонент рассчитан на обтравленный портрет с прозрачным фоном, а у
 * реальных событий в базе лежат прямоугольные афиши — в этой сцене они
 * смотрятся неправильно. Поэтому пока показываем заготовленный слайд,
 * а на данные Supabase перейдём, когда появятся обтравленные PNG.
 */
export function demoHeroSlides(locale: Locale): HeroSlide[] {
  return [
    {
      id: "mayot",
      name: "Mayot",
      // Не heroOverline: он уже стоит надстрочником, и подпись
      // повторяла его слово в слово.
      subtitle: "Большой сольный концерт",
      city: "Бишкек",
      venue: "Bishkek Arena",
      schedule: "25 ноября / 20:00",
      price: "от 9 000 ₸",
      portraitUrl: "/Mayot.png",
      ticketonUrl: localePath(locale, "/events/mayot-bishkek/tickets"),
      detailsHref: localePath(locale, "/events/mayot-bishkek"),
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
