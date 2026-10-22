-- ============================================================
-- Названия городов по локалям.
--
-- venues.city и photo_reports.city остаются каноническими: по ним
-- удобно фильтровать и группировать, их видит менеджер в админке.
-- Для витрины рядом кладём jsonb с переводами; пустой объект —
-- законное состояние, i18n_text() тогда откатится на city.
-- ============================================================

alter table public.venues
  add column city_i18n jsonb not null default '{}'::jsonb;

alter table public.photo_reports
  add column city_i18n jsonb not null default '{}'::jsonb;

comment on column public.venues.city_i18n is
  'Город по локалям: {"ru": "Алматы", "kz": "Алматы", "en": "Almaty"}. Пусто — показываем city как есть.';
comment on column public.photo_reports.city_i18n is
  'Город по локалям. См. venues.city_i18n.';

-- ---------- бэкфилл по городам, которые уже есть ----------

update public.venues v
  set city_i18n = d.translations
  from (
    values
      ('Алматы',     '{"ru": "Алматы", "kz": "Алматы", "en": "Almaty"}'::jsonb),
      ('Астана',     '{"ru": "Астана", "kz": "Астана", "en": "Astana"}'::jsonb),
      ('Бишкек',     '{"ru": "Бишкек", "kz": "Бішкек", "en": "Bishkek"}'::jsonb),
      ('Ташкент',    '{"ru": "Ташкент", "kz": "Ташкент", "en": "Tashkent"}'::jsonb),
      ('Шымкент',    '{"ru": "Шымкент", "kz": "Шымкент", "en": "Shymkent"}'::jsonb),
      ('Караганда',  '{"ru": "Караганда", "kz": "Қарағанды", "en": "Karaganda"}'::jsonb),
      ('Иссык-Куль', '{"ru": "Иссык-Куль", "kz": "Ыстықкөл", "en": "Issyk-Kul"}'::jsonb)
  ) as d(city, translations)
  where v.city = d.city and v.city_i18n = '{}'::jsonb;

update public.photo_reports r
  set city_i18n = d.translations
  from (
    values
      ('Алматы',     '{"ru": "Алматы", "kz": "Алматы", "en": "Almaty"}'::jsonb),
      ('Астана',     '{"ru": "Астана", "kz": "Астана", "en": "Astana"}'::jsonb),
      ('Бишкек',     '{"ru": "Бишкек", "kz": "Бішкек", "en": "Bishkek"}'::jsonb),
      ('Ташкент',    '{"ru": "Ташкент", "kz": "Ташкент", "en": "Tashkent"}'::jsonb),
      ('Шымкент',    '{"ru": "Шымкент", "kz": "Шымкент", "en": "Shymkent"}'::jsonb),
      ('Караганда',  '{"ru": "Караганда", "kz": "Қарағанды", "en": "Karaganda"}'::jsonb),
      ('Иссык-Куль', '{"ru": "Иссык-Куль", "kz": "Ыстықкөл", "en": "Issyk-Kul"}'::jsonb)
  ) as d(city, translations)
  where r.city = d.city and r.city_i18n = '{}'::jsonb;
