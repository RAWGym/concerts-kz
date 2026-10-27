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

- `ACQUIRING_MERCHANT_ID`: номер магазина FreedomPay (591190)
- `ACQUIRING_SECRET`: секретный ключ для приёма платежей из кабинета FreedomPay
- `ACQUIRING_TESTING`: `1` для тестового режима, удалить для боевых платежей
- `PUBLIC_FUNCTION_URL`: https://jlpfqasntsnuzxlouqvq.supabase.co/functions/v1/tickets
- `SITE_URL`: https://concerts.kz
- `TICKETON_API_URL`, `TICKETON_API_KEY`: необязательно. Без них тарифы,
  цены и остатки берутся из админки (таблица ticket_categories).

Функция развёрнута с `verify_jwt = false` (см. supabase/config.toml):
уведомления FreedomPay приходят без токена, подпись проверяется по pg_sig.

Пока ключей нет, функция отвечает `503 sales_not_configured`, а сайт
показывает «Онлайн-оплата подключается».
