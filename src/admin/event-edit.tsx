import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { adminApi, db, formatDateTime, fromLocalInput, slugify, toLocalInput } from "./db";
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
type Cat = { id?: string; code: string; name: string; price: string; available: string; max_per_order: string; is_active: boolean; upgrade_to: string[] };

const codeOf = (k: Cat, i: number) => k.code.trim() || slugify(k.name) || `cat-${i + 1}`;

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
  sales_closed: boolean;
  ticketon_url: string;
  upgrades_enabled: boolean;
};

type ChangeInfo = {
  change_kind: "postponed" | "cancelled" | null;
  change_note: string | null;
  original_starts_at: string | null;
  changed_at: string | null;
  deleted_at: string | null;
  deleted_by_name: string | null;
};

const emptyTr: Tr = { title: "", subtitle: "", description: "", lineup: "" };

export default function EventEdit() {
  const { id } = useParams();
  const isNew = id === "new";
  const staff = useStaff();
  const [sold, setSold] = useState(0);
  const [change, setChange] = useState<ChangeInfo | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<{ id: string; reason: string; requested_by_name: string | null; expires_at: string } | null>(null);
  const [dialog, setDialog] = useState<"postponed" | "cancelled" | "delete" | null>(null);
  const lockedBySales = !isNew && sold > 0 && !staff.can("events.edit_sold");
  const readOnly = !staff.can("events.edit") || lockedBySales || Boolean(change?.deleted_at);
  const canUpgrades = staff.can("events.upgrades");
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
        poster_url: "", currency: "KZT", badge: "none", is_featured: false, is_sold_out: false, sales_closed: false, ticketon_url: "", upgrades_enabled: false,
      });
      setCats([{ code: "standard", name: "Стандартный", price: "", available: "", max_per_order: "6", is_active: true, upgrade_to: [] }]);
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
          badge: e.badge, is_featured: e.is_featured, is_sold_out: e.is_sold_out, sales_closed: Boolean(e.sales_closed), ticketon_url: e.ticketon_url ?? "",
          upgrades_enabled: copyFrom ? false : Boolean(e.upgrades_enabled),
        });
        if (!copyFrom) {
          setChange({
            change_kind: e.change_kind ?? null, change_note: e.change_note ?? null, original_starts_at: e.original_starts_at ?? null,
            changed_at: e.changed_at ?? null, deleted_at: e.deleted_at ?? null, deleted_by_name: e.deleted_by_name ?? null,
          });
        }
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
              upgrade_to: copyFrom ? [] : (k.upgrade_to ?? []),
            })),
        );
      });
    if (!copyFrom) {
      c.rpc("event_sold_count", { p_event: id }).then(({ data }) => setSold(Number(data ?? 0)));
      loadDeletion();
    }
  }, [id, isNew, copyFrom]);

  function loadDeletion() {
    if (isNew || !staff.can("events.delete", "events.delete_confirm")) return;
    db().from("event_deletion_requests").select("id, reason, requested_by_name, expires_at")
      .eq("event_id", id).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle()
      .then(({ data }) => setPendingDeletion(data));
  }

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
      sales_closed: form.sales_closed,
      ticketon_url: form.ticketon_url || null,
      ...(canUpgrades ? { upgrades_enabled: form.upgrades_enabled } : {}),
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
    const codes = new Set(cats.map(codeOf));
    const catRows = cats
      .filter((k) => k.name.trim() && k.price !== "")
      .map((k, i) => ({
        ...(k.id ? { id: k.id } : {}),
        event_id: eventId,
        code: codeOf(k, i),
        ...(canUpgrades ? { upgrade_to: k.upgrade_to.filter((c) => codes.has(c) && c !== codeOf(k, i)) } : {}),
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
    if (sold > 0) return setDialog("delete");
    if (!confirm("Удалить событие? Это нельзя отменить. Чтобы просто скрыть его, поставьте статус «Архив».")) return;
    const { error } = await db().from("events").delete().eq("id", id);
    if (!error) return navigate("/admin/events");
    // Были оплаты (даже возвращённые): удаление только через подтверждение.
    if (error.code === "42501" && /подтверждени/.test(error.message)) return setDialog("delete");
    setMsg({ kind: "error", text: error.message });
  }

  async function cancelDeletion() {
    if (!pendingDeletion) return;
    const { error } = await db().rpc("decide_event_deletion", { p_request: pendingDeletion.id, p_approve: false, p_note: "Отозван автором" });
    if (error) return setMsg({ kind: "error", text: error.message });
    toast("Запрос отозван");
    setPendingDeletion(null);
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
      {change?.deleted_at && (
        <div className="mb-6"><Notice kind="error">Событие удалено {formatDateTime(change.deleted_at)}{change.deleted_by_name ? ` (подтвердил ${change.deleted_by_name})` : ""}. Оно скрыто с сайта, данные о продажах сохранены.</Notice></div>
      )}
      {change?.change_kind === "cancelled" && !change.deleted_at && (
        <div className="mb-6"><Notice kind="error">Событие отменено {change.changed_at ? formatDateTime(change.changed_at) : ""}. Покупатели получили письмо со ссылкой на возврат. Заявки видны в разделе «Возвраты».</Notice></div>
      )}
      {change?.change_kind === "postponed" && (
        <div className="mb-6"><Notice>Событие перенесено{change.original_starts_at ? ` с ${formatDateTime(change.original_starts_at, tz)}` : ""}. Покупатели получили письмо, заявки на возврат принимаются до начала концерта.</Notice></div>
      )}
      {pendingDeletion && (
        <div className="mb-6">
          <Notice>
            Запрос на удаление ждёт подтверждения владельца до {formatDateTime(pendingDeletion.expires_at)}. Автор: {pendingDeletion.requested_by_name ?? "сотрудник"}. Причина: {pendingDeletion.reason}.{" "}
            {staff.can("events.delete_confirm") && <Link to="/admin/approvals" className="text-coral hover:underline">Рассмотреть</Link>}
            <button type="button" onClick={cancelDeletion} className="ml-3 text-coral hover:underline">Отозвать</button>
          </Notice>
        </div>
      )}
      {sold > 0 && (
        <div className="mb-6">
          <Notice kind={lockedBySales ? "error" : "info"}>
            На событие продано билетов: {sold}.{" "}
            {lockedBySales
              ? "Менять его может владелец, тех. специалист или администратор."
              : "Дату меняйте кнопкой «Перенести»: так покупатели получат письмо. Тариф с продажами нельзя удалить, только снять с продажи."}
          </Notice>
        </div>
      )}
      {!staff.can("events.edit") && <div className="mb-6"><Notice>У вашей должности только просмотр.</Notice></div>}

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
            <p className="mb-4 text-xs text-fg-subtle">Цены в тенге. «Осталось» пусто: без ограничения. «Цена от» на сайте считается сама.</p>
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
              onClick={() => setCats((l) => [...l, { code: "", name: "", price: "", available: "", max_per_order: "6", is_active: true, upgrade_to: [] }])}>
              Добавить тариф
            </button>
          </Card>

          <Card>
            <h2 className="mb-1 font-display text-sm font-semibold uppercase text-fg">Апгрейд билетов</h2>
            <p className="mb-4 text-xs text-fg-subtle">
              Покупатель в личном кабинете меняет билет на тариф выше и доплачивает разницу: текущая цена нового тарифа минус то, что он заплатил.
              Доступно до открытия входа. Места за столами не улучшаются.
            </p>
            <fieldset disabled={!canUpgrades} className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input type="checkbox" checked={form.upgrades_enabled} onChange={(e) => set("upgrades_enabled", e.target.checked)} className="accent-[#ff4d4d]" />
                Разрешить апгрейд
              </label>
              {form.upgrades_enabled && (
                <div className="space-y-3">
                  {cats.filter((k) => k.name.trim()).map((k, i) => {
                    const targets = cats.filter((t) => t !== k && t.name.trim() && Number(t.price) > Number(k.price));
                    return (
                      <div key={k.id ?? i} className="rounded-btn border border-line p-3">
                        <p className="text-sm text-fg">{k.name} <span className="text-fg-subtle">· {k.price || 0} ₸</span></p>
                        {targets.length === 0 ? (
                          <p className="mt-1 text-xs text-fg-subtle">Нет тарифов дороже</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                            {targets.map((t) => {
                              const code = codeOf(t, cats.indexOf(t));
                              const on = k.upgrade_to.includes(code);
                              return (
                                <label key={code} className="flex items-center gap-2 text-xs text-fg-muted">
                                  <input type="checkbox" className="accent-[#ff4d4d]" checked={on}
                                    onChange={(e) => setCat(cats.indexOf(k), { upgrade_to: e.target.checked ? [...k.upgrade_to, code] : k.upgrade_to.filter((c) => c !== code) })} />
                                  до «{t.name}» (+{Math.max(0, Number(t.price) - Number(k.price))} ₸)
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!canUpgrades && <p className="text-xs text-fg-subtle">Апгрейды настраивает сотрудник с правом «Настройка апгрейдов».</p>}
            </fieldset>
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
              <input type="datetime-local" disabled={sold > 0} className={inputCls} value={form.starts} onChange={(e) => set("starts", e.target.value)} />
            </Field>
            <Field label="Открытие дверей">
              <input type="datetime-local" disabled={sold > 0} className={inputCls} value={form.doors} onChange={(e) => set("doors", e.target.value)} />
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
            <label className="flex items-start gap-2 text-sm text-fg-muted">
              <input type="checkbox" checked={form.sales_closed} onChange={(e) => set("sales_closed", e.target.checked)} className="mt-1 accent-[#ff4d4d]" />
              <span>
                Продажи закрыты
                <span className="block text-[11px] text-fg-subtle">
                  Событие на сайте, купить нельзя. С меткой «Скоро» покупатели видят «Продажи скоро откроются».
                </span>
              </span>
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

        </div>
      </fieldset>

      {!isNew && !change?.deleted_at && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {staff.can("events.postpone") && change?.change_kind !== "cancelled" && (
            <button type="button" className="btn btn-secondary" onClick={() => setDialog("postponed")}>Перенести</button>
          )}
          {staff.can("events.cancel") && change?.change_kind !== "cancelled" && (
            <button type="button" className="btn btn-secondary" onClick={() => setDialog("cancelled")}>Отменить событие</button>
          )}
          {staff.can("events.delete") && !pendingDeletion && (
            <button type="button" onClick={remove} className="ml-auto text-xs text-fg-subtle hover:text-coral">Удалить событие</button>
          )}
        </div>
      )}

      {(dialog === "postponed" || dialog === "cancelled") && (
        <ChangeDialog eventId={id!} kind={dialog} tz={tz} sold={sold} onClose={() => setDialog(null)}
          onDone={(text) => { setDialog(null); toast(text); window.location.reload(); }} />
      )}
      {dialog === "delete" && (
        <DeleteDialog eventId={id!} cancelled={change?.change_kind === "cancelled"} sold={sold} onClose={() => setDialog(null)}
          onDone={(text) => { setDialog(null); toast(text); loadDeletion(); }} />
      )}
    </form>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-line bg-ink-deep p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 font-display text-lg font-bold uppercase text-fg">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Перенос или отмена: меняет событие и рассылает письма покупателям. */
function ChangeDialog({ eventId, kind, tz, sold, onClose, onDone }: {
  eventId: string; kind: "postponed" | "cancelled"; tz: string; sold: number; onClose: () => void; onDone: (text: string) => void;
}) {
  const [starts, setStarts] = useState("");
  const [doors, setDoors] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const postpone = kind === "postponed";

  const body = (test: boolean) => ({
    kind, test, message,
    startsAt: postpone ? fromLocalInput(starts, tz) : null,
    doorsAt: postpone ? fromLocalInput(doors, tz) : null,
  });

  async function send(test: boolean) {
    setErr(null);
    setNote(null);
    if (postpone && !starts) return setErr("Укажите новую дату и время");
    if (!test && !confirm(postpone
      ? `Перенести событие и отправить письмо покупателям (${sold} билетов)?`
      : `Отменить событие? Оно останется на сайте с пометкой «Отменено», продажа закроется, покупатели получат письмо о возврате денег. Это нельзя отменить.`)) return;
    setBusy(true);
    try {
      const res = await adminApi<{ recipients: number; sent: number; failed: number }>(`/events/${eventId}/change`, body(test));
      if (test) setNote(res.sent ? "Тестовое письмо отправлено вам на почту" : "Тестовое письмо не отправилось");
      else onDone(`${postpone ? "Событие перенесено" : "Событие отменено"}. Писем: ${res.sent} из ${res.recipients}${res.failed ? `, не ушло ${res.failed} (повторим автоматически)` : ""}`);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Modal title={postpone ? "Перенос события" : "Отмена события"} onClose={onClose}>
      <div className="space-y-4">
        {postpone ? (
          <>
            <Field label="Новая дата и время начала *" hint={`Время площадки (${tz})`}>
              <input type="datetime-local" className={inputCls} value={starts} onChange={(e) => setStarts(e.target.value)} />
            </Field>
            <Field label="Открытие входа">
              <input type="datetime-local" className={inputCls} value={doors} onChange={(e) => setDoors(e.target.value)} />
            </Field>
          </>
        ) : (
          <p className="text-sm text-fg-muted">Продажа закроется. Покупатели получат письмо со ссылкой на заявку о возврате полной стоимости.</p>
        )}
        <Field label="Сообщение покупателям" hint="Необязательно. Появится в письме отдельным абзацем">
          <textarea rows={3} maxLength={1000} className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <p className="text-xs text-fg-subtle">
          Письмо получат все, у кого есть действующие билеты. В нём ссылка на заявку о возврате по Закону РК «О защите прав потребителей».
        </p>
        {err && <Notice kind="error">{err}</Notice>}
        {note && <Notice kind="ok">{note}</Notice>}
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} className="btn btn-primary disabled:opacity-60" onClick={() => send(false)}>
            {busy ? "Отправляю…" : postpone ? "Перенести и разослать" : "Отменить и разослать"}
          </button>
          <button type="button" disabled={busy} className="btn btn-secondary" onClick={() => send(true)}>Тест себе</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </Modal>
  );
}

/** Удаление события с продажами: только запрос, его подтверждает владелец. */
function DeleteDialog({ eventId, cancelled, sold, onClose, onDone }: {
  eventId: string; cancelled: boolean; sold: number; onClose: () => void; onDone: (text: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const blocked = !cancelled && sold > 0;

  async function submit() {
    setErr(null);
    setBusy(true);
    const { data, error } = await db().rpc("request_event_deletion", { p_event: eventId, p_reason: reason });
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    const sent = await adminApi<{ sent: number }>(`/deletion-requests/${data}/notify`).then((r) => r.sent, () => 0);
    setBusy(false);
    onDone(`Запрос отправлен на подтверждение${sent ? ` (писем: ${sent})` : ""}`);
  }

  return (
    <Modal title="Удаление события с продажами" onClose={onClose}>
      <div className="space-y-4 text-sm text-fg-muted">
        <p>По событию были оплаты, поэтому удалить его сразу нельзя. Удаление подтверждает владелец (не автор запроса) в течение 48 часов. Событие уйдёт в архив, данные о продажах и деньгах сохранятся.</p>
        {blocked && (
          <Notice kind="error">
            Сейчас действующих билетов: {sold}. Подтвердить удаление можно только после отмены события (кнопка «Отменить событие») или когда все билеты возвращены.
          </Notice>
        )}
        <Field label="Причина *">
          <textarea rows={3} maxLength={500} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {err && <Notice kind="error">{err}</Notice>}
        <div className="flex gap-3">
          <button type="button" disabled={busy || reason.trim().length < 3} className="btn btn-primary disabled:opacity-60" onClick={submit}>
            {busy ? "Отправляю…" : "Запросить удаление"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </Modal>
  );
}
