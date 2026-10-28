import { useCallback, useEffect, useMemo, useState } from "react";

import { db, dbError, money } from "./db";
import { downloadCsv, loadTickets, prettyPhone, seatText, statusLabels, statusTones, timeIn, type TicketRow } from "./entry-data";
import { EventSelect, useEventOptions, useSelectedEvent } from "./event-select";
import { useStaff } from "./layout";
import { useToast } from "./toast";
import { Notice, PageTitle, Pill, Spinner, Table } from "./ui";

const REFRESH_MS = 15000;

/** Проходы: кто прошёл, кто нет, по каждому билету концерта. */
export default function Entries() {
  const me = useStaff();
  const toast = useToast();
  const events = useEventOptions(true);
  const [event, setEvent] = useSelectedEvent(events);
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"" | "sale" | "invite">("");
  const [status, setStatus] = useState<"" | TicketRow["status"]>("");
  const [live, setLive] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      setRows(await loadTickets(event.id));
      setUpdatedAt(new Date());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [event]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  // Во время концерта список обновляется сам.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [live, load]);

  const tz = event?.venue?.timezone ?? "Asia/Almaty";
  const all = rows ?? [];
  const stats = useMemo(() => {
    const active = all.filter((r) => r.status !== "void");
    return {
      total: active.length,
      used: active.filter((r) => r.status === "used").length,
      waiting: active.filter((r) => r.status === "valid").length,
      invites: active.filter((r) => r.kind === "invite").length,
      invitesUsed: active.filter((r) => r.kind === "invite" && r.status === "used").length,
      voided: all.length - active.length,
    };
  }, [all]);

  const shown = all
    .filter((r) => (!kind || r.kind === kind) && (!status || r.status === status))
    .filter((r) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const digits = q.replace(/\D/g, "");
      return (
        [r.holder_name, r.code, r.holder_email, r.category_name, r.issued_by_name].some((v) => v?.toLowerCase().includes(q)) ||
        (digits.length >= 3 && (r.holder_phone ?? "").replace(/\D/g, "").includes(digits)) ||
        (r.order && String(r.order.number) === q)
      );
    })
    .sort((a, b) => (b.used_at ?? "").localeCompare(a.used_at ?? "") || (a.holder_name ?? "").localeCompare(b.holder_name ?? ""));

  async function revert(r: TicketRow) {
    const reason = window.prompt(`Отменить проход по билету ${r.code} (${r.holder_name || prettyPhone(r.holder_phone)})?\nПо нему снова можно будет пройти. Укажите причину:`);
    if (!reason?.trim()) return;
    const { error } = await db().rpc("revert_entry", { p_ticket: r.id, p_reason: reason });
    if (error) return toast(dbError(error), "error");
    toast("Проход отменён, запись в журнале");
    load();
  }

  function exportCsv() {
    downloadCsv(
      `prohody-${event?.slug ?? "event"}-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Код", "Тип", "Тариф", "Место", "Цена", "ФИО", "Телефон", "E-mail", "Заказ", "Выписал", "Статус", "Время входа", "Вход", "Тикетор", "Причина аннулирования"],
      shown.map((r) => [
        r.code,
        r.kind === "invite" ? "Пригласительный" : "Купленный",
        r.category_name,
        seatText(r.seat_label) ?? "",
        r.kind === "invite" ? 0 : r.price,
        r.holder_name ?? "",
        prettyPhone(r.holder_phone),
        r.holder_email ?? "",
        r.order?.number ?? "",
        r.issued_by_name ?? "",
        statusLabels[r.status],
        timeIn(r.used_at, tz),
        r.used_gate_name ?? "",
        r.used_by_name ?? "",
        r.void_reason ?? "",
      ]),
    );
  }

  if (!events) return <Spinner />;
  if (!events.length) return <Notice>Концертов пока нет.</Notice>;

  return (
    <>
      <PageTitle title="Проходы">
        <EventSelect events={events} value={event?.id ?? ""} onChange={setEvent} />
        <button className="btn btn-secondary disabled:opacity-50" disabled={!shown.length} onClick={exportCsv}>Выгрузить в Excel</button>
      </PageTitle>

      {error && <div className="mb-6"><Notice kind="error">{error}</Notice></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Прошли" value={stats.used} of={stats.total} tone="text-teal" onClick={() => setStatus("used")} />
        <Stat label="Ещё не пришли" value={stats.waiting} onClick={() => setStatus("valid")} />
        <Stat label="Всего билетов" value={stats.total} onClick={() => { setStatus(""); setKind(""); }} />
        <Stat label="Гости по приглашению" value={stats.invites} hint={`прошли ${stats.invitesUsed}`} tone="text-[#c79bff]" onClick={() => setKind("invite")} />
        <Stat label="Аннулировано" value={stats.voided} tone="text-coral" onClick={() => setStatus("void")} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ФИО, телефон, код, № заказа"
          className="w-72 max-w-full rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-coral" />
        <select className="rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="">Все типы</option>
          <option value="sale">Купленные</option>
          <option value="invite">Пригласительные</option>
        </select>
        <select className="rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">Все статусы</option>
          <option value="used">Прошли</option>
          <option value="valid">Не прошли</option>
          <option value="void">Аннулированы</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input type="checkbox" className="accent-coral" checked={live} onChange={(e) => setLive(e.target.checked)} />
          Обновлять сами{updatedAt && ` · ${updatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
        </label>
      </div>

      {!rows ? <Spinner /> : !rows.length ? (
        <Notice>На этот концерт пока нет билетов. Купленные появятся после оплаты, пригласительные — после выписки.</Notice>
      ) : (
        <Table head={["Гость", "Билет", "Код", "Статус", "Вход", ""]}>
          {shown.map((r) => (
            <tr key={r.id} className={r.status === "void" ? "opacity-60" : ""}>
              <td className="px-4 py-3">
                <div className="text-fg">{r.holder_name || (r.kind === "invite" ? "Без имени" : "–")}</div>
                <div className="text-xs text-fg-muted">
                  {prettyPhone(r.holder_phone)}
                  {r.kind === "invite" && <span className="text-[#c79bff]"> · гость от {r.issued_by_name}</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-fg-muted">
                {r.kind === "invite" ? (
                  <Pill tone="muted"><span className="text-[#c79bff]">Пригласительный</span></Pill>
                ) : (
                  <>
                    <div className="text-fg">{r.category_name}{seatText(r.seat_label) ? ` · ${seatText(r.seat_label)}` : ""}</div>
                    <div className="text-xs">{money(r.price, r.currency ?? "KZT")}{r.order ? ` · заказ № ${r.order.number}` : ""}</div>
                  </>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs tracking-[0.12em] text-fg-muted">{r.code}</td>
              <td className="px-4 py-3">
                <Pill tone={statusTones[r.status]}>{statusLabels[r.status]}</Pill>
                {r.status === "void" && r.void_reason && <div className="mt-1 text-xs text-fg-subtle">{r.void_reason}</div>}
              </td>
              <td className="px-4 py-3 text-fg-muted">
                {r.used_at ? (
                  <>
                    <div className="text-fg">{timeIn(r.used_at, tz)}</div>
                    <div className="text-xs">{[r.used_gate_name, r.used_by_name].filter(Boolean).join(" · ")}</div>
                  </>
                ) : "–"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                {me.role === "admin" && r.status === "used" && (
                  <button className="text-fg-muted hover:text-coral" onClick={() => revert(r)}>Отменить проход</button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {rows && !!rows.length && !shown.length && <p className="mt-4 text-sm text-fg-muted">Ничего не найдено.</p>}
    </>
  );
}

function Stat({ label, value, of, hint, tone = "text-fg", onClick }: { label: string; value: number; of?: number; hint?: string; tone?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-card border border-line bg-surface/40 px-4 py-3 text-left transition-colors hover:border-line-strong">
      <p className="text-[11px] uppercase tracking-[0.1em] text-fg-subtle">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${tone}`}>
        {value}
        {of != null && <span className="text-sm font-medium text-fg-subtle"> / {of}</span>}
      </p>
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </button>
  );
}
