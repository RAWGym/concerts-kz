import { useSyncExternalStore } from "react";

/** Настройки приложения тикетора. Хранятся на телефоне, у каждого устройства свои. */
export type Settings = {
  sound: boolean;
  vibration: boolean;
  /** Сколько секунд держать зелёный экран «Проходите». 0 — до нажатия. */
  autoClose: 0 | 2 | 3 | 5;
  /** Задняя камера (обычно) или фронтальная. */
  camera: "back" | "front";
  /** Не давать экрану гаснуть на сканере. */
  keepAwake: boolean;
  /** Напоминание перед открытием входа. */
  reminders: boolean;
  /** За сколько минут до открытия входа напоминать. */
  remindBefore: 30 | 60 | 120;
  /** Уведомления о новых назначениях. */
  notifyAssign: boolean;
};

export const DEFAULTS: Settings = {
  sound: true,
  vibration: true,
  autoClose: 3,
  camera: "back",
  keepAwake: true,
  reminders: true,
  remindBefore: 60,
  notifyAssign: true,
};

const KEY = "scanner:settings";
const listeners = new Set<() => void>();
let current: Settings = read();

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export const getSettings = () => current;

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* настройки останутся до перезапуска */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSettings,
    getSettings,
  );
  return [s, setSettings];
}

/** Небольшое хранилище по ключу с защитой от недоступного localStorage. */
export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* не страшно */
    }
  },
};
