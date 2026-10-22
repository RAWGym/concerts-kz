-- ============================================================
-- Storage: публичные бакеты под медиа афиши.
-- Читают все, загружает и удаляет только администратор.
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('events', 'events', true),
  ('photo-reports', 'photo-reports', true),
  ('news', 'news', true),
  ('partners', 'partners', true),
  ('venues', 'venues', true)
on conflict (id) do nothing;

create policy "storage: публичное чтение медиа"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('events', 'photo-reports', 'news', 'partners', 'venues'));

create policy "storage: загрузка администратором"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('events', 'photo-reports', 'news', 'partners', 'venues')
    and public.is_admin()
  );

create policy "storage: изменение администратором"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('events', 'photo-reports', 'news', 'partners', 'venues')
    and public.is_admin()
  )
  with check (
    bucket_id in ('events', 'photo-reports', 'news', 'partners', 'venues')
    and public.is_admin()
  );

create policy "storage: удаление администратором"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('events', 'photo-reports', 'news', 'partners', 'venues')
    and public.is_admin()
  );
