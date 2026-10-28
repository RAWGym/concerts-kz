import { useEffect, useState, type FormEvent } from "react";

import { formatDateTime, roleHints, roleLabels, staffApi, type Role } from "./db";
import { useStaff } from "./layout";
import { Card, Field, Notice, PageTitle, Spinner, Table, inputCls } from "./ui";

type Member = {
  user_id: string;
  role: Role;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  can_manage_scanners: boolean;
  can_issue_invites: boolean;
};

const ROLES: Role[] = ["admin", "editor", "sales"];

function genPassword() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join("");
}

export default function Staff() {
  const me = useStaff();
  const [list, setList] = useState<Member[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ email: "", full_name: "", role: "editor" as Role, password: genPassword() });
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { staff } = await staffApi<{ staff: Member[] }>({ action: "list" });
      // Тикеторы живут в разделе «Тикеторы и входы».
      setList(staff.filter((m) => m.role !== "scanner"));
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
      setList([]);
    }
  }
  useEffect(() => { load(); }, []);

  if (me.role !== "admin") return <Notice>Раздел доступен только администратору.</Notice>;

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await staffApi({ action: "create", ...draft });
      setMsg({ kind: "ok", text: `Аккаунт создан. Передайте сотруднику: вход на concerts.kz/ru/login, e-mail ${draft.email}, пароль ${draft.password}` });
      setCreating(false);
      setDraft({ email: "", full_name: "", role: "editor", password: genPassword() });
      load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  async function act(body: Record<string, unknown>, ok: string) {
    setMsg(null);
    try {
      await staffApi(body);
      setMsg({ kind: "ok", text: ok });
      load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  return (
    <>
      <PageTitle title="Сотрудники">
        <button className="btn btn-primary" onClick={() => { setCreating((v) => !v); setMsg(null); }}>
          {creating ? "Отмена" : "Добавить сотрудника"}
        </button>
      </PageTitle>

      {msg && <div className="mb-6"><Notice kind={msg.kind}>{msg.text}</Notice></div>}

      {creating && (
        <Card className="mb-8">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <Field label="E-mail *"><input type="email" required className={inputCls} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="Имя и фамилия"><input className={inputCls} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} /></Field>
            <Field label="Роль" hint={roleHints[draft.role]}>
              <select className={inputCls} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
              </select>
            </Field>
            <Field label="Временный пароль" hint="Сотрудник сможет сменить его после входа">
              <div className="flex gap-2">
                <input required minLength={8} className={inputCls} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                <button type="button" className="btn btn-secondary mt-1.5 shrink-0" onClick={() => setDraft({ ...draft, password: genPassword() })}>Новый</button>
              </div>
            </Field>
            <div className="sm:col-span-2">
              <button disabled={busy} className="btn btn-primary disabled:opacity-60">{busy ? "Создаю…" : "Создать аккаунт"}</button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-card border border-line px-4 py-3">
            <p className="text-sm font-medium text-fg">{roleLabels[r]}</p>
            <p className="mt-1 text-xs text-fg-subtle">{roleHints[r]}</p>
          </div>
        ))}
      </div>

      {!list ? <Spinner /> : (
        <Table head={["Сотрудник", "Роль", "Права на вход", "Последний вход", ""]}>
          {list.map((m) => (
            <tr key={m.user_id}>
              <td className="px-4 py-3">
                <div className="text-fg">{m.full_name || m.email}</div>
                {m.full_name && <div className="text-xs text-fg-muted">{m.email}</div>}
              </td>
              <td className="px-4 py-3">
                <select disabled={m.user_id === me.userId}
                  className="rounded-btn border border-line-strong bg-surface px-2 py-1.5 text-xs text-fg disabled:opacity-60"
                  value={m.role}
                  onChange={(e) => act({ action: "update", user_id: m.user_id, role: e.target.value }, "Роль изменена")}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 text-xs text-fg-muted">
                {m.role === "admin" ? (
                  <span>Все права</span>
                ) : (
                  <div className="space-y-1.5">
                    {([
                      ["can_manage_scanners", "Создаёт тикеторов"],
                      ["can_issue_invites", "Выписывает пригласительные"],
                    ] as const).map(([flag, label]) => (
                      <label key={flag} className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" className="accent-coral" checked={m[flag]}
                          onChange={(e) => act({ action: "update", user_id: m.user_id, [flag]: e.target.checked }, "Права обновлены")} />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-fg-muted">{m.last_sign_in_at ? formatDateTime(m.last_sign_in_at) : "Ещё не входил"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                <button className="text-fg-muted hover:text-coral" onClick={() => {
                  const p = genPassword();
                  if (confirm(`Задать новый пароль для ${m.email}?\n\n${p}`)) act({ action: "reset_password", user_id: m.user_id, password: p }, `Новый пароль для ${m.email}: ${p}`);
                }}>Сбросить пароль</button>
                {m.user_id !== me.userId && (
                  <button className="ml-4 text-fg-muted hover:text-coral" onClick={() => {
                    if (confirm(`Удалить аккаунт ${m.email}? Сотрудник потеряет доступ.`)) act({ action: "delete", user_id: m.user_id }, "Аккаунт удалён");
                  }}>Удалить</button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
