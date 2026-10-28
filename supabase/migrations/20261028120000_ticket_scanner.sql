-- ============================================================
-- Билетная система: проверка билетов на входе.
--
--   tickets             — каждый билет, который можно сканировать:
--                         купленный на сайте (копия из order_items)
--                         и пригласительный (выписан в админке).
--   venue_gates         — заготовки входов площадки.
--   event_gates         — входы конкретного концерта, какие типы
--                         билетов пропускают.
--   scanner_assignments — какой тикетор на каком концерте и входе.
--   ticket_log          — журнал: сканы, выдача и аннулирование
--                         приглашений, отмена проходов.
--
-- Всё, что меняет билеты, идёт через функции ниже (security definer).
-- Прямой записи в tickets и ticket_log у клиентов нет, поэтому
-- журнал нельзя подделать, а проход нельзя отметить в обход проверки.
-- ============================================================

-- ---------- роли и права ----------

alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins
  add constraint admins_role_check check (role in ('admin', 'editor', 'sales', 'scanner'));

alter table public.admins
  add column if not exists can_manage_scanners boolean not null default false,
  add column if not exists can_issue_invites boolean not null default false,
  add column if not exists is_active boolean not null default true;

-- У тикетора нет дополнительных прав, только сканирование.
alter table public.admins
  add constraint admins_scanner_no_perms check (
    role <> 'scanner' or (not can_manage_scanners and not can_issue_invites)
  );

-- Сотрудник админки (без тикеторов): заказы, заявки, проходы.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where user_id = auth.uid() and role in ('admin', 'editor', 'sales') and is_active
  );
$$;

-- Право на действие с билетами: 'scanners' — тикеторы и входы,
-- 'invites' — пригласительные. Администратору можно всё.
create or replace function public.has_ticket_perm(p text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where user_id = auth.uid()
      and is_active
      and role <> 'scanner'
      and (
        role = 'admin'
        or (p = 'scanners' and can_manage_scanners)
        or (p = 'invites' and can_issue_invites)
      )
  );
$$;

create or replace function public.is_scanner_user(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = p_uid and role = 'scanner');
$$;
revoke execute on function public.is_scanner_user(uuid) from public, anon;
grant execute on function public.is_scanner_user(uuid) to authenticated;

-- ---------- служебные номера для пригласительных ----------

insert into public.site_settings (key, value)
values ('invites', '{"service_phones": ["+77777777777"]}')
on conflict (key) do nothing;

-- ---------- входы ----------

create table public.venue_gates (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (venue_id, name)
);

create table public.event_gates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  -- Коды тарифов (ticket_categories.code), которые пропускает вход.
  -- Пустой список — любые купленные билеты.
  category_codes text[] not null default '{}',
  allow_invites boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create index event_gates_event_idx on public.event_gates (event_id, sort_order);

create table public.scanner_assignments (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  -- null — любой вход.
  gate_id uuid references public.event_gates (id) on delete set null,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index scanner_assignments_event_idx on public.scanner_assignments (event_id);

-- ---------- билеты ----------

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9A-F]{12}(-[0-9]{1,3})?$'),
  event_id uuid not null references public.events (id) on delete restrict,
  kind text not null check (kind in ('sale', 'invite')),

  -- купленный
  order_id uuid references public.orders (id) on delete restrict,
  order_item_id uuid references public.order_items (id) on delete restrict,
  category_code text,
  category_name text not null,
  seat_label text,
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency text,

  -- кому
  holder_name text,
  holder_phone text,
  holder_email text,

  -- пригласительный: кто выписал (он же владелец)
  issued_by uuid references auth.users (id) on delete set null,
  issued_by_name text,
  batch_id uuid,
  is_service boolean not null default false,
  note text,

  status text not null default 'valid' check (status in ('valid', 'used', 'void')),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  used_by_name text,
  used_gate_id uuid references public.event_gates (id) on delete set null,
  used_gate_name text,
  void_reason text,
  voided_at timestamptz,
  voided_by_name text,

  created_at timestamptz not null default now(),

  check (kind <> 'sale' or order_id is not null),
  check (kind <> 'invite' or (issued_by_name is not null and holder_phone is not null and price = 0)),
  check (status <> 'used' or used_at is not null)
);

create index tickets_event_idx on public.tickets (event_id, status);
create index tickets_order_idx on public.tickets (order_id);
create index tickets_batch_idx on public.tickets (batch_id);

-- Один номер — одно действующее приглашение на концерт (кроме служебных).
create unique index tickets_invite_phone_uniq
  on public.tickets (event_id, holder_phone)
  where kind = 'invite' and status <> 'void' and not is_service;

-- ---------- журнал ----------

create table public.ticket_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_name text,
  action text not null,
  result text,
  event_id uuid references public.events (id) on delete set null,
  ticket_id uuid references public.tickets (id) on delete set null,
  code text,
  gate_name text,
  message text,
  device text
);

create index ticket_log_at_idx on public.ticket_log (at desc);
create index ticket_log_event_idx on public.ticket_log (event_id, at desc);
create index ticket_log_actor_idx on public.ticket_log (actor_id, event_id, at desc);

-- ---------- доступ ----------

alter table public.venue_gates enable row level security;
alter table public.event_gates enable row level security;
alter table public.scanner_assignments enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_log enable row level security;

create policy "venue_gates: сотрудники читают" on public.venue_gates
  for select to authenticated using (public.is_staff());
create policy "venue_gates: правят" on public.venue_gates
  for all to authenticated
  using (public.is_admin() or public.has_ticket_perm('scanners'))
  with check (public.is_admin() or public.has_ticket_perm('scanners'));

create policy "event_gates: сотрудники читают" on public.event_gates
  for select to authenticated using (public.is_staff());
create policy "event_gates: правят" on public.event_gates
  for all to authenticated
  using (public.has_ticket_perm('scanners'))
  with check (public.has_ticket_perm('scanners'));

create policy "scanner_assignments: читают" on public.scanner_assignments
  for select to authenticated using (public.is_staff());
create policy "scanner_assignments: правят" on public.scanner_assignments
  for all to authenticated
  using (public.has_ticket_perm('scanners'))
  with check (
    public.has_ticket_perm('scanners')
    and public.is_scanner_user(user_id)
    and (gate_id is null or exists (
      select 1 from public.event_gates g where g.id = gate_id and g.event_id = scanner_assignments.event_id
    ))
  );

create policy "tickets: сотрудники читают" on public.tickets
  for select to authenticated using (public.is_staff());

create policy "ticket_log: сотрудники читают" on public.ticket_log
  for select to authenticated using (public.is_staff());

revoke insert, update, delete, truncate on public.tickets from anon, authenticated;
revoke insert, update, delete, truncate on public.ticket_log from anon, authenticated;

-- Тикетор сам меняет только пароль; строку в admins ему трогать нельзя.
-- (политика update на admins есть только у администратора)

-- ---------- служебные функции ----------

create or replace function public.staff_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(full_name), ''), email, 'Сотрудник') from public.admins where user_id = p_uid;
$$;

/** Номер телефона в виде +7XXXXXXXXXX или null, если он не казахстанский/российский. */
create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 and left(d, 1) = '8' then d := '7' || substr(d, 2); end if;
  if length(d) = 10 then d := '7' || d; end if;
  if length(d) = 11 and left(d, 1) = '7' then return '+' || d; end if;
  return null;
end;
$$;

create or replace function public.mask_phone(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p ~ '^\+7\d{10}$' then '+7 ' || substr(p, 3, 3) || ' ***-**-' || right(p, 2)
    else p
  end;
$$;

create or replace function public.new_ticket_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare c text;
begin
  for i in 1..20 loop
    c := upper(encode(extensions.gen_random_bytes(6), 'hex'));
    if not exists (select 1 from public.tickets where code = c or code like c || '-%')
       and not exists (select 1 from public.order_items where ticket_code = c) then
      return c;
    end if;
  end loop;
  raise exception 'не удалось подобрать код билета';
end;
$$;

-- ---------- купленные билеты попадают в общий список сами ----------

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
        -- Код уже занят другим билетом: откатываем запись кода,
        -- сервер продаж подберёт новый.
        if not found and not exists (select 1 from public.tickets where code = c and order_item_id = it.id) then
          raise exception 'ticket code collision: %', c using errcode = '23505';
        end if;
      end loop;
    end loop;
  elsif o.status = 'refunded' then
    update public.tickets
       set status = 'void', void_reason = 'Заказ возвращён', voided_at = now(), voided_by_name = 'Система'
     where order_id = p_order and status = 'valid';
  end if;
end;
$$;

create or replace function public.order_items_sync_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ticket_code is not null then
    perform public.sync_order_tickets(new.order_id);
  end if;
  return new;
end;
$$;

create or replace function public.orders_sync_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.sync_order_tickets(new.id);
  end if;
  return new;
end;
$$;

create trigger order_items_tickets
  after insert or update of ticket_code on public.order_items
  for each row execute function public.order_items_sync_tickets();

create trigger orders_tickets
  after update of status on public.orders
  for each row execute function public.orders_sync_tickets();

-- Уже оплаченные заказы.
do $$
declare r record;
begin
  for r in select id from public.orders where status = 'paid' loop
    perform public.sync_order_tickets(r.id);
  end loop;
end $$;

-- ---------- данные билета для ответа сканеру ----------

create or replace function public.ticket_json(t public.tickets)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id,
    'code', t.code,
    'kind', t.kind,
    'status', t.status,
    'holder_name', t.holder_name,
    'holder_phone', public.mask_phone(t.holder_phone),
    'category_name', t.category_name,
    'category_code', t.category_code,
    'seat_label', t.seat_label,
    'price', t.price,
    'currency', t.currency,
    'order_number', (select number from public.orders where id = t.order_id),
    'issued_by_name', t.issued_by_name,
    'is_service', t.is_service,
    'created_at', t.created_at,
    'used_at', t.used_at,
    'used_by', t.used_by,
    'used_by_name', t.used_by_name,
    'used_gate_name', t.used_gate_name,
    'void_reason', t.void_reason
  );
$$;

create or replace function public.event_title(p_event uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select title from public.event_translations where event_id = p_event and locale = 'ru'),
    (select title from public.event_translations where event_id = p_event limit 1),
    (select slug from public.events where id = p_event)
  );
$$;

create or replace function public.event_entry_stats(p_event uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', count(*) filter (where status <> 'void'),
    'used', count(*) filter (where status = 'used'),
    'invites', count(*) filter (where kind = 'invite' and status <> 'void'),
    'denied', (select count(*) from public.ticket_log l
               where l.event_id = p_event and l.action = 'scan' and l.result <> 'ok')
  )
  from public.tickets where event_id = p_event;
$$;

-- ---------- приложение тикетора ----------

/** Кто я и на какие концерты назначен. */
create or replace function public.scanner_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me record;
  evs jsonb;
begin
  select * into me from public.admins where user_id = auth.uid();
  if not found then return jsonb_build_object('allowed', false); end if;
  if not me.is_active then return jsonb_build_object('allowed', false, 'disabled', true); end if;

  select coalesce(jsonb_agg(x order by x->>'starts_at'), '[]'::jsonb) into evs
  from (
    select jsonb_build_object(
      'id', e.id,
      'title', public.event_title(e.id),
      'starts_at', e.starts_at,
      'doors_open_at', e.doors_open_at,
      'poster_url', e.poster_url,
      'venue', v.name,
      'city', v.city,
      'timezone', coalesce(v.timezone, 'Asia/Almaty'),
      'gate', case when g.id is null then null else jsonb_build_object('id', g.id, 'name', g.name) end,
      'gates', (select coalesce(jsonb_agg(jsonb_build_object('id', eg.id, 'name', eg.name) order by eg.sort_order, eg.name), '[]'::jsonb)
                from public.event_gates eg where eg.event_id = e.id),
      'stats', public.event_entry_stats(e.id)
    ) as x
    from public.events e
    left join public.venues v on v.id = e.venue_id
    left join public.scanner_assignments a on a.event_id = e.id and a.user_id = me.user_id
    left join public.event_gates g on g.id = a.gate_id
    where e.starts_at > now() - interval '18 hours'
      and (
        a.user_id is not null
        or (me.role = 'admin' and e.status = 'published' and e.starts_at < now() + interval '60 days')
      )
  ) s;

  return jsonb_build_object(
    'allowed', true,
    'user_id', me.user_id,
    'name', public.staff_name(me.user_id),
    'role', me.role,
    'events', evs
  );
end;
$$;

/**
 * Проверка билета на входе. Отметка «прошёл» ставится одним UPDATE
 * с условием status = 'valid': при одновременном скане одного кода
 * с двух телефонов строку получит только один, второй увидит «уже прошёл».
 */
create or replace function public.scan_ticket(p_event uuid, p_code text, p_gate uuid default null, p_device text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me record;
  asg record;
  gate public.event_gates;
  t public.tickets;
  v_code text;
  v_result text;
  v_msg text;
  v_extra jsonb := '{}'::jsonb;
  v_name text;
begin
  select * into me from public.admins where user_id = auth.uid();
  if not found or not me.is_active then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_name := public.staff_name(me.user_id);

  select * into asg from public.scanner_assignments where user_id = me.user_id and event_id = p_event;
  if asg.user_id is null and me.role <> 'admin' then
    insert into public.ticket_log (actor_id, actor_name, action, result, event_id, code, message, device)
    values (me.user_id, v_name, 'scan', 'not_assigned', p_event, left(p_code, 64), 'Тикетор не назначен на концерт', left(p_device, 120));
    return jsonb_build_object('result', 'not_assigned');
  end if;

  -- Вход: назначенный админом; если не задан, тот, что выбран в приложении.
  if asg.gate_id is not null then
    select * into gate from public.event_gates where id = asg.gate_id;
  elsif p_gate is not null then
    select * into gate from public.event_gates where id = p_gate and event_id = p_event;
  end if;

  -- Код из QR: сам код или ссылка на страницу билета.
  v_code := upper(substring(upper(coalesce(p_code, '')) from '([0-9A-F]{12}(-[0-9]{1,3})?)'));

  if v_code is null then
    v_result := 'invalid';
    v_msg := 'Не похоже на билет';
  else
    select * into t from public.tickets where code = v_code;
    if not found then
      v_result := 'not_found';
      v_msg := 'Билет не найден';
    elsif t.event_id <> p_event then
      v_result := 'wrong_event';
      v_msg := 'Билет на другой концерт: ' || public.event_title(t.event_id);
      v_extra := jsonb_build_object('event_title', public.event_title(t.event_id),
        'event_starts_at', (select starts_at from public.events where id = t.event_id));
    elsif t.status = 'void' then
      v_result := 'void';
      v_msg := 'Билет аннулирован' || coalesce(': ' || t.void_reason, '');
    elsif gate.id is not null and (
      (t.kind = 'invite' and not gate.allow_invites)
      or (t.kind = 'sale' and cardinality(gate.category_codes) > 0 and not (coalesce(t.category_code, '') = any (gate.category_codes)))
    ) then
      v_result := 'wrong_gate';
      v_msg := 'Не тот вход';
      v_extra := jsonb_build_object('gates', (
        select coalesce(jsonb_agg(g.name order by g.sort_order, g.name), '[]'::jsonb)
        from public.event_gates g
        where g.event_id = p_event and (
          (t.kind = 'invite' and g.allow_invites)
          or (t.kind = 'sale' and (cardinality(g.category_codes) = 0 or coalesce(t.category_code, '') = any (g.category_codes)))
        )
      ));
    else
      update public.tickets
         set status = 'used', used_at = now(), used_by = me.user_id, used_by_name = v_name,
             used_gate_id = gate.id, used_gate_name = gate.name
       where id = t.id and status = 'valid'
      returning * into t;
      if found then
        v_result := 'ok';
        v_msg := case when t.kind = 'invite' then 'Пропущен гость от ' || t.issued_by_name else 'Пропущен' end;
      else
        select * into t from public.tickets where code = v_code;
        v_result := 'already_used';
        v_msg := 'Уже прошёл в ' || to_char(t.used_at at time zone 'Asia/Almaty', 'HH24:MI DD.MM') || coalesce(', ' || t.used_by_name, '');
      end if;
    end if;
  end if;

  insert into public.ticket_log (actor_id, actor_name, action, result, event_id, ticket_id, code, gate_name, message, device)
  values (me.user_id, v_name, 'scan', v_result, p_event, t.id, coalesce(v_code, left(p_code, 64)), gate.name, v_msg, left(p_device, 120));

  return jsonb_build_object(
    'result', v_result,
    'message', v_msg,
    'code', v_code,
    'gate', gate.name,
    'ticket', case when t.id is null then null else public.ticket_json(t) end,
    'stats', public.event_entry_stats(p_event),
    'me', me.user_id,
    'at', now()
  ) || v_extra;
end;
$$;

/** Последние сканы тикетора на концерте. */
create or replace function public.scanner_recent(p_event uuid, p_limit int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'at', l.at, 'result', l.result, 'code', l.code, 'message', l.message, 'gate', l.gate_name,
    'holder_name', t.holder_name, 'category_name', t.category_name, 'kind', t.kind
  ) order by l.at desc), '[]'::jsonb)
  from (
    select * from public.ticket_log
    where actor_id = auth.uid() and event_id = p_event and action = 'scan'
    order by at desc
    limit least(greatest(p_limit, 1), 100)
  ) l
  left join public.tickets t on t.id = l.ticket_id;
$$;

create or replace function public.scanner_stats(p_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid() and is_active) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public.event_entry_stats(p_event);
end;
$$;

/** Запись о входе в приложение (версия, устройство). */
create or replace function public.scanner_hello(p_device text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid() and is_active) then return; end if;
  insert into public.ticket_log (actor_id, actor_name, action, result, message, device)
  values (auth.uid(), public.staff_name(auth.uid()), 'app_open', 'ok', 'Вход в приложение', left(p_device, 120));
end;
$$;

-- ---------- пригласительные ----------

/**
 * Выписать пригласительные. p_guests: [{ "phone": "+7…", "name": "…", "count": 1 }].
 * count больше 1 — только для служебных номеров. Всё или ничего:
 * при любой ошибке не создаётся ни один билет.
 */
create or replace function public.issue_invites(p_event uuid, p_guests jsonb, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_batch uuid := gen_random_uuid();
  v_service text[];
  g jsonb;
  v_phone text;
  v_guest text;
  v_count int;
  v_total int := 0;
  v_seen text[] := '{}';
  v_bad text[] := '{}';
  v_dupe text[] := '{}';
  t public.tickets;
  out jsonb := '[]'::jsonb;
begin
  if not public.has_ticket_perm('invites') then
    raise exception 'Нет права выписывать пригласительные' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event) then
    raise exception 'Концерт не найден';
  end if;
  if jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) = 0 then
    raise exception 'Добавьте хотя бы одного гостя';
  end if;

  v_name := public.staff_name(v_uid);
  select coalesce(array(select public.normalize_phone(x) from jsonb_array_elements_text(value -> 'service_phones') x), '{}')
    into v_service from public.site_settings where key = 'invites';
  v_service := coalesce(v_service, array['+77777777777']);

  -- Проверяем всё до записи.
  for g in select * from jsonb_array_elements(p_guests) loop
    v_phone := public.normalize_phone(g ->> 'phone');
    v_count := coalesce(nullif(g ->> 'count', '')::int, 1);
    if v_phone is null then
      v_bad := v_bad || coalesce(g ->> 'phone', '(пусто)');
      continue;
    end if;
    if v_count < 1 or v_count > 500 then
      raise exception 'Количество от 1 до 500 (номер %)', v_phone;
    end if;
    if not (v_phone = any (v_service)) then
      if v_count > 1 then
        raise exception 'Несколько билетов на один номер можно только на служебный (%)', array_to_string(v_service, ', ');
      end if;
      if v_phone = any (v_seen) or exists (
        select 1 from public.tickets
        where event_id = p_event and kind = 'invite' and holder_phone = v_phone and status <> 'void' and not is_service
      ) then
        v_dupe := v_dupe || v_phone;
      end if;
      v_seen := v_seen || v_phone;
    end if;
    v_total := v_total + v_count;
  end loop;

  if cardinality(v_bad) > 0 then
    raise exception 'Неверный номер: %. Нужен формат +7XXXXXXXXXX', array_to_string(v_bad, ', ');
  end if;
  if cardinality(v_dupe) > 0 then
    raise exception 'На этот концерт уже выписано приглашение: %', array_to_string(v_dupe, ', ');
  end if;
  if v_total > 1000 then
    raise exception 'За один раз не больше 1000 билетов';
  end if;

  for g in select * from jsonb_array_elements(p_guests) loop
    v_phone := public.normalize_phone(g ->> 'phone');
    v_guest := nullif(left(btrim(coalesce(g ->> 'name', '')), 120), '');
    v_count := coalesce(nullif(g ->> 'count', '')::int, 1);
    for i in 1..v_count loop
      insert into public.tickets (
        code, event_id, kind, category_name, price, holder_name, holder_phone,
        issued_by, issued_by_name, batch_id, is_service, note
      ) values (
        public.new_ticket_code(), p_event, 'invite', 'Пригласительный', 0, v_guest, v_phone,
        v_uid, v_name, v_batch, v_phone = any (v_service), nullif(left(btrim(coalesce(p_note, '')), 300), '')
      ) returning * into t;
      insert into public.ticket_log (actor_id, actor_name, action, result, event_id, ticket_id, code, message)
      values (v_uid, v_name, 'invite_issued', 'ok', p_event, t.id, t.code,
              'Пригласительный: ' || coalesce(v_guest || ', ', '') || v_phone);
      out := out || jsonb_build_object('id', t.id, 'code', t.code, 'holder_name', t.holder_name, 'holder_phone', t.holder_phone);
    end loop;
  end loop;

  return jsonb_build_object('batch_id', v_batch, 'tickets', out);
end;
$$;

/** Аннулировать пригласительный (выписавший или администратор). */
create or replace function public.void_ticket(p_ticket uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.staff_role();
  t public.tickets;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  if v_reason is null then raise exception 'Укажите причину'; end if;
  select * into t from public.tickets where id = p_ticket for update;
  if not found then raise exception 'Билет не найден'; end if;
  if t.kind <> 'invite' then
    raise exception 'Купленный билет аннулируется возвратом заказа';
  end if;
  if not (v_role = 'admin' or (t.issued_by = v_uid and public.has_ticket_perm('invites'))) then
    raise exception 'Аннулировать может выписавший или администратор' using errcode = '42501';
  end if;
  if t.status <> 'valid' then
    raise exception 'Билет уже %', case t.status when 'used' then 'использован' else 'аннулирован' end;
  end if;
  update public.tickets
     set status = 'void', void_reason = v_reason, voided_at = now(), voided_by_name = public.staff_name(v_uid)
   where id = t.id;
  insert into public.ticket_log (actor_id, actor_name, action, result, event_id, ticket_id, code, message)
  values (v_uid, public.staff_name(v_uid), 'ticket_voided', 'ok', t.event_id, t.id, t.code, 'Аннулирован: ' || v_reason);
  return jsonb_build_object('ok', true);
end;
$$;

/** Отменить ошибочный проход (только администратор, с причиной). */
create or replace function public.revert_entry(p_ticket uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  t public.tickets;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  if coalesce(public.staff_role(), '') <> 'admin' then
    raise exception 'Отменить проход может только администратор' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'Укажите причину'; end if;
  select * into t from public.tickets where id = p_ticket for update;
  if not found or t.status <> 'used' then raise exception 'Проход по этому билету не отмечен'; end if;
  update public.tickets
     set status = 'valid', used_at = null, used_by = null, used_by_name = null, used_gate_id = null, used_gate_name = null
   where id = t.id;
  insert into public.ticket_log (actor_id, actor_name, action, result, event_id, ticket_id, code, gate_name, message)
  values (v_uid, public.staff_name(v_uid), 'entry_reverted', 'ok', t.event_id, t.id, t.code, t.used_gate_name,
          'Отменён проход от ' || to_char(t.used_at at time zone 'Asia/Almaty', 'HH24:MI DD.MM') || ' (' || coalesce(t.used_by_name, '?') || '): ' || v_reason);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- журнал действий с тикеторами и входами ----------

create or replace function public.log_ticket_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record := coalesce(new, old);
  v_msg text;
  v_event uuid;
begin
  if auth.uid() is null then return rec; end if;
  if tg_table_name = 'scanner_assignments' then
    v_event := rec.event_id;
    v_msg := case tg_op
      when 'DELETE' then 'Снят с концерта: '
      when 'INSERT' then 'Назначен на концерт: '
      else 'Изменён вход: ' end
      || public.staff_name(rec.user_id)
      || coalesce(', вход ' || (select name from public.event_gates where id = rec.gate_id), '');
  elsif tg_table_name = 'event_gates' then
    v_event := rec.event_id;
    v_msg := case tg_op when 'DELETE' then 'Удалён вход: ' when 'INSERT' then 'Добавлен вход: ' else 'Изменён вход: ' end || rec.name;
  elsif tg_table_name = 'admins' then
    if rec.role <> 'scanner' and not (tg_op = 'UPDATE' and old.role = 'scanner') then return rec; end if;
    v_msg := case tg_op
      when 'DELETE' then 'Удалён тикетор: '
      when 'INSERT' then 'Создан тикетор: '
      else case when new.is_active is distinct from old.is_active
                then case when new.is_active then 'Включён тикетор: ' else 'Отключён тикетор: ' end
                else 'Изменён тикетор: ' end
      end || coalesce(rec.full_name, rec.email, '');
  end if;
  insert into public.ticket_log (actor_id, actor_name, action, result, event_id, message)
  values (auth.uid(), public.staff_name(auth.uid()), 'admin', 'ok', v_event, v_msg);
  return rec;
end;
$$;

create trigger scanner_assignments_log after insert or update or delete on public.scanner_assignments
  for each row execute function public.log_ticket_admin();
create trigger event_gates_log after insert or update or delete on public.event_gates
  for each row execute function public.log_ticket_admin();
create trigger admins_scanner_log after insert or update or delete on public.admins
  for each row execute function public.log_ticket_admin();

-- Создание тикетора идёт через сервер (service role, без auth.uid()),
-- поэтому сервер передаёт автора явно.
create or replace function public.log_scanner_account(p_actor uuid, p_message text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.ticket_log (actor_id, actor_name, action, result, message)
  values (p_actor, public.staff_name(p_actor), 'admin', 'ok', left(p_message, 300));
$$;

-- ---------- права на функции ----------

do $$
declare f text;
begin
  foreach f in array array[
    'public.has_ticket_perm(text)', 'public.staff_name(uuid)', 'public.new_ticket_code()',
    'public.sync_order_tickets(uuid)', 'public.order_items_sync_tickets()', 'public.orders_sync_tickets()',
    'public.ticket_json(public.tickets)', 'public.event_title(uuid)', 'public.event_entry_stats(uuid)',
    'public.scanner_me()', 'public.scan_ticket(uuid, text, uuid, text)', 'public.scanner_recent(uuid, int)',
    'public.scanner_stats(uuid)', 'public.scanner_hello(text)', 'public.issue_invites(uuid, jsonb, text)',
    'public.void_ticket(uuid, text)', 'public.revert_entry(uuid, text)', 'public.log_ticket_admin()',
    'public.log_scanner_account(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

grant execute on function public.has_ticket_perm(text) to authenticated;
grant execute on function public.scanner_me() to authenticated;
grant execute on function public.scan_ticket(uuid, text, uuid, text) to authenticated;
grant execute on function public.scanner_recent(uuid, int) to authenticated;
grant execute on function public.scanner_stats(uuid) to authenticated;
grant execute on function public.scanner_hello(text) to authenticated;
grant execute on function public.issue_invites(uuid, jsonb, text) to authenticated;
grant execute on function public.void_ticket(uuid, text) to authenticated;
grant execute on function public.revert_entry(uuid, text) to authenticated;
revoke execute on function public.sync_order_tickets(uuid) from authenticated;
revoke execute on function public.new_ticket_code() from authenticated;
revoke execute on function public.log_scanner_account(uuid, text) from authenticated;
revoke execute on function public.ticket_json(public.tickets) from authenticated;
revoke execute on function public.event_entry_stats(uuid) from authenticated;
revoke execute on function public.staff_name(uuid) from authenticated;
revoke execute on function public.event_title(uuid) from authenticated;

-- Сервер админки (admin-users) пишет в журнал действия с аккаунтами тикеторов.
grant execute on function public.log_scanner_account(uuid, text) to service_role;
