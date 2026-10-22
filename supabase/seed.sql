-- ============================================================
-- Демо-контент по прототипу: витрину можно посмотреть до того,
-- как менеджер заведёт настоящую афишу через /admin.
-- Скрипт идемпотентный — запускать повторно безопасно.
-- ============================================================

-- ---------- площадки ----------

insert into public.venues (slug, name, city, city_i18n, country_code, address, timezone, default_currency, capacity, map_url)
values
  ('nomad-arena', 'Nomad Arena', 'Бишкек', '{"ru": "Бишкек", "kz": "Бішкек", "en": "Bishkek"}'::jsonb, 'KG', 'ул. Байтик Баатыра 2', 'Asia/Bishkek', 'KGS', 8000, 'https://2gis.kg/bishkek'),
  ('bishkek-arena', 'Bishkek Arena', 'Бишкек', '{"ru": "Бишкек", "kz": "Бішкек", "en": "Bishkek"}'::jsonb, 'KG', 'ул. Ибраимова 115', 'Asia/Bishkek', 'KGS', 6000, 'https://2gis.kg/bishkek'),
  ('almaty-arena', 'Almaty Arena', 'Алматы', '{"ru": "Алматы", "kz": "Алматы", "en": "Almaty"}'::jsonb, 'KZ', 'ул. Момышулы 2в', 'Asia/Almaty', 'KZT', 12000, 'https://2gis.kz/almaty'),
  ('halyk-arena', 'Halyk Arena', 'Алматы', '{"ru": "Алматы", "kz": "Алматы", "en": "Almaty"}'::jsonb, 'KZ', 'ул. Момышулы 4', 'Asia/Almaty', 'KZT', 12000, 'https://2gis.kz/almaty'),
  ('central-stadium', 'Central Stadium', 'Алматы', '{"ru": "Алматы", "kz": "Алматы", "en": "Almaty"}'::jsonb, 'KZ', 'пр. Абая 48', 'Asia/Almaty', 'KZT', 23000, 'https://2gis.kz/almaty'),
  ('uzexpo', 'Uzexpo Centre', 'Ташкент', '{"ru": "Ташкент", "kz": "Ташкент", "en": "Tashkent"}'::jsonb, 'UZ', 'ул. Амира Темура 107Б', 'Asia/Tashkent', 'UZS', 9000, 'https://2gis.uz/tashkent')
on conflict (slug) do update
  set name = excluded.name,
      city = excluded.city,
      city_i18n = excluded.city_i18n,
      address = excluded.address,
      timezone = excluded.timezone,
      default_currency = excluded.default_currency;

-- ---------- события ----------

insert into public.events (
  slug, venue_id, category, status, starts_at, doors_open_at, duration_minutes,
  age_limit, price_from, currency, badge, is_featured, is_sold_out, sort_order,
  ticketon_url, published_at
)
values
  (
    'bishkek-nomad-arena',
    (select id from public.venues where slug = 'nomad-arena'),
    'concert', 'published',
    timestamptz '2026-11-11 20:00+06', timestamptz '2026-11-11 19:00+06', 150,
    12, 1200, 'KGS', 'new', true, false, 10,
    'https://ticketon.kz/bishkek-nomad-arena', now()
  ),
  (
    'mayot-bishkek',
    (select id from public.venues where slug = 'bishkek-arena'),
    'concert', 'published',
    timestamptz '2026-11-25 20:00+06', null, 120,
    16, 1500, 'KGS', 'soon', false, false, 20,
    null, now()
  ),
  (
    'jony-almaty',
    (select id from public.venues where slug = 'almaty-arena'),
    'concert', 'published',
    timestamptz '2026-12-03 20:00+05', null, 130,
    6, 9000, 'KZT', 'last_tickets', false, false, 30,
    'https://ticketon.kz/jony-almaty', now()
  ),
  (
    'macan-almaty',
    (select id from public.venues where slug = 'halyk-arena'),
    'concert', 'published',
    timestamptz '2026-12-17 20:00+05', null, 120,
    16, 12000, 'KZT', 'sold_out', false, true, 40,
    'https://ticketon.kz/macan-almaty', now()
  ),
  (
    'dvizh-fest',
    (select id from public.venues where slug = 'central-stadium'),
    'festival', 'published',
    timestamptz '2026-12-28 18:00+05', timestamptz '2026-12-28 16:00+05', 360,
    12, 15000, 'KZT', 'last_tickets', true, false, 5,
    'https://ticketon.kz/dvizh-fest', now()
  ),
  (
    'sqwoz-bab-tashkent',
    (select id from public.venues where slug = 'uzexpo'),
    'concert', 'published',
    timestamptz '2026-12-28 20:00+05', null, 110,
    12, 250000, 'UZS', 'new', false, false, 50,
    'https://ticketon.uz/sqwoz-bab', now()
  )
on conflict (slug) do update
  set venue_id = excluded.venue_id,
      starts_at = excluded.starts_at,
      price_from = excluded.price_from,
      currency = excluded.currency,
      badge = excluded.badge,
      is_featured = excluded.is_featured,
      is_sold_out = excluded.is_sold_out,
      ticketon_url = excluded.ticketon_url,
      status = excluded.status,
      published_at = excluded.published_at;

-- ---------- переводы событий ----------

insert into public.event_translations (event_id, locale, title, subtitle, description)
values
  (
    (select id from public.events where slug = 'bishkek-nomad-arena'), 'ru',
    'Bishkek Nomad Arena', 'Главное событие осени',
    'Большой сольный концерт с новой программой и всеми любимыми треками. Живой звук, мощный свет и атмосфера, которую невозможно забыть.'
  ),
  (
    (select id from public.events where slug = 'bishkek-nomad-arena'), 'kz',
    'Bishkek Nomad Arena', 'Күздің басты оқиғасы',
    'Жаңа бағдарлама мен сүйікті әндер қамтылған үлкен жеке концерт. Тірі дыбыс, қуатты жарық және ұмытылмас атмосфера.'
  ),
  (
    (select id from public.events where slug = 'bishkek-nomad-arena'), 'en',
    'Bishkek Nomad Arena', 'The main event of the autumn',
    'A full solo show with a brand new programme and every track you love. Live sound, powerful lighting and an atmosphere you will not forget.'
  ),

  ((select id from public.events where slug = 'mayot-bishkek'), 'ru', 'Mayot', 'Большой сольный концерт', 'Новый альбом целиком и специальные гости вечера.'),
  ((select id from public.events where slug = 'mayot-bishkek'), 'kz', 'Mayot', 'Үлкен жеке концерт', 'Жаңа альбом толығымен және кештің арнайы қонақтары.'),
  ((select id from public.events where slug = 'mayot-bishkek'), 'en', 'Mayot', 'Solo show', 'The new album in full, plus special guests.'),

  ((select id from public.events where slug = 'jony-almaty'), 'ru', 'Jony', 'Концерт в Алматы', 'Лучшие песни и премьеры нового материала.'),
  ((select id from public.events where slug = 'jony-almaty'), 'kz', 'Jony', 'Алматыдағы концерт', 'Үздік әндер және жаңа материалдың премьерасы.'),
  ((select id from public.events where slug = 'jony-almaty'), 'en', 'Jony', 'Live in Almaty', 'Greatest hits and new material live.'),

  ((select id from public.events where slug = 'macan-almaty'), 'ru', 'Macan', 'Концерт в Алматы', 'Все билеты распроданы.'),
  ((select id from public.events where slug = 'macan-almaty'), 'kz', 'Macan', 'Алматыдағы концерт', 'Барлық билет сатылып кетті.'),
  ((select id from public.events where slug = 'macan-almaty'), 'en', 'Macan', 'Live in Almaty', 'Sold out.'),

  ((select id from public.events where slug = 'dvizh-fest'), 'ru', 'Dvizh Fest', 'Открытый фестиваль', 'Три сцены, двенадцать артистов и afterparty до утра.'),
  ((select id from public.events where slug = 'dvizh-fest'), 'kz', 'Dvizh Fest', 'Ашық фестиваль', 'Үш сахна, он екі әртіс және таңға дейінгі afterparty.'),
  ((select id from public.events where slug = 'dvizh-fest'), 'en', 'Dvizh Fest', 'Open air festival', 'Three stages, twelve artists and an afterparty until sunrise.'),

  ((select id from public.events where slug = 'sqwoz-bab-tashkent'), 'ru', 'Sqwoz Bab', 'Концерт в Ташкенте', 'Первый большой концерт в Узбекистане.'),
  ((select id from public.events where slug = 'sqwoz-bab-tashkent'), 'kz', 'Sqwoz Bab', 'Ташкенттегі концерт', 'Өзбекстандағы алғашқы үлкен концерт.'),
  ((select id from public.events where slug = 'sqwoz-bab-tashkent'), 'en', 'Sqwoz Bab', 'Live in Tashkent', 'The first big show in Uzbekistan.')
on conflict (event_id, locale) do update
  set title = excluded.title,
      subtitle = excluded.subtitle,
      description = excluded.description;

-- ---------- фотоотчёты ----------

insert into public.photo_reports (slug, city, city_i18n, shot_on, status, sort_order, title, published_at)
values
  ('dvizh-fest-2025', 'Алматы', '{"ru": "Алматы", "kz": "Алматы", "en": "Almaty"}'::jsonb, date '2025-12-28', 'published', 10,
   '{"ru": "Dvizh Fest 2025", "kz": "Dvizh Fest 2025", "en": "Dvizh Fest 2025"}'::jsonb, now()),
  ('mayot-almaty', 'Алматы', '{"ru": "Алматы", "kz": "Алматы", "en": "Almaty"}'::jsonb, date '2026-03-14', 'published', 20,
   '{"ru": "Mayot · Алматы", "kz": "Mayot · Алматы", "en": "Mayot · Almaty"}'::jsonb, now()),
  ('jony-astana', 'Астана', '{"ru": "Астана", "kz": "Астана", "en": "Astana"}'::jsonb, date '2026-04-20', 'published', 30,
   '{"ru": "Jony · Астана", "kz": "Jony · Астана", "en": "Jony · Astana"}'::jsonb, now()),
  ('open-air-issyk-kul', 'Иссык-Куль', '{"ru": "Иссык-Куль", "kz": "Ыстықкөл", "en": "Issyk-Kul"}'::jsonb, date '2026-07-05', 'published', 40,
   '{"ru": "Open Air · Иссык-Куль", "kz": "Open Air · Ыстықкөл", "en": "Open Air · Issyk-Kul"}'::jsonb, now())
on conflict (slug) do update
  set title = excluded.title,
      city_i18n = excluded.city_i18n,
      status = excluded.status,
      shot_on = excluded.shot_on;

-- ---------- новости ----------

insert into public.news (slug, status, published_at, title, excerpt)
values
  ('dvizh-fest-2026-sale', 'published', timestamptz '2026-07-24 10:00+05',
   '{"ru": "Открыли продажи на Dvizh Fest 2026", "kz": "Dvizh Fest 2026 билеттері сатылымда", "en": "Dvizh Fest 2026 tickets are on sale"}'::jsonb,
   '{"ru": "Три сцены и двенадцать артистов в одном дне.", "kz": "Бір күнде үш сахна және он екі әртіс.", "en": "Three stages and twelve artists in one day."}'::jsonb),
  ('five-years', 'published', timestamptz '2026-07-12 10:00+05',
   '{"ru": "Нашей команде 5 лет: как мы работаем", "kz": "Командамызға 5 жыл: біз қалай жұмыс істейміз", "en": "Five years of our team: how we work"}'::jsonb,
   '{"ru": "Коротко о том, из чего складывается концерт.", "kz": "Концерт неден құралатыны туралы қысқаша.", "en": "A short look at what makes a show happen."}'::jsonb)
on conflict (slug) do update
  set title = excluded.title,
      excerpt = excluded.excerpt,
      status = excluded.status,
      published_at = excluded.published_at;

-- ---------- партнёры ----------

insert into public.partners (slug, name, tier, sort_order, is_active)
values
  ('freedom', 'Freedom', 'general', 10, true),
  ('nomad', 'Nomad', 'official', 20, true),
  ('halyk', 'Halyk', 'official', 30, true),
  ('yandex', 'Yandex', 'tech', 40, true),
  ('kaspi', 'Kaspi', 'official', 50, true),
  ('raw', 'Raw', 'media', 60, true)
on conflict (slug) do update
  set name = excluded.name,
      tier = excluded.tier,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active;

-- ---------- цифры о компании ----------

insert into public.site_stats (key, value, label, sort_order, is_active)
values
  ('events', '50+', '{"ru": "мероприятий", "kz": "іс-шара", "en": "events"}'::jsonb, 10, true),
  ('visitors', '300 000+', '{"ru": "посетителей", "kz": "көрермен", "en": "visitors"}'::jsonb, 20, true),
  ('cities', '10+', '{"ru": "городов", "kz": "қала", "en": "cities"}'::jsonb, 30, true),
  ('countries', '5+', '{"ru": "стран", "kz": "ел", "en": "countries"}'::jsonb, 40, true)
on conflict (key) do update
  set value = excluded.value,
      label = excluded.label,
      sort_order = excluded.sort_order;
