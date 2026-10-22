# Сервер продаж билетов

Supabase Edge Function `tickets`. Сайт обращается к ней по адресу из
переменной `VITE_TICKETS_API_URL` (например
`https://<project>.supabase.co/functions/v1/tickets`).

| Метод | Путь | Что делает |
| --- | --- | --- |
| GET | `/tickets/categories?event=<id>` | Категории и цены из Freedom Ticketon |
| POST | `/orders` | Бронь мест в Ticketon + заказ в базе |
| GET | `/orders/<id>` | Статус заказа |
| POST | `/payments` | Ссылка на оплату у банка-эквайера |
| POST | `/payments/callback` | Уведомление банка об оплате (webhook) |

## Секреты (Supabase → Edge Functions → Secrets)

- `TICKETON_API_URL`, `TICKETON_API_KEY` — доступ к API Freedom Ticketon
- `ACQUIRING_PROVIDER` — какой банк/шлюз (заполнится после договора)
- `ACQUIRING_MERCHANT_ID`, `ACQUIRING_SECRET` — данные мерчанта
- `SITE_URL` — https://concerts.kz

Пока ключей нет, функция отвечает `503 sales_not_configured`, а сайт
показывает «Онлайн-оплата подключается».
