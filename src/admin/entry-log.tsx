import { useCallback, useEffect, useState } from "react";

import { db } from "./db";
import { downloadCsv } from "./entry-data";
import { EventSelect, useEventOptions, useSelectedEvent } from "./event-select";
import { PageTitle, Pill, Spinner, Table } from "./ui";

type Entry = {
  id: number;
  at: string;
  actor_name: string | null;
  action: string;
  result: string | null;
  event_id: string | null;
  code: string | null;
  gate_name: string | null;
  message: string | null;
  device: string | null;
};

const scanResults: Record<string, { label: string; tone: "teal" | "coral" | "orange" | "muted" }> = {
  ok: { label: "Пропуск", tone: "teal" },
  already_used: { label: "Повтор", tone: "coral" },
  not_found: { label: "Не найден", tone: "orange" },
  invalid: { label: "Не билет", tone: "orange" },
  wrong_event: { label: "Другой концерт", tone: "orange" },
  wrong_gate: { label: "Не тот вход", tone: "orange" },
  void: { label: "Аннулирован", tone: "coral" },
  not_assigned: { label: "Не назначен", tone: "coral" },
};
const actions: Record<string, { label: string; tone: "teal" | "coral" | "orange" | "muted" }> = {
  invite_issued: { label: "Выписан", tone: "muted" },
  ticket_voided: { label: "Аннулирован", tone: "coral" },
  entry_reverted: { label: "Отмена прохода", tone: "orange" },
  app_open: { label: "Вход в сканер", tone: "muted" },
  admin: { label: "Настройка", tone: "muted" },
};

const badge = (e: Entry) => (e.action === "scan" ? scanResults[e.result ?? ""] : actions[e.action]) ?? { label: e.action, tone: "muted" as const };

const filters = [
  { value: "", label: "Все действия" },
  { value: "scan", label: "Все сканы" },
  { value: "scan:ok", label: "Пропуски" },
  { value: "scan:deny", label: "Отказы" },
  { value: "invite_issued", label: "Выписка приглашений" },
  { value: "ticket_voided", label: "Аннулирования" },
  { value: "entry_reverted", label: "Отмены проходов" },
  { value: "admin", label: "Тикеторы и входы" },
];

/** Журнал входа: каждый скан и каждое действие с билетами. Записи не меняются и не удаляются. */
export default function EntryLog() {
  const events = useEventOptions(true);
  const [event, setEvent] = useSelectedEvent(events);
  const [allEvents, setAllEvents] = useState(false);
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    let q = db().from("ticket_log").select("*").order("at", { ascending: false }).limit(1000);
    if (!allEvents && event) q = q.eq("event_id", event.id);
    if (filter === "scan") q = q.eq("action", "scan");
    else if (filter === "scan:ok") q = q.eq("action", "scan").eq("result", "ok");
    else if (filter === "scan:deny") q = q.eq("action", "scan").neq("result", "ok");
    else if (filter) q = q.eq("action", filter);
    const { data } = await q;
    setRows((data ?? []) as Entry[]);
  }, [event, allEvents, filter]);

  useEffect(() => {
    setRows(null);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  const tz = event?.venue?.timezone ?? "Asia/Almaty";
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  const title = (id: string | null) => events?.find((e) => e.id === id)?.title ?? "";

  const shown = (rows ?? []).filter((e) => {
    const q = query.trim().toLowerCase();
    return !q || [e.actor_name, e.code, e.message, e.gate_name].some((v) => v?.toLowerCase().includes(q));
  });

  return (
    <>
      <PageTitle title="Журнал входа">
        {events && events.length > 0 && !allEvents && <EventSelect events={events} value={event?.id ?? ""} onChange={setEvent} />}
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" className="accent-coral" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} />
          Все концерты
        </label>
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg" value={filter} onChange={(e) => setFilter(e.target.value)}>
          {filters.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Сотрудник, код, текст"
          className="w-64 max-w-full rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-coral" />
        <button className="btn btn-secondary ml-auto disabled:opacity-50" disabled={!shown.length} onClick={() =>
          downloadCsv(`zhurnal-vhoda-${new Date().toISOString().slice(0, 10)}.csv`,
            ["Время", "Сотрудник", "Действие", "Концерт", "Код", "Вход", "Описание", "Устройство"],
            shown.map((e) => [fmt(e.at), e.actor_name, badge(e).label, title(e.event_id), e.code, e.gate_name, e.message, e.device]))
        }>Выгрузить в Excel</button>
      </div>
      <p className="mb-4 text-xs text-fg-subtle">Записи пишет сама база при каждом действии. Изменить или удалить их нельзя. Показаны последние 1000.</p>
      {!rows ? <Spinner /> : !shown.length ? (
        <p className="text-sm text-fg-muted">Записей нет.</p>
      ) : (
        <Table head={["Время", "Кто", "Действие", "Код", "Подробно"]}>
          {shown.map((e) => {
            const b = badge(e);
            return (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg-muted">{fmt(e.at)}</td>
                <td className="px-4 py-3 text-fg">{e.actor_name ?? "–"}</td>
                <td className="px-4 py-3"><Pill tone={b.tone}>{b.label}</Pill></td>
                <td className="px-4 py-3 font-mono text-xs tracking-[0.1em] text-fg-muted">{e.code ?? ""}</td>
                <td className="px-4 py-3 text-fg-muted">
                  {e.message}
                  {(e.gate_name || (allEvents && e.event_id)) && (
                    <div className="text-xs text-fg-subtle">{[allEvents ? title(e.event_id) : "", e.gate_name ? `вход ${e.gate_name}` : ""].filter(Boolean).join(" · ")}</div>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
