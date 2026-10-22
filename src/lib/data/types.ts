import type {
  CurrencyCode,
  EventBadge,
  EventCategory,
  I18nText,
  Locale,
} from "@/lib/supabase/types";

/**
 * «Сырые» строки в том виде, в каком их отдаёт Supabase с присоединённой
 * площадкой и переводами. Демо-данные в fixtures.ts имеют ту же форму,
 * поэтому маппер в карточку один и тот же для базы и для заглушки.
 */

export type RawEvent = {
  id: string;
  slug: string;
  category: EventCategory;
  starts_at: string;
  age_limit: number | null;
  poster_url: string | null;
  cover_url: string | null;
  price_from: number | null;
  currency: CurrencyCode;
  badge: EventBadge;
  is_featured: boolean;
  is_sold_out: boolean;
  ticketon_url: string | null;
  venue: {
    name: string;
    city: string;
    city_i18n: I18nText;
    address: string | null;
    timezone: string;
  } | null;
  translations: {
    locale: Locale;
    title: string;
    subtitle: string | null;
    description: string | null;
  }[];
};

/** Карточка + поля, которые нужны только на странице события. */
export type RawEventDetail = RawEvent & {
  doors_open_at: string | null;
  duration_minutes: number | null;
  venue:
    | (NonNullable<RawEvent["venue"]> & {
        slug: string;
        map_url: string | null;
      })
    | null;
  translations: (RawEvent["translations"][number] & {
    lineup: string | null;
    faq: { q: string; a: string }[];
    meta_title: string | null;
    meta_description: string | null;
  })[];
};

export type RawPhotoReport = {
  id: string;
  slug: string;
  city: string | null;
  city_i18n: I18nText;
  shot_on: string | null;
  cover_url: string | null;
  title: I18nText;
};

export type RawPhotoReportDetail = RawPhotoReport & {
  description: I18nText;
  images: {
    id: string;
    url: string;
    width: number | null;
    height: number | null;
    alt: I18nText;
  }[];
};

export type RawNews = {
  id: string;
  slug: string;
  cover_url: string | null;
  published_at: string | null;
  title: I18nText;
  excerpt: I18nText;
};

export type RawNewsDetail = RawNews & {
  body: I18nText;
};

export type RawPartner = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
};

export type RawSiteStat = {
  id: string;
  key: string;
  value: string;
  label: I18nText;
};

/** Готовые к отрисовке модели — компоненты не знают про схему БД. */

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: EventCategory;
  startsAt: string;
  timezone: string;
  venueName: string | null;
  city: string | null;
  address: string | null;
  priceFrom: number | null;
  currency: CurrencyCode;
  badge: EventBadge;
  isSoldOut: boolean;
  isFeatured: boolean;
  posterUrl: string | null;
  coverUrl: string | null;
  ageLimit: number | null;
  /** Ссылка на Freedom Ticketon. null — продажи ещё не открыты. */
  ticketonUrl: string | null;
};

export type EventDetail = EventCard & {
  doorsOpenAt: string | null;
  durationMinutes: number | null;
  mapUrl: string | null;
  lineup: string | null;
  faq: { q: string; a: string }[];
  metaTitle: string | null;
  metaDescription: string | null;
};

export type PhotoReportCard = {
  id: string;
  slug: string;
  title: string;
  city: string | null;
  shotOn: string | null;
  coverUrl: string | null;
};

export type PhotoReportDetail = PhotoReportCard & {
  description: string;
  images: {
    id: string;
    url: string;
    width: number | null;
    height: number | null;
    alt: string;
  }[];
};

export type NewsCard = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  coverUrl: string | null;
};

export type NewsDetail = NewsCard & {
  body: string;
};

export type PartnerItem = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

export type SiteStatItem = {
  id: string;
  key: string;
  value: string;
  label: string;
};
