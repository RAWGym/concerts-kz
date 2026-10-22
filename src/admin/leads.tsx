import { useEffect, useState } from "react";

import { db, formatDateTime } from "./db";
import { PageTitle, Spinner, Table } from "./ui";

type Lead = {
  id: string;
  type: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  message: string | null;
  status: "new" | "in_progress" | "done" | "spam";
  created_at: string;
};

const types: Record<string, string> = { partner: "Партнёрство", artist: "Артист", booking: "Букинг", general: "Общее" };
const statuses = { new: "Новая", in_progress: "В работе", done: "Готово", spam: "Спам" };

export default function Leads() {
  const [rows, setRows] = useState<Lead[] | null>(null);

  useEffect(() => {
    db().from("leads").select("*").order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => setRows((data ?? []) as Lead[]));
  }, []);

  async function setStatus(id: string, status: Lead["status"]) {
    setRows((r) => r?.map((l) => (l.id === id ? { ...l, status } : l)) ?? r);
    await db().from("leads").update({ status }).eq("id", id);
  }

  return (
    <>
      <PageTitle title="Заявки" />
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Заявок пока нет. Сюда попадают формы «Стать партнёром» и обратной связи.</p>
      ) : (
        <Table head={["Дата", "Тип", "Контакт", "Сообщение", "Статус"]}>
          {rows.map((l) => (
            <tr key={l.id} className="align-top">
              <td className="whitespace-nowrap px-4 py-3 text-fg-muted">{formatDateTime(l.created_at)}</td>
              <td className="px-4 py-3 text-fg-muted">{types[l.type] ?? l.type}</td>
              <td className="px-4 py-3">
                <div className="text-fg">{l.name}{l.company ? ` · ${l.company}` : ""}</div>
                <div className="text-xs text-fg-muted">{[l.phone, l.email].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="max-w-md px-4 py-3 text-fg-muted">{l.message}</td>
              <td className="px-4 py-3">
                <select className="rounded-btn border border-line-strong bg-surface px-2 py-1.5 text-xs text-fg" value={l.status}
                  onChange={(e) => setStatus(l.id, e.target.value as Lead["status"])}>
                  {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
