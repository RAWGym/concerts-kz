/**
 * Типы схемы public.
 *
 * Написаны руками под миграции в supabase/migrations. Когда проект
 * будет залинкован, их можно перегенерировать:
 *   npx supabase gen types typescript --linked > src/lib/supabase/types.ts
 */

export type Locale = "ru" | "kz" | "en";
export type CurrencyCode = "KGS" | "KZT" | "UZS";
export type EventStatus = "draft" | "published" | "archived";
export type EventCategory =
  | "concert"
  | "festival"
  | "standup"
  | "show"
  | "open_air";
export type EventBadge =
  | "none"
  | "new"
  | "soon"
  | "last_tickets"
  | "sold_out";
export type ContentStatus = "draft" | "published" | "archived";
export type PartnerTier = "general" | "official" | "media" | "tech";
export type LeadType = "partner" | "artist" | "booking" | "general";
export type LeadStatus = "new" | "in_progress" | "done" | "spam";

/** Мультиязычное текстовое поле: {"ru": "...", "kz": "...", "en": "..."} */
export type I18nText = Partial<Record<Locale, string>>;

export type VenueRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
  /** Переводы города; пусто — витрина показывает city как есть. */
  city_i18n: I18nText;
  country_code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  map_url: string | null;
  capacity: number | null;
  timezone: string;
  default_currency: CurrencyCode;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  slug: string;
  venue_id: string | null;
  category: EventCategory;
  status: EventStatus;
  starts_at: string;
  doors_open_at: string | null;
  duration_minutes: number | null;
  age_limit: number | null;
  poster_url: string | null;
  cover_url: string | null;
  price_from: number | null;
  currency: CurrencyCode;
  badge: EventBadge;
  is_featured: boolean;
  is_sold_out: boolean;
  sort_order: number;
  ticketon_url: string | null;
  ticketon_event_id: string | null;
  ticketon_widget_id: string | null;
  external_urls: Record<string, string>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventTranslationRow = {
  id: string;
  event_id: string;
  locale: Locale;
  title: string;
  subtitle: string | null;
  description: string | null;
  lineup: string | null;
  faq: { q: string; a: string }[];
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
};

export type PhotoReportRow = {
  id: string;
  slug: string;
  event_id: string | null;
  venue_id: string | null;
  cover_url: string | null;
  shot_on: string | null;
  city: string | null;
  city_i18n: I18nText;
  status: ContentStatus;
  sort_order: number;
  title: I18nText;
  description: I18nText;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PhotoReportImageRow = {
  id: string;
  report_id: string;
  storage_path: string;
  url: string;
  width: number | null;
  height: number | null;
  alt: I18nText;
  sort_order: number;
  created_at: string;
};

export type NewsRow = {
  id: string;
  slug: string;
  event_id: string | null;
  cover_url: string | null;
  status: ContentStatus;
  published_at: string | null;
  title: I18nText;
  excerpt: I18nText;
  body: I18nText;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type PartnerRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  tier: PartnerTier;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadRow = {
  id: string;
  type: LeadType;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  message: string | null;
  locale: Locale;
  source_url: string | null;
  utm: Record<string, string>;
  status: LeadStatus;
  created_at: string;
};

export type SiteStatRow = {
  id: string;
  key: string;
  value: string;
  label: I18nText;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

export type AdminRow = {
  user_id: string;
  role: "admin" | "editor";
  created_at: string;
};

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      admins: TableDef<AdminRow>;
      venues: TableDef<VenueRow>;
      events: TableDef<EventRow>;
      event_translations: TableDef<EventTranslationRow>;
      photo_reports: TableDef<PhotoReportRow>;
      photo_report_images: TableDef<PhotoReportImageRow>;
      news: TableDef<NewsRow>;
      partners: TableDef<PartnerRow>;
      leads: TableDef<
        LeadRow,
        Pick<LeadRow, "name"> & Partial<Omit<LeadRow, "name">>
      >;
      site_stats: TableDef<SiteStatRow>;
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      i18n_text: { Args: { value: I18nText; loc: string }; Returns: string };
    };
    Enums: {
      locale_code: Locale;
      currency_code: CurrencyCode;
      event_status: EventStatus;
      event_category: EventCategory;
      event_badge: EventBadge;
      content_status: ContentStatus;
      partner_tier: PartnerTier;
      lead_type: LeadType;
      lead_status: LeadStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
