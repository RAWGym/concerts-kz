-- Места за столами (Motor Club, 2 этаж): одно место нельзя продать дважды.
--
-- Сервер продаж проверяет места до записи заказа, но два покупателя могут
-- нажать «Оплатить» одновременно. Поэтому база проверяет ещё раз под
-- блокировкой на событие: пока один заказ записывает места, второй ждёт
-- и потом видит их занятыми.
--
-- Метки: "table-7-3" — стол 7, место 3; "table-7" — стол целиком (старые
-- заказы). Столы продаются целиком одной компании: если у стола занято хоть
-- одно место в другом заказе, весь стол недоступен. Места одного заказа за
-- одним столом — это гости этой компании.

create index if not exists order_items_seat_idx
  on public.order_items (seat_label)
  where seat_label is not null;

-- true, если стол этого места занят другим оплаченным заказом или живой бронью
-- события. Внутри своего заказа повторять нельзя только само место.
create or replace function public.seat_is_taken(p_event uuid, p_order uuid, p_seat text, p_except uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.event_id = p_event
      and oi.seat_label is not null
      and oi.id is distinct from p_except
      and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()) or o.id = p_order)
      and (
        -- то же место (в том числе повтор внутри своего заказа)
        oi.seat_label = p_seat
        -- тот же стол в чужом заказе: стол принадлежит одной компании
        or (
          oi.order_id <> p_order
          and substring(oi.seat_label from '^table-(\d+)') = substring(p_seat from '^table-(\d+)')
        )
      )
  );
$$;

-- Новая строка заказа с местом.
create or replace function public.order_items_seat_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev uuid;
begin
  if new.seat_label is null then
    return new;
  end if;
  select event_id into ev from public.orders where id = new.order_id;
  perform pg_advisory_xact_lock(hashtextextended('seats:' || ev::text, 0));
  if public.seat_is_taken(ev, new.order_id, new.seat_label, new.id) then
    raise exception 'seat_taken' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists order_items_seat_guard on public.order_items;
create trigger order_items_seat_guard
  before insert or update of seat_label on public.order_items
  for each row execute function public.order_items_seat_guard();

-- Повторная оплата: истёкшая бронь снова становится живой, её места
-- за это время могли купить.
create or replace function public.orders_seat_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  it record;
begin
  -- Оплату не блокируем никогда: деньги уже списаны. Проверяем только
  -- возврат брони к жизни.
  if new.status <> 'pending' then
    return new;
  end if;
  if old.status = 'pending' and old.expires_at > now() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('seats:' || new.event_id::text, 0));
  for it in select id, seat_label from public.order_items where order_id = new.id and seat_label is not null loop
    if public.seat_is_taken(new.event_id, new.id, it.seat_label, it.id) then
      raise exception 'seat_taken' using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists orders_seat_guard on public.orders;
create trigger orders_seat_guard
  before update of status, expires_at on public.orders
  for each row execute function public.orders_seat_guard();

revoke execute on function public.seat_is_taken(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.order_items_seat_guard() from public, anon, authenticated;
revoke execute on function public.orders_seat_guard() from public, anon, authenticated;
