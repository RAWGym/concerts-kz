import { useEffect, useState } from "react";

import { db, formatDateTime } from "./db";
import { useStaff } from "./layout";
import { Notice, PageTitle, Pill, Spinner, Table } from "./ui";

type Entry = { id: number; at: string; actor: string | null; table_name: string; action: "insert" | "update" | "delete"; label: string | null; changed: string[] | null };

export const tableLabels: Record<string, string> = {
  events: "Событие", event_translations: "Текст события", ticket_categories: "Тариф", venues: "Площадка",
  news: "Новость", photo_reports: "Фотоотчёт", partners: "Партнёр", site_stats: "Цифры", site_settings: "Настройки", admins: "Сотрудник",
};
const actions = { insert: "создал", update: "изменил", delete: "удалил" } as const;
const tones = { insert: "teal", update: "muted", delete: "coral" } as const;

export const fieldLabels: Record<string, string> = {
  title: "название", subtitle: "подзаголовок", description: "описание", starts_at: "дату", status: "статус", price: "цену",
  available: "остаток", poster_url: "афишу", venue_id: "площадку", is_featured: "показ на главной", is_sold_out: "sold out",
  ticketon_url: "ссылку на билеты", price_from: "цену от", role: "роль", value: "значение", badge: "метку", name: "название",
  body: "текст", excerpt: "анонс", cover_url: "обложку", is_active: "видимость", published_at: "дату публикации",
};

export default function Audit() {
  const me = useStaff();
  const [rows, setRows] = useState<Entry[] | null>(null);

  useEffect(() => {
    db().from("audit_log").select("*").order("at", { ascending: false }).limit(300).then(({ data }) => setRows((data ?? []) as Entry[]));
  }, []);

  if (me.role !== "admin") return <Notice>Раздел доступен только администратору.</Notice>;

  return (
    <>
      <PageTitle title="Журнал изменений" />
      {!rows ? <Spinner /> : rows.length === 0 ? <p className="text-sm text-fg-muted">Пока пусто. Здесь будет видно, кто и что менял в админке.</p> : (
        <Table head={["Когда", "Кто", "Что", "Детали"]}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{formatDateTime(r.at)}</td>
              <td className="px-4 py-3 text-fg">{r.actor ?? "–"}</td>
              <td className="px-4 py-3">
                <Pill tone={tones[r.action]}>{actions[r.action]}</Pill>{" "}
                <span className="text-fg-muted">{tableLabels[r.table_name] ?? r.table_name}</span>{" "}
                <span className="text-fg">{r.label}</span>
              </td>
              <td className="px-4 py-3 text-xs text-fg-subtle">
                {r.changed?.length ? `поменял ${r.changed.map((c) => fieldLabels[c] ?? c).join(", ")}` : ""}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
