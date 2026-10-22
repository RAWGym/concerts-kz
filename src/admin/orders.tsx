import { useEffect, useState } from "react";

import { db, formatDateTime, money } from "./db";
import { PageTitle, Pill, Spinner, Table } from "./ui";

type Order = {
  id: string;
  number: number;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  total: number;
  currency: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_email: string;
  created_at: string;
  event: { slug: string; translations: { locale: string; title: string }[] } | null;
  items: { category_name: string; quantity: number }[];
};

const labels = { pending: "Ждёт оплаты", paid: "Оплачен", failed: "Ошибка", expired: "Истёк", refunded: "Возврат" } as const;
const tones = { pending: "orange", paid: "teal", failed: "coral", expired: "muted", refunded: "muted" } as const;

export default function Orders() {
  const [rows, setRows] = useState<Order[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [query, setQuery] = useState("");

  const shown = (rows ?? []).filter((o) => {
    const q = query.trim().toLowerCase();
    return !q || [String(o.number), o.buyer_name, o.buyer_phone, o.buyer_email].some((v) => v.toLowerCase().includes(q));
  });

  function exportCsv() {
    const head = ["Номер", "Событие", "Покупатель", "Телефон", "E-mail", "Билеты", "Сумма", "Валюта", "Статус", "Создан"];
    const lines = shown.map((o) => [
      o.number,
      o.event?.translations.find((t) => t.locale === "ru")?.title ?? o.event?.slug ?? "",
      o.buyer_name, o.buyer_phone, o.buyer_email,
      o.items.map((i) => `${i.category_name} x ${i.quantity}`).join("; "),
      o.total, o.currency, labels[o.status], new Date(o.created_at).toLocaleString("ru-RU"),
    ]);
    const csv = [head, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    let q = db()
      .from("orders")
      .select("id, number, status, total, currency, buyer_name, buyer_phone, buyer_email, created_at, event:events(slug, translations:event_translations(locale, title)), items:order_items(category_name, quantity)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) q = q.eq("status", status);
    q.returns<Order[]>().then(({ data }) => setRows(data ?? []));
  }, [status]);

  return (
    <>
      <PageTitle title="Заказы">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Номер, имя, телефон, e-mail"
          className="w-64 rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-coral" />
        <button className="btn btn-secondary disabled:opacity-50" disabled={!shown.length} onClick={exportCsv}>Выгрузить в Excel</button>
        <select className="rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </PageTitle>
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Заказов пока нет. Они появятся, когда подключим оплату.</p>
      ) : (
        <Table head={["№", "Событие", "Покупатель", "Билеты", "Сумма", "Статус", "Создан"]}>
          {shown.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3 text-fg-muted">{o.number}</td>
              <td className="px-4 py-3 text-fg">{o.event?.translations.find((t) => t.locale === "ru")?.title ?? o.event?.slug ?? "—"}</td>
              <td className="px-4 py-3 text-fg-muted">
                <div className="text-fg">{o.buyer_name}</div>
                <div className="text-xs">{o.buyer_phone} · {o.buyer_email}</div>
              </td>
              <td className="px-4 py-3 text-fg-muted">{o.items.map((i) => `${i.category_name} × ${i.quantity}`).join(", ")}</td>
              <td className="px-4 py-3 text-fg">{money(o.total, o.currency)}</td>
              <td className="px-4 py-3"><Pill tone={tones[o.status]}>{labels[o.status]}</Pill></td>
              <td className="px-4 py-3 text-fg-muted">{formatDateTime(o.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
