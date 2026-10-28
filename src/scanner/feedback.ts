/** Звук и вибрация результата: на шумном входе тикетор слышит и чувствует ответ. */

import { getSettings } from "./settings";

/** Методы Android-приложения. В старых версиях оболочки части методов нет. */
export type Native = {
  vibrate?: (ms: number) => void;
  version?: () => string;
  checkUpdate?: () => void;
  /** JSON: { camera, notifications, install } со значениями granted | denied | prompt | unsupported. */
  permissions?: () => string;
  requestPermission?: (name: string) => void;
  openSettings?: (name: string) => void;
  showNotification?: (id: number, title: string, body: string) => void;
  schedule?: (id: number, atMs: number, title: string, body: string) => void;
  cancel?: (id: number) => void;
};

/** Мост Android-приложения (если страница открыта в нём). */
export const native = (): Native | undefined => (window as unknown as { ConcertsApp?: Native }).ConcertsApp;

let ctx: AudioContext | null = null;

/** Звук разрешается только после касания: вызываем при первом нажатии. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.25) {
  if (!ctx || !getSettings().sound) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function vibrate(pattern: number | number[]) {
  if (!getSettings().vibration) return;
  const n = native();
  if (n?.vibrate) {
    n.vibrate(Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern);
    return;
  }
  navigator.vibrate?.(pattern);
}

/** Короткий сигнал для проверки звука и вибрации из настроек. */
export function testFeedback() {
  unlockAudio();
  feedback("ok");
}

export function feedback(kind: "ok" | "warn" | "deny") {
  if (kind === "ok") {
    tone(880, 0, 0.12);
    tone(1320, 0.13, 0.16);
    vibrate(80);
  } else if (kind === "warn") {
    tone(520, 0, 0.18, "triangle");
    tone(520, 0.24, 0.18, "triangle");
    vibrate([120, 80, 120]);
  } else {
    tone(180, 0, 0.55, "square", 0.18);
    vibrate([300, 100, 300]);
  }
}
