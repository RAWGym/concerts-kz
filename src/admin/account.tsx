import { useState, type FormEvent } from "react";

import { db, roleLabels } from "./db";
import { useStaff } from "./layout";
import { Card, Field, Notice, PageTitle, inputCls } from "./ui";

/** Свой профиль: смена пароля. */
export default function Account() {
  const me = useStaff();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const p1 = String(f.get("p1") ?? "");
    if (p1.length < 8) return setMsg({ kind: "error", text: "Пароль от 8 символов" });
    if (p1 !== f.get("p2")) return setMsg({ kind: "error", text: "Пароли не совпадают" });
    const { error } = await db().auth.updateUser({ password: p1 });
    setMsg(error ? { kind: "error", text: error.message } : { kind: "ok", text: "Пароль изменён" });
    if (!error) e.currentTarget.reset();
  }

  return (
    <>
      <PageTitle title="Мой аккаунт" />
      <Card className="max-w-md">
        <p className="text-sm text-fg">{me.email}</p>
        <p className="mt-1 text-xs text-fg-subtle">{roleLabels[me.role]}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Новый пароль"><input name="p1" type="password" autoComplete="new-password" className={inputCls} /></Field>
          <Field label="Повторите пароль"><input name="p2" type="password" autoComplete="new-password" className={inputCls} /></Field>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button className="btn btn-primary">Сменить пароль</button>
        </form>
      </Card>
    </>
  );
}
