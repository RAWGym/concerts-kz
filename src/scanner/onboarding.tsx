import { useEffect, useState, type ReactNode } from "react";

import { unlockAudio } from "./feedback";
import { canOpenSettings, openPermSettings, readPerms, requestPerm, type PermName, type PermState, type Perms } from "./perms";
import { store } from "./settings";
import { Icon, Logo } from "./ui";

/* Первый вход тикетора: по шагу на каждое разрешение. */

export const onboardedKey = (uid: string) => `scanner:onboarded:${uid}`;
export const isOnboarded = (uid: string) => store.get(onboardedKey(uid)) === "1";

type Step = { perm?: PermName; icon: ReactNode; title: string; text: string; must?: boolean };

const STEPS: Step[] = [
  {
    perm: "camera",
    icon: Icon.camera("h-9 w-9"),
    title: "Камера",
    text: "Нужна, чтобы читать QR-коды билетов. Снимки никуда не сохраняются и не отправляются, сканер видит только код.",
    must: true,
  },
  {
    perm: "notifications",
    icon: Icon.bell("h-9 w-9"),
    title: "Уведомления",
    text: "Сообщим, когда вас назначат на концерт или снимут с него, и напомним заранее, что скоро открывается вход.",
  },
  {
    perm: "install",
    icon: Icon.download("h-9 w-9"),
    title: "Обновления",
    text: "Приложение обновляется само при запуске. Для этого Android один раз спросит разрешение на установку обновлений.",
  },
];

export function Onboarding({ uid, name, onDone }: { uid: string; name: string; onDone: () => void }) {
  const [perms, setPerms] = useState<Perms | null>(null);
  const [i, setI] = useState(-1); // -1 приветствие, STEPS.length финал
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    readPerms().then(setPerms);
    // Вернулись из настроек телефона: перечитываем, что разрешено.
    const vis = () => {
      if (document.visibilityState !== "visible") return;
      readPerms().then((p) => {
        setPerms(p);
        setDenied(false);
      });
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  // Шаги, которые уже выполнены или не поддерживаются, пропускаем.
  const steps = perms ? STEPS.filter((s) => s.perm && perms[s.perm] !== "unsupported") : STEPS;
  const step = i >= 0 && i < steps.length ? steps[i] : null;
  const state: PermState | undefined = step?.perm && perms ? perms[step.perm] : undefined;

  const next = () => {
    setDenied(false);
    setI((n) => n + 1);
  };
  const finish = () => {
    store.set(onboardedKey(uid), "1");
    onDone();
  };

  async function allow() {
    if (!step?.perm) return;
    unlockAudio();
    setBusy(true);
    const r = await requestPerm(step.perm);
    setBusy(false);
    setPerms((p) => (p ? { ...p, [step.perm!]: r } : p));
    if (r === "granted") next();
    else setDenied(true);
  }

  const first = (name || "").split(" ")[0];

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto px-6 pb-6 pt-8">
      <div aria-hidden className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full opacity-30 blur-3xl" style={{ background: "radial-gradient(circle, #ff4d4d 0%, transparent 70%)" }} />
      <div className="relative flex items-center justify-between">
        <Logo className="w-[112px]" />
        {i >= 0 && i < steps.length && (
          <div className="flex gap-1.5" aria-label={`Шаг ${i + 1} из ${steps.length}`}>
            {steps.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-coral" : k < i ? "w-1.5 bg-coral/60" : "w-1.5 bg-surface-2"}`} />
            ))}
          </div>
        )}
      </div>

      {i === -1 && (
        <div className="relative mt-auto">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-coral">Добро пожаловать</p>
          <h1 className="mt-3 font-display text-[30px] font-bold uppercase leading-[1.05]">{first ? `${first}, ` : ""}настроим приложение</h1>
          <p className="mt-4 text-[15px] leading-6 text-fg-muted">
            Это займёт минуту. Приложению нужны камера для сканирования, уведомления о назначениях и разрешение на обновления.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-fg">
            {STEPS.map((s) => (
              <li key={s.title} className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-coral">{Icon.check("h-4 w-4")}</span>
                {s.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step && (
        <div className="relative mt-auto">
          <span className="grid h-20 w-20 place-items-center rounded-[22px] bg-surface text-coral shadow-[0_0_60px_-10px_rgba(255,77,77,.45)]">{step.icon}</span>
          <h1 className="mt-6 font-display text-[28px] font-bold uppercase leading-[1.05]">{step.title}</h1>
          <p className="mt-3 text-[15px] leading-6 text-fg-muted">{step.text}</p>
          {state === "granted" && <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#4ee09c]">{Icon.check("h-4 w-4")} Уже разрешено</p>}
          {denied && (
            <p className="mt-4 rounded-btn bg-coral/10 px-4 py-3 text-sm leading-5 text-coral">
              {step.must
                ? "Без камеры сканер не сможет читать билеты, останется только ввод кода руками."
                : "Разрешение не выдано. Его можно включить позже в профиле."}
              {canOpenSettings() && " Можно открыть настройки телефона и включить вручную."}
            </p>
          )}
        </div>
      )}

      {i >= steps.length && (
        <div className="relative mt-auto">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[#1fc77a]/15 text-[#4ee09c]">{Icon.check("h-10 w-10")}</span>
          <h1 className="mt-6 font-display text-[28px] font-bold uppercase leading-[1.05]">Всё готово</h1>
          <p className="mt-3 text-[15px] leading-6 text-fg-muted">
            Выберите концерт и начинайте сканировать. Звук, вибрацию, камеру и напоминания можно поменять в профиле.
          </p>
        </div>
      )}

      <div className="relative mt-8 space-y-2">
        {i === -1 && <button className="btn btn-primary w-full py-4" onClick={() => { unlockAudio(); next(); }}>Начать</button>}
        {step && state !== "granted" && !denied && (
          <button className="btn btn-primary w-full py-4 disabled:opacity-60" disabled={busy} onClick={allow}>{busy ? "Ждём ответа…" : "Разрешить"}</button>
        )}
        {step && denied && canOpenSettings() && (
          <button className="btn btn-primary w-full py-4" onClick={() => { openPermSettings(step.perm!); setDenied(false); readPerms().then(setPerms); }}>Открыть настройки</button>
        )}
        {step && (
          <button className={`btn w-full py-4 ${state === "granted" ? "btn-primary" : "btn-secondary"}`} onClick={next}>
            {state === "granted" ? "Дальше" : "Позже"}
          </button>
        )}
        {i >= steps.length && <button className="btn btn-primary w-full py-4" onClick={finish}>К концертам</button>}
      </div>
    </div>
  );
}
