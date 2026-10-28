-- Галочка «Продажи закрыты» в событии. Событие видно на сайте, но купить
-- билет нельзя. С меткой «Скоро» сайт пишет «Продажи скоро откроются».
alter table public.events
  add column if not exists sales_closed boolean not null default false;

comment on column public.events.sales_closed is
  'Продажи закрыты вручную: билеты не продаются, событие остаётся на сайте.';
