import { useEffect, useState, type FormEvent } from "react";

import { SUPPORT_PHONE, sb, shortLogin, type Me } from "./core";
import { native, testFeedback } from "./feedback";
import { canOpenSettings, canSchedule, openPermSettings, readPerms, requestPerm, type PermName, type PermState, type Perms } from "./perms";
import { useSettings } from "./settings";
import { Icon, Pill, Row, Section, Segmented, Sheet, TabHeader, Toggle } from "./ui";

/* Профиль и настройки тикетора. */

const permText: Record<PermName, [string, string]> = {
  camera: ["Камера", "Чтение QR-кодов билетов"],
  notifications: ["Уведомления", "Назначения и напоминания"],
  install: ["Установка обновлений", "Приложение обновляется само"],
};

function permPill(s: PermState) {
  if (s === "granted") return <Pill tone="ok">Разрешено</Pill>;
  if (s === "denied") return <Pill tone="bad">Запрещено</Pill>;
  if (s === "unsupported") return <Pill tone="muted">Нет на устройстве</Pill>;
  return <Pill tone="warn">Не спрошено</Pill>;
}

export function Profile({ me, email, onSignOut, onRedoSetup }: { me: Me; email: string; onSignOut: () => void; onRedoSetup: () => void }) {
  const [s, set] = useSettings();
  const [perms, setPerms] = useState<Perms | null>(null);
  const [sheet, setSheet] = useState<"password" | "rules" | "logout" | null>(null);
  const [copied, setCopied] = useState(false);
  const app = native();
  const version = app?.version?.();

  useEffect(() => {
    const load = () => readPerms().then(setPerms);
    load();
    const vis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []);

  async function fixPerm(p: PermName, state: PermState) {
    if (state === "denied" && canOpenSettings()) {
      openPermSettings(p);
      return;
    }
    const r = await requestPerm(p);
    setPerms((cur) => (cur ? { ...cur, [p]: r } : cur));
  }

  const initials = me.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <TabHeader title="Профиль" />
      <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-8">
        <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-coral to-[#9b1420] font-display text-lg font-bold text-white">{initials || "?"}</span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{me.name}</p>
            <p className="truncate text-sm text-fg-muted">Логин: {shortLogin(email)}</p>
            <p className="text-xs text-fg-subtle">{me.role === "admin" ? "Администратор" : "Тикетор"} · концертов: {me.events.length}</p>
          </div>
        </div>

        <Section title="Сканирование">
          <Row title="Звук" hint="Короткий сигнал на каждый результат" right={<Toggle label="Звук" on={s.sound} onChange={(v) => set({ sound: v })} />} />
          <Row title="Вибрация" hint="Разная для «проходите» и отказа" right={<Toggle label="Вибрация" on={s.vibration} onChange={(v) => set({ vibration: v })} />} />
          <Row title="Проверить звук и вибрацию" onClick={testFeedback} right={<span className="text-xs font-semibold text-coral">Проверить</span>} />
          <div className="space-y-2 px-4 py-3.5">
            <p className="text-[15px]">Зелёный экран «Проходите»</p>
            <Segmented value={s.autoClose} onChange={(v) => set({ autoClose: v })} options={[[2, "2 сек"], [3, "3 сек"], [5, "5 сек"], [0, "Вручную"]]} />
            <p className="text-xs text-fg-subtle">Отказ всегда закрывается только кнопкой.</p>
          </div>
          <div className="space-y-2 px-4 py-3.5">
            <p className="text-[15px]">Камера</p>
            <Segmented value={s.camera} onChange={(v) => set({ camera: v })} options={[["back", "Основная"], ["front", "Фронтальная"]]} />
          </div>
          <Row title="Не выключать экран" hint="Пока открыт сканер" right={<Toggle label="Не выключать экран" on={s.keepAwake} onChange={(v) => set({ keepAwake: v })} />} />
        </Section>

        <Section
          title="Уведомления"
          note={!canSchedule() && s.reminders ? "Напоминания по времени приходят только в Android-приложении. В браузере они видны во вкладке «Уведомления»." : undefined}
        >
          <Row title="Назначения на концерты" hint="Когда вас назначили или сняли" right={<Toggle label="Назначения" on={s.notifyAssign} onChange={(v) => set({ notifyAssign: v })} />} />
          <Row title="Напоминание перед входом" right={<Toggle label="Напоминание" on={s.reminders} onChange={(v) => set({ reminders: v })} />} />
          {s.reminders && (
            <div className="space-y-2 px-4 py-3.5">
              <p className="text-sm text-fg-muted">За сколько до открытия входа</p>
              <Segmented value={s.remindBefore} onChange={(v) => set({ remindBefore: v })} options={[[30, "30 мин"], [60, "1 час"], [120, "2 часа"]]} />
            </div>
          )}
        </Section>

        <Section title="Разрешения" note="Если что-то запрещено, нажмите на строку: откроется запрос или настройки телефона.">
          {(["camera", "notifications", "install"] as PermName[])
            .filter((p) => p !== "install" || (perms && perms.install !== "unsupported"))
            .map((p) => {
              const st = perms?.[p] ?? "prompt";
              const [t, h] = permText[p];
              return (
                <Row key={p} title={t} hint={h} right={perms ? permPill(st) : null} onClick={st === "granted" || st === "unsupported" ? undefined : () => fixPerm(p, st)} />
              );
            })}
          <Row title="Пройти настройку заново" onClick={onRedoSetup} right={Icon.chevron("h-5 w-5 text-fg-subtle")} />
        </Section>

        <Section title="Работа на входе">
          <Row title="Правила проверки билетов" hint="Что делать при каждом результате" onClick={() => setSheet("rules")} right={Icon.chevron("h-5 w-5 text-fg-subtle")} />
          <Row
            title="Поддержка"
            hint={SUPPORT_PHONE}
            onClick={() => {
              navigator.clipboard?.writeText(SUPPORT_PHONE).then(() => setCopied(true), () => undefined);
              setTimeout(() => setCopied(false), 2000);
            }}
            right={<span className="text-xs font-semibold text-coral">{copied ? "Скопировано" : "Копировать"}</span>}
          />
        </Section>

        <Section title="Аккаунт">
          <Row title="Сменить пароль" onClick={() => setSheet("password")} right={Icon.chevron("h-5 w-5 text-fg-subtle")} />
          <Row title="Выйти из аккаунта" danger onClick={() => setSheet("logout")} />
        </Section>

        <Section title="О приложении">
          <Row title="Версия" right={<span className="text-sm text-fg-muted">{version ? `Android ${version}` : "Браузер"}</span>} />
          {app?.checkUpdate && <Row title="Проверить обновление" onClick={() => app.checkUpdate!()} right={Icon.refresh("h-5 w-5 text-fg-subtle")} />}
        </Section>
        <p className="pb-2 text-center text-[11px] text-fg-faint">Concerts Сканер · ИП «BSL Production»</p>
      </div>

      {sheet === "password" && <PasswordSheet onClose={() => setSheet(null)} />}
      {sheet === "rules" && <RulesSheet onClose={() => setSheet(null)} />}
      {sheet === "logout" && (
        <Sheet title="Выйти из аккаунта?" onClose={() => setSheet(null)}>
          <p className="text-sm leading-6 text-fg-muted">Сканировать билеты можно будет только после нового входа с логином и паролем.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button className="btn btn-secondary py-3.5" onClick={() => setSheet(null)}>Отмена</button>
            <button className="btn btn-primary py-3.5" onClick={onSignOut}>Выйти</button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<[boolean, string] | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (a.length < 8) return setMsg([false, "Пароль от 8 символов"]);
    if (a !== b) return setMsg([false, "Пароли не совпадают"]);
    setBusy(true);
    const { error } = await sb().auth.updateUser({ password: a });
    setBusy(false);
    if (error) setMsg([false, /same|different/i.test(error.message) ? "Новый пароль совпадает со старым" : "Не удалось сменить пароль. Проверьте интернет."]);
    else {
      setMsg([true, "Пароль изменён"]);
      setTimeout(onClose, 1200);
    }
  }

  const input = "w-full rounded-btn border border-line-strong bg-ink px-4 py-3.5 text-base text-fg outline-none focus:border-coral";
  return (
    <Sheet title="Новый пароль" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <input id="pw-new" type="password" autoComplete="new-password" placeholder="Новый пароль" className={input} value={a} onChange={(e) => setA(e.target.value)} />
        <input id="pw-repeat" type="password" autoComplete="new-password" placeholder="Повторите пароль" className={input} value={b} onChange={(e) => setB(e.target.value)} />
        {msg && <p className={`text-sm ${msg[0] ? "text-[#4ee09c]" : "text-coral"}`}>{msg[1]}</p>}
        <button disabled={busy} className="btn btn-primary w-full py-4 disabled:opacity-60">{busy ? "Сохраняю…" : "Сохранить"}</button>
      </form>
    </Sheet>
  );
}

const RULES: [string, string, string][] = [
  ["bg-[#0f6b40]", "Зелёный · Проходите", "Пропустите гостя. Экран закроется сам."],
  ["bg-[#6a2384]", "Фиолетовый · Гость от…", "Пригласительный. Пропустите, имя пригласившего видно на экране."],
  ["bg-[#8a5c06]", "Жёлтый · Не тот вход", "Билет настоящий, но не для этого входа. Направьте гостя на указанный вход."],
  ["bg-[#8a5c06]", "Жёлтый · Нет связи", "Билет не проверен. Не пропускайте, дождитесь интернета и отсканируйте снова."],
  ["bg-[#8e1616]", "Красный · Уже прошёл", "По этому билету уже вошли. Не пропускайте, позовите администратора."],
  ["bg-[#8e1616]", "Красный · Не найден, аннулирован, другой концерт", "Не пропускайте. Если гость спорит, позовите администратора."],
];

function RulesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Правила на входе" onClose={onClose}>
      <ul className="space-y-3">
        {RULES.map(([c, t, d]) => (
          <li key={t} className="flex gap-3">
            <span className={`mt-1 h-4 w-4 shrink-0 rounded-[5px] ${c}`} />
            <span>
              <span className="block text-sm font-semibold">{t}</span>
              <span className="block text-[13px] leading-5 text-fg-muted">{d}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 rounded-btn bg-ink px-4 py-3 text-[13px] leading-5 text-fg-muted">
        Один билет пропускает одного человека один раз. Решение принимает сервер, поэтому без интернета никого не пропускайте. Код можно ввести вручную, если QR не читается.
      </p>
      <button className="btn btn-secondary mt-5 w-full py-3.5" onClick={onClose}>Понятно</button>
    </Sheet>
  );
}
