-- Аудит безопасности 28.10.2026.
-- 1. Отключённый сотрудник теряет доступ сразу: проверки ролей учитывают is_active.
-- 2. Остаток билетов списывается одной операцией в базе, без гонки двух оплат.
-- 3. В публичные папки с картинками можно загрузить только картинки до 20 МБ.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid() and role in ('admin', 'editor') and is_active); $$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid() and role = 'admin' and is_active); $$;

create or replace function public.staff_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.admins where user_id = auth.uid() and is_active; $$;

create or replace function public.consume_category(p_event uuid, p_code text, p_qty int)
returns void language sql security definer set search_path = public
as $$
  update public.ticket_categories
     set available = greatest(0, available - greatest(p_qty, 0))
   where event_id = p_event and code = p_code and available is not null;
$$;
revoke all on function public.consume_category(uuid, text, int) from public, anon, authenticated;
grant execute on function public.consume_category(uuid, text, int) to service_role;

update storage.buckets
   set file_size_limit = 20 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
 where id in ('events', 'photo-reports', 'news', 'partners', 'venues');
