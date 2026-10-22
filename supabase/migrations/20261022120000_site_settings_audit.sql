-- ============================================================
-- Настройки сайта и журнал изменений.
-- ============================================================

-- ---------- настройки: контакты, соцсети, объявление ----------

create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

create policy "site_settings: публичное чтение" on public.site_settings
  for select to anon, authenticated using (true);

create policy "site_settings: правит админ" on public.site_settings
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

insert into public.site_settings (key, value) values
  ('contacts', '{"phone": "+7 700 258 62 49", "email": "barsuklighter@gmail.com", "whatsapp": "", "address": {"ru": "Алматы, Северное кольцо, 92/3, офис 37", "kz": "Алматы, Северное кольцо, 92/3, 37-кеңсе", "en": "Almaty, Severnoye Koltso 92/3, office 37"}}'),
  ('socials', '{"instagram": "", "telegram": "", "tiktok": "", "youtube": ""}'),
  ('announcement', '{"enabled": false, "text": {}, "link": ""}')
on conflict (key) do nothing;

-- ---------- журнал изменений ----------

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  actor text,
  table_name text not null,
  record_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  label text,
  changed text[]
);

create index audit_log_at_idx on public.audit_log (at desc);

alter table public.audit_log enable row level security;

create policy "audit_log: читает админ" on public.audit_log
  for select to authenticated using (public.is_super_admin());

-- Пишет триггер от имени владельца, поэтому политик на insert нет:
-- руками записи не подделать.
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  prev jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  cols text[];
  who text;
begin
  -- Изменения от сервера (service role) без пользователя не пишем.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(k) into cols
    from jsonb_object_keys(rec) k
    where k not in ('updated_at', 'created_at') and rec -> k is distinct from prev -> k;
    if cols is null then return new; end if;
  end if;

  select coalesce(full_name, email) into who from public.admins where user_id = auth.uid();

  insert into public.audit_log (user_id, actor, table_name, record_id, action, label, changed)
  values (
    auth.uid(),
    who,
    tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'key', rec ->> 'user_id'),
    lower(tg_op),
    coalesce(rec ->> 'slug', rec ->> 'name', rec ->> 'title', rec ->> 'key', rec ->> 'email', rec ->> 'code'),
    cols
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'events', 'event_translations', 'ticket_categories', 'venues', 'news',
    'photo_reports', 'partners', 'site_stats', 'site_settings', 'admins'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()',
      t || '_audit', t
    );
  end loop;
end $$;
