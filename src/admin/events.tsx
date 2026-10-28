import { useEffect, useState } from "react";
import { Link } from "react-router";

import { db, formatDateTime, money } from "./db";
import { useStaff } from "./layout";
import { PageTitle, Pill, Spinner, Table } from "./ui";

type Row = {
  id: string;
  slug: string;
  status: "draft" | "published" | "archived";
  starts_at: string;
  price_from: number | null;
  currency: string;
  is_featured: boolean;
  is_sold_out: boolean;
  change_kind: "postponed" | "cancelled" | null;
  deleted_at: string | null;
  venue: { name: string; city: string; timezone: string } | null;
  translations: { locale: string; title: string }[];
};

export const statusLabel = { draft: "Черновик", published: "Опубликовано", archived: "Архив" } as const;
const statusTone = { draft: "muted", published: "teal", archived: "muted" } as const;

export default function EventsList() {
  const staff = useStaff();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let q = db()
      .from("events")
      .select("id, slug, status, starts_at, price_from, currency, is_featured, is_sold_out, change_kind, deleted_at, venue:venues(name, city, timezone), translations:event_translations(locale, title)")
      .order("starts_at", { ascending: !showPast });
    if (showDeleted) q = q.not("deleted_at", "is", null);
    else {
      q = q.is("deleted_at", null);
      if (!showPast) q = q.gte("starts_at", new Date(Date.now() - 86400000).toISOString());
    }
    q.returns<Row[]>().then(({ data }) => setRows(data ?? []));
  }, [showPast, showDeleted]);

  return (
    <>
      <PageTitle title="События">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по названию или городу"
          className="w-64 rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-coral" />
        {!showDeleted && (
          <button onClick={() => setShowPast((v) => !v)} className="btn btn-secondary">
            {showPast ? "Только ближайшие" : "Показать прошедшие"}
          </button>
        )}
        <button onClick={() => setShowDeleted((v) => !v)} className="btn btn-secondary">
          {showDeleted ? "К событиям" : "Удалённые"}
        </button>
        {staff.can("events.edit") && <Link to="/admin/events/new" className="btn btn-primary">Новое событие</Link>}
      </PageTitle>

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">{showDeleted ? "Удалённых событий нет." : "Событий пока нет."}</p>
      ) : (
        <Table head={["Событие", "Дата", "Площадка", "Цена от", "Статус"]}>
          {rows.filter((e) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return [e.slug, e.venue?.city, e.venue?.name, ...e.translations.map((t) => t.title)].some((v) => v?.toLowerCase().includes(q));
          }).map((e) => {
            const title = e.translations.find((t) => t.locale === "ru")?.title ?? e.translations[0]?.title ?? e.slug;
            return (
              <tr key={e.id} className="hover:bg-surface/60">
                <td className="px-4 py-3">
                  <Link to={`/admin/events/${e.id}`} className="font-medium text-fg hover:text-coral">{title}</Link>
                  <div className="mt-1 flex gap-2">
                    {e.is_featured && <Pill tone="coral">На главной</Pill>}
                    {e.is_sold_out && <Pill tone="orange">Sold out</Pill>}
                    {e.change_kind === "postponed" && <Pill tone="orange">Перенесено</Pill>}
                    {e.change_kind === "cancelled" && <Pill tone="coral">Отменено</Pill>}
                    {e.deleted_at && <Pill>Удалено {formatDateTime(e.deleted_at)}</Pill>}
                  </div>
                </td>
                <td className="px-4 py-3 text-fg-muted">{formatDateTime(e.starts_at, e.venue?.timezone)}</td>
                <td className="px-4 py-3 text-fg-muted">{e.venue ? `${e.venue.city} · ${e.venue.name}` : "–"}</td>
                <td className="px-4 py-3 text-fg-muted">{money(e.price_from, e.currency)}</td>
                <td className="px-4 py-3"><Pill tone={statusTone[e.status]}>{statusLabel[e.status]}</Pill></td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
