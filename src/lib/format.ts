import { intlLocale, type Locale } from "@/i18n/config";
import type { CurrencyCode, I18nText } from "@/lib/supabase/types";

/**
 * Валюту подписываем словом, а не кодом: Intl для KGS и UZS выводит
 * «KGS»/«UZS», а в макете — «сом» и «сум».
 */
const currencyLabel: Record<Locale, Record<CurrencyCode, string>> = {
  ru: { KGS: "сом", KZT: "₸", UZS: "сум" },
  kz: { KGS: "сом", KZT: "₸", UZS: "сўм" },
  en: { KGS: "som", KZT: "₸", UZS: "sum" },
};

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  locale: Locale,
): string {
  const number = new Intl.NumberFormat(intlLocale[locale], {
    maximumFractionDigits: 0,
  }).format(amount);

  return `${number} ${currencyLabel[locale][currency]}`;
}

/** «от 1 200 сом» — подпись цены на карточке события. */
export function formatPriceFrom(
  amount: number | null,
  currency: CurrencyCode,
  locale: Locale,
  fromWord: string,
): string | null {
  if (amount === null) return null;
  return `${fromWord} ${formatMoney(amount, currency, locale)}`;
}

/** «11 ноября» */
export function formatEventDate(
  isoDate: string,
  locale: Locale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(isoDate));
}

/** «11 нояб.» — короткий вариант для тесных карточек. */
export function formatEventDateShort(
  isoDate: string,
  locale: Locale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(new Date(isoDate));
}

/** «20:00» в часовом поясе площадки, а не браузера. */
export function formatEventTime(
  isoDate: string,
  locale: Locale,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(isoDate));
}

/** «11 ноября / 20:00» — как в макете. */
export function formatEventDateTime(
  isoDate: string,
  locale: Locale,
  timeZone: string,
): string {
  return `${formatEventDate(isoDate, locale, timeZone)} / ${formatEventTime(isoDate, locale, timeZone)}`;
}

/** Дата публикации новости. */
export function formatNewsDate(isoDate: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    day: "numeric",
    month: "long",
  }).format(new Date(isoDate));
}

/** Читает нужную локаль из jsonb-поля с откатом ru → en. */
export function pickI18n(value: I18nText | null | undefined, locale: Locale): string {
  if (!value) return "";
  return value[locale] || value.ru || value.en || "";
}
