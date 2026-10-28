import { useEffect, useState } from "react";
import { Link } from "react-router";

import { tableLabels } from "./audit";
import { db, formatDateTime, money } from "./db";
import { useStaff } from "./layout";
import { Card, PageTitle, Pill } from "./ui";

type Upcoming = {
  id: string;
  slug: string;
  starts_at: string;
  status: string;
  poster_url: string | null;
  ticketon_url: string | null;
  venue: { name: string; city: string; timezone: string } | null;
  translations: { locale: string; title: string }[];
  cats: { name: { ru?: string }; price: number; available: number | null; is_active: boolean }[];
};
type Lead = { id: string; name: string; type: string; created_at: string; message: string | null };
type Change = { id: number; at: string; actor: string | null; table_name: string; action: string; label: string | null };

function daysLeft(iso: string, timeZone = "Asia/Almaty") {
  const day = (t: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(t);
  const d = Math.round((Date.parse(day(new Date(iso))) - Date.parse(day(new Date()))) / 86400000);
  return d <= 0 ? "сегодня" : d === 1 ? "завтра" : `через ${d} дн.`;
}

export default function Dashboard() {
  const staff = useStaff();
  const [stats, setStats] = useState<{ paid: number; revenue: number; today: number; pending: number } | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[] | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);

  useEffect(() => {
    const c = db();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    // Суммы без данных покупателей: доступно с правом «Метрики» или «Финансы».
    if (staff.can("metrics", "finance")) {
      c.rpc("metrics_orders").range(0, 49999).then(({ data }) => {
        const rows = (data ?? []) as { total: number; refunded_amount: number | null; status: string; kind: string | null; created_at: string }[];
        const paid = rows.filter((r) => r.status === "paid");
        const sales = paid.filter((r) => (r.kind ?? "sale") === "sale");
        setStats({
          paid: sales.length,
          revenue: paid.reduce((s, r) => s + Number(r.total) - Number(r.refunded_amount ?? 0), 0),
          today: sales.filter((r) => r.created_at >= dayStart).length,
          pending: rows.filter((r) => r.status === "pending").length,
        });
      });
    }
    c.from("events")
      .select("id, slug, starts_at, status, poster_url, ticketon_url, venue:venues(name, city, timezone), translations:event_translations(locale, title), cats:ticket_categories(name, price, available, is_active)")
      .gte("starts_at", now.toISOString())
      .neq("status", "archived")
      .is("deleted_at", null)
      .order("starts_at")
      .limit(6)
      .returns<Upcoming[]>()
      .then(({ data }) => setUpcoming(data ?? []));
    if (staff.can("leads")) c.from("leads").select("id, name, type, created_at, message").eq("status", "new").order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => setLeads((data ?? []) as Lead[]));
    if (staff.can("audit")) {
      c.from("audit_log").select("id, at, actor, table_name, action, label").order("at", { ascending: false }).limit(6)
        .then(({ data }) => setChanges((data ?? []) as Change[]));
    }
  }, [staff]);

  const money_ = staff.can("metrics", "finance");
  const tiles = [
    ...(money_
      ? [
          { label: "Выручка", value: stats ? money(stats.revenue) : "…", hint: "за вычетом возвратов", to: "/admin/finance" },
          { label: "Оплачено заказов", value: stats?.paid ?? "…", hint: stats ? `сегодня: ${stats.today}` : "" },
          { label: "Ждут оплаты", value: stats?.pending ?? "…", hint: "незавершённые заказы" },
        ]
      : []),
    ...(staff.can("leads") ? [{ label: "Новые заявки", value: leads.length, hint: "партнёры и артисты", to: "/admin/leads" }] : []),
  ] as { label: string; value: string | number; hint: string; to?: string }[];

  return (
    <>
      <PageTitle title={`Здравствуйте${staff.fullName ? `, ${staff.fullName.split(" ")[0]}` : ""}`}>
        {staff.can("events.edit") && <Link to="/admin/events/new" className="btn btn-primary">Новое событие</Link>}
      </PageTitle>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => {
          const card = (
            <Card className={t.to ? "h-full transition-colors hover:border-coral/60" : "h-full"}>
              <p className="text-xs uppercase tracking-[0.08em] text-fg-subtle">{t.label}</p>
              <p className="mt-2 font-display text-3xl font-bold text-fg">{t.value}</p>
              <p className="mt-1 text-xs text-fg-subtle">{t.to ? <>{t.hint} · <span className="text-coral">аналитика →</span></> : t.hint}</p>
            </Card>
          );
          return t.to ? <Link key={t.label} to={t.to}>{card}</Link> : <div key={t.label}>{card}</div>;
        })}
      </div>

      <h2 className="mb-4 mt-10 font-display text-sm font-semibold uppercase tracking-[0.06em] text-fg">Ближайшие события</h2>
      {upcoming && upcoming.length === 0 && <p className="text-sm text-fg-muted">Нет запланированных событий.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {upcoming?.map((e) => {
          const title = e.translations.find((t) => t.locale === "ru")?.title ?? e.slug;
          const active = e.cats.filter((k) => k.is_active);
          return (
            <Link key={e.id} to={`/admin/events/${e.id}`}>
              <Card className="flex gap-4 transition-colors hover:border-coral/60">
                <div className="aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-btn bg-surface">
                  {e.poster_url && <img src={e.poster_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-fg">{title}</p>
                    {e.status === "draft" && <Pill>Черновик</Pill>}
                    {e.ticketon_url && <Pill tone="orange">Внешняя продажа</Pill>}
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {formatDateTime(e.starts_at, e.venue?.timezone)} · {daysLeft(e.starts_at, e.venue?.timezone)}
                    {e.venue ? ` · ${e.venue.city}, ${e.venue.name}` : ""}
                  </p>
                  <div className="mt-3 space-y-1">
                    {active.length === 0 && <p className="text-xs text-fg-subtle">Тарифы не заданы</p>}
                    {active.map((k, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted">{k.name.ru} · {money(k.price)}</span>
                        <span className={k.available !== null && k.available < 20 ? "text-orange" : "text-fg-subtle"}>
                          {k.available === null ? "без лимита" : `осталось ${k.available}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {staff.can("leads") && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold uppercase text-fg">Новые заявки</h2>
            <Link to="/admin/leads" className="text-xs text-coral hover:underline">Все</Link>
          </div>
          {leads.length === 0 ? <p className="text-sm text-fg-subtle">Новых заявок нет.</p> : (
            <ul className="divide-y divide-line">
              {leads.map((l) => (
                <li key={l.id} className="py-2.5">
                  <p className="text-sm text-fg">{l.name}</p>
                  <p className="truncate text-xs text-fg-subtle">{formatDateTime(l.created_at)}{l.message ? ` · ${l.message}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        )}

        {staff.can("audit") && (
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase text-fg">Последние изменения</h2>
              <Link to="/admin/audit" className="text-xs text-coral hover:underline">Журнал</Link>
            </div>
            {changes.length === 0 ? <p className="text-sm text-fg-subtle">Пока пусто.</p> : (
              <ul className="divide-y divide-line">
                {changes.map((c) => (
                  <li key={c.id} className="py-2.5 text-sm">
                    <span className="text-fg">{c.actor ?? "–"}</span>{" "}
                    <span className="text-fg-muted">{c.action === "insert" ? "создал" : c.action === "delete" ? "удалил" : "изменил"} {(tableLabels[c.table_name] ?? c.table_name).toLowerCase()}</span>{" "}
                    <span className="text-fg">{c.label}</span>
                    <p className="text-xs text-fg-subtle">{formatDateTime(c.at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
