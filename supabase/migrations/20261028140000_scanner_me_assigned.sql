-- Приложение тикетора: когда и кто назначил на концерт (для уведомлений).

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
      'assigned_at', a.created_at,
      'assigned_by', public.staff_name(a.assigned_by),
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
