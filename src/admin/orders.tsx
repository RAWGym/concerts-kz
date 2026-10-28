import { useCallback, useEffect, useState } from "react";

import { db, dbError, formatDateTime, money } from "./db";
import { downloadCsv } from "./entry-data";
import { useStaff } from "./layout";
import { useToast } from "./toast";
import { PageTitle, Pill, Spinner, Table, inputCls } from "./ui";

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
  refunded_at: string | null;
  refund_reason: string | null;
  refunded_by_name: string | null;
  event: { slug: string; starts_at: string; translations: { locale: string; title: string }[] } | null;
  items: { category_name: string; quantity: number }[];
};

const labels = { pending: "Ждёт оплаты", paid: "Оплачен", failed: "Ошибка", expired: "Истёк", refunded: "Возврат" } as const;
const tones = { pending: "orange", paid: "teal", failed: "coral", expired: "muted", refunded: "muted" } as const;

export default function Orders() {
  const staff = useStaff();
  const canRefund = staff.role === "admin" || staff.role === "sales";
  const [refunding, setRefunding] = useState<Order | null>(null);
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
    downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, head, lines);
  }

  const load = useCallback(() => {
    let q = db()
      .from("orders")
      .select("id, number, status, total, currency, buyer_name, buyer_phone, buyer_email, created_at, refunded_at, refund_reason, refunded_by_name, event:events(slug, starts_at, translations:event_translations(locale, title)), items:order_items(category_name, quantity)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) q = q.eq("status", status);
    q.returns<Order[]>().then(({ data }) => setRows(data ?? []));
  }, [status]);

  useEffect(load, [load]);

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
        <Table head={["№", "Событие", "Покупатель", "Билеты", "Сумма", "Статус", "Создан", ...(canRefund ? [""] : [])]}>
          {shown.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3 text-fg-muted">{o.number}</td>
              <td className="px-4 py-3 text-fg">{o.event?.translations.find((t) => t.locale === "ru")?.title ?? o.event?.slug ?? "–"}</td>
              <td className="px-4 py-3 text-fg-muted">
                <div className="text-fg">{o.buyer_name}</div>
                <div className="text-xs">{o.buyer_phone} · {o.buyer_email}</div>
              </td>
              <td className="px-4 py-3 text-fg-muted">{o.items.map((i) => `${i.category_name} × ${i.quantity}`).join(", ")}</td>
              <td className="px-4 py-3 text-fg">{money(o.total, o.currency)}</td>
              <td className="px-4 py-3">
                <Pill tone={tones[o.status]}>{labels[o.status]}</Pill>
                {o.status === "refunded" && o.refunded_at && (
                  <div className="mt-1 max-w-[200px] text-[11px] leading-snug text-fg-subtle">
                    {formatDateTime(o.refunded_at)}
                    {o.refunded_by_name ? ` · ${o.refunded_by_name}` : ""}
                    {o.refund_reason && <div className="truncate" title={o.refund_reason}>{o.refund_reason}</div>}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-fg-muted">{formatDateTime(o.created_at)}</td>
              {canRefund && (
                <td className="px-4 py-3 text-right">
                  {o.status === "paid" && (
                    <button className="whitespace-nowrap text-xs text-fg-subtle hover:text-coral" onClick={() => setRefunding(o)}>
                      Возврат
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </Table>
      )}
      {refunding && <RefundDialog order={refunding} onClose={() => setRefunding(null)} onDone={() => { setRefunding(null); load(); }} />}
    </>
  );
}

const REASONS = ["Отмена концерта", "Перенос концерта", "Покупатель отказался", "Ошибка при покупке", "Двойная оплата"];

/** Оформление возврата: причина, места обратно в продажу, подтверждение. */
function RefundDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usedWarning, setUsedWarning] = useState("");
  const upcoming = order.event ? Date.parse(order.event.starts_at) > Date.now() : false;
  const title = order.event?.translations.find((t) => t.locale === "ru")?.title ?? order.event?.slug ?? "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit() {
    if (!reason.trim()) return setError("Укажите причину возврата");
    setBusy(true);
    setError("");
    const { data, error: e } = await db().rpc("refund_order", {
      p_order: order.id,
      p_reason: reason.trim(),
      p_restock: restock && upcoming,
      p_force: Boolean(usedWarning),
    });
    setBusy(false);
    if (e) {
      if ((e as { hint?: string }).hint === "used_tickets") return setUsedWarning(e.message);
      return setError(dbError(e));
    }
    const voided = (data as { voided?: number } | null)?.voided ?? 0;
    toast(`Возврат по заказу №${order.number} оформлен${voided ? `, аннулировано билетов: ${voided}` : ""}`);
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="refund-title" className="w-full max-w-md rounded-card border border-line-strong bg-ink p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="refund-title" className="font-display text-lg font-bold uppercase text-fg">Возврат заказа №{order.number}</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {order.buyer_name} · {title}
        </p>
        <p className="mt-4 font-display text-3xl font-bold tabular-nums text-fg">{money(order.total, order.currency)}</p>
        <p className="mt-1 text-xs text-fg-subtle">{order.items.map((i) => `${i.category_name} × ${i.quantity}`).join(", ")}</p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${reason === r ? "border-coral bg-coral/15 text-coral" : "border-line-strong text-fg-muted hover:text-fg"}`}>
              {r}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-xs font-medium text-fg-muted">
          Причина
          <textarea rows={2} maxLength={500} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: заявление покупателя от 28.10" />
        </label>
        {upcoming && (
          <label className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="accent-[#ff4d4d]" />
            Вернуть места в продажу
          </label>
        )}

        <p className="mt-4 rounded-btn bg-surface px-3 py-2.5 text-xs leading-relaxed text-fg-muted">
          Билеты по заказу сразу перестанут проходить на входе. Сами деньги возвращаются в кабинете банка (FreedomPay) на карту покупателя.
        </p>
        {usedWarning && <p className="mt-3 rounded-btn border border-orange/50 px-3 py-2.5 text-xs text-orange">{usedWarning}</p>}
        {error && <p className="mt-3 text-sm text-coral">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button className="btn btn-secondary" disabled={busy} onClick={onClose}>Отмена</button>
          <button className="btn btn-primary disabled:opacity-50" disabled={busy || !reason.trim()} onClick={submit}>
            {busy ? "Оформляем…" : usedWarning ? "Всё равно вернуть" : "Оформить возврат"}
          </button>
        </div>
      </div>
    </div>
  );
}
