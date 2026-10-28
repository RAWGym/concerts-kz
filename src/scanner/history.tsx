import { useCallback, useEffect, useState } from "react";

import { fmtTime, rpc, type EventItem, type Recent } from "./core";
import { Icon, Pill, Segmented, TabHeader, type PillTone } from "./ui";

/* История сканов тикетора по концерту. */

const label: Record<string, [string, PillTone]> = {
  ok: ["Пропущен", "ok"],
  already_used: ["Повтор", "bad"],
  not_found: ["Не найден", "bad"],
  invalid: ["Не билет", "warn"],
  wrong_event: ["Другой концерт", "warn"],
  wrong_gate: ["Не тот вход", "warn"],
  void: ["Аннулирован", "bad"],
  not_assigned: ["Нет доступа", "bad"],
};

type Filter = "all" | "ok" | "denied";

export function History({ events, current }: { events: EventItem[]; current: EventItem | null }) {
  const [eventId, setEventId] = useState(current?.id ?? events[0]?.id ?? "");
  const [list, setList] = useState<Recent[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const event = events.find((e) => e.id === eventId) ?? null;

  const load = useCallback(async () => {
    if (!eventId) return;
    setError(false);
    try {
      setList(await rpc<Recent[]>("scanner_recent", { p_event: eventId, p_limit: 100 }));
    } catch {
      setError(true);
      setList((l) => l ?? []);
    }
  }, [eventId]);

  useEffect(() => {
    setList(null);
    load();
  }, [load]);

  const shown = (list ?? []).filter((r) => {
    if (filter === "ok" && r.result !== "ok") return false;
    if (filter === "denied" && r.result === "ok") return false;
    const s = q.trim().toLowerCase();
    return !s || `${r.holder_name ?? ""} ${r.code} ${r.category_name ?? ""}`.toLowerCase().includes(s);
  });
  const okCount = (list ?? []).filter((r) => r.result === "ok").length;

  return (
    <>
      <TabHeader
        title="История"
        right={
          <button onClick={load} className="pb-0.5 text-fg-muted" aria-label="Обновить">
            {Icon.refresh("h-5 w-5")}
          </button>
        }
      />
      {events.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-3 [scrollbar-width:none]">
          {events.map((e) => (
            <button
              key={e.id}
              onClick={() => setEventId(e.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${e.id === eventId ? "border-coral bg-coral/15 text-fg" : "border-line text-fg-muted"}`}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}
      {!events.length ? (
        <p className="px-5 py-10 text-center text-sm text-fg-muted">Нет концертов. История появится после назначения.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-3 px-5 pb-3">
            <div className="grid grid-cols-3 gap-2">
              <Box label="моих сканов" value={list?.length ?? "–"} />
              <Box label="пропустил" value={list ? okCount : "–"} />
              <Box label="отказов" value={list ? list.length - okCount : "–"} />
            </div>
            <Segmented<Filter> value={filter} onChange={setFilter} options={[["all", "Все"], ["ok", "Пропущены"], ["denied", "Отказы"]]} />
            <input
              id="history-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Имя или код билета"
              className="w-full rounded-btn border border-line bg-surface px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-coral"
            />
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-5 pb-6">
            {error && <p className="rounded-btn bg-coral/10 px-4 py-3 text-sm text-coral">Нет связи. Показаны последние загруженные данные.</p>}
            {list === null && <p className="py-10 text-center text-sm text-fg-muted">Загружаю…</p>}
            {list !== null && !shown.length && <p className="py-10 text-center text-sm text-fg-muted">{list.length ? "Ничего не найдено." : "Вы ещё ничего не сканировали на этом концерте."}</p>}
            {shown.map((r, i) => {
              const [text, tone] = label[r.result] ?? [r.result, "muted" as PillTone];
              return (
                <div key={i} className="flex items-center gap-3 rounded-btn bg-surface px-3 py-3">
                  <span className="w-11 shrink-0 text-xs tabular-nums text-fg-subtle">{fmtTime(r.at, event?.timezone)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{r.holder_name || (r.kind === "invite" ? "Гость" : r.code)}</p>
                    <p className="truncate text-[11px] text-fg-subtle">
                      {[r.kind === "invite" ? "Пригласительный" : r.category_name ?? r.message, r.gate].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Pill tone={tone}>{text}</Pill>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function Box({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-btn bg-surface px-2 py-2 text-center">
      <p className="font-display text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.08em] text-fg-subtle">{label}</p>
    </div>
  );
}
