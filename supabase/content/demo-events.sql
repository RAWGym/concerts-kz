-- ============================================================
-- Демо-события: портреты артистов и цены в тенге.
--
-- Фото — с Wikimedia Commons, лицензии CC BY / CC BY-SA.
-- Требуют указания автора, список в public/events/CREDITS.md.
-- Для Mayot свободного фото не нашлось: карточка остаётся с
-- фирменной заглушкой-градиентом.
--
-- Выполнять в SQL Editor. Скрипт идемпотентный.
-- ============================================================

-- ---------- портреты ----------

update public.events set poster_url = '/events/bishkek-nomad-arena.jpg'
  where slug = 'bishkek-nomad-arena';
update public.events set poster_url = '/events/jony-almaty.jpg'
  where slug = 'jony-almaty';
update public.events set poster_url = '/events/macan-almaty.jpg'
  where slug = 'macan-almaty';
update public.events set poster_url = '/events/sqwoz-bab-tashkent.jpg'
  where slug = 'sqwoz-bab-tashkent';

-- ---------- цены в тенге ----------
-- Суммы пересчитаны по курсу, а не просто переподписаны другой
-- валютой: «от 1 200 ₸» за большой концерт читалось бы как ошибка.

-- 1 200 сом ≈ 7 000 ₸
update public.events set price_from = 7000, currency = 'KZT'
  where slug = 'bishkek-nomad-arena';

-- 1 500 сом ≈ 9 000 ₸
update public.events set price_from = 9000, currency = 'KZT'
  where slug = 'mayot-bishkek';

-- 250 000 сум ≈ 10 000 ₸
update public.events set price_from = 10000, currency = 'KZT'
  where slug = 'sqwoz-bab-tashkent';

-- Подстраховка: всё остальное тоже в тенге.
update public.events set currency = 'KZT' where currency <> 'KZT';

-- Новые события должны заводиться в тенге по умолчанию.
update public.venues set default_currency = 'KZT' where default_currency <> 'KZT';
