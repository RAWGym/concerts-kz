import { useEffect, useState } from "react";

import { db, slugify, uploadPublic } from "./db";
import { Card, Field, Notice, PageTitle, Spinner, inputCls } from "./ui";

type P = { id?: string; slug: string; name: string; logo_url: string; website_url: string; tier: string; sort_order: number; is_active: boolean };
const tiers: Record<string, string> = { general: "Генеральный", official: "Официальный", media: "Медиа", tech: "Технический" };
const blank = (n: number): P => ({ slug: "", name: "", logo_url: "", website_url: "", tier: "official", sort_order: n, is_active: true });

export default function Partners() {
  const [list, setList] = useState<P[] | null>(null);
  const [edit, setEdit] = useState<P | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function load() {
    const { data } = await db().from("partners").select("*").order("sort_order");
    setList((data ?? []).map((p) => ({ ...p, logo_url: p.logo_url ?? "", website_url: p.website_url ?? "" })) as P[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit?.name.trim()) return setMsg({ kind: "error", text: "Нужно название" });
    const row = { ...edit, slug: edit.slug || slugify(edit.name), logo_url: edit.logo_url || null, website_url: edit.website_url || null };
    delete (row as { id?: string }).id;
    const res = edit.id ? await db().from("partners").update(row).eq("id", edit.id) : await db().from("partners").insert(row);
    if (res.error) return setMsg({ kind: "error", text: res.error.message });
    setMsg({ kind: "ok", text: "Сохранено" });
    setEdit(null);
    load();
  }

  return (
    <>
      <PageTitle title="Партнёры">
        <button className="btn btn-primary" onClick={() => { setEdit(blank((list?.length ?? 0) + 1)); setMsg(null); }}>Добавить партнёра</button>
      </PageTitle>
      {msg && <div className="mb-6"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {edit && (
        <Card className="mb-8 grid gap-4 sm:grid-cols-2">
          <Field label="Название *"><input className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Сайт"><input className={inputCls} placeholder="https://" value={edit.website_url} onChange={(e) => setEdit({ ...edit, website_url: e.target.value })} /></Field>
          <Field label="Тип">
            <select className={inputCls} value={edit.tier} onChange={(e) => setEdit({ ...edit, tier: e.target.value })}>
              {Object.entries(tiers).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Порядок"><input type="number" className={inputCls} value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></Field>
          <Field label="Логотип" hint="PNG или SVG на прозрачном фоне">
            {edit.logo_url && <img src={edit.logo_url} alt="" className="mt-2 h-16 rounded-btn bg-surface-2 object-contain p-2" />}
            <input type="file" accept="image/*" className="mt-2 block w-full text-xs text-fg-muted"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try { const { url } = await uploadPublic("partners", f, "logo"); setEdit((x) => (x ? { ...x, logo_url: url } : x)); }
                catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
              }} />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm text-fg-muted">
            <input type="checkbox" checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} className="accent-[#ff4d4d]" />
            Показывать на сайте
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button className="btn btn-primary" onClick={save}>Сохранить</button>
            <button className="btn btn-secondary" onClick={() => setEdit(null)}>Отмена</button>
            {edit.id && (
              <button className="ml-auto text-xs text-fg-subtle hover:text-coral" onClick={async () => {
                if (!confirm("Удалить партнёра?")) return;
                await db().from("partners").delete().eq("id", edit.id);
                setEdit(null); load();
              }}>Удалить</button>
            )}
          </div>
        </Card>
      )}
      {!list ? <Spinner /> : list.length === 0 ? <p className="text-sm text-fg-muted">Партнёров пока нет. Пока список пуст, блок на сайте скрыт.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((p) => (
            <button key={p.id} onClick={() => { setEdit(p); setMsg(null); window.scrollTo({ top: 0 }); }} className="rounded-card border border-line p-4 text-left hover:border-coral/60">
              {p.logo_url ? <img src={p.logo_url} alt="" className="h-12 object-contain" /> : <div className="h-12" />}
              <p className="mt-3 text-sm text-fg">{p.name}</p>
              <p className="text-xs text-fg-subtle">{tiers[p.tier]}{p.is_active ? "" : " · скрыт"}</p>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
