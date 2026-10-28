import { useCallback, useEffect, useState, type FormEvent } from "react";

import { QrCode } from "@/components/account/qr-code";

import { db, dbError, formatDateTime, staffApi } from "./db";
import { EventSelect, useEventOptions, useSelectedEvent } from "./event-select";
import { useStaff } from "./layout";
import { useToast } from "./toast";
import { Card, Field, Notice, PageTitle, Pill, Spinner, Table, inputCls } from "./ui";
import { loadVenueGates } from "./venue-gates";

type Scanner = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};
type Gate = { id: string; name: string; category_codes: string[]; allow_invites: boolean; sort_order: number };
type Category = { code: string; name: { ru?: string } };
type Assignment = { user_id: string; gate_id: string | null; created_at: string };

const SCANNER_DOMAIN = "@scanner.concerts.kz";
/** Последняя версия APK из Releases на GitHub. */
/** Ссылка на веб-приложение сканера для iPhone (ставится на экран «Домой»). */
const PWA_URL = "https://concerts.kz/scanner/";

function CopyLink({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 text-coral hover:underline"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        }, () => undefined);
      }}
    >
      {done ? "Ссылка скопирована" : `Скопировать ссылку ${value.replace(/^https:\/\//, "")}`}
    </button>
  );
}

const APK_URL = "https://github.com/RAWGym/concerts-kz/releases/latest/download/concerts-scanner.apk";
const loginOf = (email: string | null) => (email?.endsWith(SCANNER_DOMAIN) ? email.slice(0, -SCANNER_DOMAIN.length) : email ?? "");

function genPassword() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join("");
}

export default function Scanners() {
  const me = useStaff();
  const toast = useToast();
  const events = useEventOptions(false);
  const [event, setEvent] = useSelectedEvent(events);
  const [scanners, setScanners] = useState<Scanner[] | null>(null);
  const [gates, setGates] = useState<Gate[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [assigned, setAssigned] = useState<Assignment[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ full_name: "", login: "", password: genPassword() });
  const [created, setCreated] = useState<{ name: string; login: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newGate, setNewGate] = useState("");
  const [assignDraft, setAssignDraft] = useState({ user_id: "", gate_id: "" });

  const loadScanners = useCallback(async () => {
    try {
      const { staff } = await staffApi<{ staff: (Scanner & { role: string })[] }>({ action: "list", scanners_only: true });
      setScanners(staff.filter((s) => s.role === "scanner"));
    } catch (e) {
      toast((e as Error).message, "error");
      setScanners([]);
    }
  }, [toast]);

  const loadEvent = useCallback(async () => {
    if (!event) return;
    const [g, c, a] = await Promise.all([
      db().from("event_gates").select("id, name, category_codes, allow_invites, sort_order").eq("event_id", event.id).order("sort_order").order("name"),
      db().from("ticket_categories").select("code, name").eq("event_id", event.id).order("sort_order"),
      db().from("scanner_assignments").select("user_id, gate_id, created_at").eq("event_id", event.id).order("created_at"),
    ]);
    setGates((g.data ?? []) as Gate[]);
    setCats((c.data ?? []) as Category[]);
    setAssigned((a.data ?? []) as Assignment[]);
  }, [event]);

  useEffect(() => { loadScanners(); }, [loadScanners]);
  useEffect(() => {
    setGates(null);
    setAssigned(null);
    loadEvent();
  }, [loadEvent]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await staffApi<{ email: string }>({ action: "create", role: "scanner", email: draft.login.trim(), full_name: draft.full_name.trim(), password: draft.password });
      setCreated({ name: draft.full_name.trim(), login: loginOf(res.email), password: draft.password });
      setDraft({ full_name: "", login: "", password: genPassword() });
      setCreating(false);
      loadScanners();
    } catch (err) {
      toast((err as Error).message, "error");
    }
    setBusy(false);
  }

  async function act(body: Record<string, unknown>, ok: string) {
    try {
      await staffApi(body);
      toast(ok);
      loadScanners();
      loadEvent();
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  }

  async function copyFromVenue() {
    if (!event?.venue) return;
    const tpl = await loadVenueGates(event.venue.id);
    const have = new Set((gates ?? []).map((g) => g.name));
    const add = tpl.filter((t) => !have.has(t.name));
    if (!add.length) return toast(tpl.length ? "Все входы площадки уже добавлены" : "У площадки нет заготовок входов. Добавьте их в разделе «Площадки»", "error");
    const { error } = await db().from("event_gates").insert(add.map((t) => ({ event_id: event.id, name: t.name, sort_order: t.sort_order })));
    if (error) return toast(dbError(error), "error");
    toast(`Добавлено входов: ${add.length}`);
    loadEvent();
  }

  async function addGate() {
    const name = newGate.trim();
    if (!name || !event) return;
    const { error } = await db().from("event_gates").insert({ event_id: event.id, name, sort_order: ((gates?.length ?? 0) + 1) * 10 });
    if (error) return toast(dbError(error), "error");
    setNewGate("");
    loadEvent();
  }

  async function patchGate(g: Gate, patch: Partial<Gate>) {
    const { error } = await db().from("event_gates").update(patch).eq("id", g.id);
    if (error) return toast(dbError(error), "error");
    loadEvent();
  }

  async function removeGate(g: Gate) {
    if (!window.confirm(`Удалить вход «${g.name}»? Тикеторы этого входа станут «любой вход».`)) return;
    const { error } = await db().from("event_gates").delete().eq("id", g.id);
    if (error) return toast(dbError(error), "error");
    loadEvent();
  }

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!event || !assignDraft.user_id) return;
    const { error } = await db().from("scanner_assignments").insert({
      user_id: assignDraft.user_id,
      event_id: event.id,
      gate_id: assignDraft.gate_id || null,
      assigned_by: me.userId,
    });
    if (error) return toast(dbError(error), "error");
    toast("Тикетор назначен");
    setAssignDraft({ user_id: "", gate_id: "" });
    loadEvent();
  }

  async function changeGate(a: Assignment, gateId: string) {
    const { error } = await db().from("scanner_assignments").update({ gate_id: gateId || null }).eq("event_id", event!.id).eq("user_id", a.user_id);
    if (error) return toast(dbError(error), "error");
    toast("Вход изменён");
    loadEvent();
  }

  async function unassign(a: Assignment) {
    const s = scanners?.find((x) => x.user_id === a.user_id);
    if (!window.confirm(`Снять ${s?.full_name ?? "тикетора"} с концерта?`)) return;
    const { error } = await db().from("scanner_assignments").delete().eq("event_id", event!.id).eq("user_id", a.user_id);
    if (error) return toast(dbError(error), "error");
    loadEvent();
  }

  const nameOf = (id: string) => {
    const s = scanners?.find((x) => x.user_id === id);
    return s ? s.full_name || loginOf(s.email) : "Тикетор";
  };
  const free = (scanners ?? []).filter((s) => s.is_active && !(assigned ?? []).some((a) => a.user_id === s.user_id));

  return (
    <>
      <PageTitle title="Тикеторы и входы">
        {events && events.length > 0 && <EventSelect events={events} value={event?.id ?? ""} onChange={setEvent} />}
      </PageTitle>

      {/* ---------- концерт: входы и назначения ---------- */}
      {!events ? <Spinner /> : !events.length ? (
        <div className="mb-10"><Notice>Нет ближайших концертов для назначения.</Notice></div>
      ) : event && (
        <div className="mb-12 grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="font-display text-sm font-bold uppercase text-fg">Входы концерта</p>
              {event.venue && <button className="text-xs text-coral hover:underline" onClick={copyFromVenue}>Взять входы площадки «{event.venue.name}»</button>}
            </div>
            {!gates ? <Spinner /> : (
              <div className="space-y-3">
                {!gates.length && <p className="text-sm text-fg-muted">Входов нет: все тикеторы проверяют любые билеты. Добавьте входы, если пускаете через разные двери или зоны.</p>}
                {gates.map((g) => (
                  <div key={g.id} className="rounded-btn border border-line p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-fg">{g.name}</p>
                      <button className="text-xs text-fg-muted hover:text-coral" onClick={() => removeGate(g)}>Удалить</button>
                    </div>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.08em] text-fg-subtle">Кого пропускает</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-fg-muted">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="accent-coral" checked={!g.category_codes.length}
                          onChange={(e) => e.target.checked && patchGate(g, { category_codes: [] })} />
                        Все купленные
                      </label>
                      {cats.map((c) => (
                        <label key={c.code} className="flex items-center gap-2">
                          <input type="checkbox" className="accent-coral" checked={g.category_codes.includes(c.code)}
                            onChange={(e) => patchGate(g, {
                              category_codes: e.target.checked ? [...g.category_codes, c.code] : g.category_codes.filter((x) => x !== c.code),
                            })} />
                          {c.name.ru || c.code}
                        </label>
                      ))}
                      <label className="flex items-center gap-2">
                        <input type="checkbox" className="accent-coral" checked={g.allow_invites} onChange={(e) => patchGate(g, { allow_invites: e.target.checked })} />
                        Пригласительные
                      </label>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input className={inputCls} value={newGate} maxLength={60} placeholder="Новый вход, например «VIP»" onChange={(e) => setNewGate(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGate(); } }} />
                  <button className="btn btn-secondary mt-1.5 shrink-0" onClick={addGate}>Добавить</button>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <p className="mb-4 font-display text-sm font-bold uppercase text-fg">Тикеторы на концерте</p>
            {!assigned || !scanners ? <Spinner /> : (
              <div className="space-y-3">
                {!assigned.length && <p className="text-sm text-fg-muted">Никто не назначен. Тикетор видит в приложении только свои концерты.</p>}
                {assigned.map((a) => (
                  <div key={a.user_id} className="flex flex-wrap items-center gap-3 rounded-btn border border-line p-3">
                    <p className="min-w-0 flex-1 text-fg">{nameOf(a.user_id)}</p>
                    <select className="rounded-btn border border-line-strong bg-surface px-2 py-1.5 text-sm text-fg" value={a.gate_id ?? ""} onChange={(e) => changeGate(a, e.target.value)}>
                      <option value="">Любой вход</option>
                      {(gates ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <button className="text-xs text-fg-muted hover:text-coral" onClick={() => unassign(a)}>Снять</button>
                  </div>
                ))}
                <form onSubmit={assign} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
                  <Field label="Тикетор" className="min-w-[160px] flex-1">
                    <select className={inputCls} value={assignDraft.user_id} onChange={(e) => setAssignDraft({ ...assignDraft, user_id: e.target.value })}>
                      <option value="">{free.length ? "Выберите" : "Все уже назначены"}</option>
                      {free.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name || loginOf(s.email)}</option>)}
                    </select>
                  </Field>
                  <Field label="Вход" className="min-w-[140px] flex-1">
                    <select className={inputCls} value={assignDraft.gate_id} onChange={(e) => setAssignDraft({ ...assignDraft, gate_id: e.target.value })}>
                      <option value="">Любой вход</option>
                      {(gates ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </Field>
                  <button disabled={!assignDraft.user_id} className="btn btn-primary disabled:opacity-50">Назначить</button>
                </form>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ---------- приложение ---------- */}
      <div className="mb-10 grid gap-4 lg:grid-cols-2">
        <Card className="flex items-center gap-5">
          <div className="shrink-0 rounded-btn bg-white p-2"><QrCode value={APK_URL} className="h-28 w-28" /></div>
          <div className="min-w-0 flex-1 space-y-2 text-sm text-fg-muted">
            <p className="font-display text-sm font-bold uppercase text-fg">Android</p>
            <p>Тикетор наводит камеру на QR, скачивает APK и устанавливает (один раз разрешить установку из браузера). Обновляется само при запуске.</p>
            <a href={APK_URL} className="inline-block text-coral hover:underline">Скачать concerts-scanner.apk</a>
          </div>
        </Card>
        <Card className="flex items-center gap-5">
          <div className="shrink-0 rounded-btn bg-white p-2"><QrCode value={PWA_URL} className="h-28 w-28" /></div>
          <div className="min-w-0 flex-1 space-y-2 text-sm text-fg-muted">
            <p className="font-display text-sm font-bold uppercase text-fg">iPhone</p>
            <p>Тикетор открывает ссылку в Safari, нажимает «Поделиться» → «На экран Домой». Появится иконка «Сканер», приложение открывается на весь экран и обновляется само.</p>
            <CopyLink value={PWA_URL} />
          </div>
        </Card>
      </div>

      {/* ---------- аккаунты ---------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold uppercase text-fg">Аккаунты тикеторов</h2>
        <button className="btn btn-primary" onClick={() => { setCreating((v) => !v); setCreated(null); }}>{creating ? "Отмена" : "+ Тикетор"}</button>
      </div>

      {created && (
        <div className="mb-6">
          <Notice kind="ok">
            {created.name}: передайте данные для входа. Приложение «Concerts Сканер» или concerts.kz/scanner · логин <b>{created.login}</b> · пароль <b>{created.password}</b>
          </Notice>
        </div>
      )}

      {creating && (
        <Card className="mb-6">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-3">
            <Field label="Имя *" hint="Видно в журнале проходов">
              <input required className={inputCls} value={draft.full_name} maxLength={80} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
            </Field>
            <Field label="Логин или e-mail *" hint="Латиница, например ivan или marat.kz">
              <input required className={inputCls} value={draft.login} autoCapitalize="none" autoCorrect="off" onChange={(e) => setDraft({ ...draft, login: e.target.value.toLowerCase().replace(/\s/g, "") })} />
            </Field>
            <Field label="Пароль *">
              <div className="flex gap-2">
                <input required minLength={8} className={inputCls} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                <button type="button" className="btn btn-secondary mt-1.5 shrink-0" onClick={() => setDraft({ ...draft, password: genPassword() })}>Новый</button>
              </div>
            </Field>
            <div className="sm:col-span-3">
              <button disabled={busy} className="btn btn-primary disabled:opacity-60">{busy ? "Создаю…" : "Создать тикетора"}</button>
            </div>
          </form>
        </Card>
      )}

      {!scanners ? <Spinner /> : !scanners.length ? (
        <Notice>Тикеторов пока нет. Создайте аккаунт, затем назначьте его на концерт.</Notice>
      ) : (
        <Table head={["Тикетор", "Логин", "Статус", "Последний вход", ""]}>
          {scanners.map((s) => (
            <tr key={s.user_id} className={s.is_active ? "" : "opacity-60"}>
              <td className="px-4 py-3 text-fg">{s.full_name || "–"}</td>
              <td className="px-4 py-3 font-mono text-xs text-fg-muted">{loginOf(s.email)}</td>
              <td className="px-4 py-3">{s.is_active ? <Pill tone="teal">Активен</Pill> : <Pill>Отключён</Pill>}</td>
              <td className="px-4 py-3 text-fg-muted">{s.last_sign_in_at ? formatDateTime(s.last_sign_in_at) : "Ещё не входил"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                <button className="text-fg-muted hover:text-coral" onClick={() => act({ action: "update", user_id: s.user_id, is_active: !s.is_active }, s.is_active ? "Тикетор отключён" : "Тикетор включён")}>
                  {s.is_active ? "Отключить" : "Включить"}
                </button>
                <button className="ml-4 text-fg-muted hover:text-coral" onClick={() => {
                  const p = genPassword();
                  if (window.confirm(`Задать новый пароль для ${s.full_name}?\n\n${p}`)) {
                    act({ action: "reset_password", user_id: s.user_id, password: p }, "Пароль изменён").then((ok) => {
                      if (ok) setCreated({ name: s.full_name ?? "", login: loginOf(s.email), password: p });
                    });
                  }
                }}>Новый пароль</button>
                <button className="ml-4 text-fg-muted hover:text-coral" onClick={() => {
                  if (window.confirm(`Удалить аккаунт ${s.full_name}? Его проходы останутся в журнале.`)) act({ action: "delete", user_id: s.user_id }, "Тикетор удалён");
                }}>Удалить</button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
