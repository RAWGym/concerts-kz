-- ============================================================
-- Продажа билетов на сайте: заказы, позиции и платежи.
--
-- Схема мест и выпуск билетов — на стороне Freedom Ticketon,
-- деньги — у банка-эквайера. Здесь храним заказ покупателя, его
-- статус и связь с внешними идентификаторами. Пишет в эти таблицы
-- только сервер продаж (service role), покупатель читает свои заказы.
-- ============================================================

create type public.order_status as enum ('pending', 'paid', 'failed', 'expired', 'refunded');
create type public.payment_status as enum ('created', 'succeeded', 'failed', 'refunded');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  event_id uuid not null references public.events (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,

  buyer_name text not null,
  buyer_phone text not null,
  buyer_email text not null,
  locale public.locale_code not null default 'ru',

  status public.order_status not null default 'pending',
  total numeric(12, 2) not null check (total >= 0),
  service_fee numeric(12, 2) not null default 0 check (service_fee >= 0),
  currency public.currency_code not null,

  accepted_terms_at timestamptz not null,
  expires_at timestamptz,

  -- Идентификаторы во внешних системах
  ticketon_order_id text,
  ticketon_payload jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_event_idx on public.orders (event_id);
create index orders_user_idx on public.orders (user_id);
create index orders_email_idx on public.orders (lower(buyer_email));

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  category_id text not null,
  category_name text not null,
  seat_label text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  ticket_code text
);

create index order_items_order_idx on public.order_items (order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  status public.payment_status not null default 'created',
  amount numeric(12, 2) not null check (amount >= 0),
  currency public.currency_code not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create index payments_order_idx on public.payments (order_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------- доступ ----------

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

-- Покупатель видит свои заказы, сотрудники — все.
create policy "orders: own or staff read" on public.orders
  for select using (user_id = auth.uid() or public.is_admin());

create policy "order_items: own or staff read" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "payments: staff read" on public.payments
  for select using (public.is_admin());

-- insert / update делает только сервер продаж ключом service role,
-- для него RLS не действует, поэтому отдельные политики не нужны.
