-- Закрываем служебные функции от анонимов (замечания Supabase Advisors).
alter function public.set_updated_at() set search_path = public;
alter function public.i18n_text(jsonb, text) set search_path = public;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
revoke execute on function public.staff_role() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.staff_role() to authenticated;
