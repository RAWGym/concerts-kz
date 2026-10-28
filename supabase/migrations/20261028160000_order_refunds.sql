-- Возврат заказа из админки.
-- Деньги возвращаются в кабинете банка; здесь фиксируем возврат,
-- аннулируем билеты (сканер их больше не пропустит) и при желании
-- возвращаем места в продажу.

alter table public.orders
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists refunded_by uuid references auth.users (id) on delete set null,
  add column if not exists refunded_by_name text;

create or replace function public.refund_order(p_order uuid, p_reason text, p_restock boolean default true, p_force boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.staff_role();
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  o public.orders;
  v_used int;
  v_voided int;
  v_name text;
begin
  if v_role is null or v_role not in ('admin', 'sales') then
    raise exception 'Оформить возврат может администратор или отдел продаж' using errcode = '42501';
  end if;
  if v_reason is null then raise exception 'Укажите причину возврата'; end if;

  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Заказ не найден'; end if;
  if o.status = 'refunded' then raise exception 'Возврат по заказу уже оформлен'; end if;
  if o.status <> 'paid' then raise exception 'Вернуть можно только оплаченный заказ'; end if;

  select count(*) into v_used from public.tickets where order_id = o.id and status = 'used';
  if v_used > 0 and not p_force then
    raise exception 'По заказу уже прошли вход (% бил.). Подтвердите возврат ещё раз, если он всё равно нужен', v_used
      using errcode = 'P0001', hint = 'used_tickets';
  end if;

  v_name := public.staff_name(v_uid);

  update public.orders
     set status = 'refunded',
         refunded_at = now(),
         refund_reason = v_reason,
         refunded_by = v_uid,
         refunded_by_name = v_name
   where id = o.id;

  -- Триггер orders_tickets уже аннулировал билеты; уточняем, кто и почему.
  update public.tickets
     set void_reason = 'Возврат: ' || v_reason, voided_by_name = v_name
   where order_id = o.id and status = 'void' and voided_at = now();
  get diagnostics v_voided = row_count;

  update public.payments set status = 'refunded'
   where order_id = o.id and status = 'succeeded';

  -- Места обратно в продажу, только если концерт ещё впереди.
  if p_restock and exists (select 1 from public.events where id = o.event_id and starts_at > now()) then
    update public.ticket_categories c
       set available = c.available + i.qty
      from (
        select category_id, sum(quantity) as qty from public.order_items where order_id = o.id group by category_id
      ) i
     where c.event_id = o.event_id and c.code = i.category_id and c.available is not null;
  end if;

  insert into public.ticket_log (actor_id, actor_name, action, result, event_id, message)
  values (v_uid, v_name, 'order_refunded', 'ok', o.event_id,
          'Возврат заказа №' || o.number || ' на ' || o.total || ' ' || o.currency || ': ' || v_reason);

  return jsonb_build_object('ok', true, 'voided', v_voided, 'used', v_used);
end;
$$;

revoke all on function public.refund_order(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.refund_order(uuid, text, boolean, boolean) to authenticated;
