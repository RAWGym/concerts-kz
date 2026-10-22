-- ============================================================
-- Concerts Prod — базовая схема
--
-- Модель: сайт-витрина. Билеты продаются во внешнем сервисе
-- Freedom Ticketon, поэтому у события есть ticketon_url (ссылка
-- для кнопки «Купить билет») и зарезервированные ticketon_event_id
-- / ticketon_widget_id — чтобы позже подключить виджет или API
-- без изменения схемы.
--
-- Мультиязычность: RU / KZ / EN.
--   • events — отдельная таблица event_translations (много текста,
--     нужен полноценный поиск и SEO по каждой локали);
--   • остальной контент — jsonb-поля вида {"ru": "...", "kz": "..."},
--     читаются функцией public.i18n_text().
-- Мультивалюта: сом (KGS) / тенге (KZT) / сум (UZS).
-- ============================================================

-- ---------- перечисления ----------

create type public.locale_code as enum ('ru', 'kz', 'en');

create type public.currency_code as enum ('KGS', 'KZT', 'UZS');

create type public.event_status as enum ('draft', 'published', 'archived');

create type public.event_category as enum (
  'concert',
  'festival',
  'standup',
  'show',
  'open_air'
);

-- Метка на карточке события. Коралловая по умолчанию, оранжевая
-- для last_tickets, серая для sold_out — см. дизайн-систему.
create type public.event_badge as enum (
  'none',
  'new',
  'soon',
  'last_tickets',
  'sold_out'
);

create type public.content_status as enum ('draft', 'published', 'archived');

create type public.partner_tier as enum ('general', 'official', 'media', 'tech');

create type public.lead_type as enum ('partner', 'artist', 'booking', 'general');

create type public.lead_status as enum ('new', 'in_progress', 'done', 'spam');

-- ---------- служебные функции ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Достаёт текст нужной локали из jsonb-поля с откатом ru → en → любой.
create or replace function public.i18n_text(value jsonb, loc text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(value ->> loc, ''),
    nullif(value ->> 'ru', ''),
    nullif(value ->> 'en', '')
  );
$$;

-- ---------- доступ в админку ----------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Кто имеет доступ к /admin. Менеджера заводим вручную: insert по user_id из auth.users.';

-- security definer, чтобы политики RLS могли читать admins,
-- не упираясь в RLS самой таблицы admins.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

-- ---------- площадки ----------

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  city text not null,
  country_code char(2) not null default 'KZ',
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  map_url text,
  capacity integer check (capacity is null or capacity > 0),
  timezone text not null default 'Asia/Almaty',
  default_currency public.currency_code not null default 'KZT',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index venues_city_idx on public.venues (city);

create trigger venues_set_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

-- ---------- события ----------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  venue_id uuid references public.venues (id) on delete restrict,
  category public.event_category not null default 'concert',
  status public.event_status not null default 'draft',

  starts_at timestamptz not null,
  doors_open_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  age_limit smallint check (age_limit is null or age_limit between 0 and 21),

  -- Вертикальная афиша для карточек и широкий кадр для hero.
  poster_url text,
  cover_url text,

  price_from numeric(12, 2) check (price_from is null or price_from >= 0),
  currency public.currency_code not null default 'KZT',

  badge public.event_badge not null default 'none',
  is_featured boolean not null default false,
  is_sold_out boolean not null default false,
  sort_order integer not null default 0,

  -- Продажа билетов: внешняя ссылка сейчас, задел под виджет/API потом.
  ticketon_url text,
  ticketon_event_id text,
  ticketon_widget_id text,
  external_urls jsonb not null default '{}'::jsonb,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Опубликованному событию нужна либо ссылка на билеты, либо
  -- явный признак, что продажи закрыты.
  constraint events_published_needs_tickets check (
    status <> 'published'
    or ticketon_url is not null
    or is_sold_out
    or badge = 'soon'
  )
);

comment on column public.events.ticketon_url is
  'Внешняя ссылка Freedom Ticketon — кнопка «Купить билет» ведёт сюда.';
comment on column public.events.ticketon_event_id is
  'Идентификатор события в Ticketon. Зарезервировано под будущий виджет/API.';

create index events_schedule_idx on public.events (status, starts_at);
create index events_featured_idx on public.events (is_featured) where is_featured;
create index events_venue_idx on public.events (venue_id);
create index events_category_idx on public.events (category);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------- переводы событий ----------

create table public.event_translations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  locale public.locale_code not null,
  title text not null,
  subtitle text,
  description text,
  lineup text,
  -- [{"q": "Как получить билет?", "a": "..."}]
  faq jsonb not null default '[]'::jsonb,
  meta_title text,
  meta_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, locale)
);

create index event_translations_event_idx on public.event_translations (event_id);

create trigger event_translations_set_updated_at
  before update on public.event_translations
  for each row execute function public.set_updated_at();

-- ---------- фотоотчёты ----------

create table public.photo_reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  event_id uuid references public.events (id) on delete set null,
  venue_id uuid references public.venues (id) on delete set null,
  cover_url text,
  shot_on date,
  city text,
  status public.content_status not null default 'draft',
  sort_order integer not null default 0,
  title jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index photo_reports_status_idx on public.photo_reports (status, shot_on desc);

create trigger photo_reports_set_updated_at
  before update on public.photo_reports
  for each row execute function public.set_updated_at();

create table public.photo_report_images (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.photo_reports (id) on delete cascade,
  storage_path text not null,
  url text not null,
  width integer,
  height integer,
  alt jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index photo_report_images_report_idx
  on public.photo_report_images (report_id, sort_order);

-- ---------- новости ----------

create table public.news (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  event_id uuid references public.events (id) on delete set null,
  cover_url text,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  title jsonb not null default '{}'::jsonb,
  excerpt jsonb not null default '{}'::jsonb,
  body jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index news_published_idx on public.news (status, published_at desc);

create trigger news_set_updated_at
  before update on public.news
  for each row execute function public.set_updated_at();

-- ---------- партнёры ----------

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text,
  website_url text,
  tier public.partner_tier not null default 'official',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partners_active_idx on public.partners (is_active, sort_order);

create trigger partners_set_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

-- ---------- заявки с сайта ----------

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  type public.lead_type not null default 'general',
  name text not null,
  phone text,
  email text,
  company text,
  message text,
  locale public.locale_code not null default 'ru',
  source_url text,
  utm jsonb not null default '{}'::jsonb,
  status public.lead_status not null default 'new',
  created_at timestamptz not null default now(),
  constraint leads_needs_contact check (phone is not null or email is not null)
);

create index leads_inbox_idx on public.leads (status, created_at desc);

-- ---------- цифры о компании ----------

create table public.site_stats (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  -- Текст, а не число: в макете значения вида «300 000+».
  value text not null,
  label jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger site_stats_set_updated_at
  before update on public.site_stats
  for each row execute function public.set_updated_at();
