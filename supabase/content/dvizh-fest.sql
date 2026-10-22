-- ============================================================
-- ДВИЖ FEST — реальные данные с Freedom Ticketon.
-- Источник: https://ticketon.kz/event/tckt2-dvizh-fest
--
-- Это контент, а не схема, поэтому файл лежит отдельно от
-- migrations: выполнять руками в SQL Editor. Скрипт идемпотентный.
-- ============================================================

-- ---------- площадка ----------

insert into public.venues (
  slug, name, city, city_i18n, country_code, address,
  timezone, default_currency
)
values (
  'asp-arena', 'ASP Arena', 'Конаев',
  '{"ru": "Конаев", "kz": "Қонаев", "en": "Konayev"}'::jsonb,
  'KZ', 'ASP Club / ASP Arena',
  'Asia/Almaty', 'KZT'
)
on conflict (slug) do update
  set name = excluded.name,
      city = excluded.city,
      city_i18n = excluded.city_i18n,
      address = excluded.address,
      timezone = excluded.timezone;

-- ---------- событие ----------

update public.events set
  venue_id = (select id from public.venues where slug = 'asp-arena'),
  category = 'festival',
  status = 'published',
  -- Основная программа: 1 августа, 12:00. Открытие 31 июля —
  -- вечеринка на бассейне, она указана в описании.
  starts_at = timestamptz '2026-08-01 12:00+05',
  doors_open_at = null,
  age_limit = 16,
  -- Вход на арену 1 августа. На Ticketon в шапке светится «от 3 500 ₸»,
  -- но это цена трансфера Halyk Arena → ASP Arena, а не билета.
  price_from = 20000,
  currency = 'KZT',
  poster_url = '/events/dvizh-fest.png',
  cover_url = null,
  badge = 'last_tickets',
  is_featured = true,
  is_sold_out = false,
  sort_order = 1,
  ticketon_url = 'https://ticketon.kz/event/tckt2-dvizh-fest',
  ticketon_event_id = 'tckt2-dvizh-fest',
  published_at = coalesce(published_at, now())
where slug = 'dvizh-fest';

-- Остальные события снимаем с главной роли, чтобы в герое был фестиваль.
update public.events
  set is_featured = false
  where slug <> 'dvizh-fest' and is_featured;

-- ---------- переводы ----------

insert into public.event_translations (event_id, locale, title, subtitle, description, lineup)
values
  (
    (select id from public.events where slug = 'dvizh-fest'), 'ru',
    'ДВИЖ FEST',
    'Главный фестиваль лета в ASP Arena',
    E'Три дня музыки и отдыха на берегу: большая концертная программа с хедлайнерами, вечерние шоу на главной арене, DJ-сеты у бассейна и пляжные вечеринки до рассвета.\n\nНа территории — фуд-корты, зоны отдыха, картинг и дрифт-такси, аквакартинг и сапборды, глемпинг и отель прямо на площадке.\n\n31 июля фестиваль открывает вечеринка на бассейне ASP.',
    E'1 августа: Тима Белорусских, Bushido Zho, Scally Milano, Johnyboy, UNIK, BAKR, CODE 80\n2 августа: OG Buda, Mayot, 163onmyneck, Omerta, Ulukmanapo, Baby Cute, Scally Milano, Джон Гарик\n\nВедущий — Шах-Love Sosa'
  ),
  (
    (select id from public.events where slug = 'dvizh-fest'), 'kz',
    'ДВИЖ FEST',
    'ASP Arena-дағы жаздың басты фестивалі',
    E'Жағалаудағы үш күндік музыка мен демалыс: хедлайнерлер қатысатын үлкен концерттік бағдарлама, басты аренадағы кешкі шоулар, бассейн жанындағы DJ-сеттер және таңға дейінгі жағажай кештері.\n\nАумақта — фуд-корттар, демалыс аймақтары, картинг пен дрифт-такси, аквакартинг пен сапбордтар, глэмпинг және алаңның дәл өзінде орналасқан қонақүй.\n\n31 шілдеде фестивальді ASP бассейніндегі кеш ашады.',
    E'1 тамыз: Тима Белорусских, Bushido Zho, Scally Milano, Johnyboy, UNIK, BAKR, CODE 80\n2 тамыз: OG Buda, Mayot, 163onmyneck, Omerta, Ulukmanapo, Baby Cute, Scally Milano, Джон Гарик\n\nЖүргізуші — Шах-Love Sosa'
  ),
  (
    (select id from public.events where slug = 'dvizh-fest'), 'en',
    'DVIZH FEST',
    'The summer''s biggest festival at ASP Arena',
    E'Three days of music and leisure by the water: a full concert programme with headliners, evening shows on the main arena, poolside DJ sets and beach parties until sunrise.\n\nOn site: food courts, chill-out zones, karting and drift taxi, aqua-karting and paddleboards, glamping and a hotel right at the venue.\n\nThe festival opens on 31 July with a party at the ASP pool.',
    E'1 August: Tima Belorusskih, Bushido Zho, Scally Milano, Johnyboy, UNIK, BAKR, CODE 80\n2 August: OG Buda, Mayot, 163onmyneck, Omerta, Ulukmanapo, Baby Cute, Scally Milano, John Garik\n\nHost — Shakh-Love Sosa'
  )
on conflict (event_id, locale) do update
  set title = excluded.title,
      subtitle = excluded.subtitle,
      description = excluded.description,
      lineup = excluded.lineup;
