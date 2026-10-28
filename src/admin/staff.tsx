import { useEffect, useState, type FormEvent } from "react";

import { formatDateTime, staffApi } from "./db";
import { useStaff } from "./layout";
import {
  ALL_PERMISSIONS,
  permissionGroups,
  positionHints,
  positionLabels,
  positionPermissions,
  STAFF_POSITIONS,
  TOP_POSITIONS,
  type Permission,
  type Position,
} from "./permissions";
import { Card, Field, Notice, PageTitle, Pill, Spinner, inputCls } from "./ui";

type Member = {
  user_id: string;
  position: Position;
  permissions: Permission[];
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_active: boolean;
};

function genPassword() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join("");
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Выбор должности и галочки прав. Права, которых нет у себя, выдать нельзя (их можно только снять). */
function Rights({
  position,
  permissions,
  original,
  onChange,
}: {
  position: Position;
  permissions: Permission[];
  original: Permission[];
  onChange: (position: Position, permissions: Permission[]) => void;
}) {
  const me = useStaff();
  const top = TOP_POSITIONS.includes(me.position);
  const preset = positionPermissions[position];
  const custom = !sameSet(permissions, preset);
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-fg-muted">Должность</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {STAFF_POSITIONS.map((p) => {
            const locked = TOP_POSITIONS.includes(p) && !top;
            return (
              <button key={p} type="button" disabled={locked}
                title={locked ? "Назначает только владелец или тех. специалист" : positionHints[p]}
                onClick={() => onChange(p, positionPermissions[p].filter((x) => me.can(x) || original.includes(x)))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${position === p ? "border-coral bg-coral/15 text-coral" : "border-line-strong text-fg-muted hover:text-fg"}`}>
                {positionLabels[p]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-fg-subtle">
          {positionHints[position]}. Права ниже заполнены по должности, их можно поправить.
          {custom && (
            <button type="button" className="ml-2 text-coral hover:underline" onClick={() => onChange(position, preset.filter((x) => me.can(x) || original.includes(x)))}>
              Вернуть права должности
            </button>
          )}
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {permissionGroups.map((g) => (
          <div key={g.title}>
            <p className="text-[10px] uppercase tracking-[0.14em] text-fg-faint">{g.title}</p>
            <div className="mt-2 space-y-2">
              {g.items.map((i) => {
                const has = permissions.includes(i.key);
                // Своё право можно и дать, и снять. Чужое (которого нет у меня) только снять.
                const disabled = !me.can(i.key) && !has;
                return (
                  <label key={i.key} className={`flex items-start gap-2 text-xs ${disabled ? "opacity-40" : "cursor-pointer"}`}>
                    <input type="checkbox" className="mt-0.5 accent-coral" checked={has} disabled={disabled}
                      onChange={(e) => onChange(position, e.target.checked ? [...permissions, i.key] : permissions.filter((x) => x !== i.key))} />
                    <span>
                      <span className="text-fg">{i.label}</span>
                      {i.hint && <span className="block text-[11px] text-fg-subtle">{i.hint}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Staff() {
  const me = useStaff();
  const [list, setList] = useState<Member[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    email: "",
    full_name: "",
    position: "editor" as Position,
    permissions: positionPermissions.editor,
    password: genPassword(),
  });
  const [editing, setEditing] = useState<{ id: string; position: Position; permissions: Permission[] } | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { staff } = await staffApi<{ staff: Member[] }>({ action: "list" });
      // Тикеторы живут в разделе «Тикеторы и входы».
      setList(staff.filter((m) => m.position !== "scanner"));
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
      setList([]);
    }
  }
  useEffect(() => { load(); }, []);

  if (!me.can("staff")) return <Notice>Раздел доступен сотрудникам с правом «Сотрудники и должности».</Notice>;

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await staffApi({ action: "create", ...draft });
      setMsg({ kind: "ok", text: `Аккаунт создан. Передайте сотруднику: вход на concerts.kz/ru/login, e-mail ${draft.email}, пароль ${draft.password}` });
      setCreating(false);
      setDraft({ email: "", full_name: "", position: "editor", permissions: positionPermissions.editor, password: genPassword() });
      load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  async function act(body: Record<string, unknown>, ok: string) {
    setMsg(null);
    setBusy(true);
    try {
      await staffApi(body);
      setMsg({ kind: "ok", text: ok });
      setEditing(null);
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
    setBusy(false);
  }

  const top = TOP_POSITIONS.includes(me.position);

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
          <form onSubmit={create} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="E-mail *"><input type="email" required className={inputCls} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
              <Field label="Имя и фамилия"><input className={inputCls} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} /></Field>
              <Field label="Временный пароль" hint="Сотрудник сможет сменить его после входа">
                <div className="flex gap-2">
                  <input required minLength={8} className={inputCls} value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                  <button type="button" className="btn btn-secondary mt-1.5 shrink-0" onClick={() => setDraft({ ...draft, password: genPassword() })}>Новый</button>
                </div>
              </Field>
            </div>
            <Rights position={draft.position} permissions={draft.permissions} original={[]}
              onChange={(position, permissions) => setDraft({ ...draft, position, permissions })} />
            <button disabled={busy} className="btn btn-primary disabled:opacity-60">{busy ? "Создаю…" : "Создать аккаунт"}</button>
          </form>
        </Card>
      )}

      {!list ? <Spinner /> : (
        <div className="space-y-3">
          {list.map((m) => {
            const self = m.user_id === me.userId;
            // Владельца и тех. специалиста меняет только владелец или тех. специалист.
            const locked = self || (TOP_POSITIONS.includes(m.position) && !top);
            const open = editing?.id === m.user_id;
            const all = ALL_PERMISSIONS.every((p) => m.permissions.includes(p));
            const custom = !sameSet(m.permissions, positionPermissions[m.position] ?? []);
            return (
              <Card key={m.user_id} className={m.is_active ? "" : "opacity-60"}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-fg">
                      {m.full_name || m.email}
                      {self && <span className="ml-2 text-xs text-fg-subtle">это вы</span>}
                    </p>
                    {m.full_name && <p className="text-xs text-fg-muted">{m.email}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Pill tone={TOP_POSITIONS.includes(m.position) ? "coral" : "muted"}>{positionLabels[m.position] ?? m.position}</Pill>
                      {!m.is_active && <Pill tone="orange">Отключён</Pill>}
                      <span className="text-[11px] text-fg-subtle">
                        {all ? "все права" : custom ? `свои права: ${m.permissions.length}` : `права должности: ${m.permissions.length}`}
                        {" · "}
                        {m.last_sign_in_at ? `вход ${formatDateTime(m.last_sign_in_at)}` : "ещё не входил"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    {!locked && (
                      <button className="text-fg-muted hover:text-coral" onClick={() => setEditing(open ? null : { id: m.user_id, position: m.position, permissions: m.permissions })}>
                        {open ? "Закрыть" : "Должность и права"}
                      </button>
                    )}
                    {!locked && (
                      <button className="text-fg-muted hover:text-coral" onClick={() => {
                        const p = genPassword();
                        if (confirm(`Задать новый пароль для ${m.email}?\n\n${p}`)) act({ action: "reset_password", user_id: m.user_id, password: p }, `Новый пароль для ${m.email}: ${p}`);
                      }}>Сбросить пароль</button>
                    )}
                    {!locked && (
                      <button className="text-fg-muted hover:text-coral" onClick={() => act({ action: "update", user_id: m.user_id, is_active: !m.is_active }, m.is_active ? "Доступ отключён" : "Доступ включён")}>
                        {m.is_active ? "Отключить" : "Включить"}
                      </button>
                    )}
                    {!locked && (
                      <button className="text-fg-muted hover:text-coral" onClick={() => {
                        if (confirm(`Удалить аккаунт ${m.email}? Сотрудник потеряет доступ.`)) act({ action: "delete", user_id: m.user_id }, "Аккаунт удалён");
                      }}>Удалить</button>
                    )}
                  </div>
                </div>
                {open && editing && (
                  <div className="mt-5 border-t border-line pt-5">
                    <Rights position={editing.position} permissions={editing.permissions} original={m.permissions}
                      onChange={(position, permissions) => setEditing({ ...editing, position, permissions })} />
                    <div className="mt-5 flex gap-3">
                      <button disabled={busy} className="btn btn-primary disabled:opacity-60"
                        onClick={() => act({ action: "update", user_id: m.user_id, position: editing.position, permissions: editing.permissions }, "Должность и права сохранены")}>
                        Сохранить
                      </button>
                      <button className="btn btn-secondary" onClick={() => setEditing(null)}>Отмена</button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
