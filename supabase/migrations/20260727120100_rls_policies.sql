-- ============================================================
-- RLS: анонимный посетитель видит только опубликованное,
-- менеджер из public.admins имеет полный доступ.
-- Заявки (leads) — единственное, что аноним может писать.
-- ============================================================

alter table public.admins enable row level security;
alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_translations enable row level security;
alter table public.photo_reports enable row level security;
alter table public.photo_report_images enable row level security;
alter table public.news enable row level security;
alter table public.partners enable row level security;
alter table public.leads enable row level security;
alter table public.site_stats enable row level security;

-- ---------- admins ----------

create policy "admins: читает себя"
  on public.admins for select
  to authenticated
  using (user_id = auth.uid());

-- ---------- venues ----------

create policy "venues: публичное чтение"
  on public.venues for select
  to anon, authenticated
  using (true);

create policy "venues: полный доступ администратора"
  on public.venues for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- events ----------

create policy "events: публичное чтение опубликованных"
  on public.events for select
  to anon, authenticated
  using (status = 'published');

create policy "events: полный доступ администратора"
  on public.events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- event_translations ----------

create policy "event_translations: публичное чтение опубликованных"
  on public.event_translations for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_translations.event_id
        and e.status = 'published'
    )
  );

create policy "event_translations: полный доступ администратора"
  on public.event_translations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- photo_reports ----------

create policy "photo_reports: публичное чтение опубликованных"
  on public.photo_reports for select
  to anon, authenticated
  using (status = 'published');

create policy "photo_reports: полный доступ администратора"
  on public.photo_reports for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "photo_report_images: публичное чтение опубликованных"
  on public.photo_report_images for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.photo_reports r
      where r.id = photo_report_images.report_id
        and r.status = 'published'
    )
  );

create policy "photo_report_images: полный доступ администратора"
  on public.photo_report_images for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- news ----------

create policy "news: публичное чтение опубликованных"
  on public.news for select
  to anon, authenticated
  using (status = 'published' and (published_at is null or published_at <= now()));

create policy "news: полный доступ администратора"
  on public.news for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- partners ----------

create policy "partners: публичное чтение активных"
  on public.partners for select
  to anon, authenticated
  using (is_active);

create policy "partners: полный доступ администратора"
  on public.partners for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- site_stats ----------

create policy "site_stats: публичное чтение активных"
  on public.site_stats for select
  to anon, authenticated
  using (is_active);

create policy "site_stats: полный доступ администратора"
  on public.site_stats for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- leads ----------
-- Аноним может только оставить заявку. Читает их администратор.

create policy "leads: аноним оставляет заявку"
  on public.leads for insert
  to anon, authenticated
  with check (status = 'new');

create policy "leads: чтение администратором"
  on public.leads for select
  to authenticated
  using (public.is_admin());

create policy "leads: обновление администратором"
  on public.leads for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "leads: удаление администратором"
  on public.leads for delete
  to authenticated
  using (public.is_admin());
