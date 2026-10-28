import { native } from "./feedback";

/** Разрешения, которые нужны приложению тикетора. */
export type PermName = "camera" | "notifications" | "install";
export type PermState = "granted" | "denied" | "prompt" | "unsupported";
export type Perms = Record<PermName, PermState>;

type Waiter = (state: PermState) => void;
const waiters = new Map<string, Waiter[]>();

// Android-приложение сообщает результат системного окна сюда.
(window as unknown as { __concertsPermission?: (name: string, state: string) => void }).__concertsPermission = (name, state) => {
  const list = waiters.get(name) ?? [];
  waiters.delete(name);
  list.forEach((w) => w(state as PermState));
};

function nativePerms(): Partial<Perms> | null {
  const raw = native()?.permissions?.();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<Perms>;
  } catch {
    return null;
  }
}

async function webCamera(): Promise<PermState> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const st = await navigator.permissions?.query({ name: "camera" as PermissionName });
    if (st) return st.state as PermState;
  } catch {
    /* браузер не умеет спрашивать про камеру заранее */
  }
  return "prompt";
}

function webNotifications(): PermState {
  if (!("Notification" in window)) return "unsupported";
  const p = Notification.permission;
  return p === "default" ? "prompt" : (p as PermState);
}

export async function readPerms(): Promise<Perms> {
  const n = nativePerms();
  return {
    camera: (n?.camera as PermState) ?? (await webCamera()),
    notifications: (n?.notifications as PermState) ?? webNotifications(),
    install: (n?.install as PermState) ?? "unsupported",
  };
}

/** Показывает системный запрос. Если запрос уже отклонён навсегда, открывает настройки. */
export async function requestPerm(name: PermName): Promise<PermState> {
  const app = native();
  if (app?.requestPermission && nativePerms()) {
    return new Promise<PermState>((resolve) => {
      const list = waiters.get(name) ?? [];
      list.push(resolve);
      waiters.set(name, list);
      app.requestPermission!(name);
      // Запасной путь: человек ушёл в настройки и вернулся.
      const back = async () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", back);
        const st = (await readPerms())[name];
        const pending = waiters.get(name);
        if (pending?.includes(resolve)) {
          waiters.set(name, pending.filter((w) => w !== resolve));
          resolve(st);
        }
      };
      document.addEventListener("visibilitychange", back);
    });
  }
  if (name === "camera") {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      s.getTracks().forEach((t) => t.stop());
      return "granted";
    } catch (e) {
      return (e as Error).name === "NotAllowedError" ? "denied" : "unsupported";
    }
  }
  if (name === "notifications" && "Notification" in window) {
    const r = await Notification.requestPermission();
    return r === "default" ? "prompt" : (r as PermState);
  }
  return "unsupported";
}

export function openPermSettings(name: PermName) {
  native()?.openSettings?.(name);
}

export const canOpenSettings = () => Boolean(native()?.openSettings);

/** Системное уведомление: в приложении через Android, в браузере через Notification. */
export function systemNotify(id: number, title: string, body: string) {
  const app = native();
  if (app?.showNotification) {
    app.showNotification(id, title, body);
    return;
  }
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { body, icon: "/scanner/icon-192.png", badge: "/scanner/icon-192.png", tag: String(id) };
  // На iPhone и Android уведомление показывает только service worker.
  navigator.serviceWorker?.getRegistration("/scanner/")
    .then(async (reg) => {
      if (reg) await reg.showNotification(title, opts);
      else new Notification(title, opts);
    })
    .catch(() => {
      try {
        new Notification(title, opts);
      } catch {
        /* браузер не умеет показывать уведомления */
      }
    });
}

/** Напоминание в заданное время. Работает только в Android-приложении. */
export const canSchedule = () => Boolean(native()?.schedule);
export function scheduleNotify(id: number, at: number, title: string, body: string) {
  native()?.schedule?.(id, at, title, body);
}
export function cancelNotify(id: number) {
  native()?.cancel?.(id);
}

/** Стабильный числовой id из строки (для уведомлений Android). */
export function numId(s: string) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}
