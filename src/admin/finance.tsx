import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { Meter, ShareBars, StackBar, TimeChart, compact, type Point } from "./charts";
import { db, dbError, formatDateTime, money, titleOf } from "./db";
import { downloadCsv } from "./entry-data";
import { useStaff } from "./layout";
import { Card, Notice, PageTitle, Spinner } from "./ui";

/* ---------- данные ---------- */

type Status = "pending" | "paid" | "failed" | "expired" | "refunded";
type Item = { category_id: string; category_name: string; quantity: number; unit_price: number };
type Order = {
  id: string;
  number: number;
  status: Status;
  /** sale: покупка, upgrade: доплата за апгрейд (билетов не добавляет). */
  kind: "sale" | "upgrade";
  total: number;
  /** Сколько уже вернули (частичный возврат оставляет заказ оплаченным). */
  refunded_amount: number;
  service_fee: number;
  currency: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  event_id: string;
  items: Item[];
};
type Ev = {
  id: string;
  slug: string;
  starts_at: string;
  status: string;
  venue: { name: string; city: string; timezone: string } | null;
  translations: { locale: string; title: string }[];
  cats: { code: string; name: { ru?: string }; price: number; available: number | null; is_active: boolean }[];
};
type Ticket = { event_id: string; kind: "sale" | "invite"; status: "valid" | "used" | "void" };

const TZ = "Asia/Almaty";
const PAGE = 1000;
const CURRENCY = "KZT";

/** Читает таблицу целиком страницами по 1000 строк (лимит Supabase). */
async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1);
    if (error) throw new Error(dbError(error));
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/* ---------- даты в часовом поясе Алматы ---------- */

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const dayKey = (d: Date | string) => dayFmt.format(typeof d === "string" ? new Date(d) : d);
const keyToUtc = (k: string) => Date.parse(`${k}T00:00:00Z`);
const utcToKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (k: string, n: number) => utcToKey(keyToUtc(k) + n * 86400000);
const shortDay = (k: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(keyToUtc(k))).replace(".", "");
const hourOf = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));
const weekdayOf = (iso: string) => (new Date(keyToUtc(dayKey(iso))).getUTCDay() + 6) % 7; // 0 = пн

const PERIODS = [
  { id: "7", label: "7 дн.", days: 7 },
  { id: "30", label: "30 дн.", days: 30 },
  { id: "90", label: "90 дн.", days: 90 },
  { id: "365", label: "Год", days: 365 },
  { id: "all", label: "Всё", days: 0 },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

/* ---------- расчёты ---------- */

/** Заказ «ждёт оплаты» только пока не истекла бронь. */
const isLivePending = (o: Order, now: number) => o.status === "pending" && (!o.expires_at || Date.parse(o.expires_at) > now);
const tickets = (o: Order) => (o.kind === "upgrade" ? 0 : o.items.reduce((s, i) => s + i.quantity, 0));
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
/** Возвращено по заказу. У старых возвратов без суммы считаем весь заказ. */
const refundOf = (o: Order) => (o.status === "refunded" ? o.refunded_amount || o.total : o.refunded_amount);
/** Сколько по заказу осталось у нас после возвратов. */
const net = (o: Order) => o.total - refundOf(o);

function metrics(list: Order[], now: number) {
  const paid = list.filter((o) => o.status === "paid");
  const refunded = list.filter((o) => o.status === "refunded");
  const pending = list.filter((o) => isLivePending(o, now));
  const failed = list.filter((o) => o.status === "failed");
  const lost = list.filter((o) => o.status === "expired" || (o.status === "pending" && !isLivePending(o, now)));
  const revenue = sum(paid, net);
  const refundSum = sum(paid, refundOf) + sum(refunded, refundOf);
  const upgrades = paid.filter((o) => o.kind === "upgrade");
  const finished = paid.length + refunded.length + failed.length + lost.length;
  return {
    paid,
    refunded,
    pending,
    failed,
    lost,
    revenue,
    fees: sum(paid, (o) => Number(o.service_fee)),
    tickets: sum(paid, tickets),
    avg: paid.length - upgrades.length ? revenue / (paid.length - upgrades.length) : 0,
    refundSum,
    refundRate: revenue + refundSum ? refundSum / (revenue + refundSum) : 0,
    conversion: finished ? (paid.length + refunded.length) / finished : 0,
    pendingSum: sum(pending, (o) => Number(o.total)),
    upgrades: upgrades.length,
    upgradesSum: sum(upgrades, net),
  };
}

const pct = (v: number, digits = 0) => `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: digits })}%`;
const num = (n: number) => new Intl.NumberFormat("ru-RU").format(Math.round(n));

/* ---------- страница ---------- */

export default function Finance() {
  const staff = useStaff();
  // Суммы видят и финансы, и метрики (маркетолог): данные без покупателей.
  const allowed = staff.can("finance", "metrics");

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [tix, setTix] = useState<Ticket[]>([]);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<PeriodId>("30");
  const [eventId, setEventId] = useState("");
  const [metric, setMetric] = useState<"revenue" | "tickets">("revenue");
  const [view, setView] = useState<"bar" | "area">("bar");
  const [fee, setFee] = useState<string>(() => {
    try {
      return localStorage.getItem("admin:acquiring-fee") ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (!allowed) return;
    const c = db();
    Promise.all([
      fetchAll<Order>((a, b) =>
        c.rpc("metrics_orders").range(a, b),
      ),
      fetchAll<Ev>((a, b) =>
        c.from("events")
          .select("id, slug, starts_at, status, venue:venues(name, city, timezone), translations:event_translations(locale, title), cats:ticket_categories(code, name, price, available, is_active)")
          .order("starts_at", { ascending: false })
          .range(a, b),
      ),
      fetchAll<Ticket>((a, b) => c.rpc("metrics_tickets").range(a, b)),
    ])
      .then(([o, e, t]) => {
        setOrders(o.map((x) => ({ ...x, kind: x.kind ?? "sale", total: Number(x.total), refunded_amount: Number(x.refunded_amount ?? 0), service_fee: Number(x.service_fee) })));
        setEvents(e);
        setTix(t);
      })
      .catch((e: Error) => setError(e.message));
  }, [allowed]);

  function saveFee(v: string) {
    const clean = v.replace(",", ".").replace(/[^\d.]/g, "").slice(0, 5);
    setFee(clean);
    try {
      localStorage.setItem("admin:acquiring-fee", clean);
    } catch {
      /* без памяти тоже работает */
    }
  }

  const data = useMemo(() => {
    if (!orders) return null;
    const now = Date.now();
    const today = dayKey(new Date());
    const foreign = orders.filter((o) => o.currency !== CURRENCY).length;
    const base = orders.filter((o) => o.currency === CURRENCY && (!eventId || o.event_id === eventId));

    const p = PERIODS.find((x) => x.id === period)!;
    const firstKey = base.length ? dayKey(base[0].created_at) : addDays(today, -29);
    const startKey = p.days ? addDays(today, -(p.days - 1)) : firstKey < today ? firstKey : addDays(today, -6);
    const spanDays = Math.round((keyToUtc(today) - keyToUtc(startKey)) / 86400000) + 1;
    const prevStartKey = addDays(startKey, -spanDays);

    const inRange = (o: Order, from: string, to: string) => {
      const k = dayKey(o.created_at);
      return k >= from && k <= to;
    };
    const cur = base.filter((o) => inRange(o, startKey, today));
    const prev = p.days ? base.filter((o) => inRange(o, prevStartKey, addDays(startKey, -1))) : null;
    const m = metrics(cur, now);
    const pm = prev ? metrics(prev, now) : null;

    // Ряды по дням, а для длинных периодов — по неделям.
    const step = spanDays > 120 ? 7 : 1;
    const buckets: { key: string; end: string; revenue: number; tickets: number; orders: number }[] = [];
    for (let k = startKey; k <= today; k = addDays(k, step)) buckets.push({ key: k, end: addDays(k, step - 1), revenue: 0, tickets: 0, orders: 0 });
    for (const o of m.paid) {
      const i = Math.min(Math.floor((keyToUtc(dayKey(o.created_at)) - keyToUtc(startKey)) / (step * 86400000)), buckets.length - 1);
      if (i < 0) continue;
      buckets[i].revenue += net(o);
      buckets[i].tickets += tickets(o);
      buckets[i].orders += 1;
    }

    // Когда покупают.
    const hours = Array.from({ length: 24 }, () => 0);
    const weekdays = Array.from({ length: 7 }, () => 0);
    for (const o of m.paid) {
      hours[hourOf(o.created_at)] += 1;
      weekdays[weekdayOf(o.created_at)] += 1;
    }

    // Тарифы.
    const multi = !eventId;
    const evTitle = new Map(events.map((e) => [e.id, titleOf(e)]));
    const tariffs = new Map<string, { label: string; revenue: number; qty: number; event: string }>();
    for (const o of m.paid) {
      for (const i of o.items) {
        const key = `${o.event_id}:${i.category_id}`;
        const t = tariffs.get(key) ?? { label: i.category_name, revenue: 0, qty: 0, event: evTitle.get(o.event_id) ?? "" };
        t.revenue += i.quantity * Number(i.unit_price);
        t.qty += o.kind === "upgrade" ? 0 : i.quantity;
        tariffs.set(key, t);
      }
    }

    // По концертам: деньги за период, заполняемость и проходы за всё время.
    const allPaid = orders.filter((o) => o.status === "paid" && o.currency === CURRENCY);
    const rows = events
      .filter((e) => !eventId || e.id === eventId)
      .map((e) => {
        const mine = cur.filter((o) => o.event_id === e.id);
        const em = metrics(mine, now);
        const soldAll = sum(allPaid.filter((o) => o.event_id === e.id), tickets);
        const active = e.cats.filter((c) => c.is_active);
        const limited = active.length > 0 && active.every((c) => c.available !== null);
        const left = sum(active, (c) => c.available ?? 0);
        const t = tix.filter((x) => x.event_id === e.id && x.status !== "void");
        const sale = t.filter((x) => x.kind === "sale");
        const invites = t.filter((x) => x.kind === "invite");
        const days = Math.ceil((Date.parse(e.starts_at) - now) / 86400000);
        return {
          e,
          title: titleOf(e),
          m: em,
          soldAll,
          capacity: limited ? soldAll + left : null,
          fill: limited && soldAll + left > 0 ? soldAll / (soldAll + left) : null,
          came: sale.filter((x) => x.status === "used").length,
          saleTickets: sale.length,
          invites: invites.length,
          invitesCame: invites.filter((x) => x.status === "used").length,
          days,
          any: mine.length > 0 || soldAll > 0 || t.length > 0 || days >= 0,
        };
      })
      .filter((r) => r.any);

    return {
      foreign,
      startKey,
      today,
      spanDays,
      step,
      m,
      pm,
      buckets,
      hours,
      weekdays,
      tariffs: [...tariffs.entries()]
        .map(([key, t]) => ({ key, ...t, label: multi && events.length > 1 ? `${t.label} · ${t.event}` : t.label }))
        .sort((a, b) => b.revenue - a.revenue),
      rows,
    };
  }, [orders, events, tix, period, eventId]);

  if (!allowed) {
    return (
      <>
        <PageTitle title="Финансы" />
        <Notice>Раздел доступен администраторам и отделу продаж.</Notice>
      </>
    );
  }

  const feeRate = Math.min(Math.max(Number(fee) || 0, 0), 30) / 100;

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `finance-${data.startKey}_${data.today}.csv`,
      ["Концерт", "Дата", "Площадка", "Оплачено заказов", "Билетов", "Выручка, ₸", "Сервисный сбор, ₸", "Возвраты, шт", "Возвраты, ₸", "Ждут оплаты, ₸", "Продано всего", "Вместимость", "Заполняемость", "Пришли", "Пригласительные"],
      data.rows.map((r) => [
        r.title,
        formatDateTime(r.e.starts_at, r.e.venue?.timezone),
        r.e.venue ? `${r.e.venue.city}, ${r.e.venue.name}` : "",
        r.m.paid.length,
        r.m.tickets,
        r.m.revenue,
        r.m.fees,
        r.m.refunded.length,
        r.m.refundSum,
        r.m.pendingSum,
        r.soldAll,
        r.capacity ?? "без лимита",
        r.fill == null ? "" : pct(r.fill, 1),
        r.came,
        r.invites,
      ]),
    );
  }

  const chartData: Point[] = (data?.buckets ?? []).reduce<Point[]>((acc, b) => {
    const v = metric === "revenue" ? b.revenue : b.tickets;
    const value = view === "area" ? (acc.length ? acc[acc.length - 1].value : 0) + v : v;
    const label = data!.step > 1 ? `${shortDay(b.key)} – ${shortDay(b.end > data!.today ? data!.today : b.end)}` : shortDay(b.key);
    acc.push({
      key: b.key,
      label: data!.step > 1 ? shortDay(b.key) : label,
      value,
      tip: (
        <>
          <p className="text-fg-subtle">{label}</p>
          <p className="mt-1 font-semibold tabular-nums text-fg">
            {metric === "revenue" ? money(value) : `${num(value)} бил.`}
            {view === "area" && <span className="ml-1 font-normal text-fg-subtle">всего</span>}
          </p>
          {view === "bar" && (
            <p className="mt-0.5 text-fg-muted tabular-nums">
              {metric === "revenue" ? `${num(b.tickets)} бил.` : money(b.revenue)} · {b.orders} зак.
            </p>
          )}
        </>
      ),
    });
    return acc;
  }, []);

  return (
    <>
      <PageTitle title="Финансы">
        <button className="btn btn-secondary disabled:opacity-50" disabled={!data?.rows.length} onClick={exportCsv}>
          Выгрузить в Excel
        </button>
      </PageTitle>

      {/* фильтры одной строкой */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ id: p.id, label: p.label }))} />
        <select
          className="w-full min-w-0 max-w-full rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg sm:w-auto"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="">Все концерты</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {titleOf(e)} · {formatDateTime(e.starts_at, e.venue?.timezone)}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}
      {!data ? (
        !error && <Spinner />
      ) : (
        <>
          {data.foreign > 0 && (
            <div className="mb-6">
              <Notice>Заказы в другой валюте ({data.foreign} шт.) не входят в расчёт: суммы ниже только в тенге.</Notice>
            </div>
          )}

          {/* ключевые цифры */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="sm:col-span-2 xl:col-span-1 xl:row-span-2 flex flex-col">
              <Label>Выручка</Label>
              <p className="mt-2 whitespace-nowrap font-display text-[34px] font-bold leading-tight tabular-nums text-fg sm:text-[42px]">{money(data.m.revenue)}</p>
              <Delta cur={data.m.revenue} prev={data.pm?.revenue} />
              <p className="mt-3 text-xs text-fg-subtle">
                Оплаченные заказы за {data.spanDays} дн.{data.m.fees > 0 && <> · в т.ч. сервисный сбор {money(data.m.fees)}</>}
              </p>
              <div className="mt-auto border-t border-line pt-4">
                <label className="flex items-center justify-between gap-3 text-xs text-fg-muted">
                  Комиссия эквайринга
                  <span className="flex items-center gap-1">
                    <input
                      inputMode="decimal"
                      value={fee}
                      onChange={(e) => saveFee(e.target.value)}
                      placeholder="0"
                      className="w-14 rounded-btn border border-line-strong bg-surface px-2 py-1 text-right text-sm text-fg outline-none focus:border-coral"
                    />
                    %
                  </span>
                </label>
                {feeRate > 0 && (
                  <p className="mt-3 flex items-baseline justify-between text-sm">
                    <span className="text-fg-muted">К получению ≈</span>
                    <span className="font-semibold tabular-nums text-fg">{money(data.m.revenue * (1 - feeRate))}</span>
                  </p>
                )}
              </div>
            </Card>
            <Kpi label="Продано билетов" value={num(data.m.tickets)} delta={<Delta cur={data.m.tickets} prev={data.pm?.tickets} />} hint={`${data.m.paid.length - data.m.upgrades} оплаченных заказов${data.m.upgrades ? ` · апгрейдов ${data.m.upgrades} на ${money(data.m.upgradesSum)}` : ""}`} />
            <Kpi label="Средний чек" value={money(data.m.avg)} delta={<Delta cur={data.m.avg} prev={data.pm?.avg} />} hint={data.m.tickets ? `≈ ${money(data.m.revenue / data.m.tickets)} за билет` : "нет продаж"} />
            <Kpi
              label="Возвраты"
              value={pct(data.m.refundRate, 1)}
              delta={<Delta cur={data.m.refundRate} prev={data.pm?.refundRate} inverse points />}
              hint={data.m.refundSum ? `${money(data.m.refundSum)}${data.m.refunded.length ? `, полностью ${data.m.refunded.length} зак.` : ""}` : "возвратов нет"}
            />
            <Kpi
              label="Оплачивают"
              value={pct(data.m.conversion)}
              delta={<Delta cur={data.m.conversion} prev={data.pm?.conversion} points />}
              hint={`из начатых заказов · ${data.m.failed.length} ошибок, ${data.m.lost.length} брошено`}
            />
          </div>

          {/* динамика */}
          <Card className="mt-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-sm font-semibold uppercase text-fg">
                {metric === "revenue" ? "Выручка" : "Билеты"} {view === "area" ? "нарастающим итогом" : data.step > 1 ? "по неделям" : "по дням"}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Segmented value={metric} onChange={setMetric} options={[{ id: "revenue", label: "Выручка" }, { id: "tickets", label: "Билеты" }]} small />
                <Segmented value={view} onChange={setView} options={[{ id: "bar", label: data.step > 1 ? "По неделям" : "По дням" }, { id: "area", label: "Нарастающим" }]} small />
              </div>
            </div>
            {data.m.paid.length === 0 ? (
              <Empty>За выбранный период оплат нет.</Empty>
            ) : (
              <TimeChart
                data={chartData}
                mode={view}
                format={metric === "revenue" ? compact : (n) => num(n)}
                ariaLabel={`${metric === "revenue" ? "Выручка" : "Билеты"} с ${data.startKey} по ${data.today}`}
              />
            )}
          </Card>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-5 font-display text-sm font-semibold uppercase text-fg">По тарифам</h2>
              {data.tariffs.length === 0 ? (
                <Empty>Нет проданных билетов.</Empty>
              ) : (
                <ShareBars
                  format={money}
                  rows={data.tariffs.slice(0, 8).map((t) => ({
                    key: t.key,
                    label: t.label,
                    value: t.revenue,
                    hint: `${num(t.qty)} бил. · в среднем ${money(t.revenue / t.qty)}`,
                  }))}
                />
              )}
            </Card>
            <Card>
              <h2 className="mb-5 font-display text-sm font-semibold uppercase text-fg">Статусы заказов</h2>
              <StackBar
                parts={[
                  { key: "paid", label: "Оплачены", value: data.m.paid.length, color: "var(--color-teal)" },
                  { key: "pending", label: "Ждут оплаты", value: data.m.pending.length, color: "var(--color-orange)" },
                  { key: "refunded", label: "Возврат", value: data.m.refunded.length, color: "#9085e9" },
                  { key: "failed", label: "Ошибка оплаты", value: data.m.failed.length, color: "var(--color-coral)" },
                  { key: "lost", label: "Брошены", value: data.m.lost.length, color: "var(--color-fg-subtle)" },
                ]}
              />
              {data.m.pending.length > 0 && (
                <p className="mt-4 text-xs text-fg-subtle">
                  Сейчас ждут оплаты {data.m.pending.length} зак. на {money(data.m.pendingSum)}.{" "}
                  <Link to="/admin/orders" className="text-coral hover:underline">К заказам</Link>
                </p>
              )}
            </Card>
          </div>

          {/* по концертам */}
          <h2 className="mb-4 mt-10 font-display text-sm font-semibold uppercase tracking-[0.06em] text-fg">По концертам</h2>
          {data.rows.length === 0 ? (
            <Empty>Концертов с продажами нет.</Empty>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.rows.map((r) => (
                <Card key={r.e.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/admin/events/${r.e.id}`} className="font-medium text-fg hover:text-coral">{r.title}</Link>
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        {formatDateTime(r.e.starts_at, r.e.venue?.timezone)}
                        {r.e.venue ? ` · ${r.e.venue.name}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${r.days >= 0 ? "bg-coral/15 text-coral" : "bg-surface-2 text-fg-muted"}`}>
                      {r.days > 1 ? `через ${r.days} дн.` : r.days >= 0 ? "скоро" : "прошёл"}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3">
                    <Stat label="Выручка" value={money(r.m.revenue)} />
                    <Stat label="Билетов" value={num(r.m.tickets)} />
                    <Stat label="Возвраты" value={r.m.refunded.length ? pct(r.m.refundRate, 1) : "0%"} />
                  </dl>
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-fg-muted">Продано мест</span>
                        <span className="tabular-nums text-fg">
                          {r.capacity != null ? `${num(r.soldAll)} из ${num(r.capacity)} · ${pct(r.fill ?? 0)}` : `${num(r.soldAll)} · без лимита`}
                        </span>
                      </div>
                      {r.fill != null && <Meter value={r.fill} />}
                    </div>
                    {r.days <= 0 && r.saleTickets + r.invites > 0 && (
                      <div>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-fg-muted">Пришли по билетам</span>
                          <span className="tabular-nums text-fg">
                            {num(r.came)} из {num(r.saleTickets)}
                            {r.invites > 0 && <span className="text-fg-subtle"> · пригл. {r.invitesCame}/{r.invites}</span>}
                          </span>
                        </div>
                        <Meter value={r.saleTickets ? r.came / r.saleTickets : 0} tone="teal" />
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* когда покупают */}
          <div className="mt-10 grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
            <Card>
              <h2 className="mb-1 font-display text-sm font-semibold uppercase text-fg">Когда покупают</h2>
              <p className="mb-4 text-xs text-fg-subtle">Оплаченные заказы по часу суток, время Алматы</p>
              {data.m.paid.length === 0 ? (
                <Empty>Нет данных.</Empty>
              ) : (
                <TimeChart
                  height={160}
                  format={(n) => num(n)}
                  ariaLabel="Заказы по часам"
                  data={data.hours.map((v, h) => ({ key: String(h), label: `${String(h).padStart(2, "0")}:00`, value: v, tip: <><p className="text-fg-subtle">{String(h).padStart(2, "0")}:00–{String(h).padStart(2, "0")}:59</p><p className="mt-0.5 font-semibold text-fg">{v} зак.</p></> }))}
                />
              )}
            </Card>
            <Card>
              <h2 className="mb-5 font-display text-sm font-semibold uppercase text-fg">По дням недели</h2>
              <ShareBars
                format={(n) => `${n} зак.`}
                rows={["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d, i) => ({ key: d, label: d, value: data.weekdays[i] }))}
              />
            </Card>
          </div>

          <p className="mt-8 text-xs leading-relaxed text-fg-subtle">
            Выручка — сумма оплаченных заказов, день считается по времени Алматы. Возвраты — доля возвращённых денег от всех оплат за период.
            «Оплачивают» — доля оплаченных среди завершённых заказов (без тех, что ещё ждут оплаты). Заполняемость и проходы — за всё время.
            {data.pm && " Стрелки сравнивают с предыдущим таким же периодом."}
          </p>
        </>
      )}
    </>
  );
}

/* ---------- мелкие элементы ---------- */

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs uppercase tracking-[0.08em] text-fg-subtle">{children}</p>;
}

function Kpi({ label, value, delta, hint }: { label: string; value: ReactNode; delta?: ReactNode; hint?: string }) {
  return (
    <Card>
      <Label>{label}</Label>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-fg">{value}</p>
      {delta}
      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-fg">{value}</dd>
    </div>
  );
}

/** Изменение к прошлому периоду. points — разница в процентных пунктах. */
function Delta({ cur, prev, inverse = false, points = false }: { cur: number; prev?: number; inverse?: boolean; points?: boolean }) {
  if (prev == null) return null;
  if (!points && prev === 0) return cur > 0 ? <p className="mt-1 text-xs text-fg-subtle">в прошлом периоде не было</p> : null;
  const diff = points ? (cur - prev) * 100 : ((cur - prev) / prev) * 100;
  if (Math.abs(diff) < 0.5) return <p className="mt-1 text-xs text-fg-subtle">без изменений к прошлому периоду</p>;
  const up = diff > 0;
  const good = inverse ? !up : up;
  return (
    <p className={`mt-1 text-xs font-medium ${good ? "text-teal" : "text-coral"}`}>
      {up ? "▲" : "▼"} {Math.abs(diff).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
      {points ? " п.п." : "%"} <span className="font-normal text-fg-subtle">к прошлому периоду</span>
    </p>
  );
}

function Segmented<T extends string>({ value, onChange, options, small }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; small?: boolean }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-btn border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`whitespace-nowrap rounded-[8px] ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} transition-colors ${value === o.id ? "bg-coral text-white" : "text-fg-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-fg-subtle">{children}</p>;
}
