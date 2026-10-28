import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { createBrowserSupabase } from "@/lib/supabase/client";

import { useQrScanner } from "./camera";
import { feedback, native, unlockAudio } from "./feedback";

/* ============================================================
   Сканер билетов для тикеторов: /scanner.
   Открывается в Android-приложении «Concerts Сканер» и в браузере.
   Решение «пускать или нет» принимает только база (scan_ticket),
   поэтому без связи билет не пропускается.
   ============================================================ */

const SCANNER_DOMAIN = "scanner.concerts.kz";
const RPC_TIMEOUT = 9000;

type Stats = { total: number; used: number; invites: number; denied: number };
type Gate = { id: string; name: string };
type EventItem = {
  id: string;
  title: string;
  starts_at: string;
  doors_open_at: string | null;
  poster_url: string | null;
  venue: string | null;
  city: string | null;
  timezone: string;
  gate: Gate | null;
  gates: Gate[];
  stats: Stats;
};
type Me = { allowed: boolean; disabled?: boolean; user_id: string; name: string; role: string; events: EventItem[] };
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
type Recent = { at: string; result: string; code: string; message: string; holder_name: string | null; category_name: string | null; kind: string | null };

const sb = () => createBrowserSupabase();

/** Вызов функции базы с ограничением по времени: зависший запрос не держит очередь. */
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb() as any).rpc(fn, args).abortSignal(ctrl.signal);
    if (error) throw Object.assign(new Error(error.message || "network"), { code: error.code, status: (error as { status?: number }).status });
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

const isNetworkError = (e: unknown) => {
  const m = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`;
  return /abort|network|fetch|failed to|load failed|timeout/i.test(m) || !navigator.onLine;
};

function deviceLabel() {
  const app = native()?.version?.();
  const ua = navigator.userAgent.match(/Android [\d.]+; ([^;)]+)/)?.[1] ?? navigator.platform;
  return [app ? `APK ${app}` : "Браузер", ua].filter(Boolean).join(" · ").slice(0, 120);
}

const fmtTime = (iso: string | null | undefined, tz = "Asia/Almaty") =>
  iso ? new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
const fmtDate = (iso: string, tz = "Asia/Almaty") =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "long", weekday: "short" }).format(new Date(iso));
const seatText = (s: string | null) => (s ? s.replace(/^table-(\d+)$/, "Стол $1") : null);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "только что" : m < 60 ? `${m} мин назад` : `${Math.floor(m / 60)} ч ${m % 60} мин назад`;
};

/* ---------------- корень ---------------- */

export default function ScannerApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState("");
  const [event, setEvent] = useState<EventItem | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [choosingGate, setChoosingGate] = useState<EventItem | null>(null);
  const online = useOnline();

  useEffect(() => {
    document.title = "Сканер билетов · Concerts";
    document.documentElement.style.background = "#050505";
    const client = sb();
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMe = useCallback(async () => {
    setMeError("");
    try {
      const data = await rpc<Me>("scanner_me");
      setMe(data);
      // Обновляем выбранный концерт свежими данными.
      setEvent((cur) => (cur ? data.events.find((e) => e.id === cur.id) ?? null : cur));
    } catch (e) {
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

  async function signOut() {
    await sb().auth.signOut();
    setEvent(null);
    setGate(null);
  }

  function openEvent(e: EventItem) {
    unlockAudio();
    if (e.gate) {
      setGate(e.gate);
      setEvent(e);
    } else if (e.gates.length) {
      setChoosingGate(e);
    } else {
      setGate(null);
      setEvent(e);
    }
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
  else if (choosingGate)
    screen = (
      <GatePicker
        event={choosingGate}
        onPick={(g) => { setGate(g); setEvent(choosingGate); setChoosingGate(null); }}
        onBack={() => setChoosingGate(null)}
      />
    );
  else if (event) screen = <Scan event={event} gate={gate} me={me} online={online} onBack={() => { setEvent(null); loadMe(); }} />;
  else screen = <Events me={me} onOpen={openEvent} onRefresh={loadMe} onSignOut={signOut} online={online} />;

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

/* ---------------- общие куски ---------------- */

function Logo() {
  return <img src="/logo-header.svg" alt="Concerts" className="h-auto w-[136px]" draggable={false} />;
}

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

function NetBadge({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${online ? "text-fg-subtle" : "text-coral"}`}>
      <span className={`h-2 w-2 rounded-full ${online ? "bg-[#1fc77a]" : "animate-pulse bg-coral"}`} />
      {online ? "Онлайн" : "Нет сети"}
    </span>
  );
}

/* ---------------- вход ---------------- */

function Login() {
  const [login, setLogin] = useState(() => {
    try {
      return localStorage.getItem("scanner:login") ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const appVersion = native()?.version?.();

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
    try {
      localStorage.setItem("scanner:login", l);
    } catch {
      /* не страшно */
    }
  }

  return (
    <div className="relative flex flex-1 flex-col justify-center overflow-y-auto px-6 py-10">
      <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, #ff4d4d 0%, transparent 70%)" }} />
      <div className="relative mx-auto w-full max-w-sm">
        <Logo />
        <p className="mt-10 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-coral">Вход для тикетора</p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase leading-[1.05]">Сканер<br />билетов</h1>
        <form onSubmit={submit} className="mt-8 space-y-3">
          <input className="w-full rounded-btn border border-line-strong bg-surface px-4 py-3.5 text-base text-fg outline-none placeholder:text-fg-subtle focus:border-coral"
            placeholder="Логин" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
          <input type="password" className="w-full rounded-btn border border-line-strong bg-surface px-4 py-3.5 text-base text-fg outline-none placeholder:text-fg-subtle focus:border-coral"
            placeholder="Пароль" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-coral">{error}</p>}
          <button disabled={busy} className="btn btn-primary w-full py-4 text-sm disabled:opacity-60">{busy ? "Входим…" : "Войти"}</button>
        </form>
        <p className="mt-6 text-xs leading-5 text-fg-subtle">Аккаунт выдаёт администратор. Регистрации в приложении нет.</p>
        {appVersion && <p className="mt-2 text-[11px] text-fg-faint">Версия приложения {appVersion}</p>}
      </div>
    </div>
  );
}

/* ---------------- список концертов ---------------- */

function Events({ me, onOpen, onRefresh, onSignOut, online }: { me: Me; onOpen: (e: EventItem) => void; onRefresh: () => Promise<void>; onSignOut: () => void; online: boolean }) {
  const [refreshing, setRefreshing] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && onRefresh(), 30000);
    return () => clearInterval(t);
  }, [onRefresh]);

  return (
    <>
      <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <Logo />
        <div className="text-right">
          <p className="text-sm font-medium text-fg">{me.name}</p>
          <p className="text-[11px] text-fg-subtle">{me.role === "admin" ? "Администратор" : "Тикетор"}</p>
        </div>
      </header>
      <div className="flex items-end justify-between gap-3 px-5 pb-3 pt-2">
        <h1 className="font-display text-xl font-bold uppercase">Выберите концерт</h1>
        <button onClick={refresh} className="text-xs text-coral" disabled={refreshing}>{refreshing ? "Обновляю…" : "Обновить"}</button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6">
        {!me.events.length && (
          <div className="rounded-card border border-dashed border-line-strong px-5 py-8 text-center text-sm text-fg-muted">
            Вас пока не назначили ни на один концерт. Попросите администратора назначить вас, затем нажмите «Обновить».
          </div>
        )}
        {me.events.map((e) => {
          const pct = e.stats.total ? Math.round((e.stats.used / e.stats.total) * 100) : 0;
          return (
            <button key={e.id} onClick={() => onOpen(e)} className="flex w-full items-center gap-4 rounded-card border border-line bg-surface p-3 text-left active:scale-[0.99] active:border-coral">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-orange to-[#b0161e]">
                {e.poster_url && <img src={e.poster_url} alt="" className="h-full w-full object-cover" draggable={false} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[15px] font-bold uppercase leading-tight">{e.title}</p>
                <p className="mt-0.5 truncate text-xs text-fg-muted">{fmtDate(e.starts_at, e.timezone)} · {fmtTime(e.starts_at, e.timezone)}{e.venue ? ` · ${e.venue}` : ""}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-coral" style={{ width: `${pct}%` }} /></div>
                <p className="mt-1 flex justify-between gap-2 text-[11px] text-fg-subtle">
                  <span className="tabular-nums">{e.stats.used} из {e.stats.total} прошли</span>
                  {e.gate && <span className="font-semibold text-coral">Вход: {e.gate.name}</span>}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <footer className="flex items-center justify-between border-t border-line px-5 py-3">
        <NetBadge online={online} />
        {confirmOut ? (
          <span className="flex gap-4 text-sm">
            <button className="text-coral" onClick={onSignOut}>Да, выйти</button>
            <button className="text-fg-muted" onClick={() => setConfirmOut(false)}>Отмена</button>
          </span>
        ) : (
          <button className="text-sm text-fg-muted" onClick={() => setConfirmOut(true)}>Выйти</button>
        )}
      </footer>
    </>
  );
}

function GatePicker({ event, onPick, onBack }: { event: EventItem; onPick: (g: Gate | null) => void; onBack: () => void }) {
  return (
    <>
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
    </>
  );
}

/* ---------------- сканирование ---------------- */

type Shown = ScanResult & { local?: "repeat_mine" };

function Scan({ event, gate, me, online, onBack }: { event: EventItem; gate: Gate | null; me: Me; online: boolean; onBack: () => void }) {
  const [stats, setStats] = useState<Stats>(event.stats);
  const [result, setResult] = useState<Shown | null>(null);
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState(false);
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busyRef = useRef(false);

  // Экран не гаснет, пока открыт сканер.
  useEffect(() => {
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
  }, []);

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

  // Успешный проход закрывается сам через 3 секунды, отказ — только кнопкой.
  useEffect(() => {
    if (result?.result !== "ok") return;
    const t = setTimeout(dismiss, result.ticket?.kind === "invite" ? 4000 : 3000);
    return () => clearTimeout(t);
  }, [result, dismiss]);

  const paused = Boolean(result) || checking || manual || recent !== null;
  const cam = useQrScanner((code) => check(code, true), paused);

  async function openRecent() {
    setRecent([]);
    try {
      setRecent(await rpc<Recent[]>("scanner_recent", { p_event: event.id, p_limit: 40 }));
    } catch {
      setRecent([]);
    }
  }

  return (
    <div className="relative flex flex-1 flex-col">
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
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 pb-4 pt-2">
        <button className="btn btn-secondary py-3.5 text-xs" onClick={() => { unlockAudio(); setManual(true); }}>Ввести код</button>
        {cam.torch !== null && (
          <button className={`btn py-3.5 text-xs ${cam.torch ? "btn-primary" : "btn-secondary"}`} onClick={cam.toggleTorch} aria-label="Фонарик">Свет</button>
        )}
        <button className="btn btn-secondary py-3.5 text-xs" onClick={openRecent}>История</button>
      </div>

      {manual && <ManualCode onClose={() => setManual(false)} onSubmit={(c) => { setManual(false); check(c, false); }} />}
      {recent !== null && <RecentSheet list={recent} tz={event.timezone} onClose={() => setRecent(null)} />}
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
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/70" onClick={onClose}>
      <form className="rounded-t-[22px] bg-surface px-5 pb-8 pt-5" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(clean); }}>
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

const recentLabel: Record<string, [string, string]> = {
  ok: ["Пропущен", "text-[#1fc77a]"],
  already_used: ["Повтор", "text-coral"],
  not_found: ["Не найден", "text-orange"],
  invalid: ["Не билет", "text-orange"],
  wrong_event: ["Другой концерт", "text-orange"],
  wrong_gate: ["Не тот вход", "text-orange"],
  void: ["Аннулирован", "text-coral"],
  not_assigned: ["Нет доступа", "text-coral"],
};

function RecentSheet({ list, tz, onClose }: { list: Recent[]; tz: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-ink">
      <header className="flex items-center justify-between px-5 pb-3 pt-4">
        <p className="font-display text-base font-bold uppercase">Мои последние сканы</p>
        <button className="text-sm text-coral" onClick={onClose}>Закрыть</button>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-5 pb-6">
        {!list.length && <p className="py-10 text-center text-sm text-fg-muted">Пока пусто.</p>}
        {list.map((r, i) => {
          const [label, color] = recentLabel[r.result] ?? [r.result, "text-fg-muted"];
          return (
            <div key={i} className="flex items-center gap-3 rounded-btn bg-surface px-3 py-2.5">
              <span className="w-12 shrink-0 text-xs tabular-nums text-fg-subtle">{fmtTime(r.at, tz)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{r.holder_name || (r.kind === "invite" ? "Гость" : r.code)}</p>
                <p className="truncate text-[11px] text-fg-subtle">{r.kind === "invite" ? "Пригласительный" : r.category_name ?? r.message}</p>
              </div>
              <span className={`shrink-0 text-xs font-semibold ${color}`}>{label}</span>
            </div>
          );
        })}
      </div>
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
    <button type="button" onClick={() => ready && onNext()} className={`absolute inset-0 z-30 flex flex-col px-6 pb-6 pt-8 text-left text-white ${bg}`}>
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
