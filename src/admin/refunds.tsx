import { useEffect, useState } from "react";

import { adminApi, db, formatDateTime, money } from "./db";
import { useStaff } from "./layout";
import { RefundDialog, type CurrentTicket } from "./orders";
import { useToast } from "./toast";
import { Card, Notice, PageTitle, Pill, Spinner, Table } from "./ui";

type RefundRequest = {
  id: string;
  order_id: string;
  ticket_ids: string[];
  amount: number;
  kind: "postponed" | "cancelled";
  reason: string | null;
  status: "new" | "refunded" | "rejected" | "cancelled";
  created_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  order: { number: number; currency: string; buyer_name: string; buyer_email: string; buyer_phone: string } | null;
  event: { slug: string; translations: { locale: string; title: string }[] } | null;
};

type RefundRow = {
  id: string;
  batch_id: string;
  order_id: string;
  amount: number;
  status: "pending" | "succeeded" | "manual" | "failed" | "applied";
  reason: string;
  error: string | null;
  created_by_name: string | null;
  created_at: string;
  applied_at: string | null;
  order: { number: number; currency: string; kind: string; buyer_name: string } | null;
};

const reqStatus = { new: "Новая", refunded: "Возвращено", rejected: "Отказ", cancelled: "Отозвана" } as const;
const reqTone = { new: "orange", refunded: "teal", rejected: "coral", cancelled: "muted" } as const;
const rowStatus = { pending: "Ждём банк", succeeded: "Банк вернул", manual: "Вернули вручную", failed: "Ошибка банка", applied: "Готово" } as const;

export default function Refunds() {
  const staff = useStaff();
  const toast = useToast();
  const [tab, setTab] = useState<"requests" | "history">("requests");
  const [requests, setRequests] = useState<RefundRequest[] | null>(null);
  const [refunds, setRefunds] = useState<RefundRow[] | null>(null);
  const [dialog, setDialog] = useState<{ request: RefundRequest; tickets: CurrentTicket[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const c = db();
    const [r1, r2] = await Promise.all([
      c.from("refund_requests")
        .select("*, order:orders(number, currency, buyer_name, buyer_email, buyer_phone), event:events(slug, translations:event_translations(locale, title))")
        .order("created_at", { ascending: false }).limit(200),
      c.from("refunds")
        .select("id, batch_id, order_id, amount, status, reason, error, created_by_name, created_at, applied_at, order:orders(number, currency, kind, buyer_name)")
        .order("created_at", { ascending: false }).limit(300),
    ]);
    setRequests((r1.data ?? []) as RefundRequest[]);
    setRefunds((r2.data ?? []) as unknown as RefundRow[]);
  }
  useEffect(() => { load(); }, []);

  if (!staff.can("orders", "finance", "refunds")) return <Notice>Раздел доступен сотрудникам с правом «Возвраты», «Заказы» или «Финансы».</Notice>;
  const canAct = staff.can("refunds");

  async function openRefund(r: RefundRequest) {
    setBusy(r.id);
    try {
      const { tickets } = await adminApi<{ tickets: CurrentTicket[] }>(`/orders/${r.order_id}/tickets`);
      if (!tickets.length) toast("В заказе больше нет действующих билетов", "error");
      else setDialog({ request: r, tickets });
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  }

  async function reject(r: RefundRequest) {
    const note = window.prompt("Причина отказа (покупателю нужно сообщить её самим):", "");
    if (!note?.trim()) return;
    setBusy(r.id);
    try {
      await adminApi(`/refund-requests/${r.id}/reject`, { note });
      toast("Заявка отклонена");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
  }

  async function retry(batch: string, manual: boolean) {
    if (manual && !confirm("Отметить, что деньги вернули вручную в кабинете банка? Билеты будут аннулированы.")) return;
    setBusy(batch);
    try {
      await adminApi(`/refunds/${batch}/retry`, { manual });
      toast("Возврат завершён");
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(null);
    load();
  }

  // Строки возврата по пачкам: одна пачка = одно действие сотрудника.
  const batches = new Map<string, RefundRow[]>();
  for (const r of refunds ?? []) batches.set(r.batch_id, [...(batches.get(r.batch_id) ?? []), r]);
  const fresh = (requests ?? []).filter((r) => r.status === "new");
  const titleOf = (r: RefundRequest) => r.event?.translations.find((t) => t.locale === "ru")?.title ?? r.event?.slug ?? "–";

  return (
    <>
      <PageTitle title="Возвраты">
        <div className="flex gap-1">
          {([["requests", `Заявки${fresh.length ? ` (${fresh.length})` : ""}`], ["history", "История"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-btn px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] ${tab === k ? "bg-coral text-white" : "text-fg-muted hover:text-fg"}`}>
              {l}
            </button>
          ))}
        </div>
      </PageTitle>

      {tab === "requests" && (!requests ? <Spinner /> : requests.length === 0 ? (
        <p className="text-sm text-fg-muted">Заявок на возврат нет. Они приходят от покупателей после переноса или отмены события.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id} className={r.status === "new" ? "" : "opacity-70"}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={reqTone[r.status]}>{reqStatus[r.status]}</Pill>
                    <span className="text-xs text-fg-subtle">{r.kind === "cancelled" ? "Отмена" : "Перенос"} · {formatDateTime(r.created_at)}</span>
                  </div>
                  <p className="mt-2 text-fg">{titleOf(r)} · заказ № {r.order?.number}</p>
                  <p className="text-xs text-fg-muted">{r.order?.buyer_name} · {r.order?.buyer_phone} · {r.order?.buyer_email}</p>
                  <p className="mt-2 text-sm text-fg">
                    Билетов: {r.ticket_ids.length} · {money(r.amount, r.order?.currency ?? "KZT")}
                  </p>
                  {r.reason && <p className="mt-1 text-xs text-fg-muted">Комментарий покупателя: {r.reason}</p>}
                  {r.status !== "new" && (
                    <p className="mt-1 text-xs text-fg-subtle">{r.decided_by_name} · {r.decided_at ? formatDateTime(r.decided_at) : ""}{r.decision_note ? ` · ${r.decision_note}` : ""}</p>
                  )}
                </div>
                {canAct && r.status === "new" && (
                  <div className="flex gap-3">
                    <button disabled={busy === r.id} className="btn btn-primary disabled:opacity-60" onClick={() => openRefund(r)}>Вернуть</button>
                    <button disabled={busy === r.id} className="btn btn-secondary" onClick={() => reject(r)}>Отказать</button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      ))}

      {tab === "history" && (!refunds ? <Spinner /> : batches.size === 0 ? (
        <p className="text-sm text-fg-muted">Возвратов пока не было.</p>
      ) : (
        <Table head={["Когда", "Заказ", "Сумма", "Статус", "Причина", ""]}>
          {[...batches.entries()].map(([batch, list]) => {
            const first = list[0];
            const total = list.reduce((s, r) => s + Number(r.amount), 0);
            const done = list.every((r) => r.status === "applied");
            const failed = list.some((r) => r.status === "failed");
            const stuck = !done && list.some((r) => r.status === "succeeded" || r.status === "manual");
            return (
              <tr key={batch}>
                <td className="px-4 py-3 text-fg-muted">{formatDateTime(first.created_at)}<div className="text-xs">{first.created_by_name}</div></td>
                <td className="px-4 py-3 text-fg">
                  {list.map((r) => <div key={r.id}>№ {r.order?.number}{r.order?.kind === "upgrade" ? " (доплата)" : ""} · {r.order?.buyer_name}</div>)}
                </td>
                <td className="px-4 py-3 text-fg">{money(total, first.order?.currency ?? "KZT")}</td>
                <td className="px-4 py-3">
                  {list.map((r) => (
                    <div key={r.id} className="text-xs">
                      <span className={r.status === "failed" ? "text-coral" : r.status === "applied" ? "text-teal" : "text-orange"}>{rowStatus[r.status]}</span>
                      {r.error && r.status === "failed" && <span className="text-fg-subtle"> · {r.error}</span>}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3 text-xs text-fg-muted">{first.reason}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                  {canAct && !done && (failed || stuck || list.some((r) => r.status === "pending")) && (
                    <>
                      <button disabled={busy === batch} className="text-fg-muted hover:text-coral" onClick={() => retry(batch, false)}>Повторить</button>
                      <button disabled={busy === batch} className="ml-4 text-fg-muted hover:text-coral" onClick={() => retry(batch, true)}>Вернули вручную</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      ))}

      {dialog && (
        <RefundDialog
          order={{ id: dialog.request.order_id, number: dialog.request.order?.number ?? 0, currency: dialog.request.order?.currency ?? "KZT" }}
          tickets={dialog.tickets}
          requestId={dialog.request.id}
          preselected={dialog.request.ticket_ids.filter((id) => dialog.tickets.some((t) => t.ticket_id === id))}
          onClose={() => setDialog(null)}
          onDone={(text) => { setDialog(null); toast(text); load(); }}
        />
      )}
    </>
  );
}
