import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { canEdit, db, fromLocalInput, slugify, toLocalInput } from "./db";
import { statusLabel } from "./events";
import { useStaff } from "./layout";
import { useToast } from "./toast";
import { Card, Field, Notice, PageTitle, Spinner, inputCls } from "./ui";

const LOCALES = [
  { code: "ru", label: "Русский" },
  { code: "kz", label: "Қазақша" },
  { code: "en", label: "English" },
] as const;
type Loc = (typeof LOCALES)[number]["code"];

const categories = { concert: "Концерт", festival: "Фестиваль", standup: "Стендап", show: "Шоу", open_air: "Open air" };
const badges = { none: "Без метки", new: "Новинка", soon: "Скоро", last_tickets: "Последние билеты", sold_out: "Sold out" };

type Venue = { id: string; name: string; city: string; timezone: string };
type Tr = { title: string; subtitle: string; description: string; lineup: string };
type Cat = { id?: string; code: string; name: string; price: string; available: string; max_per_order: string; is_active: boolean };

type Form = {
  slug: string;
  status: keyof typeof statusLabel;
  category: keyof typeof categories;
  venue_id: string;
  starts: string;
  doors: string;
  age_limit: string;
  poster_url: string;
  currency: string;
  badge: keyof typeof badges;
  is_featured: boolean;
  is_sold_out: boolean;
  ticketon_url: string;
};

const emptyTr: Tr = { title: "", subtitle: "", description: "", lineup: "" };

export default function EventEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const staff = useStaff();
  const readOnly = !canEdit(staff.role);
  const navigate = useNavigate();
  const toast = useToast();
  const [search] = useSearchParams();
  const copyFrom = isNew ? search.get("from") : null;

  const [venues, setVenues] = useState<Venue[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [tr, setTr] = useState<Record<Loc, Tr>>({ ru: { ...emptyTr }, kz: { ...emptyTr }, en: { ...emptyTr } });
  const [cats, setCats] = useState<Cat[]>([]);
  const [removedCats, setRemovedCats] = useState<string[]>([]);
  const [tab, setTab] = useState<Loc>("ru");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const tz = venues.find((v) => v.id === form?.venue_id)?.timezone ?? "Asia/Almaty";

  useEffect(() => {
    const c = db();
    c.from("venues").select("id, name, city, timezone").order("city").then(({ data }) => setVenues((data ?? []) as Venue[]));

    if (isNew && !copyFrom) {
      setForm({
        slug: "", status: "draft", category: "concert", venue_id: "", starts: "", doors: "", age_limit: "",
        poster_url: "", currency: "KZT", badge: "none", is_featured: false, is_sold_out: false, ticketon_url: "",
      });
      setCats([{ code: "standard", name: "Стандартный", price: "", available: "", max_per_order: "6", is_active: true }]);
      return;
    }

    c.from("events")
      .select("*, venue:venues(timezone), translations:event_translations(*), cats:ticket_categories(*)")
      .eq("id", copyFrom ?? id)
      .single()
      .then(({ data: e, error }) => {
        if (error || !e) return setMsg({ kind: "error", text: "Событие не найдено" });
        const zone = e.venue?.timezone ?? "Asia/Almaty";
        setForm({
          slug: copyFrom ? `${e.slug}-copy` : e.slug, status: copyFrom ? "draft" : e.status, category: e.category, venue_id: e.venue_id ?? "",
          starts: toLocalInput(e.starts_at, zone), doors: toLocalInput(e.doors_open_at, zone),
          age_limit: e.age_limit?.toString() ?? "", poster_url: e.poster_url ?? "", currency: e.currency,
          badge: e.badge, is_featured: e.is_featured, is_sold_out: e.is_sold_out, ticketon_url: e.ticketon_url ?? "",
        });
        const next = { ru: { ...emptyTr }, kz: { ...emptyTr }, en: { ...emptyTr } };
        for (const t of e.translations ?? []) {
          next[t.locale as Loc] = { title: t.title ?? "", subtitle: t.subtitle ?? "", description: t.description ?? "", lineup: t.lineup ?? "" };
        }
        setTr(next);
        setCats(
          [...(e.cats ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((k) => ({
              id: copyFrom ? undefined : k.id, code: k.code, name: k.name?.ru ?? k.code, price: String(Number(k.price)),
              available: k.available == null ? "" : String(k.available), max_per_order: String(k.max_per_order), is_active: k.is_active,
            })),
        );
      });
  }, [id, isNew, copyFrom]);

  if (!form) return msg ? <Notice kind="error">{msg.text}</Notice> : <Spinner />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setT = (k: keyof Tr, v: string) => setTr((all) => ({ ...all, [tab]: { ...all[tab], [k]: v } }));
  const setCat = (i: number, patch: Partial<Cat>) => setCats((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function upload(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${form!.slug || "event"}-${Date.now()}.${ext}`;
    const { error } = await db().storage.from("events").upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) return setMsg({ kind: "error", text: `Не удалось загрузить афишу: ${error.message}` });
    set("poster_url", db().storage.from("events").getPublicUrl(path).data.publicUrl);
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!form) return;
    setMsg(null);
    if (!tr.ru.title.trim()) return setMsg({ kind: "error", text: "Заполните название на русском" });
    if (!form.starts) return setMsg({ kind: "error", text: "Укажите дату и время" });
    const slug = form.slug.trim() || slugify(tr.ru.title);
    const activePrices = cats.filter((c) => c.is_active && c.price !== "").map((c) => Number(c.price));

    setBusy(true);
    const c = db();
    const payload = {
      slug,
      status: form.status,
      category: form.category,
      venue_id: form.venue_id || null,
      starts_at: fromLocalInput(form.starts, tz),
      doors_open_at: fromLocalInput(form.doors, tz),
      age_limit: form.age_limit ? Number(form.age_limit) : null,
      poster_url: form.poster_url || null,
      currency: form.currency,
      badge: form.badge,
      is_featured: form.is_featured,
      is_sold_out: form.is_sold_out,
      ticketon_url: form.ticketon_url || null,
      price_from: activePrices.length ? Math.min(...activePrices) : null,
      published_at: form.status === "published" ? new Date().toISOString() : null,
    };

    const res = isNew
      ? await c.from("events").insert(payload).select("id").single()
      : await c.from("events").update(payload).eq("id", id).select("id").single();
    if (res.error) {
      setBusy(false);
      return setMsg({ kind: "error", text: res.error.code === "23505" ? "Такой адрес (slug) уже занят" : res.error.message });
    }
    const eventId = res.data.id as string;

    const trRows = LOCALES.filter((l) => tr[l.code].title.trim()).map((l) => ({
      event_id: eventId,
      locale: l.code,
      title: tr[l.code].title.trim(),
      subtitle: tr[l.code].subtitle.trim() || null,
      description: tr[l.code].description.trim() || null,
      lineup: tr[l.code].lineup.trim() || null,
    }));
    const trRes = await c.from("event_translations").upsert(trRows, { onConflict: "event_id,locale" });

    if (removedCats.length) await c.from("ticket_categories").delete().in("id", removedCats);
    const catRows = cats
      .filter((k) => k.name.trim() && k.price !== "")
      .map((k, i) => ({
        ...(k.id ? { id: k.id } : {}),
        event_id: eventId,
        code: k.code.trim() || slugify(k.name) || `cat-${i + 1}`,
        name: { ru: k.name.trim() },
        price: Number(k.price),
        available: k.available === "" ? null : Number(k.available),
        max_per_order: Number(k.max_per_order) || 6,
        is_active: k.is_active,
        sort_order: i + 1,
      }));
    const catRes = catRows.length ? await c.from("ticket_categories").upsert(catRows) : { error: null };

    setBusy(false);
    const err = trRes.error ?? catRes.error;
    if (err) return setMsg({ kind: "error", text: err.message });
    setRemovedCats([]);
    toast("Сохранено. На сайте изменения видны сразу.");
    if (isNew) navigate(`/admin/events/${eventId}`, { replace: true });
  }

  async function remove() {
    if (!confirm("Удалить событие? Это нельзя отменить. Чтобы просто скрыть его, поставьте статус «Архив».")) return;
    const { error } = await db().from("events").delete().eq("id", id);
    if (error) return setMsg({ kind: "error", text: error.code === "23503" ? "По событию есть заказы, его можно только перенести в архив" : error.message });
    navigate("/admin/events");
  }

  return (
    <form onSubmit={onSubmit}>
      <PageTitle title={copyFrom ? "Копия события" : isNew ? "Новое событие" : tr.ru.title || "Событие"}>
        <Link to="/admin/events" className="btn btn-secondary">К списку</Link>
        {!isNew && !readOnly && (
          <Link to={`/admin/events/new?from=${id}`} className="btn btn-secondary">Копировать</Link>
        )}
        {!isNew && form.status === "published" && (
          <a href={`/ru/events/${form.slug}`} target="_blank" rel="noreferrer" className="btn btn-secondary">Открыть на сайте</a>
        )}
        {!readOnly && <button disabled={busy} className="btn btn-primary disabled:opacity-60">{busy ? "Сохраняю…" : "Сохранить"}</button>}
      </PageTitle>

      {msg && <div className="mb-6"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      {readOnly && <div className="mb-6"><Notice>У вашей роли только просмотр.</Notice></div>}

      <fieldset disabled={readOnly} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex gap-1">
              {LOCALES.map((l) => (
                <button key={l.code} type="button" onClick={() => setTab(l.code)}
                  className={`rounded-btn px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] ${tab === l.code ? "bg-coral text-white" : "text-fg-muted hover:text-fg"}`}>
                  {l.label}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              <Field label={`Название${tab === "ru" ? " *" : ""}`}>
                <input className={inputCls} value={tr[tab].title} onChange={(e) => setT("title", e.target.value)} />
              </Field>
              <Field label="Подзаголовок">
                <input className={inputCls} value={tr[tab].subtitle} onChange={(e) => setT("subtitle", e.target.value)} />
              </Field>
              <Field label="Описание">
                <textarea rows={6} className={inputCls} value={tr[tab].description} onChange={(e) => setT("description", e.target.value)} />
              </Field>
              <Field label="Состав / лайнап" hint="Необязательно">
                <textarea rows={2} className={inputCls} value={tr[tab].lineup} onChange={(e) => setT("lineup", e.target.value)} />
              </Field>
              {tab !== "ru" && <p className="text-xs text-fg-subtle">Если перевод пустой, на сайте покажется русский текст.</p>}
            </div>
          </Card>

          <Card>
            <h2 className="mb-1 font-display text-sm font-semibold uppercase text-fg">Билеты</h2>
            <p className="mb-4 text-xs text-fg-subtle">Цены в тенге. «Осталось» пусто — без ограничения. «Цена от» на сайте считается сама.</p>
            <div className="space-y-3">
              {cats.map((k, i) => (
                <div key={k.id ?? i} className="grid grid-cols-2 gap-3 rounded-btn border border-line p-3 sm:grid-cols-[1.4fr_1fr_0.8fr_0.7fr_auto]">
                  <Field label="Название"><input className={inputCls} value={k.name} onChange={(e) => setCat(i, { name: e.target.value })} /></Field>
                  <Field label="Цена, ₸"><input type="number" min={0} className={inputCls} value={k.price} onChange={(e) => setCat(i, { price: e.target.value })} /></Field>
                  <Field label="Осталось"><input type="number" min={0} className={inputCls} value={k.available} onChange={(e) => setCat(i, { available: e.target.value })} /></Field>
                  <Field label="Макс. в заказе"><input type="number" min={1} className={inputCls} value={k.max_per_order} onChange={(e) => setCat(i, { max_per_order: e.target.value })} /></Field>
                  <div className="col-span-2 flex items-end justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end">
                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                      <input type="checkbox" checked={k.is_active} onChange={(e) => setCat(i, { is_active: e.target.checked })} className="accent-[#ff4d4d]" />
                      В продаже
                    </label>
                    <button type="button" className="text-xs text-fg-subtle hover:text-coral"
                      onClick={() => { if (k.id) setRemovedCats((r) => [...r, k.id!]); setCats((l) => l.filter((_, j) => j !== i)); }}>
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-secondary mt-4"
              onClick={() => setCats((l) => [...l, { code: "", name: "", price: "", available: "", max_per_order: "6", is_active: true }])}>
              Добавить тариф
            </button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4">
            <Field label="Статус">
              <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value as Form["status"])}>
                {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Дата и время начала *" hint={`Время площадки (${tz})`}>
              <input type="datetime-local" className={inputCls} value={form.starts} onChange={(e) => set("starts", e.target.value)} />
            </Field>
            <Field label="Открытие дверей">
              <input type="datetime-local" className={inputCls} value={form.doors} onChange={(e) => set("doors", e.target.value)} />
            </Field>
            <Field label="Площадка" hint={venues.length ? undefined : "Сначала добавьте площадку в разделе «Площадки»"}>
              <select className={inputCls} value={form.venue_id} onChange={(e) => set("venue_id", e.target.value)}>
                <option value="">Не выбрана</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.city} · {v.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Жанр">
                <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value as Form["category"])}>
                  {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Возраст">
                <input type="number" min={0} max={21} placeholder="16" className={inputCls} value={form.age_limit} onChange={(e) => set("age_limit", e.target.value)} />
              </Field>
            </div>
            <Field label="Метка на карточке">
              <select className={inputCls} value={form.badge} onChange={(e) => set("badge", e.target.value as Form["badge"])}>
                {Object.entries(badges).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input type="checkbox" checked={form.is_featured} onChange={(e) => set("is_featured", e.target.checked)} className="accent-[#ff4d4d]" />
              Показывать на главной
            </label>
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input type="checkbox" checked={form.is_sold_out} onChange={(e) => set("is_sold_out", e.target.checked)} className="accent-[#ff4d4d]" />
              Билеты распроданы
            </label>
          </Card>

          <Card className="space-y-4">
            <Field label="Афиша" hint="Вертикальная, 4:5, например 1080×1350">
              {form.poster_url && <img src={form.poster_url} alt="" className="mt-2 aspect-[4/5] w-full rounded-btn object-cover" />}
              <input type="file" accept="image/*" className="mt-2 block w-full text-xs text-fg-muted file:mr-3 file:rounded-btn file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-fg"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              {uploading && <span className="mt-1 block text-xs text-fg-subtle">Загружаю…</span>}
            </Field>
            <Field label="Адрес страницы (slug)" hint={`concerts.kz/ru/events/${form.slug || slugify(tr.ru.title) || "…"}`}>
              <input className={inputCls} value={form.slug} placeholder={slugify(tr.ru.title)} onChange={(e) => set("slug", slugify(e.target.value))} />
            </Field>
            <Field label="Внешняя ссылка на билеты" hint="Если заполнить, кнопка «Купить» поведёт туда, а не на оплату на сайте">
              <input className={inputCls} value={form.ticketon_url} placeholder="https://" onChange={(e) => set("ticketon_url", e.target.value)} />
            </Field>
          </Card>

          {!isNew && !readOnly && (
            <button type="button" onClick={remove} className="text-xs text-fg-subtle hover:text-coral">Удалить событие</button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
