import { Fragment, useEffect, useState } from "react";

import { AdminApiError, adminApi, db, formatDateTime, money } from "./db";
import { downloadCsv } from "./entry-data";
import { useStaff } from "./layout";
import { useToast } from "./toast";
import { Field, Notice, PageTitle, Pill, Spinner, Table, inputCls } from "./ui";

type Order = {
  id: string;
  number: number;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  kind: "sale" | "upgrade";
  parent_order_id: string | null;
  total: number;
  refunded_amount: number | null;
  refund_reason: string | null;
  refunded_by_name: string | null;
  currency: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_email: string;
  created_at: string;
  event: { slug: string; translations: { locale: string; title: string }[] } | null;
  items: { category_name: string; quantity: number }[];
};

type CurrentTicket = { ticket_id: string; code: string; category_name: string; seat_label: string | null; status: string; paid: number };
type Mail = { id: number; kind: string; status: string; subject: string | null; created_at: string; sent_at: string | null; error: string | null; attempts: number };

const labels = { pending: "Ждёт оплаты", paid: "Оплачен", failed: "Ошибка", expired: "Истёк", refunded: "Возврат" } as const;
const tones = { pending: "orange", paid: "teal", failed: "coral", expired: "muted", refunded: "muted" } as const;
const mailKinds: Record<string, string> = { tickets: "Билеты", upgrade: "Апгрейд", event_change: "Перенос/отмена", refund: "Возврат" };

const titleOf = (o: Order) => o.event?.translations.find((t) => t.locale === "ru")?.title ?? o.event?.slug ?? "–";

export default function Orders() {
  const staff = useStaff();
  const [rows, setRows] = useState<Order[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Данные покупателей: право «Заказы», «Возвраты» или «Финансы». Маркетолог видит только суммы в «Финансах».
  const canBuyers = staff.can("orders", "refunds", "finance");

  const shown = (rows ?? []).filter((o) => {
    const q = query.trim().toLowerCase();
    return !q || [String(o.number), o.buyer_name, o.buyer_phone, o.buyer_email].some((v) => v.toLowerCase().includes(q));
  });

  function exportCsv() {
    const head = ["Номер", "Тип", "Событие", "Покупатель", "Телефон", "E-mail", "Билеты", "Сумма", "Возвращено", "Валюта", "Статус", "Создан"];
    const lines = shown.map((o) => [
      o.number,
      o.kind === "upgrade" ? "Доплата за апгрейд" : "Покупка",
      titleOf(o),
      o.buyer_name, o.buyer_phone, o.buyer_email,
      o.items.map((i) => `${i.category_name} x ${i.quantity}`).join("; "),
      o.total, Number(o.refunded_amount ?? 0), o.currency, labels[o.status], new Date(o.created_at).toLocaleString("ru-RU"),
    ]);
    downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, head, lines);
  }

  useEffect(() => {
    let q = db()
      .from("orders")
      .select("id, number, status, kind, parent_order_id, total, refunded_amount, refund_reason, refunded_by_name, currency, buyer_name, buyer_phone, buyer_email, created_at, event:events(slug, translations:event_translations(locale, title)), items:order_items(category_name, quantity)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (status) q = q.eq("status", status);
    q.returns<Order[]>().then(({ data }) => setRows(data ?? []));
  }, [status, reload]);

  if (!canBuyers) return <Notice>Раздел доступен сотрудникам с правом «Заказы».</Notice>;

  const numberOf = (id: string | null) => rows?.find((r) => r.id === id)?.number;

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
        <p className="text-sm text-fg-muted">Заказов пока нет.</p>
      ) : (
        <Table head={["№", "Событие", "Покупатель", "Билеты", "Сумма", "Статус", "Создан"]}>
          {shown.map((o) => {
            const refunded = Number(o.refunded_amount ?? 0);
            return (
              <Fragment key={o.id}>
                <tr className="cursor-pointer hover:bg-surface/60" onClick={() => setOpen(open === o.id ? null : o.id)}>
                  <td className="px-4 py-3 text-fg-muted">{o.number}</td>
                  <td className="px-4 py-3 text-fg">
                    {titleOf(o)}
                    {o.kind === "upgrade" && (
                      <div className="mt-1 text-xs text-orange">Доплата за апгрейд{numberOf(o.parent_order_id) ? ` к заказу № ${numberOf(o.parent_order_id)}` : ""}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    <div className="text-fg">{o.buyer_name}</div>
                    <div className="text-xs">{o.buyer_phone} · {o.buyer_email}</div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{o.items.map((i) => `${i.category_name} × ${i.quantity}`).join(", ")}</td>
                  <td className="px-4 py-3 text-fg">
                    {money(o.total, o.currency)}
                    {refunded > 0 && <div className="text-xs text-coral">возврат {money(refunded, o.currency)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={tones[o.status]}>{labels[o.status]}</Pill>
                    {o.status === "paid" && refunded > 0 && <div className="mt-1 text-[11px] text-fg-subtle">частичный возврат</div>}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{formatDateTime(o.created_at)}</td>
                </tr>
                {open === o.id && (
                  <tr>
                    <td colSpan={7} className="bg-surface/40 px-4 py-4">
                      <OrderDetails order={o} onChanged={() => setReload((n) => n + 1)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </Table>
      )}
    </>
  );
}

function OrderDetails({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const staff = useStaff();
  const toast = useToast();
  const [tickets, setTickets] = useState<CurrentTicket[] | null>(null);
  const [mails, setMails] = useState<Mail[]>([]);
  const [refunding, setRefunding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order.kind === "sale") {
      adminApi<{ tickets: CurrentTicket[] }>(`/orders/${order.id}/tickets`).then((r) => setTickets(r.tickets), () => setTickets([]));
    } else setTickets([]);
    db().from("email_log").select("id, kind, status, subject, created_at, sent_at, error, attempts").eq("order_id", order.id)
      .order("created_at", { ascending: false }).limit(20).then(({ data }) => setMails((data ?? []) as Mail[]));
  }, [order.id, order.kind]);

  async function resend() {
    setBusy(true);
    try {
      await adminApi(`/orders/${order.id}/resend`);
      toast(`Билеты отправлены на ${order.buyer_email}`);
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-fg-subtle">Действующие билеты</p>
        {order.kind === "upgrade" ? (
          <p className="text-xs text-fg-muted">Это доплата за апгрейд. Новые билеты и возврат смотрите в исходном заказе.</p>
        ) : !tickets ? <p className="text-xs text-fg-subtle">Загрузка…</p> : tickets.length === 0 ? (
          <p className="text-xs text-fg-muted">Действующих билетов нет.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {tickets.map((t) => (
              <li key={t.ticket_id} className="flex justify-between gap-3">
                <span className="text-fg">{t.code} · {t.category_name}{t.seat_label ? ` · ${t.seat_label}` : ""}{t.status === "used" ? " · вход был" : ""}</span>
                <span className="text-fg-muted">{money(t.paid, order.currency)}</span>
              </li>
            ))}
          </ul>
        )}
        {order.refund_reason && (
          <p className="mt-3 text-xs text-fg-muted">Возврат: {order.refund_reason}{order.refunded_by_name ? ` (${order.refunded_by_name})` : ""}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          {staff.can("orders") && order.status === "paid" && (
            <button disabled={busy} className="btn btn-secondary disabled:opacity-60" onClick={resend}>Отправить билеты ещё раз</button>
          )}
          {staff.can("refunds") && order.status === "paid" && order.kind === "sale" && !!tickets?.length && (
            <button className="btn btn-secondary" onClick={() => setRefunding(true)}>Оформить возврат</button>
          )}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-fg-subtle">Письма покупателю</p>
        {mails.length === 0 ? <p className="text-xs text-fg-muted">Писем нет.</p> : (
          <ul className="space-y-1.5 text-xs">
            {mails.map((m) => (
              <li key={m.id}>
                <span className={m.status === "sent" ? "text-teal" : m.status === "failed" ? "text-coral" : "text-orange"}>
                  {m.status === "sent" ? "Доставлено в почту" : m.status === "failed" ? "Не отправлено" : "В очереди"}
                </span>{" "}
                <span className="text-fg">{mailKinds[m.kind] ?? m.kind}</span>{" "}
                <span className="text-fg-subtle">{formatDateTime(m.sent_at ?? m.created_at)}{m.attempts > 1 ? ` · попыток ${m.attempts}` : ""}</span>
                {m.error && m.status !== "sent" && <div className="text-fg-subtle">{m.error}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {refunding && tickets && (
        <RefundDialog order={order} tickets={tickets} onClose={() => setRefunding(false)}
          onDone={(text) => { setRefunding(false); toast(text); onChanged(); }} />
      )}
    </div>
  );
}

/** Возврат по заказу: выбор билетов, причина, через банк или отметка ручного возврата. */
export function RefundDialog({ order, tickets, requestId, preselected, onClose, onDone }: {
  order: { id: string; number: number; currency: string };
  tickets: CurrentTicket[];
  requestId?: string;
  preselected?: string[];
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [chosen, setChosen] = useState<string[]>(preselected?.length ? preselected : tickets.map((t) => t.ticket_id));
  const [reason, setReason] = useState(requestId ? "Заявка покупателя на возврат" : "");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sum = tickets.filter((t) => chosen.includes(t.ticket_id)).reduce((s, t) => s + Number(t.paid), 0);

  async function submit(force = false) {
    setErr(null);
    setBusy(true);
    try {
      const res = await adminApi<{ voided: number }>("/refunds", { orderId: order.id, ticketIds: chosen, reason, requestId, manual, force });
      onDone(`Возврат оформлен: ${money(sum, order.currency)}, аннулировано билетов: ${res.voided ?? chosen.length}`);
    } catch (e) {
      const hint = e instanceof AdminApiError ? e.hint : undefined;
      if (hint === "used_tickets" && confirm(`${(e as Error).message}\n\nВсё равно вернуть?`)) {
        setBusy(false);
        return submit(true);
      }
      setErr(hint?.startsWith("batch:") ? `${(e as Error).message} Это можно сделать в разделе «Возвраты».` : (e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-ink-deep p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-lg font-bold uppercase text-fg">Возврат по заказу № {order.number}</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            {tickets.map((t) => (
              <label key={t.ticket_id} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-fg">
                  <input type="checkbox" className="accent-coral" checked={chosen.includes(t.ticket_id)}
                    onChange={(e) => setChosen((c) => (e.target.checked ? [...c, t.ticket_id] : c.filter((x) => x !== t.ticket_id)))} />
                  {t.code} · {t.category_name}{t.seat_label ? ` · ${t.seat_label}` : ""}
                  {t.status === "used" && <span className="text-xs text-orange">вход был</span>}
                </span>
                <span className="text-fg-muted">{money(t.paid, order.currency)}</span>
              </label>
            ))}
          </div>
          <p className="text-sm text-fg">К возврату: <b>{money(sum, order.currency)}</b></p>
          <p className="text-xs text-fg-subtle">Если билет улучшали, вернутся и покупка, и доплата: каждая на свой платёж. Стол возвращается целиком.</p>
          <Field label="Причина *">
            <textarea rows={2} maxLength={500} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <label className="flex items-start gap-2 text-xs text-fg-muted">
            <input type="checkbox" className="mt-0.5 accent-coral" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            Деньги уже вернули в кабинете банка, только отметить возврат (банк не вызываем)
          </label>
          {err && <Notice kind="error">{err}</Notice>}
          <div className="flex gap-3">
            <button disabled={busy || !chosen.length || !reason.trim()} className="btn btn-primary disabled:opacity-60" onClick={() => submit()}>
              {busy ? "Возвращаю…" : manual ? "Отметить возврат" : "Вернуть деньги"}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { CurrentTicket };
