-- ============================================================
-- Должности и права, защита событий с продажами, перенос и отмена,
-- заявки на возврат и возвраты через банк, апгрейд билетов,
-- журнал писем. План утверждён 28.10.2026.
--
-- Права проверяет база: интерфейс только прячет лишнее.
-- ============================================================

-- ============ 1. Должности и права ============

alter table public.admins
  add column if not exists position text,
  add column if not exists permissions text[] not null default '{}';

-- Все права системы. Тот же список в src/admin/permissions.ts.
create or replace function public.all_permissions()
returns text[] language sql immutable as $$
  select array[
    'metrics', 'events.edit', 'events.edit_sold', 'events.upgrades', 'events.delete', 'events.delete_confirm',
    'events.postpone', 'events.cancel', 'content', 'orders', 'refunds', 'finance', 'leads',
    'invites', 'scanners', 'entries', 'staff', 'settings', 'audit'
  ]::text[];
$$;

-- Заготовки прав для должностей.
create or replace function public.position_permissions(p text)
returns text[] language sql immutable as $$
  select case p
    when 'owner' then public.all_permissions()
    when 'tech' then array_remove(public.all_permissions(), 'events.delete_confirm')
    when 'admin' then array[
      'metrics', 'events.edit', 'events.edit_sold', 'events.upgrades', 'events.delete', 'events.postpone',
      'content', 'orders', 'refunds', 'finance', 'leads', 'invites', 'scanners', 'entries', 'staff', 'audit']
    when 'marketer' then array['metrics', 'events.edit', 'events.upgrades', 'content', 'leads']
    when 'accountant' then array['metrics', 'orders', 'finance']
    when 'sales' then array['metrics', 'orders', 'refunds', 'leads', 'entries']
    when 'editor' then array['events.edit', 'content']
    else array[]::text[]
  end::text[];
$$;

-- Совместимость: старые проверки смотрят на role.
create or replace function public.position_role(p text)
returns text language sql immutable as $$
  select case
    when p in ('owner', 'tech', 'admin') then 'admin'
    when p in ('marketer', 'editor') then 'editor'
    when p in ('accountant', 'sales') then 'sales'
    when p = 'scanner' then 'scanner'
  end;
$$;

update public.admins set position = case role
  when 'admin' then 'admin' when 'editor' then 'editor' when 'sales' then 'sales' else 'scanner' end
 where position is null;

update public.admins
   set permissions = (
     select coalesce(array_agg(distinct x), '{}') from unnest(
       public.position_permissions(position)
       || case when can_manage_scanners then array['scanners'] else array[]::text[] end
       || case when can_issue_invites then array['invites'] else array[]::text[] end
     ) x)
 where permissions = '{}' and position <> 'scanner';

-- Руслан: владелец. Тех. специалист: те же права, кроме подтверждения удаления
-- (по решению 28.10 удаление подтверждают Руслан или Борис). Борис: все права.
update public.admins a set position = 'owner', permissions = public.position_permissions('owner')
  from auth.users u where u.id = a.user_id and lower(u.email) = 'ruslansoldout@gmail.com';
update public.admins a set position = 'tech', permissions = public.position_permissions('tech')
  from auth.users u where u.id = a.user_id and lower(u.email) = 'maksiimiliano.raw@gmail.com';
update public.admins a set position = 'admin', permissions = public.all_permissions()
  from auth.users u where u.id = a.user_id and lower(u.email) = 'barsuklighter@gmail.com';

alter table public.admins alter column position set not null;
alter table public.admins drop constraint if exists admins_position_check;
alter table public.admins add constraint admins_position_check
  check (position in ('owner', 'tech', 'admin', 'marketer', 'accountant', 'sales', 'editor', 'scanner'));
alter table public.admins drop constraint if exists admins_permissions_check;
alter table public.admins add constraint admins_permissions_check
  check (permissions <@ public.all_permissions() and (position <> 'scanner' or permissions = '{}'));

-- role и старые флаги тикетов следуют за должностью и правами.
create or replace function public.admins_sync_position()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.position is null then
    new.position := case new.role when 'admin' then 'admin' when 'editor' then 'editor' when 'sales' then 'sales' else 'scanner' end;
  end if;
  new.role := public.position_role(new.position);
  if new.position = 'scanner' then
    new.permissions := '{}';
  elsif tg_op = 'INSERT' and coalesce(cardinality(new.permissions), 0) = 0 then
    new.permissions := public.position_permissions(new.position);
  end if;
  select coalesce(array_agg(distinct x order by x), '{}') into new.permissions from unnest(new.permissions) x;
  new.can_manage_scanners := 'scanners' = any (new.permissions);
  new.can_issue_invites := 'invites' = any (new.permissions);
  return new;
end;
$$;

drop trigger if exists admins_sync_position on public.admins;
create trigger admins_sync_position before insert or update on public.admins
  for each row execute function public.admins_sync_position();

-- Право текущего пользователя.
create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where user_id = auth.uid() and is_active and position <> 'scanner' and p = any (permissions)
  );
$$;
revoke execute on function public.has_perm(text) from public, anon;
grant execute on function public.has_perm(text) to authenticated;

-- То же для сервера (service role): кто вызвал, передаётся явно.
create or replace function public.staff_has_perm(p_uid uuid, p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where user_id = p_uid and is_active and position <> 'scanner' and p = any (permissions)
  );
$$;
revoke execute on function public.staff_has_perm(uuid, text) from public, anon, authenticated;
grant execute on function public.staff_has_perm(uuid, text) to service_role;

-- Старые функции получают новый смысл: политики, завязанные на них, работают дальше.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_perm('events.edit') or public.has_perm('content'); $$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_perm('staff'); $$;

create or replace function public.has_ticket_perm(p text)
returns boolean language sql stable security definer set search_path = public
as $$ select p in ('scanners', 'invites') and public.has_perm(p); $$;

-- Проверка изменения сотрудника. Вызывает сервер admin-users перед записью.
-- p_target null: новый сотрудник. Ошибка = отказ.
create or replace function public.staff_check_change(
  p_actor uuid, p_target uuid, p_position text, p_permissions text[], p_is_active boolean, p_delete boolean default false
)
returns void language plpgsql stable security definer set search_path = public as $$
declare
  me public.admins;
  t public.admins;
  top constant text[] := array['owner', 'tech'];
  new_pos text;
  new_perms text[];
begin
  select * into me from public.admins where user_id = p_actor and is_active;
  if not found or me.position = 'scanner' then raise exception 'Нет доступа' using errcode = '42501'; end if;
  if p_target is not null then
    select * into t from public.admins where user_id = p_target;
    if not found then raise exception 'Это не сотрудник' using errcode = '42501'; end if;
  end if;

  new_pos := coalesce(p_position, t.position);
  new_perms := case when new_pos = 'scanner' then '{}'::text[] else coalesce(p_permissions, t.permissions, public.position_permissions(new_pos)) end;

  -- Тикеторами управляет тот, у кого право «Тикеторы».
  if new_pos = 'scanner' and coalesce(t.position, 'scanner') = 'scanner' then
    if not ('scanners' = any (me.permissions)) then raise exception 'Нет права управлять тикеторами' using errcode = '42501'; end if;
    return;
  end if;

  if not ('staff' = any (me.permissions)) then raise exception 'Нет права управлять сотрудниками' using errcode = '42501'; end if;
  if p_target = p_actor then raise exception 'Свою должность и права меняет другой сотрудник' using errcode = '42501'; end if;
  if t.user_id is not null and (t.position = 'scanner') <> (new_pos = 'scanner') then
    raise exception 'Тикетора нельзя сделать сотрудником админки и наоборот. Создайте отдельный аккаунт.';
  end if;
  if (new_pos = any (top) or t.position = any (top)) and not (me.position = any (top)) then
    raise exception 'Владельца и тех. специалиста назначает и меняет только владелец или тех. специалист' using errcode = '42501';
  end if;
  if not (new_perms <@ public.all_permissions()) then raise exception 'Неизвестное право'; end if;
  -- Добавлять можно только те права, которые есть у тебя самого.
  if exists (select 1 from unnest(new_perms) x where not (x = any (me.permissions)) and not (x = any (coalesce(t.permissions, '{}')))) then
    raise exception 'Нельзя выдать право, которого нет у вас: %',
      array_to_string(array(select x from unnest(new_perms) x where not (x = any (me.permissions)) and not (x = any (coalesce(t.permissions, '{}')))), ', ')
      using errcode = '42501';
  end if;
  -- Последний владелец остаётся.
  if t.position = 'owner' and (p_delete or new_pos <> 'owner' or p_is_active is false)
     and not exists (select 1 from public.admins where position = 'owner' and is_active and user_id <> t.user_id) then
    raise exception 'Нельзя убрать последнего владельца';
  end if;
end;
$$;
revoke execute on function public.staff_check_change(uuid, uuid, text, text[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.staff_check_change(uuid, uuid, text, text[], boolean, boolean) to service_role;

-- Запись в журнал изменений от имени сотрудника, когда пишет сервер.
create or replace function public.audit_as(p_actor uuid, p_table text, p_record text, p_action text, p_label text, p_changed text[])
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (user_id, actor, table_name, record_id, action, label, changed)
  values (p_actor, public.staff_name(p_actor), p_table, p_record, p_action, left(p_label, 300), p_changed);
$$;
revoke execute on function public.audit_as(uuid, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.audit_as(uuid, text, text, text, text, text[]) to service_role;

-- ---------- политики по правам ----------

-- Сотрудники: список видят те, кто ими управляет. Менять только через сервер.
drop policy if exists "admins: админ читает всех" on public.admins;
drop policy if exists "admins: админ меняет роли" on public.admins;
create policy "admins: управляющие читают" on public.admins
  for select to authenticated using (public.has_perm('staff') or public.has_perm('scanners'));

-- События, переводы, тарифы.
drop policy if exists "events: полный доступ администратора" on public.events;
create policy "events: сотрудники читают" on public.events for select to authenticated using (public.is_staff());
create policy "events: покупатель видит свои" on public.events for select to authenticated
  using (exists (select 1 from public.orders o where o.event_id = events.id and o.user_id = auth.uid()));
create policy "events: создание" on public.events for insert to authenticated with check (public.has_perm('events.edit'));
create policy "events: правка" on public.events for update to authenticated
  using (public.has_perm('events.edit')) with check (public.has_perm('events.edit'));
create policy "events: удаление" on public.events for delete to authenticated using (public.has_perm('events.delete'));

drop policy if exists "event_translations: полный доступ администратора" on public.event_translations;
create policy "event_translations: сотрудники читают" on public.event_translations for select to authenticated using (public.is_staff());
create policy "event_translations: покупатель видит свои" on public.event_translations for select to authenticated
  using (exists (select 1 from public.orders o where o.event_id = event_translations.event_id and o.user_id = auth.uid()));
create policy "event_translations: правка" on public.event_translations for all to authenticated
  using (public.has_perm('events.edit')) with check (public.has_perm('events.edit'));

drop policy if exists "ticket_categories: полный доступ редактора" on public.ticket_categories;
create policy "ticket_categories: сотрудники читают" on public.ticket_categories for select to authenticated using (public.is_staff());
create policy "ticket_categories: правка" on public.ticket_categories for all to authenticated
  using (public.has_perm('events.edit')) with check (public.has_perm('events.edit'));

-- Контент.
do $$
declare t text;
begin
  foreach t in array array['venues', 'news', 'photo_reports', 'photo_report_images', 'partners', 'site_stats'] loop
    execute format('drop policy if exists %I on public.%I', t || ': полный доступ администратора', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_perm(''content'')) with check (public.has_perm(''content''))',
      t || ': контент', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || ': сотрудники читают', t);
  end loop;
end $$;

-- Заявки с сайта.
drop policy if exists "leads: чтение администратором" on public.leads;
drop policy if exists "leads: обновление администратором" on public.leads;
drop policy if exists "leads: удаление администратором" on public.leads;
drop policy if exists "leads: сотрудники читают" on public.leads;
drop policy if exists "leads: сотрудники меняют статус" on public.leads;
create policy "leads: право заявки" on public.leads for select to authenticated using (public.has_perm('leads'));
create policy "leads: право заявки меняет" on public.leads for update to authenticated
  using (public.has_perm('leads')) with check (public.has_perm('leads'));
create policy "leads: право заявки удаляет" on public.leads for delete to authenticated using (public.has_perm('leads'));

-- Заказы и платежи: покупатель свои, сотрудники с правом заказов, финансов или возвратов.
create or replace function public.can_see_orders()
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_perm('orders') or public.has_perm('finance') or public.has_perm('refunds'); $$;
revoke execute on function public.can_see_orders() from public, anon;
grant execute on function public.can_see_orders() to authenticated;

drop policy if exists "orders: own or staff read" on public.orders;
drop policy if exists "orders: staff read" on public.orders;
create policy "orders: покупатель свои" on public.orders for select to authenticated using (user_id = auth.uid());
create policy "orders: сотрудники с правом" on public.orders for select to authenticated using (public.can_see_orders());

drop policy if exists "order_items: own or staff read" on public.order_items;
drop policy if exists "order_items: staff read" on public.order_items;
create policy "order_items: покупатель свои" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "order_items: сотрудники с правом" on public.order_items for select to authenticated using (public.can_see_orders());

drop policy if exists "payments: staff read" on public.payments;
drop policy if exists "payments: all staff read" on public.payments;
create policy "payments: сотрудники с правом" on public.payments for select to authenticated using (public.can_see_orders());

-- Билеты: покупатель свои купленные, сотрудники по делу.
drop policy if exists "tickets: сотрудники читают" on public.tickets;
create policy "tickets: сотрудники с правом" on public.tickets for select to authenticated
  using (public.can_see_orders() or public.has_perm('entries') or public.has_perm('invites') or public.has_perm('scanners'));
create policy "tickets: покупатель свои" on public.tickets for select to authenticated
  using (kind = 'sale' and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

drop policy if exists "ticket_log: сотрудники читают" on public.ticket_log;
create policy "ticket_log: сотрудники с правом" on public.ticket_log for select to authenticated
  using (public.has_perm('entries') or public.has_perm('scanners') or public.has_perm('invites') or public.can_see_orders());

-- Настройки: служебные номера пригласительных больше не публичны.
drop policy if exists "site_settings: публичное чтение" on public.site_settings;
create policy "site_settings: публичное чтение" on public.site_settings for select to anon, authenticated using (key <> 'invites');
create policy "site_settings: сотрудники читают" on public.site_settings for select to authenticated using (public.is_staff());
drop policy if exists "site_settings: правит админ" on public.site_settings;
create policy "site_settings: правка" on public.site_settings for all to authenticated
  using (public.has_perm('settings')) with check (public.has_perm('settings'));

drop policy if exists "audit_log: читает админ" on public.audit_log;
create policy "audit_log: право журнал" on public.audit_log for select to authenticated using (public.has_perm('audit'));

-- ============ 2. Новые поля событий, заказов и билетов ============

alter table public.events
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_name text,
  add column if not exists change_kind text check (change_kind in ('postponed', 'cancelled')),
  add column if not exists change_note text,
  add column if not exists original_starts_at timestamptz,
  add column if not exists changed_at timestamptz,
  add column if not exists upgrades_enabled boolean not null default false;

alter table public.ticket_categories
  add column if not exists upgrade_to text[] not null default '{}';

alter table public.orders
  add column if not exists kind text not null default 'sale' check (kind in ('sale', 'upgrade')),
  add column if not exists parent_order_id uuid references public.orders (id) on delete restrict,
  add column if not exists refunded_amount numeric(12, 2) not null default 0 check (refunded_amount >= 0),
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists refunded_by uuid references auth.users (id) on delete set null,
  add column if not exists refunded_by_name text;
create index if not exists orders_parent_idx on public.orders (parent_order_id);

alter table public.order_items
  add column if not exists upgrade_from uuid references public.tickets (id) on delete restrict;
create index if not exists order_items_upgrade_from_idx on public.order_items (upgrade_from);

alter table public.tickets
  add column if not exists upgraded_from uuid references public.tickets (id) on delete set null,
  add column if not exists upgraded_to uuid references public.tickets (id) on delete set null,
  add column if not exists paid_total numeric(12, 2);

-- Сколько действующих купленных билетов у события (возвращённые и заменённые не считаются).
create or replace function public.event_sold_count(p_event uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.tickets where event_id = p_event and kind = 'sale' and status in ('valid', 'used');
$$;
revoke execute on function public.event_sold_count(uuid) from public, anon;
grant execute on function public.event_sold_count(uuid) to authenticated, service_role;

-- Были ли у события деньги (оплаты или возвраты): такое событие не стирается, только архив.
create or replace function public.event_has_money(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.orders where event_id = p_event and status in ('paid', 'refunded'));
$$;
revoke execute on function public.event_has_money(uuid) from public, anon;
grant execute on function public.event_has_money(uuid) to authenticated, service_role;

-- ============ 3. Защита событий с продажами ============

create or replace function public.guard_sold_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_event uuid;
begin
  -- Сервер (service role) и согласованные операции базы проходят без проверки.
  if auth.uid() is null or current_setting('app.event_guard_bypass', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_event := case when tg_table_name = 'events' then (r ->> 'id')::uuid else (r ->> 'event_id')::uuid end;

  -- Тариф с проданными билетами не удаляется и не меняет код никем.
  if tg_table_name = 'ticket_categories' and (tg_op = 'DELETE' or (tg_op = 'UPDATE' and (o ->> 'code') is distinct from (r ->> 'code')))
     and exists (select 1 from public.tickets where event_id = v_event and kind = 'sale' and status <> 'void'
                 and category_code = coalesce(o ->> 'code', r ->> 'code')) then
    raise exception 'По тарифу «%» уже проданы билеты: удалить его нельзя. Снимите галочку «В продаже»',
      coalesce(r -> 'name' ->> 'ru', r ->> 'code') using errcode = '42501';
  end if;

  if tg_table_name = 'events' and tg_op = 'DELETE' then
    if public.event_has_money(v_event) then
      raise exception 'По событию были продажи. Удалить его можно только через запрос на подтверждение' using errcode = '42501';
    end if;
    -- Без продаж: неоплаченные заказы и пригласительные уходят вместе с событием.
    delete from public.orders where event_id = v_event and status in ('pending', 'failed', 'expired');
    delete from public.tickets where event_id = v_event and kind = 'invite';
    return old;
  end if;

  if public.event_sold_count(v_event) > 0 and not public.has_perm('events.edit_sold') then
    raise exception 'На событие уже проданы билеты: менять его может владелец, тех. специалист или администратор' using errcode = '42501';
  end if;
  -- Апгрейды настраивает отдельное право.
  if tg_op = 'UPDATE' and not public.has_perm('events.upgrades') and (
       (tg_table_name = 'events' and (o ->> 'upgrades_enabled') is distinct from (r ->> 'upgrades_enabled'))
    or (tg_table_name = 'ticket_categories' and (o -> 'upgrade_to') is distinct from (r -> 'upgrade_to'))) then
    raise exception 'Нет права настраивать апгрейды' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists events_guard_sold on public.events;
create trigger events_guard_sold before update or delete on public.events
  for each row execute function public.guard_sold_event();
drop trigger if exists event_translations_guard_sold on public.event_translations;
create trigger event_translations_guard_sold before insert or update or delete on public.event_translations
  for each row execute function public.guard_sold_event();
drop trigger if exists ticket_categories_guard_sold on public.ticket_categories;
create trigger ticket_categories_guard_sold before insert or update or delete on public.ticket_categories
  for each row execute function public.guard_sold_event();

-- ---------- запросы на удаление ----------

create table if not exists public.event_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid references auth.users (id) on delete set null,
  requested_by_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours',
  notified_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);
create unique index if not exists event_deletion_one_pending on public.event_deletion_requests (event_id) where status = 'pending';
alter table public.event_deletion_requests enable row level security;
create policy "event_deletion_requests: читают" on public.event_deletion_requests for select to authenticated
  using (public.has_perm('events.delete') or public.has_perm('events.delete_confirm'));

create or replace function public.request_event_deletion(p_event uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  if not public.has_perm('events.delete') then raise exception 'Нет права удалять события' using errcode = '42501'; end if;
  if v_reason is null or length(v_reason) < 3 then raise exception 'Укажите причину'; end if;
  if not exists (select 1 from public.events where id = p_event and deleted_at is null) then raise exception 'Событие не найдено'; end if;
  if not public.event_has_money(p_event) then raise exception 'У события нет продаж: его можно удалить сразу'; end if;
  update public.event_deletion_requests set status = 'cancelled', decision_note = 'Истёк срок'
   where event_id = p_event and status = 'pending' and expires_at < now();
  if exists (select 1 from public.event_deletion_requests where event_id = p_event and status = 'pending') then
    raise exception 'Запрос на удаление этого события уже ждёт подтверждения';
  end if;
  insert into public.event_deletion_requests (event_id, reason, requested_by, requested_by_name)
  values (p_event, v_reason, auth.uid(), public.staff_name(auth.uid()))
  returning id into v_id;
  insert into public.audit_log (user_id, actor, table_name, record_id, action, label, changed)
  values (auth.uid(), public.staff_name(auth.uid()), 'events', p_event::text, 'update', 'Запрос на удаление: ' || v_reason, array['deletion_request']);
  return v_id;
end;
$$;
revoke execute on function public.request_event_deletion(uuid, text) from public, anon;
grant execute on function public.request_event_deletion(uuid, text) to authenticated;

create or replace function public.decide_event_deletion(p_request uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q public.event_deletion_requests;
  e public.events;
  v_left int;
  v_name text := public.staff_name(auth.uid());
begin
  select * into q from public.event_deletion_requests where id = p_request for update;
  if not found then raise exception 'Запрос не найден'; end if;
  if q.status <> 'pending' then raise exception 'Запрос уже рассмотрен'; end if;

  -- Отозвать свой запрос может сам автор.
  if not p_approve and q.requested_by = auth.uid() then
    update public.event_deletion_requests set status = 'cancelled', decided_by = auth.uid(), decided_by_name = v_name,
      decided_at = now(), decision_note = left(p_note, 500) where id = q.id;
    return jsonb_build_object('status', 'cancelled');
  end if;

  if not public.has_perm('events.delete_confirm') then raise exception 'Подтверждать удаление может владелец' using errcode = '42501'; end if;
  if q.requested_by = auth.uid() then raise exception 'Свой запрос подтверждает другой человек' using errcode = '42501'; end if;
  if q.expires_at < now() then
    update public.event_deletion_requests set status = 'cancelled', decision_note = 'Истёк срок' where id = q.id;
    raise exception 'Срок запроса истёк, нужен новый';
  end if;

  if not p_approve then
    update public.event_deletion_requests set status = 'rejected', decided_by = auth.uid(), decided_by_name = v_name,
      decided_at = now(), decision_note = left(p_note, 500) where id = q.id;
    insert into public.audit_log (user_id, actor, table_name, record_id, action, label, changed)
    values (auth.uid(), v_name, 'events', q.event_id::text, 'update', 'Удаление отклонено', array['deletion_rejected']);
    return jsonb_build_object('status', 'rejected');
  end if;

  select * into e from public.events where id = q.event_id for update;
  v_left := public.event_sold_count(e.id);
  if coalesce(e.change_kind, '') <> 'cancelled' and v_left > 0 then
    raise exception 'Сначала отмените событие или верните все билеты (действующих: %)', v_left;
  end if;

  perform set_config('app.event_guard_bypass', 'on', true);
  update public.events
     set status = 'archived', deleted_at = now(), deleted_by_name = v_name, is_featured = false
   where id = e.id;
  update public.event_deletion_requests set status = 'approved', decided_by = auth.uid(), decided_by_name = v_name,
    decided_at = now(), decision_note = left(p_note, 500) where id = q.id;
  insert into public.audit_log (user_id, actor, table_name, record_id, action, label, changed)
  values (auth.uid(), v_name, 'events', e.id::text, 'delete', e.slug || ': в архив по запросу ' || coalesce(q.requested_by_name, ''), array['deleted_at']);
  return jsonb_build_object('status', 'approved');
end;
$$;
revoke execute on function public.decide_event_deletion(uuid, boolean, text) from public, anon;
grant execute on function public.decide_event_deletion(uuid, boolean, text) to authenticated;

-- ============ 4. Письма и рассылки ============

create table if not exists public.event_mailings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('postponed', 'cancelled')),
  message text,
  old_starts_at timestamptz,
  new_starts_at timestamptz,
  new_doors_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  recipients int not null default 0
);
alter table public.event_mailings enable row level security;
create policy "event_mailings: читают" on public.event_mailings for select to authenticated
  using (public.has_perm('events.postpone') or public.has_perm('events.cancel') or public.can_see_orders());

create table if not exists public.email_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('tickets', 'upgrade', 'event_change', 'refund', 'deletion_request')),
  to_email text not null,
  subject text,
  order_id uuid references public.orders (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  mailing_id uuid references public.event_mailings (id) on delete set null,
  ref_id uuid,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts int not null default 0,
  error text,
  provider_id text,
  sent_at timestamptz,
  next_try_at timestamptz
);
create index if not exists email_log_order_idx on public.email_log (order_id, created_at desc);
create index if not exists email_log_retry_idx on public.email_log (next_try_at) where status <> 'sent';
alter table public.email_log enable row level security;
create policy "email_log: читают" on public.email_log for select to authenticated
  using (public.can_see_orders() or public.has_perm('events.postpone') or public.has_perm('events.cancel'));

-- ============ 5. Возвраты ============

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  event_id uuid references public.events (id) on delete set null,
  ticket_ids uuid[] not null,
  amount numeric(12, 2) not null check (amount > 0),
  kind text not null check (kind in ('postponed', 'cancelled')),
  reason text,
  status text not null default 'new' check (status in ('new', 'refunded', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  decision_note text
);
create unique index if not exists refund_requests_one_open on public.refund_requests (order_id) where status = 'new';
alter table public.refund_requests enable row level security;
create policy "refund_requests: покупатель свои" on public.refund_requests for select to authenticated using (user_id = auth.uid());
create policy "refund_requests: сотрудники" on public.refund_requests for select to authenticated using (public.can_see_orders());

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete set null,
  provider_payment_id text,
  amount numeric(12, 2) not null check (amount > 0),
  ticket_ids uuid[] not null default '{}',
  reason text not null,
  request_id uuid references public.refund_requests (id) on delete set null,
  -- pending: ждём банк; succeeded: банк вернул; manual: вернули в кабинете банка;
  -- failed: банк отказал; applied: билеты аннулированы, заказ отмечен.
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'manual', 'failed', 'applied')),
  bank_raw text,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index if not exists refunds_order_idx on public.refunds (order_id);
create index if not exists refunds_batch_idx on public.refunds (batch_id);
-- Одновременно по заказу идёт только один незавершённый возврат: двойного списания не будет.
create unique index if not exists refunds_one_open on public.refunds (order_id) where status in ('pending', 'succeeded', 'manual');
alter table public.refunds enable row level security;
create policy "refunds: сотрудники" on public.refunds for select to authenticated using (public.can_see_orders());

-- Исходный (купленный) заказ билета: для заменённых по апгрейду идём по цепочке назад.
create or replace function public.ticket_chain(p_ticket uuid)
returns setof public.tickets language sql stable security definer set search_path = public as $$
  with recursive c (t, depth) as (
    select x, 0 from public.tickets x where x.id = p_ticket
    union all
    select p, c.depth + 1 from c join public.tickets p on p.id = (c.t).upgraded_from where c.depth < 20
  )
  select (c.t).* from c order by c.depth;
$$;
revoke execute on function public.ticket_chain(uuid) from public, anon, authenticated;
grant execute on function public.ticket_chain(uuid) to service_role;

create or replace function public.ticket_root_order(p_ticket uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select order_id from public.ticket_chain(p_ticket) order by created_at limit 1;
$$;
revoke execute on function public.ticket_root_order(uuid) from public, anon, authenticated;
grant execute on function public.ticket_root_order(uuid) to service_role;

-- Действующие купленные билеты заказа (с учётом апгрейдов), сколько за каждый заплачено.
create or replace function public.order_current_tickets(p_order uuid)
returns table (ticket_id uuid, code text, category_name text, seat_label text, status text, paid numeric)
language sql stable security definer set search_path = public as $$
  with recursive c as (
    select t.id as root, t.id, t.upgraded_to from public.tickets t where t.order_id = p_order and t.kind = 'sale'
    union all
    select c.root, n.id, n.upgraded_to from c join public.tickets n on n.id = c.upgraded_to
  )
  select t.id, t.code, t.category_name, t.seat_label, t.status, coalesce(t.paid_total, t.price)
    from c join public.tickets t on t.id = c.id
   where c.upgraded_to is null and t.status in ('valid', 'used')
   order by t.code;
$$;
revoke execute on function public.order_current_tickets(uuid) from public, anon, authenticated;
grant execute on function public.order_current_tickets(uuid) to service_role;

-- Шаг 1 возврата: проверка и строки возврата по каждому платежу (статус pending).
-- Вызывает сервер, предварительно проверив право «Возвраты».
create or replace function public.refund_prepare(
  p_actor uuid, p_order uuid, p_ticket_ids uuid[], p_reason text, p_request uuid default null, p_force boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_ids uuid[];
  v_batch uuid := gen_random_uuid();
  v_used int;
  v_name text := public.staff_name(p_actor);
  g record;
  pay public.payments;
  t public.tickets;
  v_tables text[];
  v_rows jsonb := '[]'::jsonb;
begin
  if v_reason is null then raise exception 'Укажите причину возврата'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found or o.kind <> 'sale' then raise exception 'Заказ не найден'; end if;
  if o.status <> 'paid' then raise exception 'Вернуть можно только оплаченный заказ'; end if;

  v_ids := coalesce(p_ticket_ids, '{}');
  if cardinality(v_ids) = 0 then
    select array_agg(ticket_id) into v_ids from public.order_current_tickets(o.id);
  end if;
  if coalesce(cardinality(v_ids), 0) = 0 then raise exception 'В заказе нет действующих билетов'; end if;

  -- Каждый выбранный билет должен быть действующим билетом этого заказа.
  if exists (select 1 from unnest(v_ids) x where x not in (select ticket_id from public.order_current_tickets(o.id))) then
    raise exception 'Билет не относится к заказу или уже недействителен';
  end if;

  -- Стол продаётся целиком: возвращаем только все места стола вместе.
  select array_agg(distinct substring(seat_label from '^table-(\d+)')) into v_tables
    from public.order_current_tickets(o.id) where ticket_id = any (v_ids) and seat_label ~ '^table-\d+';
  if v_tables is not null and exists (
    select 1 from public.order_current_tickets(o.id)
     where substring(seat_label from '^table-(\d+)') = any (v_tables) and not (ticket_id = any (v_ids))) then
    raise exception 'Стол возвращается целиком: отметьте все места стола';
  end if;

  select count(*) into v_used from public.tickets where id = any (v_ids) and status = 'used';
  if v_used > 0 and not p_force then
    raise exception 'По % бил. уже прошли вход. Подтвердите возврат ещё раз, если он всё равно нужен', v_used
      using errcode = 'P0001', hint = 'used_tickets';
  end if;

  if exists (select 1 from public.refunds r join public.orders x on x.id = r.order_id
              where r.status in ('pending', 'succeeded', 'manual') and (x.id = o.id or x.parent_order_id = o.id)) then
    raise exception 'По заказу уже идёт возврат. Дождитесь завершения или проверьте раздел «Возвраты»';
  end if;

  -- Суммы по заказам цепочки: исходный заказ и заказы доплат.
  for g in
    select c.order_id, sum(c.price) as amount, array_agg(c.id) as ids
      from unnest(v_ids) s(id), lateral public.ticket_chain(s.id) c
     group by c.order_id
  loop
    select * into pay from public.payments
     where order_id = g.order_id and status = 'succeeded' and provider_payment_id is not null
     order by created_at desc limit 1;
    insert into public.refunds (batch_id, order_id, payment_id, provider_payment_id, amount, ticket_ids, reason, request_id, created_by, created_by_name)
    values (v_batch, g.order_id, pay.id, pay.provider_payment_id, g.amount, g.ids, v_reason, p_request, p_actor, v_name);
    if (select total - refunded_amount from public.orders where id = g.order_id) + 0.001 < g.amount then
      raise exception 'Сумма возврата больше оплаченной по заказу';
    end if;
    v_rows := v_rows || jsonb_build_object('order_id', g.order_id, 'amount', g.amount, 'provider_payment_id', pay.provider_payment_id);
  end loop;

  return jsonb_build_object('batch_id', v_batch, 'rows', v_rows, 'ticket_ids', to_jsonb(v_ids));
end;
$$;
revoke execute on function public.refund_prepare(uuid, uuid, uuid[], text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.refund_prepare(uuid, uuid, uuid[], text, uuid, boolean) to service_role;

-- Шаг 3 возврата: когда банк вернул деньги по всем строкам, аннулируем билеты и отмечаем заказы.
create or replace function public.refund_apply(p_batch uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.refunds;
  o public.orders;
  t public.tickets;
  v_voided int := 0;
  v_root uuid;
  v_future boolean;
begin
  if exists (select 1 from public.refunds where batch_id = p_batch and status not in ('succeeded', 'manual', 'applied')) then
    raise exception 'Не все платежи возвращены банком';
  end if;
  for r in select * from public.refunds where batch_id = p_batch and status in ('succeeded', 'manual') order by created_at for update loop
    select * into o from public.orders where id = r.order_id for update;
    -- Билеты: действующие аннулируем, места возвращаем в продажу, пока концерт впереди.
    select starts_at > now() into v_future from public.events where id = o.event_id;
    for t in select * from public.tickets where id = any (r.ticket_ids) and status in ('valid', 'used') for update loop
      update public.tickets set status = 'void', void_reason = 'Возврат: ' || r.reason, voided_at = now(),
             voided_by_name = coalesce(r.created_by_name, 'Система')
       where id = t.id;
      v_voided := v_voided + 1;
      if v_future then
        update public.ticket_categories set available = available + 1
         where event_id = t.event_id and code = t.category_code and available is not null;
      end if;
    end loop;
    update public.orders
       set refunded_amount = least(total, refunded_amount + r.amount),
           status = case when refunded_amount + r.amount >= total - 0.001 then 'refunded'::public.order_status else status end,
           refunded_at = now(), refund_reason = r.reason, refunded_by = r.created_by, refunded_by_name = r.created_by_name
     where id = o.id;
    update public.payments set status = 'refunded'
     where id = r.payment_id and (select status from public.orders where id = o.id) = 'refunded';
    update public.refunds set status = 'applied', applied_at = now() where id = r.id;
    v_root := coalesce(o.parent_order_id, o.id);
    insert into public.ticket_log (actor_id, actor_name, action, result, event_id, message)
    values (r.created_by, r.created_by_name, 'order_refunded', 'ok', o.event_id,
            'Возврат по заказу №' || o.number || ': ' || r.amount || ' ' || o.currency || ', ' || r.reason);
    update public.refund_requests set status = 'refunded', decided_by = r.created_by, decided_by_name = r.created_by_name, decided_at = now()
     where id = r.request_id and status = 'new';
  end loop;
  return jsonb_build_object('ok', true, 'voided', v_voided);
end;
$$;
revoke execute on function public.refund_apply(uuid) from public, anon, authenticated;
grant execute on function public.refund_apply(uuid) to service_role;

-- ============ 6. Апгрейд ============

-- Вызывается после выдачи кодов по оплаченному заказу-доплате.
create or replace function public.apply_upgrade_items(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  it record;
  nt public.tickets;
  ot public.tickets;
begin
  for it in select * from public.order_items where order_id = p_order and upgrade_from is not null and ticket_code is not null loop
    select * into nt from public.tickets where order_item_id = it.id for update;
    if not found or nt.upgraded_from is not null then continue; end if;
    select * into ot from public.tickets where id = it.upgrade_from for update;

    update public.tickets
       set upgraded_from = ot.id,
           paid_total = coalesce(ot.paid_total, ot.price) + nt.price,
           holder_name = coalesce(ot.holder_name, nt.holder_name),
           holder_phone = coalesce(ot.holder_phone, nt.holder_phone),
           holder_email = coalesce(ot.holder_email, nt.holder_email)
     where id = nt.id;

    if ot.status = 'valid' and ot.upgraded_to is null then
      update public.tickets set status = 'void', void_reason = 'Улучшен до «' || nt.category_name || '», новый билет ' || nt.code,
             voided_at = now(), voided_by_name = 'Система', upgraded_to = nt.id
       where id = ot.id;
      update public.ticket_categories set available = available + 1
       where event_id = ot.event_id and code = ot.category_code and available is not null;
    elsif ot.status = 'used' and ot.upgraded_to is null then
      -- Гость уже внутри: новый билет тоже отмечаем пройденным.
      update public.tickets set upgraded_to = nt.id where id = ot.id;
      update public.tickets set status = 'used', used_at = ot.used_at, used_by = ot.used_by, used_by_name = ot.used_by_name,
             used_gate_id = ot.used_gate_id, used_gate_name = ot.used_gate_name where id = nt.id;
    else
      -- Исходный билет уже возвращён или заменён: доплату нужно вернуть.
      update public.tickets set status = 'void', void_reason = 'Апгрейд не применён: исходный билет недействителен, верните доплату',
             voided_at = now(), voided_by_name = 'Система' where id = nt.id;
      insert into public.ticket_log (action, result, event_id, ticket_id, code, message)
      values ('upgrade', 'conflict', nt.event_id, nt.id, nt.code, 'Доплата по заказу без действующего исходного билета ' || ot.code);
    end if;
  end loop;
end;
$$;
revoke execute on function public.apply_upgrade_items(uuid) from public, anon, authenticated;

-- Выдача билетов: после оплаты доплаты сразу связываем старый и новый билет.
create or replace function public.sync_order_tickets(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  it record;
  c text;
  codes text[];
begin
  select * into o from public.orders where id = p_order;
  if not found then return; end if;

  if o.status = 'paid' then
    for it in select * from public.order_items where order_id = p_order and ticket_code is not null loop
      if it.quantity = 1 then
        codes := array[it.ticket_code];
      else
        codes := array(select it.ticket_code || '-' || n from generate_series(1, it.quantity) n);
      end if;
      foreach c in array codes loop
        insert into public.tickets (
          code, event_id, kind, order_id, order_item_id, category_code, category_name, seat_label,
          price, currency, holder_name, holder_phone, holder_email
        ) values (
          c, o.event_id, 'sale', o.id, it.id, it.category_id, it.category_name, it.seat_label,
          it.unit_price, o.currency::text, o.buyer_name, o.buyer_phone, o.buyer_email
        )
        on conflict (code) do nothing;
        if not found and not exists (select 1 from public.tickets where code = c and order_item_id = it.id) then
          raise exception 'ticket code collision: %', c using errcode = '23505';
        end if;
      end loop;
    end loop;
    if o.kind = 'upgrade' then perform public.apply_upgrade_items(p_order); end if;
  elsif o.status = 'refunded' then
    update public.tickets
       set status = 'void', void_reason = coalesce('Возврат: ' || o.refund_reason, 'Заказ возвращён'), voided_at = now(),
           voided_by_name = coalesce(o.refunded_by_name, 'Система')
     where order_id = p_order and status in ('valid', 'used') and upgraded_to is null;
  end if;
end;
$$;

-- ============ 7. Данные для метрик без личных данных покупателей ============

create or replace function public.metrics_orders()
returns table (
  id uuid, number bigint, status public.order_status, kind text, total numeric, refunded_amount numeric, service_fee numeric,
  currency public.currency_code, created_at timestamptz, updated_at timestamptz, expires_at timestamptz, event_id uuid, items jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_perm('metrics') or public.has_perm('finance')) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query
    select o.id, o.number, o.status, o.kind, o.total, o.refunded_amount, o.service_fee, o.currency, o.created_at, o.updated_at,
           o.expires_at, o.event_id,
           coalesce((select jsonb_agg(jsonb_build_object('category_id', i.category_id, 'category_name', i.category_name,
                       'quantity', i.quantity, 'unit_price', i.unit_price)) from public.order_items i where i.order_id = o.id), '[]'::jsonb)
      from public.orders o
     order by o.created_at;
end;
$$;
revoke execute on function public.metrics_orders() from public, anon;
grant execute on function public.metrics_orders() to authenticated;

create or replace function public.metrics_tickets()
returns table (event_id uuid, kind text, status text, upgraded boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_perm('metrics') or public.has_perm('finance')) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  return query select t.event_id, t.kind, t.status, t.upgraded_from is not null from public.tickets t;
end;
$$;
revoke execute on function public.metrics_tickets() from public, anon;
grant execute on function public.metrics_tickets() to authenticated;

-- Журнал изменений: новые таблицы.
do $$
declare t text;
begin
  foreach t in array array['event_deletion_requests', 'refund_requests'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

grant select on public.event_deletion_requests, public.event_mailings, public.email_log, public.refund_requests, public.refunds to authenticated;
grant all on public.event_deletion_requests, public.event_mailings, public.email_log, public.refund_requests, public.refunds to service_role;
