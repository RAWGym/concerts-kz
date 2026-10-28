import type { Locale } from "@/i18n/config";
import { pickI18n } from "@/lib/format";
import type { I18nText } from "@/lib/supabase/types";

import type {
  EventCard,
  EventDetail,
  NewsCard,
  NewsDetail,
  PartnerItem,
  PhotoReportCard,
  PhotoReportDetail,
  RawEvent,
  RawEventDetail,
  RawNews,
  RawNewsDetail,
  RawPartner,
  RawPhotoReport,
  RawPhotoReportDetail,
  RawSiteStat,
  SiteStatItem,
} from "./types";

/** Часовой пояс по умолчанию, если у события не указана площадка. */
const FALLBACK_TIMEZONE = "Asia/Almaty";

/**
 * Город: сначала перевод из jsonb, иначе каноническое значение
 * колонки city — менеджер мог просто не заполнить переводы.
 */
function localizedCity(
  translations: I18nText | null | undefined,
  fallback: string | null,
  locale: Locale,
): string | null {
  return pickI18n(translations, locale) || fallback;
}

/** Перевод нужной локали с откатом ru → первый доступный. */
function pickTranslation<T extends { locale: Locale }>(
  translations: T[],
  locale: Locale,
): T | undefined {
  return (
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === "ru") ??
    translations[0]
  );
}

export function toEventCard(raw: RawEvent, locale: Locale): EventCard {
  const translation = pickTranslation(raw.translations, locale);

  return {
    id: raw.id,
    slug: raw.slug,
    title: translation?.title ?? raw.slug,
    subtitle: translation?.subtitle ?? null,
    description: translation?.description ?? null,
    category: raw.category,
    startsAt: raw.starts_at,
    timezone: raw.venue?.timezone ?? FALLBACK_TIMEZONE,
    venueName: raw.venue?.name ?? null,
    city: localizedCity(raw.venue?.city_i18n, raw.venue?.city ?? null, locale),
    address: raw.venue?.address ?? null,
    priceFrom: raw.price_from,
    currency: raw.currency,
    badge: raw.badge,
    // Отменённый концерт не продаётся: везде ведёт себя как распроданный.
    isSoldOut: raw.is_sold_out || raw.change_kind === "cancelled",
    isFeatured: raw.is_featured,
    posterUrl: raw.poster_url,
    coverUrl: raw.cover_url,
    ageLimit: raw.age_limit,
    ticketonUrl: raw.ticketon_url,
    changeKind: raw.change_kind ?? null,
    originalStartsAt: raw.original_starts_at ?? null,
  };
}

export function toEventDetail(
  raw: RawEventDetail,
  locale: Locale,
): EventDetail {
  const translation = pickTranslation(raw.translations, locale);

  return {
    ...toEventCard(raw, locale),
    doorsOpenAt: raw.doors_open_at,
    durationMinutes: raw.duration_minutes,
    mapUrl: raw.venue?.map_url ?? null,
    lineup: translation?.lineup ?? null,
    faq: translation?.faq ?? [],
    metaTitle: translation?.meta_title ?? null,
    metaDescription: translation?.meta_description ?? null,
  };
}

export function toPhotoReportCard(
  raw: RawPhotoReport,
  locale: Locale,
): PhotoReportCard {
  return {
    id: raw.id,
    slug: raw.slug,
    title: pickI18n(raw.title, locale),
    city: localizedCity(raw.city_i18n, raw.city, locale),
    shotOn: raw.shot_on,
    coverUrl: raw.cover_url,
  };
}

export function toPhotoReportDetail(
  raw: RawPhotoReportDetail,
  locale: Locale,
): PhotoReportDetail {
  return {
    ...toPhotoReportCard(raw, locale),
    description: pickI18n(raw.description, locale),
    images: raw.images.map((image) => ({
      id: image.id,
      url: image.url,
      width: image.width,
      height: image.height,
      alt: pickI18n(image.alt, locale),
    })),
  };
}

export function toNewsCard(raw: RawNews, locale: Locale): NewsCard {
  return {
    id: raw.id,
    slug: raw.slug,
    title: pickI18n(raw.title, locale),
    excerpt: pickI18n(raw.excerpt, locale),
    publishedAt: raw.published_at,
    coverUrl: raw.cover_url,
  };
}

export function toNewsDetail(raw: RawNewsDetail, locale: Locale): NewsDetail {
  return {
    ...toNewsCard(raw, locale),
    body: pickI18n(raw.body, locale),
  };
}

export function toPartnerItem(raw: RawPartner): PartnerItem {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name,
    logoUrl: raw.logo_url,
    websiteUrl: raw.website_url,
  };
}

export function toSiteStatItem(raw: RawSiteStat, locale: Locale): SiteStatItem {
  return {
    id: raw.id,
    key: raw.key,
    value: raw.value,
    label: pickI18n(raw.label, locale),
  };
}
