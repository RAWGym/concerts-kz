import { useEffect, useState } from "react";

import { cleanI18n, db, slugify, uploadPublic, type I18n } from "./db";
import { Card, Field, I18nFields, Notice, PageTitle, Pill, Spinner, inputCls, type Lang } from "./ui";

type Img = { id: string; url: string; storage_path: string; sort_order: number };
type R = {
  id?: string;
  slug: string;
  status: "draft" | "published" | "archived";
  cover_url: string;
  shot_on: string;
  city: string;
  title: I18n;
  description: I18n;
};

const statuses = { draft: "Черновик", published: "Опубликовано", archived: "Архив" };
const blank = (): R => ({ slug: "", status: "draft", cover_url: "", shot_on: "", city: "", title: {}, description: {} });

function size(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src); };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

export default function Reports() {
  const [list, setList] = useState<R[] | null>(null);
  const [edit, setEdit] = useState<R | null>(null);
  const [images, setImages] = useState<Img[]>([]);
  const [lang, setLang] = useState<Lang>("ru");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  async function load() {
    const { data } = await db().from("photo_reports").select("id, slug, status, cover_url, shot_on, city, title, description").order("shot_on", { ascending: false, nullsFirst: true });
    setList((data ?? []).map((r) => ({ ...r, cover_url: r.cover_url ?? "", shot_on: r.shot_on ?? "", city: r.city ?? "" })) as R[]);
  }
  useEffect(() => { load(); }, []);

  async function open(r: R) {
    setEdit(r);
    setMsg(null);
    setImages([]);
    window.scrollTo({ top: 0 });
    if (r.id) {
      const { data } = await db().from("photo_report_images").select("id, url, storage_path, sort_order").eq("report_id", r.id).order("sort_order");
      setImages((data ?? []) as Img[]);
    }
  }

  async function save(): Promise<string | null> {
    if (!edit) return null;
    if (!edit.title.ru?.trim()) { setMsg({ kind: "error", text: "Нужен заголовок на русском" }); return null; }
    const row = {
      slug: edit.slug || slugify(edit.title.ru),
      status: edit.status,
      cover_url: edit.cover_url || images[0]?.url || null,
      shot_on: edit.shot_on || null,
      city: edit.city.trim() || null,
      title: cleanI18n(edit.title),
      description: cleanI18n(edit.description),
      published_at: edit.status === "published" ? new Date().toISOString() : null,
    };
    const res = edit.id
      ? await db().from("photo_reports").update(row).eq("id", edit.id).select("id").single()
      : await db().from("photo_reports").insert(row).select("id").single();
    if (res.error) { setMsg({ kind: "error", text: res.error.code === "23505" ? "Такой адрес уже занят" : res.error.message }); return null; }
    setEdit((e) => (e ? { ...e, id: res.data.id, slug: row.slug } : e));
    setMsg({ kind: "ok", text: "Фотоотчёт сохранён" });
    load();
    return res.data.id as string;
  }

  async function addPhotos(files: FileList) {
    const reportId = edit?.id ?? (await save());
    if (!reportId) return;
    let order = images.length;
    const added: Img[] = [];
    for (const [i, f] of Array.from(files).entries()) {
      setUploading(`Загружаю ${i + 1} из ${files.length}…`);
      try {
        const [{ path, url }, dims] = await Promise.all([uploadPublic("photo-reports", f, edit?.slug || "report"), size(f)]);
        const { data, error } = await db().from("photo_report_images")
          .insert({ report_id: reportId, storage_path: path, url, width: dims?.width ?? null, height: dims?.height ?? null, sort_order: ++order })
          .select("id, url, storage_path, sort_order").single();
        if (error) throw error;
        added.push(data as Img);
      } catch (err) {
        setMsg({ kind: "error", text: (err as Error).message });
      }
    }
    setUploading(null);
    setImages((list) => [...list, ...added]);
  }

  async function removePhoto(img: Img) {
    await db().from("photo_report_images").delete().eq("id", img.id);
    await db().storage.from("photo-reports").remove([img.storage_path]);
    setImages((l) => l.filter((x) => x.id !== img.id));
  }

  const change = (f: string, l: Lang, v: string) =>
    setEdit((e) => (e ? { ...e, [f]: { ...(e[f as "title"] ?? {}), [l]: v } } : e));

  return (
    <>
      <PageTitle title="Фотоотчёты">
        <button className="btn btn-primary" onClick={() => open(blank())}>Новый фотоотчёт</button>
      </PageTitle>
      {msg && <div className="mb-6"><Notice kind={msg.kind}>{msg.text}</Notice></div>}

      {edit && (
        <Card className="mb-8 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <I18nFields lang={lang} setLang={setLang} values={edit} onChange={change}
              fields={[{ key: "title", label: "Заголовок" }, { key: "description", label: "Описание", rows: 4 }]} />
            <div className="space-y-4">
              <Field label="Статус">
                <select className={inputCls} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as R["status"] })}>
                  {Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Дата съёмки"><input type="date" className={inputCls} value={edit.shot_on} onChange={(e) => setEdit({ ...edit, shot_on: e.target.value })} /></Field>
              <Field label="Город"><input className={inputCls} value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
              <Field label="Адрес (slug)"><input className={inputCls} value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: slugify(e.target.value) })} /></Field>
              <div className="flex gap-3">
                <button className="btn btn-primary" onClick={save}>Сохранить</button>
                <button className="btn btn-secondary" onClick={() => setEdit(null)}>Закрыть</button>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <h2 className="font-display text-sm font-semibold uppercase text-fg">Фото ({images.length})</h2>
              <label className="btn btn-secondary cursor-pointer">
                Добавить фото
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files?.length && addPhotos(e.target.files)} />
              </label>
              {uploading && <span className="text-xs text-fg-subtle">{uploading}</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {images.map((img) => (
                <div key={img.id} className="group relative aspect-square overflow-hidden rounded-btn bg-surface">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  {edit.cover_url === img.url && <span className="absolute left-1 top-1"><Pill tone="coral">Обложка</Pill></span>}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 px-2 py-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                    <button className="text-fg hover:text-coral" onClick={() => setEdit({ ...edit, cover_url: img.url })}>Обложка</button>
                    <button className="text-fg hover:text-coral" onClick={() => removePhoto(img)}>Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {!list ? <Spinner /> : list.length === 0 ? <p className="text-sm text-fg-muted">Фотоотчётов пока нет.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((r) => (
            <button key={r.id} onClick={() => open(r)} className="overflow-hidden rounded-card border border-line text-left hover:border-coral/60">
              <div className="aspect-video bg-surface">{r.cover_url && <img src={r.cover_url} alt="" className="h-full w-full object-cover" />}</div>
              <div className="p-3">
                <p className="text-sm text-fg">{r.title.ru ?? r.slug}</p>
                <p className="mt-1 text-xs text-fg-subtle">{[r.city, r.shot_on].filter(Boolean).join(" · ")} · {statuses[r.status]}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
