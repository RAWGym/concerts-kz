-- ============================================================
-- Сотрудники и роли, тарифы билетов.
--
-- Роли:
--   admin   — всё, включая сотрудников и роли;
--   editor  — контент: события, площадки, новости, отчёты, партнёры;
--   sales   — заказы и заявки, без правки контента.
-- Аккаунты сотрудников создаёт админ через Edge Function admin-users
-- (ей нужен service role, в браузере его нет).
-- ============================================================

alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins
  add constraint admins_role_check check (role in ('admin', 'editor', 'sales'));

alter table public.admins
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

comment on table public.admins is
  'Сотрудники с доступом в /admin и их роли. Заводятся из админки (Edge Function admin-users).';

-- Роль текущего пользователя или null.
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.admins where user_id = auth.uid();
$$;

-- Любой сотрудник.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Право править контент: admin и editor. Старые политики контента
-- уже завязаны на is_admin(), поэтому меняем только её смысл.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where user_id = auth.uid() and role in ('admin', 'editor')
  );
$$;

-- Полный администратор.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.staff_role() from anon;
revoke execute on function public.is_staff() from anon;
revoke execute on function public.is_super_admin() from anon;

-- ---------- admins: админ видит и правит всех ----------

create policy "admins: админ читает всех"
  on public.admins for select
  to authenticated
  using (public.is_super_admin());

create policy "admins: админ меняет роли"
  on public.admins for update
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------- заказы и заявки видят все сотрудники ----------

create policy "orders: staff read" on public.orders
  for select to authenticated using (public.is_staff());
create policy "order_items: staff read" on public.order_items
  for select to authenticated using (public.is_staff());
create policy "payments: all staff read" on public.payments
  for select to authenticated using (public.is_staff());

create policy "leads: сотрудники читают"
  on public.leads for select
  to authenticated
  using (public.is_staff());

create policy "leads: сотрудники меняют статус"
  on public.leads for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ---------- события: продажа на сайте ----------

-- Раньше опубликованному событию была обязательна внешняя ссылка.
-- Теперь билеты продаём сами, поэтому условие снимаем.
alter table public.events drop constraint if exists events_published_needs_tickets;

-- ---------- тарифы билетов ----------

create table public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null,
  name jsonb not null default '{}'::jsonb,
  price numeric(12, 2) not null check (price >= 0),
  -- Сколько билетов осталось. null — без ограничения.
  available integer check (available is null or available >= 0),
  max_per_order integer not null default 6 check (max_per_order > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  ticketon_category_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create index ticket_categories_event_idx on public.ticket_categories (event_id, sort_order);

create trigger ticket_categories_set_updated_at
  before update on public.ticket_categories
  for each row execute function public.set_updated_at();

alter table public.ticket_categories enable row level security;

create policy "ticket_categories: публичное чтение"
  on public.ticket_categories for select
  to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.events e
      where e.id = ticket_categories.event_id and e.status = 'published'
    )
  );

create policy "ticket_categories: полный доступ редактора"
  on public.ticket_categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
