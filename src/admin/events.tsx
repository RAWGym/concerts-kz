import { useEffect, useState } from "react";
import { Link } from "react-router";

import { canEdit, db, formatDateTime, money } from "./db";
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
  venue: { name: string; city: string; timezone: string } | null;
  translations: { locale: string; title: string }[];
};

export const statusLabel = { draft: "Черновик", published: "Опубликовано", archived: "Архив" } as const;
const statusTone = { draft: "muted", published: "teal", archived: "muted" } as const;

export default function EventsList() {
  const staff = useStaff();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    let q = db()
      .from("events")
      .select("id, slug, status, starts_at, price_from, currency, is_featured, is_sold_out, venue:venues(name, city, timezone), translations:event_translations(locale, title)")
      .order("starts_at", { ascending: !showPast });
    if (!showPast) q = q.gte("starts_at", new Date(Date.now() - 86400000).toISOString());
    q.returns<Row[]>().then(({ data }) => setRows(data ?? []));
  }, [showPast]);

  return (
    <>
      <PageTitle title="События">
        <button onClick={() => setShowPast((v) => !v)} className="btn btn-secondary">
          {showPast ? "Только ближайшие" : "Показать прошедшие"}
        </button>
        {canEdit(staff.role) && <Link to="/admin/events/new" className="btn btn-primary">Новое событие</Link>}
      </PageTitle>

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Событий пока нет.</p>
      ) : (
        <Table head={["Событие", "Дата", "Площадка", "Цена от", "Статус"]}>
          {rows.map((e) => {
            const title = e.translations.find((t) => t.locale === "ru")?.title ?? e.translations[0]?.title ?? e.slug;
            return (
              <tr key={e.id} className="hover:bg-surface/60">
                <td className="px-4 py-3">
                  <Link to={`/admin/events/${e.id}`} className="font-medium text-fg hover:text-coral">{title}</Link>
                  <div className="mt-1 flex gap-2">
                    {e.is_featured && <Pill tone="coral">На главной</Pill>}
                    {e.is_sold_out && <Pill tone="orange">Sold out</Pill>}
                  </div>
                </td>
                <td className="px-4 py-3 text-fg-muted">{formatDateTime(e.starts_at, e.venue?.timezone)}</td>
                <td className="px-4 py-3 text-fg-muted">{e.venue ? `${e.venue.city} · ${e.venue.name}` : "—"}</td>
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
