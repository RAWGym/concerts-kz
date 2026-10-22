import type { Locale } from "@/i18n/config";
import { createPublicClient } from "@/lib/supabase/public";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { EventCategory } from "@/lib/supabase/types";

import {
  demoEvents,
  demoNews,
  demoPartners,
  demoPhotoReports,
  demoSiteStats,
} from "./fixtures";
import {
  toEventCard,
  toEventDetail,
  toNewsCard,
  toNewsDetail,
  toPartnerItem,
  toPhotoReportCard,
  toPhotoReportDetail,
  toSiteStatItem,
} from "./mappers";
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

/**
 * Единственное место, которое знает, откуда берётся контент.
 * Пока NEXT_PUBLIC_SUPABASE_* не заполнены, отдаём демо-данные из
 * fixtures.ts — страницы верстаются и собираются без базы.
 */

const EVENT_CARD_FIELDS = `
  id, slug, category, starts_at, age_limit, poster_url, cover_url,
  price_from, currency, badge, is_featured, is_sold_out, ticketon_url,
  venue:venues ( name, city, city_i18n, address, timezone ),
  translations:event_translations ( locale, title, subtitle, description )
`;

const EVENT_DETAIL_FIELDS = `
  id, slug, category, starts_at, doors_open_at, duration_minutes, age_limit,
  poster_url, cover_url, price_from, currency, badge, is_featured,
  is_sold_out, ticketon_url,
  venue:venues ( slug, name, city, city_i18n, address, timezone, map_url ),
  translations:event_translations (
    locale, title, subtitle, description, lineup, faq,
    meta_title, meta_description
  )
`;

export type EventsQuery = {
  limit?: number;
  category?: EventCategory;
  /** Прошедшие события в афише не нужны, но нужны в архиве. */
  includePast?: boolean;
};

function filterDemoEvents({ limit, category, includePast }: EventsQuery) {
  const now = Date.now();

  return demoEvents
    .filter((e) => (category ? e.category === category : true))
    .filter((e) => (includePast ? true : Date.parse(e.starts_at) >= now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .slice(0, limit ?? demoEvents.length);
}

export async function getEvents(
  locale: Locale,
  query: EventsQuery = {},
): Promise<EventCard[]> {
  if (!isSupabaseConfigured) {
    return filterDemoEvents(query).map((raw) => toEventCard(raw, locale));
  }

  let request = createPublicClient()
    .from("events")
    .select(EVENT_CARD_FIELDS)
    .eq("status", "published")
    .order("starts_at", { ascending: true });

  if (query.category) request = request.eq("category", query.category);
  if (!query.includePast) {
    request = request.gte("starts_at", new Date().toISOString());
  }
  if (query.limit) request = request.limit(query.limit);

  const { data, error } = await request.returns<RawEvent[]>();
  if (error) throw error;

  return (data ?? []).map((raw) => toEventCard(raw, locale));
}

/**
 * Событие для героя на главной: сначала помеченное is_featured,
 * иначе просто ближайшее.
 */
export async function getFeaturedEvent(
  locale: Locale,
): Promise<EventCard | null> {
  if (!isSupabaseConfigured) {
    const upcoming = filterDemoEvents({});
    const raw = upcoming.find((e) => e.is_featured) ?? upcoming[0];
    return raw ? toEventCard(raw, locale) : null;
  }

  const { data, error } = await createPublicClient()
    .from("events")
    .select(EVENT_CARD_FIELDS)
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("is_featured", { ascending: false })
    .order("starts_at", { ascending: true })
    .limit(1)
    .returns<RawEvent[]>();

  if (error) throw error;

  const raw = data?.[0];
  return raw ? toEventCard(raw, locale) : null;
}

export async function getEventBySlug(
  slug: string,
  locale: Locale,
): Promise<EventDetail | null> {
  if (!isSupabaseConfigured) {
    const raw = demoEvents.find((e) => e.slug === slug);
    if (!raw) return null;

    // В демо-данных нет полей страницы события — дополняем пустыми.
    const detail: RawEventDetail = {
      ...raw,
      doors_open_at: null,
      duration_minutes: null,
      venue: raw.venue ? { ...raw.venue, slug, map_url: null } : null,
      translations: raw.translations.map((t) => ({
        ...t,
        lineup: null,
        faq: [],
        meta_title: null,
        meta_description: null,
      })),
    };

    return toEventDetail(detail, locale);
  }

  const { data, error } = await createPublicClient()
    .from("events")
    .select(EVENT_DETAIL_FIELDS)
    .eq("status", "published")
    .eq("slug", slug)
    .limit(1)
    .returns<RawEventDetail[]>();

  if (error) throw error;

  const raw = data?.[0];
  return raw ? toEventDetail(raw, locale) : null;
}

/** Слаги для generateStaticParams — без переводов и площадки. */
export async function getEventSlugs(): Promise<string[]> {
  if (!isSupabaseConfigured) return demoEvents.map((e) => e.slug);

  const { data, error } = await createPublicClient()
    .from("events")
    .select("slug")
    .eq("status", "published");

  if (error) throw error;

  return (data ?? []).map((row) => row.slug);
}

export async function getPhotoReports(
  locale: Locale,
  limit?: number,
): Promise<PhotoReportCard[]> {
  if (!isSupabaseConfigured) {
    return demoPhotoReports
      .slice(0, limit ?? demoPhotoReports.length)
      .map((raw) => toPhotoReportCard(raw, locale));
  }

  let request = createPublicClient()
    .from("photo_reports")
    .select("id, slug, city, city_i18n, shot_on, cover_url, title")
    .eq("status", "published")
    .order("shot_on", { ascending: false, nullsFirst: false });

  if (limit) request = request.limit(limit);

  const { data, error } = await request.returns<RawPhotoReport[]>();
  if (error) throw error;

  return (data ?? []).map((raw) => toPhotoReportCard(raw, locale));
}

export async function getPhotoReportBySlug(
  slug: string,
  locale: Locale,
): Promise<PhotoReportDetail | null> {
  if (!isSupabaseConfigured) {
    const raw = demoPhotoReports.find((r) => r.slug === slug);
    if (!raw) return null;

    return toPhotoReportDetail({ ...raw, description: {}, images: [] }, locale);
  }

  const { data, error } = await createPublicClient()
    .from("photo_reports")
    .select(
      `id, slug, city, city_i18n, shot_on, cover_url, title, description,
       images:photo_report_images ( id, url, width, height, alt )`,
    )
    .eq("status", "published")
    .eq("slug", slug)
    .limit(1)
    .returns<RawPhotoReportDetail[]>();

  if (error) throw error;

  const raw = data?.[0];
  return raw ? toPhotoReportDetail(raw, locale) : null;
}

export async function getPhotoReportSlugs(): Promise<string[]> {
  if (!isSupabaseConfigured) return demoPhotoReports.map((r) => r.slug);

  const { data, error } = await createPublicClient()
    .from("photo_reports")
    .select("slug")
    .eq("status", "published");

  if (error) throw error;

  return (data ?? []).map((row) => row.slug);
}

export async function getNews(
  locale: Locale,
  limit?: number,
): Promise<NewsCard[]> {
  if (!isSupabaseConfigured) {
    return demoNews
      .slice(0, limit ?? demoNews.length)
      .map((raw) => toNewsCard(raw, locale));
  }

  let request = createPublicClient()
    .from("news")
    .select("id, slug, cover_url, published_at, title, excerpt")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false });

  if (limit) request = request.limit(limit);

  const { data, error } = await request.returns<RawNews[]>();
  if (error) throw error;

  return (data ?? []).map((raw) => toNewsCard(raw, locale));
}

export async function getNewsBySlug(
  slug: string,
  locale: Locale,
): Promise<NewsDetail | null> {
  if (!isSupabaseConfigured) {
    const raw = demoNews.find((n) => n.slug === slug);
    if (!raw) return null;

    return toNewsDetail({ ...raw, body: raw.excerpt }, locale);
  }

  const { data, error } = await createPublicClient()
    .from("news")
    .select("id, slug, cover_url, published_at, title, excerpt, body")
    .eq("status", "published")
    .eq("slug", slug)
    .limit(1)
    .returns<RawNewsDetail[]>();

  if (error) throw error;

  const raw = data?.[0];
  return raw ? toNewsDetail(raw, locale) : null;
}

export async function getNewsSlugs(): Promise<string[]> {
  if (!isSupabaseConfigured) return demoNews.map((n) => n.slug);

  const { data, error } = await createPublicClient()
    .from("news")
    .select("slug")
    .eq("status", "published");

  if (error) throw error;

  return (data ?? []).map((row) => row.slug);
}

export async function getPartners(): Promise<PartnerItem[]> {
  if (!isSupabaseConfigured) return demoPartners.map(toPartnerItem);

  const { data, error } = await createPublicClient()
    .from("partners")
    .select("id, slug, name, logo_url, website_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .returns<RawPartner[]>();

  if (error) throw error;

  return (data ?? []).map(toPartnerItem);
}

export async function getSiteStats(locale: Locale): Promise<SiteStatItem[]> {
  if (!isSupabaseConfigured) {
    return demoSiteStats.map((raw) => toSiteStatItem(raw, locale));
  }

  const { data, error } = await createPublicClient()
    .from("site_stats")
    .select("id, key, value, label")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .returns<RawSiteStat[]>();

  if (error) throw error;

  return (data ?? []).map((raw) => toSiteStatItem(raw, locale));
}
