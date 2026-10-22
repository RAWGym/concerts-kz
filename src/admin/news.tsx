import { useEffect, useState } from "react";

import { cleanI18n, db, formatDateTime, slugify, uploadPublic, type I18n } from "./db";
import { Card, Field, I18nFields, Notice, PageTitle, Pill, Spinner, inputCls, type Lang } from "./ui";

type Item = {
  id?: string;
  slug: string;
  status: "draft" | "published" | "archived";
  cover_url: string;
  published_at: string | null;
  title: I18n;
  excerpt: I18n;
  body: I18n;
};

const blank = (): Item => ({ slug: "", status: "draft", cover_url: "", published_at: null, title: {}, excerpt: {}, body: {} });
const statuses = { draft: "Черновик", published: "Опубликовано", archived: "Архив" };

export default function News() {
  const [list, setList] = useState<Item[] | null>(null);
  const [edit, setEdit] = useState<Item | null>(null);
  const [lang, setLang] = useState<Lang>("ru");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function load() {
    const { data } = await db().from("news").select("id, slug, status, cover_url, published_at, title, excerpt, body").order("created_at", { ascending: false });
    setList((data ?? []).map((n) => ({ ...n, cover_url: n.cover_url ?? "" })) as Item[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit) return;
    if (!edit.title.ru?.trim()) return setMsg({ kind: "error", text: "Нужен заголовок на русском" });
    const row = {
      slug: edit.slug || slugify(edit.title.ru),
      status: edit.status,
      cover_url: edit.cover_url || null,
      title: cleanI18n(edit.title),
      excerpt: cleanI18n(edit.excerpt),
      body: cleanI18n(edit.body),
      published_at: edit.status === "published" ? (edit.published_at ?? new Date().toISOString()) : edit.published_at,
    };
    const res = edit.id ? await db().from("news").update(row).eq("id", edit.id) : await db().from("news").insert(row);
    if (res.error) return setMsg({ kind: "error", text: res.error.code === "23505" ? "Такой адрес уже занят" : res.error.message });
    setMsg({ kind: "ok", text: "Новость сохранена" });
    setEdit(null);
    load();
  }

  async function remove() {
    if (!edit?.id || !confirm("Удалить новость?")) return;
    await db().from("news").delete().eq("id", edit.id);
    setEdit(null);
    load();
  }

  const change = (f: string, l: Lang, v: string) =>
    setEdit((e) => (e ? { ...e, [f]: { ...(e[f as "title"] ?? {}), [l]: v } } : e));

  return (
    <>
      <PageTitle title="Новости">
        <button className="btn btn-primary" onClick={() => { setEdit(blank()); setMsg(null); }}>Новая новость</button>
      </PageTitle>
      {msg && <div className="mb-6"><Notice kind={msg.kind}>{msg.text}</Notice></div>}

      {edit && (
        <Card className="mb-8 grid gap-6 lg:grid-cols-[1fr_280px]">
          <I18nFields lang={lang} setLang={setLang} values={edit} onChange={change}
            fields={[{ key: "title", label: "Заголовок" }, { key: "excerpt", label: "Кратко", rows: 2 }, { key: "body", label: "Текст", rows: 10 }]} />
          <div className="space-y-4">
            <Field label="Статус">
              <select className={inputCls} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Item["status"] })}>
                {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Обложка">
              {edit.cover_url && <img src={edit.cover_url} alt="" className="mt-2 aspect-video w-full rounded-btn object-cover" />}
              <input type="file" accept="image/*" className="mt-2 block w-full text-xs text-fg-muted"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try { const { url } = await uploadPublic("news", f, "news"); setEdit((x) => (x ? { ...x, cover_url: url } : x)); }
                  catch (err) { setMsg({ kind: "error", text: (err as Error).message }); }
                }} />
            </Field>
            <Field label="Адрес (slug)" hint={`/ru/news/${edit.slug || slugify(edit.title.ru ?? "") || "…"}`}>
              <input className={inputCls} value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} />
            </Field>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={save}>Сохранить</button>
              <button className="btn btn-secondary" onClick={() => setEdit(null)}>Отмена</button>
            </div>
            {edit.id && <button className="text-xs text-fg-subtle hover:text-coral" onClick={remove}>Удалить</button>}
          </div>
        </Card>
      )}

      {!list ? <Spinner /> : list.length === 0 ? <p className="text-sm text-fg-muted">Новостей пока нет.</p> : (
        <div className="space-y-2">
          {list.map((n) => (
            <button key={n.id} onClick={() => { setEdit(n); setMsg(null); window.scrollTo({ top: 0 }); }}
              className="flex w-full items-center justify-between gap-4 rounded-card border border-line px-4 py-3 text-left hover:border-coral/60">
              <span className="text-fg">{n.title.ru ?? n.slug}</span>
              <span className="flex items-center gap-3 text-xs text-fg-muted">
                {formatDateTime(n.published_at)}
                <Pill tone={n.status === "published" ? "teal" : "muted"}>{statuses[n.status]}</Pill>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
