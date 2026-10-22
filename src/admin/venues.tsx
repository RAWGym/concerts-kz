import { useEffect, useState } from "react";

import { db, slugify } from "./db";
import { Card, Field, Notice, PageTitle, Spinner, inputCls } from "./ui";

type Venue = { id?: string; slug: string; name: string; city: string; address: string; timezone: string; map_url: string; capacity: string };

const zones = [
  { tz: "Asia/Almaty", label: "Казахстан (UTC+5)" },
  { tz: "Asia/Bishkek", label: "Кыргызстан (UTC+6)" },
  { tz: "Asia/Tashkent", label: "Узбекистан (UTC+5)" },
];

const blank: Venue = { slug: "", name: "", city: "", address: "", timezone: "Asia/Almaty", map_url: "", capacity: "" };

export default function Venues() {
  const [list, setList] = useState<Venue[] | null>(null);
  const [edit, setEdit] = useState<Venue | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function load() {
    const { data } = await db().from("venues").select("*").order("city");
    setList(
      (data ?? []).map((v) => ({
        id: v.id, slug: v.slug, name: v.name, city: v.city, address: v.address ?? "", timezone: v.timezone,
        map_url: v.map_url ?? "", capacity: v.capacity?.toString() ?? "",
      })),
    );
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit) return;
    if (!edit.name.trim() || !edit.city.trim()) return setMsg({ kind: "error", text: "Нужны название и город" });
    const row = {
      slug: edit.slug || slugify(`${edit.name}-${edit.city}`),
      name: edit.name.trim(),
      city: edit.city.trim(),
      address: edit.address.trim() || null,
      timezone: edit.timezone,
      map_url: edit.map_url.trim() || null,
      capacity: edit.capacity ? Number(edit.capacity) : null,
      country_code: edit.timezone === "Asia/Bishkek" ? "KG" : edit.timezone === "Asia/Tashkent" ? "UZ" : "KZ",
    };
    const res = edit.id ? await db().from("venues").update(row).eq("id", edit.id) : await db().from("venues").insert(row);
    if (res.error) return setMsg({ kind: "error", text: res.error.message });
    setMsg({ kind: "ok", text: "Площадка сохранена" });
    setEdit(null);
    load();
  }

  const set = (k: keyof Venue, v: string) => setEdit((e) => (e ? { ...e, [k]: v } : e));

  return (
    <>
      <PageTitle title="Площадки">
        <button className="btn btn-primary" onClick={() => { setEdit({ ...blank }); setMsg(null); }}>Новая площадка</button>
      </PageTitle>
      {msg && <div className="mb-6"><Notice kind={msg.kind}>{msg.text}</Notice></div>}

      {edit && (
        <Card className="mb-8 grid gap-4 sm:grid-cols-2">
          <Field label="Название *"><input className={inputCls} value={edit.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Город *"><input className={inputCls} value={edit.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="Адрес"><input className={inputCls} value={edit.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Часовой пояс">
            <select className={inputCls} value={edit.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {zones.map((z) => <option key={z.tz} value={z.tz}>{z.label}</option>)}
            </select>
          </Field>
          <Field label="Ссылка на карту"><input className={inputCls} value={edit.map_url} placeholder="https://2gis.kz/…" onChange={(e) => set("map_url", e.target.value)} /></Field>
          <Field label="Вместимость"><input type="number" className={inputCls} value={edit.capacity} onChange={(e) => set("capacity", e.target.value)} /></Field>
          <div className="flex gap-3 sm:col-span-2">
            <button className="btn btn-primary" onClick={save}>Сохранить</button>
            <button className="btn btn-secondary" onClick={() => setEdit(null)}>Отмена</button>
          </div>
        </Card>
      )}

      {!list ? <Spinner /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((v) => (
            <Card key={v.id}>
              <p className="font-medium text-fg">{v.name}</p>
              <p className="mt-1 text-sm text-fg-muted">{v.city}{v.address ? `, ${v.address}` : ""}</p>
              <button className="mt-3 text-xs text-coral hover:underline" onClick={() => { setEdit(v); setMsg(null); window.scrollTo({ top: 0 }); }}>Изменить</button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
