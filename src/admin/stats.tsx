import { useEffect, useState } from "react";

import { cleanI18n, db, slugify, type I18n } from "./db";
import { Card, Field, Notice, PageTitle, Spinner, inputCls } from "./ui";

type S = { id?: string; key: string; value: string; label: I18n; sort_order: number; is_active: boolean };

/** Цифры в блоке «О компании»: «300 000+ зрителей» и т. п. */
export default function Stats() {
  const [list, setList] = useState<S[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);

  useEffect(() => {
    db().from("site_stats").select("*").order("sort_order").then(({ data }) => setList((data ?? []) as S[]));
  }, []);

  const set = (i: number, patch: Partial<S>) => setList((l) => l?.map((s, j) => (j === i ? { ...s, ...patch } : s)) ?? l);

  async function save() {
    if (!list) return;
    setMsg(null);
    if (removed.length) await db().from("site_stats").delete().in("id", removed);
    const rows = list
      .filter((s) => s.value.trim() && s.label.ru?.trim())
      .map((s, i) => ({ ...(s.id ? { id: s.id } : {}), key: s.key || slugify(s.label.ru ?? "") || `stat-${i}`, value: s.value.trim(), label: cleanI18n(s.label), sort_order: i + 1, is_active: s.is_active }));
    const { error } = await db().from("site_stats").upsert(rows);
    if (error) return setMsg({ kind: "error", text: error.message });
    setRemoved([]);
    const { data } = await db().from("site_stats").select("*").order("sort_order");
    setList((data ?? []) as S[]);
    setMsg({ kind: "ok", text: "Сохранено" });
  }

  return (
    <>
      <PageTitle title="Цифры о компании">
        <button className="btn btn-secondary" onClick={() => setList((l) => [...(l ?? []), { key: "", value: "", label: {}, sort_order: 0, is_active: true }])}>Добавить</button>
        <button className="btn btn-primary" onClick={save}>Сохранить</button>
      </PageTitle>
      <p className="mb-6 text-sm text-fg-muted">Показываются в блоке «О компании» на главной. Пустой список скрывает блок цифр.</p>
      {msg && <div className="mb-6"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {!list ? <Spinner /> : (
        <div className="space-y-3">
          {list.map((s, i) => (
            <Card key={s.id ?? `n${i}`} className="grid gap-3 sm:grid-cols-[140px_1fr_1fr_1fr_auto]">
              <Field label="Значение"><input className={inputCls} placeholder="300 000+" value={s.value} onChange={(e) => set(i, { value: e.target.value })} /></Field>
              <Field label="Подпись RU"><input className={inputCls} placeholder="зрителей" value={s.label.ru ?? ""} onChange={(e) => set(i, { label: { ...s.label, ru: e.target.value } })} /></Field>
              <Field label="KZ"><input className={inputCls} value={s.label.kz ?? ""} onChange={(e) => set(i, { label: { ...s.label, kz: e.target.value } })} /></Field>
              <Field label="EN"><input className={inputCls} value={s.label.en ?? ""} onChange={(e) => set(i, { label: { ...s.label, en: e.target.value } })} /></Field>
              <div className="flex items-end gap-3 pb-2 text-xs">
                <label className="flex items-center gap-1.5 text-fg-muted">
                  <input type="checkbox" checked={s.is_active} onChange={(e) => set(i, { is_active: e.target.checked })} className="accent-[#ff4d4d]" />
                  Показ
                </label>
                <button className="text-fg-subtle hover:text-coral" onClick={() => { if (s.id) setRemoved((r) => [...r, s.id!]); setList((l) => l?.filter((_, j) => j !== i) ?? l); }}>Удалить</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
