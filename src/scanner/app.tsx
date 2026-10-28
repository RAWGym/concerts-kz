import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AlertsScreen, useAlerts } from "./alerts";
import { useQrScanner } from "./camera";
import {
  SCANNER_DOMAIN,
  ago,
  deviceLabel,
  doorsAt,
  fmtDate,
  fmtTime,
  isAuthError,
  isNetworkError,
  rpc,
  sb,
  seatText,
  type EventItem,
  type Gate,
  type Me,
  type Stats,
} from "./core";
import { feedback, native, unlockAudio } from "./feedback";
import { History } from "./history";
import { Onboarding, isOnboarded, onboardedKey } from "./onboarding";
import { Profile } from "./profile";
import { needsIOSInstall, registerScannerSW, useWebUpdate } from "./pwa";
import { store, useSettings } from "./settings";
import { Icon, Logo, NetBadge, Sheet, TabHeader } from "./ui";

/* ============================================================
   Приложение тикетора: /scanner.
   Открывается в Android-приложении «Concerts Сканер» и в браузере.
   Решение «пускать или нет» принимает только база (scan_ticket),
   поэтому без связи билет не пропускается.

   Экраны: вход → первая настройка (разрешения) → вкладки
   Концерты · Сканер · История · Уведомления · Профиль.
   ============================================================ */

type Ticket = {
  id: string;
  code: string;
  kind: "sale" | "invite";
  status: string;
  holder_name: string | null;
  holder_phone: string | null;
  category_name: string;
  seat_label: string | null;
  price: number;
  currency: string | null;
  order_number: number | null;
  issued_by_name: string | null;
  is_service: boolean;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
  used_by_name: string | null;
  used_gate_name: string | null;
  void_reason: string | null;
};
type ScanResult = {
  result: "ok" | "already_used" | "not_found" | "invalid" | "wrong_event" | "wrong_gate" | "void" | "not_assigned" | "offline";
  message?: string;
  code?: string | null;
  gate?: string | null;
  ticket?: Ticket | null;
  stats?: Stats;
  me?: string;
  at?: string;
  gates?: string[];
  event_title?: string;
  event_starts_at?: string;
};


/* ---------------- корень ---------------- */

export default function ScannerApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState("");
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    document.title = "Сканер билетов · Concerts";
    registerScannerSW();
    document.documentElement.style.background = "#050505";
    const client = sb();
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMe = useCallback(async () => {
    setMeError("");
    try {
      setMe(await rpc<Me>("scanner_me"));
    } catch (e) {
      // Вход больше не действует (пароль сменили, аккаунт удалён): на экран входа.
      if (isAuthError(e)) {
        await sb().auth.signOut({ scope: "local" }).catch(() => undefined);
        return;
      }
      setMeError(isNetworkError(e) ? "Нет связи с сервером. Проверьте интернет." : (e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      setMe(null);
      return;
    }
    loadMe();
    rpc("scanner_hello", { p_device: deviceLabel() }).catch(() => undefined);
  }, [session, loadMe]);

  // Список концертов обновляется сам, пока приложение на экране.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => document.visibilityState === "visible" && loadMe(), 30000);
    const vis = () => document.visibilityState === "visible" && loadMe();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [session, loadMe]);

  async function signOut() {
    await sb().auth.signOut();
    setMe(null);
  }

  let screen: ReactNode;
  if (session === undefined) screen = <Splash />;
  else if (!session) screen = <Login />;
  else if (!me) screen = meError ? <Problem text={meError} onRetry={loadMe} onSignOut={signOut} /> : <Splash />;
  else if (!me.allowed)
    screen = (
      <Problem
        text={me.disabled ? "Аккаунт отключён администратором." : "У этого аккаунта нет доступа к сканеру. Войдите под аккаунтом тикетора."}
        onSignOut={signOut}
      />
    );
  else if (!setupDone && !isOnboarded(me.user_id)) screen = <Onboarding uid={me.user_id} name={me.name} onDone={() => setSetupDone(true)} />;
  else
    screen = (
      <Shell
        me={me}
        email={session.user.email ?? ""}
        onRefresh={loadMe}
        onSignOut={signOut}
        onRedoSetup={() => {
          store.set(onboardedKey(me.user_id), "0");
          setSetupDone(false);
        }}
      />
    );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-ink text-fg [padding-bottom:env(safe-area-inset-bottom)] [padding-top:env(safe-area-inset-top)] select-none">
      {screen}
    </div>
  );
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return on;
}

/* ---------------- вкладки ---------------- */

type Tab = "events" | "scan" | "history" | "alerts" | "profile";

function Shell({ me, email, onRefresh, onSignOut, onRedoSetup }: { me: Me; email: string; onRefresh: () => Promise<void>; onSignOut: () => void; onRedoSetup: () => void }) {
  const [tab, setTab] = useState<Tab>("events");
  const [eventId, setEventId] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [choosingGate, setChoosingGate] = useState<EventItem | null>(null);
  const online = useOnline();
  const alerts = useAlerts(me);
  // Новая версия сайта: перезагружаемся, когда тикетор не на экране сканера.
  useWebUpdate(tab !== "scan");
  const event = me.events.find((e) => e.id === eventId) ?? null;

  // Сняли с концерта, пока он был открыт: возвращаем к списку.
  useEffect(() => {
    if (eventId && !event) {
      setEventId(null);
      setGate(null);
    }
  }, [eventId, event]);

  // Кнопка «назад» Android: со вкладок возвращаемся к концертам.
  useEffect(() => {
    history.replaceState({ tab: "events" }, "");
  }, []);
  useEffect(() => {
    if (tab !== "events") history.pushState({ tab }, "");
    const pop = () => setTab("events");
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [tab]);

  function openEvent(e: EventItem) {
    unlockAudio();
    if (e.gate) {
      setGate(e.gate);
      setEventId(e.id);
      setTab("scan");
    } else if (e.gates.length) {
      setChoosingGate(e);
    } else {
      setGate(null);
      setEventId(e.id);
      setTab("scan");
    }
  }

  let body: ReactNode;
  if (tab === "events") body = <Events me={me} current={event} onOpen={openEvent} onRefresh={onRefresh} online={online} />;
  else if (tab === "scan")
    body = event ? (
      <Scan key={event.id + (gate?.id ?? "")} event={event} gate={gate} me={me} online={online} onBack={() => setTab("events")} onHistory={() => setTab("history")} />
    ) : (
      <NoEvent me={me} onOpen={openEvent} />
    );
  else if (tab === "history") body = <History events={me.events} current={event} />;
  else if (tab === "alerts")
    body = (
      <AlertsScreen
        alerts={alerts}
        onSettings={() => setTab("profile")}
        onOpenEvent={(id) => {
          const e = me.events.find((x) => x.id === id);
          if (e) openEvent(e);
        }}
      />
    );
  else body = <Profile me={me} email={email} onSignOut={onSignOut} onRedoSetup={onRedoSetup} />;

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col">{body}</main>
      <TabBar tab={tab} onTab={setTab} unread={alerts.unread} live={Boolean(event)} />
      {choosingGate && (
        <GatePicker
          event={choosingGate}
          onPick={(g) => {
            setGate(g);
            setEventId(choosingGate.id);
            setChoosingGate(null);
            setTab("scan");
          }}
          onBack={() => setChoosingGate(null)}
        />
      )}
    </>
  );
}

function TabBar({ tab, onTab, unread, live }: { tab: Tab; onTab: (t: Tab) => void; unread: number; live: boolean }) {
  const item = (t: Tab, label: string, icon: (c?: string) => ReactNode, badge?: number) => {
    const on = tab === t;
    return (
      <button
        key={t}
        type="button"
        onClick={() => onTab(t)}
        aria-current={on ? "page" : undefined}
        className={`relative flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] font-semibold ${on ? "text-fg" : "text-fg-subtle"}`}
      >
        {icon("h-[22px] w-[22px]")}
        {label}
        {on && <span className="absolute top-0 h-0.5 w-6 rounded-full bg-coral" />}
        {badge ? (
          <span className="absolute left-1/2 top-1 ml-1.5 min-w-[17px] rounded-full bg-coral px-1 text-center text-[10px] font-bold leading-[17px] text-white">{badge > 9 ? "9+" : badge}</span>
        ) : null}
      </button>
    );
  };
  return (
    <nav className="relative z-10 flex items-end border-t border-line bg-[#0b0b0b]/95 px-1 backdrop-blur" aria-label="Разделы">
      {item("events", "Концерты", Icon.events)}
      {item("history", "История", Icon.history)}
      <button type="button" onClick={() => onTab("scan")} aria-current={tab === "scan" ? "page" : undefined} className="flex flex-1 flex-col items-center pb-1.5" aria-label="Сканер">
        <span className={`-mt-5 grid h-14 w-14 place-items-center rounded-full border-4 border-ink text-white shadow-[0_8px_24px_-6px_rgba(255,77,77,.7)] ${tab === "scan" ? "bg-coral" : "bg-[#d63a3a]"}`}>
          {Icon.scan("h-7 w-7")}
        </span>
        <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-semibold ${tab === "scan" ? "text-fg" : "text-fg-subtle"}`}>
          {live && <span className="h-1.5 w-1.5 rounded-full bg-[#1fc77a]" />}Сканер
        </span>
      </button>
      {item("alerts", "Уведомления", Icon.bell, unread)}
      {item("profile", "Профиль", Icon.user)}
    </nav>
  );
}

/* ---------------- общие куски ---------------- */

function Splash() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <Logo />
      <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full w-1/2 animate-[scanbar_1s_ease-in-out_infinite_alternate] rounded-full bg-coral" />
      </div>
      <style>{`@keyframes scanbar{from{transform:translateX(-50%)}to{transform:translateX(150%)}}`}</style>
    </div>
  );
}

function Problem({ text, onRetry, onSignOut }: { text: string; onRetry?: () => void; onSignOut: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <Logo />
      <p className="text-base text-fg-muted">{text}</p>
      <div className="flex gap-3">
        {onRetry && <button className="btn btn-primary" onClick={onRetry}>Повторить</button>}
        <button className="btn btn-secondary" onClick={onSignOut}>Выйти</button>
      </div>
    </div>
  );
}

/* ---------------- вход ---------------- */

function Login() {
  const [login, setLogin] = useState(() => store.get("scanner:login") ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const appVersion = native()?.version?.();
  const [iosInstall] = useState(needsIOSInstall);
  const [installHelp, setInstallHelp] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    unlockAudio();
    setBusy(true);
    setError("");
    const l = login.trim().toLowerCase();
    const email = l.includes("@") ? l : `${l}@${SCANNER_DOMAIN}`;
    const { error } = await sb().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(/invalid/i.test(error.message) ? "Неверный логин или пароль" : isNetworkError(error) ? "Нет связи с сервером" : error.message);
      return;
    }
    store.set("scanner:login", l);
  }

  const input = "w-full rounded-btn border border-line-strong bg-surface px-4 py-3.5 text-base text-fg outline-none placeholder:text-fg-subtle focus:border-coral";
  return (
    <div className="relative flex flex-1 flex-col justify-center overflow-y-auto px-6 py-10">
      <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #ff4d4d 0%, transparent 70%)" }} />
      <div className="relative mx-auto w-full max-w-sm">
        <Logo />
        <p className="mt-10 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-coral">Вход для тикетора</p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase leading-[1.05]">Сканер<br />билетов</h1>
        {iosInstall && (
          <button type="button" onClick={() => setInstallHelp(true)} className="mt-6 flex w-full items-center gap-3 rounded-card border border-coral/40 bg-coral/10 p-4 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-coral text-white">{Icon.download("h-5 w-5")}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Установите приложение</span>
              <span className="block text-xs leading-5 text-fg-muted">Иконка на экране, полный экран и обновления. Займёт 10 секунд.</span>
            </span>
            {Icon.chevron("h-5 w-5 shrink-0 text-fg-subtle")}
          </button>
        )}
        <form onSubmit={submit} className="mt-8 space-y-3">
          <input id="login" className={input} placeholder="Логин" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
          <div className="relative">
            <input id="password" type={show ? "text" : "password"} className={`${input} pr-24`} placeholder="Пароль" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-3 my-auto h-8 px-2 text-xs font-semibold text-fg-muted">{show ? "Скрыть" : "Показать"}</button>
          </div>
          {error && <p className="text-sm text-coral">{error}</p>}
          <button disabled={busy} className="btn btn-primary w-full py-4 text-sm disabled:opacity-60">{busy ? "Входим…" : "Войти"}</button>
        </form>
        <p className="mt-6 text-xs leading-5 text-fg-subtle">Аккаунт выдаёт администратор. Забыли пароль? Попросите администратора задать новый.</p>
        {appVersion && <p className="mt-2 text-[11px] text-fg-faint">Версия приложения {appVersion}</p>}
      </div>
      {installHelp && <InstallSheet onClose={() => setInstallHelp(false)} />}
    </div>
  );
}

/** Как поставить сканер на экран «Домой» iPhone. */
function InstallSheet({ onClose }: { onClose: () => void }) {
  const safari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|YaBrowser/.test(navigator.userAgent);
  const steps: [ReactNode, string, string][] = [
    [<svg key="s" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>, "Нажмите «Поделиться»", safari ? "Кнопка внизу экрана Safari (на iPad вверху)." : "В меню браузера. Если пункта нет, откройте эту страницу в Safari."],
    [<svg key="p" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" /></svg>, "«На экран Домой»", "Пролистайте список действий вниз, если пункта не видно."],
    [Icon.check("h-5 w-5"), "Нажмите «Добавить»", "На экране появится иконка «Сканер». Открывайте приложение с неё и войдите там."],
  ];
  return (
    <Sheet title="Установка на iPhone" onClose={onClose}>
      <ol className="space-y-4">
        {steps.map(([icon, t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-ink text-coral">{icon}</span>
            <span>
              <span className="block text-sm font-semibold">{i + 1}. {t}</span>
              <span className="block text-[13px] leading-5 text-fg-muted">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 rounded-btn bg-ink px-4 py-3 text-[13px] leading-5 text-fg-muted">
        Приложение обновляется само: каждый запуск открывает свежую версию. Камеру iPhone может спросить при первом сканировании.
      </p>
      <button className="btn btn-secondary mt-5 w-full py-3.5" onClick={onClose}>Понятно</button>
    </Sheet>
  );
}

/* ---------------- концерты ---------------- */

function eventPhase(e: EventItem) {
  const now = Date.now();
  const doors = new Date(doorsAt(e)).getTime();
  const start = new Date(e.starts_at).getTime();
  if (now >= doors && now < start + 4 * 3600000) return { label: "Вход открыт", tone: "bg-[#1fc77a]/15 text-[#4ee09c]" };
  if (doors - now < 3 * 3600000 && doors > now) return { label: `Вход в ${fmtTime(doorsAt(e), e.timezone)}`, tone: "bg-orange/15 text-orange" };
  return null;
}

function Events({ me, current, onOpen, onRefresh, online }: { me: Me; current: EventItem | null; onOpen: (e: EventItem) => void; onRefresh: () => Promise<void>; online: boolean }) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };
  const hour = Number(new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", hour: "numeric" }).format(new Date()));
  const hello = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <>
      <TabHeader
        eyebrow={`${hello}, ${me.name.split(" ")[0]}`}
        title="Мои концерты"
        right={
          <div className="flex flex-col items-end gap-2">
            <NetBadge online={online} />
            <button onClick={refresh} className="text-xs text-coral" disabled={refreshing}>{refreshing ? "Обновляю…" : "Обновить"}</button>
          </div>
        }
      />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6">
        {!me.events.length && (
          <div className="rounded-card border border-dashed border-line-strong px-5 py-8 text-center text-sm leading-6 text-fg-muted">
            Вас пока не назначили ни на один концерт. Как только администратор назначит, концерт появится здесь, а во вкладке «Уведомления» придёт сообщение.
          </div>
        )}
        {me.events.map((e) => {
          const pct = e.stats.total ? Math.round((e.stats.used / e.stats.total) * 100) : 0;
          const phase = eventPhase(e);
          const active = current?.id === e.id;
          return (
            <button key={e.id} onClick={() => onOpen(e)} className={`w-full rounded-card border bg-surface p-3 text-left active:scale-[0.99] ${active ? "border-coral/60" : "border-line"}`}>
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-orange to-[#b0161e]">
                  {e.poster_url && <img src={e.poster_url} alt="" className="h-full w-full object-cover" draggable={false} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 truncate font-display text-[15px] font-bold uppercase leading-tight">{e.title}</p>
                    {phase && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${phase.tone}`}>{phase.label}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{fmtDate(e.starts_at, e.timezone)} · {fmtTime(e.starts_at, e.timezone)}{e.venue ? ` · ${e.venue}` : ""}</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-coral" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 flex justify-between gap-2 text-[11px] text-fg-subtle">
                    <span className="tabular-nums">{e.stats.used} из {e.stats.total} прошли</span>
                    {e.gate && <span className="font-semibold text-coral">Вход: {e.gate.name}</span>}
                  </p>
                </div>
              </div>
              {active && <p className="mt-3 border-t border-line pt-2.5 text-center text-xs font-semibold text-coral">Сканер открыт · вернуться</p>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function NoEvent({ me, onOpen }: { me: Me; onOpen: (e: EventItem) => void }) {
  return (
    <>
      <TabHeader title="Сканер" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-[22px] bg-surface text-coral">{Icon.scan("h-10 w-10")}</span>
        <p className="font-display text-lg font-bold uppercase">Выберите концерт</p>
        <p className="text-sm leading-6 text-fg-muted">Сканер проверяет билеты только на выбранный концерт.</p>
        <div className="mt-2 w-full space-y-2">
          {me.events.slice(0, 3).map((e) => (
            <button key={e.id} onClick={() => onOpen(e)} className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3.5 text-left active:border-coral">
              <span className="min-w-0">
                <span className="block truncate font-display text-sm font-bold uppercase">{e.title}</span>
                <span className="block text-xs text-fg-subtle">{fmtDate(e.starts_at, e.timezone)} · {fmtTime(e.starts_at, e.timezone)}</span>
              </span>
              {Icon.chevron("h-5 w-5 shrink-0 text-fg-subtle")}
            </button>
          ))}
          {!me.events.length && <p className="text-sm text-fg-subtle">Вас пока не назначили ни на один концерт.</p>}
        </div>
      </div>
    </>
  );
}

function GatePicker({ event, onPick, onBack }: { event: EventItem; onPick: (g: Gate | null) => void; onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink [padding-bottom:env(safe-area-inset-bottom)] [padding-top:env(safe-area-inset-top)]">
      <header className="flex items-center gap-3 px-5 pb-3 pt-4">
        <button onClick={onBack} className="text-2xl leading-none text-fg-muted" aria-label="Назад">‹</button>
        <p className="truncate font-display text-sm font-bold uppercase">{event.title}</p>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6">
        <h1 className="font-display text-xl font-bold uppercase">На каком вы входе?</h1>
        <p className="text-sm text-fg-muted">Вход попадёт в журнал. Если вход пропускает не все билеты, сканер подскажет гостю нужный.</p>
        {event.gates.map((g) => (
          <button key={g.id} onClick={() => onPick(g)} className="w-full rounded-card border border-line bg-surface px-5 py-4 text-left font-display text-base font-bold uppercase active:border-coral">{g.name}</button>
        ))}
        <button onClick={() => onPick(null)} className="w-full rounded-card border border-dashed border-line-strong px-5 py-4 text-left text-sm text-fg-muted">Любой вход, без проверки зоны</button>
      </div>
    </div>
  );
}

/* ---------------- сканирование ---------------- */

type Shown = ScanResult & { local?: "repeat_mine" };

function Scan({ event, gate, me, online, onBack, onHistory }: { event: EventItem; gate: Gate | null; me: Me; online: boolean; onBack: () => void; onHistory: () => void }) {
  const [settings] = useSettings();
  const [stats, setStats] = useState<Stats>(event.stats);
  const [result, setResult] = useState<Shown | null>(null);
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busyRef = useRef(false);

  // Экран не гаснет, пока открыт сканер (если включено в настройках).
  useEffect(() => {
    if (!settings.keepAwake) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () => nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    get();
    const vis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      lock?.release().catch(() => undefined);
    };
  }, [settings.keepAwake]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      rpc<Stats>("scanner_stats", { p_event: event.id }).then(setStats).catch(() => undefined);
    }, 20000);
    return () => clearInterval(t);
  }, [event.id]);

  const check = useCallback(async (raw: string, fromCamera: boolean) => {
    const code = raw.trim();
    if (!code || busyRef.current) return;
    // Тот же QR ещё в кадре после ответа: не проверяем его повторно.
    if (fromCamera && lastRef.current.code === code && Date.now() - lastRef.current.at < 8000) return;
    busyRef.current = true;
    setChecking(true);
    let res: Shown;
    try {
      res = await rpc<ScanResult>("scan_ticket", { p_event: event.id, p_code: code, p_gate: gate?.id ?? null, p_device: deviceLabel() });
      if (res.stats) setStats(res.stats);
      // Повторный скан того же билета этим же тикетором сразу после пропуска
      // (например, ответ потерялся из-за сети) — это не обман, а повтор.
      if (res.result === "already_used" && res.ticket?.used_by === me.user_id && res.ticket.used_at &&
          Date.now() - new Date(res.ticket.used_at).getTime() < 3 * 60000) {
        res = { ...res, local: "repeat_mine" };
      }
    } catch (e) {
      res = { result: "offline", message: isNetworkError(e) ? "Нет связи с сервером" : (e as Error).message, code };
    }
    const ok = res.result === "ok";
    feedback(ok ? "ok" : res.result === "wrong_gate" || res.local === "repeat_mine" || res.result === "offline" ? "warn" : "deny");
    setResult(res);
    setChecking(false);
    busyRef.current = false;
    lastRef.current = { code, at: Date.now() };
  }, [event.id, gate?.id, me.user_id]);

  const dismiss = useCallback(() => {
    lastRef.current = { ...lastRef.current, at: Date.now() };
    setResult(null);
  }, []);

  // Успешный проход закрывается сам (время в настройках), отказ — только кнопкой.
  useEffect(() => {
    if (result?.result !== "ok" || !settings.autoClose) return;
    const t = setTimeout(dismiss, (settings.autoClose + (result.ticket?.kind === "invite" ? 1 : 0)) * 1000);
    return () => clearTimeout(t);
  }, [result, dismiss, settings.autoClose]);

  const paused = Boolean(result) || checking || manual;
  const cam = useQrScanner((code) => check(code, true), paused, settings.camera);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 px-4 pb-2 pt-3">
        <button onClick={onBack} className="-ml-1 px-1 text-3xl leading-none text-fg-muted" aria-label="К списку концертов">‹</button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold uppercase">{event.title}</p>
          <p className="truncate text-[11px] text-fg-subtle">{gate ? `Вход: ${gate.name}` : "Любой вход"} · {me.name}</p>
        </div>
        <NetBadge online={online} />
      </header>

      {!online && (
        <div className="mx-4 mb-2 rounded-btn bg-coral px-3 py-2 text-center text-xs font-semibold text-white">
          Нет интернета. Билеты не проверяются, никого не пропускайте без проверки.
        </div>
      )}

      <div className="relative mx-4 flex-1 overflow-hidden rounded-[18px] bg-[#111]">
        <video ref={cam.videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        {cam.state === "on" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative aspect-square w-[66%] max-w-[320px]">
              {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map((c) => (
                <span key={c} className={`absolute h-10 w-10 border-coral ${c}`} />
              ))}
              {checking && <span className="absolute inset-0 grid place-items-center font-display text-sm font-bold uppercase text-white drop-shadow">Проверяю…</span>}
            </div>
          </div>
        )}
        {cam.state === "starting" && <p className="absolute inset-0 grid place-items-center text-sm text-fg-muted">Включаю камеру…</p>}
        {(cam.state === "denied" || cam.state === "unavailable") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-sm text-fg-muted">
              {cam.state === "denied" ? "Нет доступа к камере. Разрешите камеру для приложения в настройках телефона." : "Камера недоступна. Можно вводить коды вручную."}
            </p>
            <button className="btn btn-secondary" onClick={cam.restart}>Попробовать снова</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pt-3">
        <StatBox label="прошли" value={stats.used} />
        <StatBox label="ждём" value={Math.max(0, stats.total - stats.used)} />
        <StatBox label="отказов" value={stats.denied} />
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 pb-3 pt-2">
        <button className="btn btn-secondary py-3.5 text-xs" onClick={() => { unlockAudio(); setManual(true); }}>Ввести код</button>
        {cam.torch !== null && (
          <button className={`btn py-3.5 text-xs ${cam.torch ? "btn-primary" : "btn-secondary"}`} onClick={cam.toggleTorch} aria-label="Фонарик">Свет</button>
        )}
        <button className="btn btn-secondary py-3.5 text-xs" onClick={onHistory}>История</button>
      </div>

      {manual && <ManualCode onClose={() => setManual(false)} onSubmit={(c) => { setManual(false); check(c, false); }} />}
      {result && <ResultScreen r={result} event={event} onNext={dismiss} />}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-btn bg-surface px-2 py-2 text-center">
      <p className="font-display text-lg font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.08em] text-fg-subtle">{label}</p>
    </div>
  );
}

function ManualCode({ onClose, onSubmit }: { onClose: () => void; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^0-9A-F-]/g, "");
  const valid = /^[0-9A-F]{12}(-\d{1,3})?$/.test(clean);
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/70" onClick={onClose}>
      <form className="rounded-t-[22px] bg-surface px-5 pt-5 [padding-bottom:calc(env(safe-area-inset-bottom)+28px)]" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(clean); }}>
        <p className="font-display text-sm font-bold uppercase">Код с билета</p>
        <p className="mt-1 text-xs text-fg-subtle">12 символов под QR-кодом, например A41F9C02B7E1</p>
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} maxLength={16} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          className="mt-4 w-full rounded-btn border border-line-strong bg-ink px-4 py-4 text-center font-mono text-xl tracking-[0.25em] text-fg outline-none focus:border-coral" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-secondary py-3.5" onClick={onClose}>Отмена</button>
          <button disabled={!valid} className="btn btn-primary py-3.5 disabled:opacity-50">Проверить</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- экран результата ---------------- */

function ResultScreen({ r, event, onNext }: { r: Shown; event: EventItem; onNext: () => void }) {
  const t = r.ticket;
  // Отказ нельзя закрыть случайным касанием в первую секунду.
  const [ready, setReady] = useState(r.result === "ok");
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(id);
  }, [ready]);
  const tz = event.timezone;
  let tone: "ok" | "invite" | "warn" | "bad" = "bad";
  let eyebrow = "Отказ";
  let title = "";
  let note: ReactNode = null;

  switch (r.result) {
    case "ok":
      if (t?.kind === "invite") {
        tone = "invite";
        eyebrow = "Пригласительный · проходите";
        title = `Гость от ${t.issued_by_name ?? "организатора"}`;
      } else {
        tone = "ok";
        eyebrow = "Билет действителен";
        title = "Проходите";
      }
      break;
    case "already_used":
      if (r.local === "repeat_mine") {
        tone = "warn";
        eyebrow = "Повторный скан";
        title = "Вы уже пропустили";
        note = `Этот билет вы отметили ${t?.used_at ? `в ${fmtTime(t.used_at, tz)}` : "только что"}. Если гость ещё не прошёл, пропустите его.`;
      } else {
        title = "Уже прошёл";
        note = t?.used_at ? `${fmtTime(t.used_at, tz)}, ${ago(t.used_at)}${t.used_by_name ? ` · ${t.used_by_name}` : ""}${t.used_gate_name ? ` · вход ${t.used_gate_name}` : ""}` : null;
      }
      break;
    case "wrong_gate":
      tone = "warn";
      eyebrow = "Не пропускать здесь";
      title = "Не тот вход";
      note = r.gates?.length ? `Направьте гостя: ${r.gates.join(", ")}` : "Для этого билета нет подходящего входа. Позовите администратора.";
      break;
    case "wrong_event":
      title = "Другой концерт";
      note = r.event_title ? `Билет на «${r.event_title}»${r.event_starts_at ? `, ${fmtDate(r.event_starts_at, tz)}` : ""}` : null;
      break;
    case "void":
      title = "Аннулирован";
      note = t?.void_reason ?? null;
      break;
    case "not_found":
      title = "Билет не найден";
      note = "Такого кода нет в базе. Возможна подделка или ошибка при вводе.";
      break;
    case "invalid":
      title = "Это не билет";
      note = "QR-код не похож на билет Concerts.";
      break;
    case "not_assigned":
      title = "Нет доступа";
      note = "Вас сняли с этого концерта. Вернитесь к списку.";
      break;
    case "offline":
      tone = "warn";
      eyebrow = "Билет не проверен";
      title = "Нет связи";
      note = "Ответ сервера не получен. Проверьте интернет и отсканируйте ещё раз. Без проверки не пропускайте.";
      break;
  }

  const bg = {
    ok: "bg-[linear-gradient(170deg,#0f6b40,#08241a)]",
    invite: "bg-[linear-gradient(170deg,#6a2384,#1f0b28)]",
    warn: "bg-[linear-gradient(170deg,#8a5c06,#2a1e08)]",
    bad: "bg-[linear-gradient(170deg,#8e1616,#2a0b0b)]",
  }[tone];
  const eyebrowColor = { ok: "text-[#8ff5c3]", invite: "text-[#e2c1ff]", warn: "text-[#ffd98a]", bad: "text-[#ffb3b3]" }[tone];

  const facts: [string, string][] = [];
  if (t) {
    if (t.kind === "invite") {
      facts.push(["Гость", t.holder_name || "Без имени"]);
      if (t.holder_phone) facts.push(["Телефон", t.holder_phone]);
      facts.push(["Тип", t.is_service ? "Пригласительный (служебный)" : "Пригласительный"]);
      facts.push(["Выписал", t.issued_by_name ?? "–"]);
    } else {
      facts.push(["ФИО", t.holder_name || "–"]);
      facts.push(["Тип", t.category_name]);
      const seat = seatText(t.seat_label);
      if (seat) facts.push(["Место", seat]);
      if (t.order_number) facts.push(["Заказ", `№ ${t.order_number}`]);
    }
  }

  return (
    <button type="button" onClick={() => ready && onNext()} className={`fixed inset-0 z-50 flex flex-col px-6 text-left text-white [padding-bottom:calc(env(safe-area-inset-bottom)+24px)] [padding-top:calc(env(safe-area-inset-top)+32px)] ${bg}`}>
      <p className={`font-display text-xs font-bold uppercase tracking-[0.16em] ${eyebrowColor}`}>{eyebrow}</p>
      <h2 className="mt-3 font-display text-[40px] font-bold uppercase leading-[1.02] [text-wrap:balance]">{title}</h2>
      {note && <p className="mt-4 text-lg leading-snug text-white/85">{note}</p>}
      {facts.length > 0 && (
        <dl className="mt-7 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-base">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-white/55">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {(r.code || t?.code) && <p className="mt-6 font-mono text-sm tracking-[0.2em] text-white/60">{t?.code ?? r.code}</p>}
      <span className="mt-auto block w-full rounded-full bg-white/95 py-4 text-center font-display text-sm font-bold uppercase text-ink">
        {r.result === "ok" ? "Дальше" : "Сканировать дальше"}
      </span>
    </button>
  );
}
