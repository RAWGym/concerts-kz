import { createBrowserSupabase } from "@/lib/supabase/client";
import { seatName } from "@/lib/tickets/seats";

import { native } from "./feedback";

/* Общие типы, вызовы базы и форматирование для приложения тикетора. */

export const SCANNER_DOMAIN = "scanner.concerts.kz";
export const SUPPORT_PHONE = "+7 700 258 62 49";
const RPC_TIMEOUT = 9000;

export type Stats = { total: number; used: number; invites: number; denied: number };
export type Gate = { id: string; name: string };
export type EventItem = {
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
  /** Когда и кто назначил (нет у администратора без назначения). */
  assigned_at?: string | null;
  assigned_by?: string | null;
};
export type Me = { allowed: boolean; disabled?: boolean; user_id: string; name: string; role: string; events: EventItem[] };
export type Recent = {
  at: string;
  result: string;
  code: string;
  message: string;
  gate?: string | null;
  holder_name: string | null;
  category_name: string | null;
  kind: string | null;
};

export const sb = () => createBrowserSupabase();

/** Вызов функции базы с ограничением по времени: зависший запрос не держит очередь. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}, retried = false): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb() as any).rpc(fn, args).abortSignal(ctrl.signal);
    if (error) throw Object.assign(new Error(error.message || "network"), { code: error.code, status: (error as { status?: number }).status });
    return data as T;
  } catch (e) {
    // Телефон долго спал и токен входа истёк: обновляем его и повторяем один раз.
    if (!retried && isAuthError(e)) {
      const { error } = await sb().auth.refreshSession();
      if (!error) return rpc<T>(fn, args, true);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const isAuthError = (e: unknown) => {
  const x = e as { code?: string; status?: number; message?: string };
  return x?.code === "PGRST301" || x?.code === "PGRST303" || x?.status === 401 || /jwt|token is expired|invalid claim/i.test(x?.message ?? "");
};

export const isNetworkError = (e: unknown) => {
  const m = `${(e as Error)?.name ?? ""} ${(e as Error)?.message ?? ""}`;
  return /abort|network|fetch|failed to|load failed|timeout/i.test(m) || !navigator.onLine;
};

/** Открыто с иконки на экране «Домой» (PWA), а не во вкладке браузера. */
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone или iPad (новые iPad представляются как Mac с сенсорным экраном). */
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function deviceLabel() {
  const app = native()?.version?.();
  const ua = navigator.userAgent;
  const model = ua.match(/Android [\d.]+; ([^;)]+)/)?.[1] ?? (/iPhone|iPad|iPod/.test(ua) ? `iOS ${ua.match(/OS (\d+)[_\d]*/)?.[1] ?? ""}`.trim() : navigator.platform);
  const kind = app ? `APK ${app}` : isStandalone() ? (isIOS() ? "Приложение iPhone" : "Приложение PWA") : "Браузер";
  return [kind, model].filter(Boolean).join(" · ").slice(0, 120);
}

export const fmtTime = (iso: string | null | undefined, tz = "Asia/Almaty") =>
  iso ? new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
export const fmtDate = (iso: string, tz = "Asia/Almaty") =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: tz, day: "numeric", month: "long", weekday: "short" }).format(new Date(iso));
export const seatText = (s: string | null) => seatName(s, "ru");
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  if (m < 24 * 60) return `${Math.floor(m / 60)} ч ${m % 60} мин назад`;
  return `${Math.floor(m / 1440)} дн назад`;
};

/** Логин без служебного домена: ivan@scanner.concerts.kz → ivan */
export const shortLogin = (email: string | null | undefined) => (email ?? "").replace(`@${SCANNER_DOMAIN}`, "");

/** Время, когда начинает работать вход: открытие дверей или начало. */
export const doorsAt = (e: EventItem) => e.doors_open_at ?? e.starts_at;
