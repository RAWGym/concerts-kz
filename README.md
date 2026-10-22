# concerts.kz

Сайт Concerts Prod: React + Vite + Tailwind, данные и вход через Supabase.
Каждый push в `main` собирается и публикуется на GitHub Pages
(`.github/workflows/deploy.yml`), домен задан в `public/CNAME`.

- `npm run dev` — локальная разработка
- `npm run build` — сборка в `dist/` (+ `404.html` для прямых ссылок)

Без `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` сайт показывает демо-данные
из `src/lib/data/fixtures.ts`. Схема базы — `supabase/migrations`.
Реквизиты компании — `src/lib/company.ts`.
