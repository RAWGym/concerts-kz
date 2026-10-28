import { useEffect, useState } from "react";

import { db, type I18n } from "./db";
import { useStaff } from "./layout";
import { useToast } from "./toast";
import { Card, Field, Notice, PageTitle, Spinner, inputCls } from "./ui";

type Contacts = { phone: string; email: string; whatsapp: string; address: I18n };
type Socials = { instagram: string; telegram: string; tiktok: string; youtube: string };
type Announcement = { enabled: boolean; text: I18n; link: string };

const LANGS = ["ru", "kz", "en"] as const;

export default function Settings() {
  const me = useStaff();
  const toast = useToast();
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [socials, setSocials] = useState<Socials>({ instagram: "", telegram: "", tiktok: "", youtube: "" });
  const [ann, setAnn] = useState<Announcement>({ enabled: false, text: {}, link: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db().from("site_settings").select("key, value").then(({ data }) => {
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
      setContacts({ phone: "", email: "", whatsapp: "", address: {}, ...m.contacts });
      setSocials((s) => ({ ...s, ...m.socials }));
      setAnn((a) => ({ ...a, ...m.announcement }));
    });
  }, []);

  if (!me.can("settings")) return <Notice>Раздел доступен сотрудникам с правом «Настройки сайта».</Notice>;
  if (!contacts) return <Spinner />;

  async function save() {
    setBusy(true);
    const { error } = await db().from("site_settings").upsert([
      { key: "contacts", value: contacts, updated_by: me.userId },
      { key: "socials", value: socials, updated_by: me.userId },
      { key: "announcement", value: ann, updated_by: me.userId },
    ]);
    setBusy(false);
    toast(error ? error.message : "Настройки сохранены, на сайте уже видно", error ? "error" : "ok");
  }

  return (
    <>
      <PageTitle title="Настройки сайта">
        <button className="btn btn-primary disabled:opacity-60" disabled={busy} onClick={save}>{busy ? "Сохраняю…" : "Сохранить"}</button>
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="font-display text-sm font-semibold uppercase text-fg">Контакты</h2>
          <p className="text-xs text-fg-subtle">Показываются в подвале и на странице «Контакты».</p>
          <Field label="Телефон"><input className={inputCls} value={contacts.phone} onChange={(e) => setContacts({ ...contacts, phone: e.target.value })} /></Field>
          <Field label="E-mail"><input className={inputCls} value={contacts.email} onChange={(e) => setContacts({ ...contacts, email: e.target.value })} /></Field>
          <Field label="WhatsApp" hint="Номер, например +7 700 000 00 00. Пусто: не показываем"><input className={inputCls} value={contacts.whatsapp} onChange={(e) => setContacts({ ...contacts, whatsapp: e.target.value })} /></Field>
          {LANGS.map((l) => (
            <Field key={l} label={`Адрес (${l.toUpperCase()})`}>
              <input className={inputCls} value={contacts.address[l] ?? ""} onChange={(e) => setContacts({ ...contacts, address: { ...contacts.address, [l]: e.target.value } })} />
            </Field>
          ))}
        </Card>

        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="font-display text-sm font-semibold uppercase text-fg">Соцсети</h2>
            {(Object.keys(socials) as (keyof Socials)[]).map((k) => (
              <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                <input className={inputCls} placeholder="https://" value={socials[k]} onChange={(e) => setSocials({ ...socials, [k]: e.target.value })} />
              </Field>
            ))}
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold uppercase text-fg">Объявление</h2>
              <label className="flex items-center gap-2 text-sm text-fg-muted">
                <input type="checkbox" checked={ann.enabled} onChange={(e) => setAnn({ ...ann, enabled: e.target.checked })} className="accent-[#ff4d4d]" />
                Показывать
              </label>
            </div>
            <p className="text-xs text-fg-subtle">Плашка внизу экрана на всех страницах, например «Старт продаж на фестиваль».</p>
            {LANGS.map((l) => (
              <Field key={l} label={`Текст (${l.toUpperCase()})`}>
                <input className={inputCls} value={ann.text[l] ?? ""} onChange={(e) => setAnn({ ...ann, text: { ...ann.text, [l]: e.target.value } })} />
              </Field>
            ))}
            <Field label="Ссылка" hint="Куда ведёт плашка, например /ru/events/lucaveros-almaty"><input className={inputCls} value={ann.link} onChange={(e) => setAnn({ ...ann, link: e.target.value })} /></Field>
          </Card>
        </div>
      </div>
    </>
  );
}
