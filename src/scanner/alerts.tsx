import { useEffect, useMemo, useState } from "react";

import { doorsAt, fmtDate, fmtTime, type EventItem, type Me, ago } from "./core";
import { native } from "./feedback";
import { cancelNotify, canSchedule, numId, scheduleNotify, systemNotify } from "./perms";
import { getSettings, store, useSettings } from "./settings";
import { Icon, TabHeader } from "./ui";

/* ============================================================
   Уведомления тикетора. Источники:
   - назначения на концерты (из scanner_me: assigned_at, assigned_by);
   - снятие с концерта (концерт пропал из списка, а он ещё не прошёл);
   - скорое открытие входа (за N минут до дверей);
   - обновление приложения (сменилась версия Android-оболочки).
   Прочитанность и локальные события хранятся на телефоне.
   ============================================================ */

export type Alert = {
  id: string;
  at: string;
  kind: "assign" | "unassign" | "soon" | "update";
  title: string;
  body: string;
  eventId?: string;
};

type Saved = { known: string[]; events: Record<string, [title: string, startsAt: string]>; local: Alert[]; seen: number; scheduled: number[]; version?: string };

const keyFor = (uid: string) => `scanner:alerts:${uid}`;
function load(uid: string): Saved | null {
  try {
    const raw = store.get(keyFor(uid));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
const save = (uid: string, s: Saved) => store.set(keyFor(uid), JSON.stringify(s));

const place = (e: EventItem) => [fmtDate(e.starts_at, e.timezone), fmtTime(e.starts_at, e.timezone), e.venue].filter(Boolean).join(" · ");

function assignAlert(e: EventItem): Alert | null {
  if (!e.assigned_at) return null;
  return {
    id: `assign:${e.id}:${e.assigned_at}`,
    at: e.assigned_at,
    kind: "assign",
    title: `Вас назначили на ${e.title}`,
    body: `${place(e)}${e.gate ? ` · вход ${e.gate.name}` : ""}${e.assigned_by ? `. Назначил: ${e.assigned_by}` : ""}`,
    eventId: e.id,
  };
}

/**
 * Собирает уведомления, отмечает новые, показывает системные уведомления
 * и ставит напоминания перед входом.
 */
export function useAlerts(me: Me | null) {
  const [settings] = useSettings();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // Сверка с прошлым состоянием при каждом обновлении списка концертов.
  useEffect(() => {
    if (!me?.allowed) return;
    const prev = load(me.user_id);
    const first = !prev;
    const s: Saved = prev ?? { known: [], events: {}, local: [], seen: Date.now(), scheduled: [] };
    const nowIso = new Date().toISOString();

    // Назначения
    for (const e of me.events) {
      const a = assignAlert(e);
      if (a && !s.known.includes(a.id)) {
        s.known.push(a.id);
        if (!first && getSettings().notifyAssign) systemNotify(numId(a.id), a.title, a.body);
      }
    }
    // Снятие с концерта, который ещё не прошёл
    const current = new Set(me.events.map((e) => e.id));
    for (const [id, [title, startsAt]] of Object.entries(s.events)) {
      // Прошедший концерт уходит из списка сам, это не снятие.
      if (!current.has(id) && new Date(startsAt).getTime() > Date.now()) {
        const a: Alert = { id: `unassign:${id}:${nowIso}`, at: nowIso, kind: "unassign", title: `Вас сняли с концерта ${title}`, body: "Сканировать билеты на этот концерт больше нельзя.", eventId: id };
        s.local.unshift(a);
        if (getSettings().notifyAssign) systemNotify(numId(a.id), a.title, a.body);
      }
    }
    s.events = Object.fromEntries(me.events.filter((e) => e.assigned_at).map((e) => [e.id, [e.title, e.starts_at]]));

    // Обновление приложения
    const v = native()?.version?.();
    if (v && s.version && s.version !== v) {
      s.local.unshift({ id: `update:${v}`, at: nowIso, kind: "update", title: `Приложение обновлено до ${v}`, body: "Обновление установилось само. Ничего делать не нужно." });
    }
    if (v) s.version = v;

    s.known = s.known.slice(-200);
    s.local = s.local.slice(0, 50);
    save(me.user_id, s);
    setSaved({ ...s });
  }, [me]);

  // Напоминания перед входом (только в Android-приложении).
  useEffect(() => {
    if (!me?.allowed || !canSchedule()) return;
    const s = load(me.user_id);
    if (!s) return;
    const want = new Map<number, [number, string, string]>();
    if (settings.reminders) {
      for (const e of me.events) {
        const at = new Date(doorsAt(e)).getTime() - settings.remindBefore * 60000;
        if (at <= Date.now()) continue;
        want.set(numId(`soon:${e.id}`), [at, `Скоро вход: ${e.title}`, `Вход с ${fmtTime(doorsAt(e), e.timezone)}${e.gate ? ` · ${e.gate.name}` : ""}. Откройте сканер заранее и проверьте интернет.`]);
      }
    }
    for (const id of s.scheduled ?? []) if (!want.has(id)) cancelNotify(id);
    for (const [id, [at, title, body]] of want) scheduleNotify(id, at, title, body);
    s.scheduled = [...want.keys()];
    save(me.user_id, s);
  }, [me, settings.reminders, settings.remindBefore]);

  const list = useMemo<Alert[]>(() => {
    if (!me?.allowed || !saved) return [];
    const out: Alert[] = [];
    for (const e of me.events) {
      const a = assignAlert(e);
      if (a) out.push(a);
      // «Скоро вход» показываем в списке с момента напоминания до начала концерта.
      const doors = new Date(doorsAt(e)).getTime();
      const from = doors - settings.remindBefore * 60000;
      if (settings.reminders && now >= from && now < new Date(e.starts_at).getTime() + 3 * 3600000) {
        out.push({
          id: `soon:${e.id}`,
          at: new Date(from).toISOString(),
          kind: "soon",
          title: now < doors ? `Скоро вход: ${e.title}` : `Вход открыт: ${e.title}`,
          body: `Вход с ${fmtTime(doorsAt(e), e.timezone)}${e.gate ? ` · ${e.gate.name}` : ""}. ${e.stats.used} из ${e.stats.total} прошли.`,
          eventId: e.id,
        });
      }
    }
    out.push(...saved.local);
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [me, saved, now, settings.reminders, settings.remindBefore]);

  const unread = saved ? list.filter((a) => new Date(a.at).getTime() > saved.seen).length : 0;

  const markSeen = () => {
    if (!me) return;
    const s = load(me.user_id);
    if (!s) return;
    s.seen = Date.now();
    save(me.user_id, s);
    setSaved({ ...s });
  };

  const clearLocal = () => {
    if (!me) return;
    const s = load(me.user_id);
    if (!s) return;
    s.local = [];
    save(me.user_id, s);
    setSaved({ ...s });
  };

  return { list, unread, seen: saved?.seen ?? 0, markSeen, clearLocal };
}

const kindStyle: Record<Alert["kind"], [string, string]> = {
  assign: ["bg-coral/15 text-coral", "Назначение"],
  unassign: ["bg-surface-2 text-fg-muted", "Снятие"],
  soon: ["bg-orange/15 text-orange", "Напоминание"],
  update: ["bg-[#1fc77a]/15 text-[#4ee09c]", "Приложение"],
};

export function AlertsScreen({ alerts, onOpenEvent, onSettings }: { alerts: ReturnType<typeof useAlerts>; onOpenEvent: (id: string) => void; onSettings: () => void }) {
  const [seenAtOpen] = useState(alerts.seen);
  const { markSeen } = alerts;
  useEffect(() => {
    markSeen();
    // Отмечаем прочитанным один раз при открытии вкладки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <TabHeader title="Уведомления" right={<button className="pb-0.5 text-xs text-coral" onClick={onSettings}>Настроить</button>} />
      <div className="flex-1 space-y-2 overflow-y-auto px-5 pb-6">
        {!alerts.list.length && (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
            <span className="text-fg-subtle">{Icon.bell("h-8 w-8")}</span>
            <p className="text-sm text-fg-muted">Здесь появятся назначения на концерты, напоминания перед входом и новости приложения.</p>
          </div>
        )}
        {alerts.list.map((a) => {
          const fresh = new Date(a.at).getTime() > seenAtOpen;
          const [chip, label] = kindStyle[a.kind];
          const body = (
            <>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${chip}`}>{label}</span>
                <span className="text-[11px] text-fg-subtle">{ago(a.at)}</span>
                {fresh && <span className="ml-auto h-2 w-2 rounded-full bg-coral" aria-label="Новое" />}
              </div>
              <p className="mt-2 text-[15px] font-semibold leading-snug text-fg">{a.title}</p>
              <p className="mt-1 text-[13px] leading-5 text-fg-muted">{a.body}</p>
            </>
          );
          const canOpen = a.eventId && (a.kind === "assign" || a.kind === "soon");
          return canOpen ? (
            <button key={a.id} onClick={() => onOpenEvent(a.eventId!)} className={`block w-full rounded-card border p-4 text-left active:bg-surface-2 ${fresh ? "border-coral/40 bg-surface" : "border-line bg-surface"}`}>
              {body}
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-coral">Открыть сканер {Icon.chevron("h-4 w-4")}</span>
            </button>
          ) : (
            <div key={a.id} className={`rounded-card border p-4 ${fresh ? "border-coral/40 bg-surface" : "border-line bg-surface"}`}>{body}</div>
          );
        })}
        {alerts.list.some((a) => a.kind === "unassign" || a.kind === "update") && (
          <button className="w-full py-3 text-xs text-fg-subtle" onClick={alerts.clearLocal}>Очистить старые</button>
        )}
      </div>
    </>
  );
}
