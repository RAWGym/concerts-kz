// Отправка писем через Resend и журнал писем (таблица email_log).
//
// Секреты функции:
//   RESEND_API_KEY=<ключ Resend>
//   MAIL_FROM=Concerts Prod <tickets@concerts.kz>
// Если MAIL_FROM записан с ошибкой, берём адрес по умолчанию, а не теряем письмо.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const SUPPORT = {
  phone: "+7 700 258 62 49",
  email: "barsuklighter@gmail.com",
  organizer: "ИП «BSL Production», БИН 870613300367",
};

export const SITE = () => (Deno.env.get("SITE_URL") ?? "https://concerts.kz").replace(/\/$/, "");

const DEFAULT_FROM = "Concerts Prod <tickets@concerts.kz>";

/** Адрес отправителя в формате, который принимает Resend: «Имя <a@b.c>» или «a@b.c». */
export function mailFrom(raw = Deno.env.get("MAIL_FROM") ?? "") {
  const v = raw.trim().replace(/^["'«]+|["'»]+$/g, "").trim();
  const named = v.match(/^([^<>"]{1,80}?)\s*<\s*([^<>\s@]+@[^<>\s@]+\.[a-z]{2,})\s*>$/i);
  if (named) return `${named[1].trim().replace(/^["']|["']$/g, "")} <${named[2]}>`;
  if (/^[^<>\s@]+@[^<>\s@]+\.[a-z]{2,}$/i.test(v)) return v;
  if (v) console.warn("MAIL_FROM has a wrong format, default sender is used");
  return DEFAULT_FROM;
}

export type Mail = {
  to: string;
  subject: string;
  html: string;
  kind: "tickets" | "upgrade" | "event_change" | "refund" | "deletion_request";
  orderId?: string | null;
  eventId?: string | null;
  mailingId?: string | null;
  refId?: string | null;
};

/** Через сколько повторить письмо после неудачи: 5 минут, потом час, потом сдаёмся. */
const RETRY_AFTER = [5 * 60_000, 60 * 60_000];

async function logRow(db: SupabaseClient, m: Mail) {
  const { data, error } = await db
    .from("email_log")
    .insert({
      kind: m.kind,
      to_email: m.to,
      subject: m.subject.slice(0, 300),
      order_id: m.orderId ?? null,
      event_id: m.eventId ?? null,
      mailing_id: m.mailingId ?? null,
      ref_id: m.refId ?? null,
    })
    .select("id")
    .single();
  // Журнала может не быть (база ещё не обновлена): письмо всё равно уходит.
  if (error) console.warn("email_log insert", error.message);
  return (data?.id as number | undefined) ?? null;
}

async function markRow(db: SupabaseClient, id: number | null, ok: boolean, info: string, attempts: number) {
  if (id === null) return;
  const retry = RETRY_AFTER[attempts - 1];
  await db
    .from("email_log")
    .update(
      ok
        ? { status: "sent", provider_id: info, sent_at: new Date().toISOString(), attempts, error: null, next_try_at: null }
        : { status: "failed", error: info.slice(0, 500), attempts, next_try_at: retry ? new Date(Date.now() + retry).toISOString() : null },
    )
    .eq("id", id);
}

async function resend(path: string, body: unknown) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, info: "RESEND_API_KEY is not set", json: null };
  const res = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch { /* текст ошибки */ }
  return { ok: res.ok, info: res.ok ? text : `${res.status} ${text}`, json };
}

const payload = (m: Mail) => ({
  from: mailFrom(),
  to: [m.to],
  reply_to: SUPPORT.email,
  subject: m.subject,
  html: m.html,
});

/** Одно письмо с записью в журнал. true: Resend принял письмо. */
export async function sendMail(db: SupabaseClient, m: Mail, logId?: number | null, attempt = 1) {
  const id = logId === undefined ? await logRow(db, m) : logId;
  const r = await resend("/emails", payload(m));
  const providerId = (r.json as { id?: string } | null)?.id ?? "";
  if (!r.ok) console.error("mail failed", m.kind, r.info.slice(0, 500));
  await markRow(db, id, r.ok, r.ok ? providerId : r.info, attempt);
  return r.ok;
}

/** Рассылка: пачками по 100 писем (лимит Resend), между пачками пауза. */
export async function sendMany(db: SupabaseClient, mails: Mail[]) {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    const ids = await Promise.all(chunk.map((m) => logRow(db, m)));
    const r = await resend("/emails/batch", chunk.map(payload));
    const data = ((r.json as { data?: { id: string }[] } | null)?.data ?? []) as { id: string }[];
    for (let j = 0; j < chunk.length; j++) {
      await markRow(db, ids[j], r.ok, r.ok ? data[j]?.id ?? "" : r.info, 1);
    }
    if (r.ok) sent += chunk.length;
    else {
      failed += chunk.length;
      console.error("mail batch failed", r.info.slice(0, 500));
    }
    if (i + 100 < mails.length) await new Promise((ok) => setTimeout(ok, 700));
  }
  return { sent, failed };
}

/* ---------------- оформление ---------------- */

export const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const money = (n: number, cur: string) => `${new Intl.NumberFormat("ru-RU").format(n)} ${cur === "KZT" ? "₸" : cur}`;

export const when = (iso: string, tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: tz, ...opts }).format(new Date(iso));

export const dateTime = (iso: string, tz: string) =>
  `${when(iso, tz, { day: "numeric", month: "long", year: "numeric" })}, ${when(iso, tz, { hour: "2-digit", minute: "2-digit" })}`;

export function button(href: string, label: string, dark = false) {
  return `<a href="${href}" style="display:inline-block;background:${dark ? "#0d0d0d" : "#ff4d4d"};color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase;padding:12px 20px;border-radius:999px;margin:4px 8px 4px 0">${label}</a>`;
}

/** Общий макет письма: шапка с событием, текст, подвал с организатором. */
export function letter(o: { eyebrow: string; title: string; place?: string; body: string }) {
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#ececec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;border-radius:18px;overflow:hidden;background:#ffffff;border:1px solid #e6e6e6">
  <tr><td style="background:#0d0d0d;padding:18px 24px">
    <img src="${SITE()}/logo-email.png" width="150" alt="Concerts Prod" style="display:block;border:0">
  </td></tr>
  <tr><td style="background:#0d0d0d;padding:4px 24px 22px">
    <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#ff4d4d;font-weight:700">${esc(o.eyebrow)}</div>
    <div style="font-size:24px;line-height:1.15;color:#ffffff;font-weight:800;text-transform:uppercase;margin-top:6px">${esc(o.title)}</div>
    ${o.place ? `<div style="font-size:13px;color:#bdbdbd;margin-top:6px">${esc(o.place)}</div>` : ""}
  </td></tr>
  <tr><td style="padding:22px 24px;font-size:15px;line-height:1.6;color:#222">${o.body}</td></tr>
  <tr><td style="background:#f4f4f4;padding:16px 24px;font-size:12px;line-height:1.6;color:#555">
    <b style="color:#0d0d0d">Поддержка:</b> ${SUPPORT.phone} · <a href="mailto:${SUPPORT.email}" style="color:#ff4d4d">${SUPPORT.email}</a> · <a href="${SITE()}" style="color:#ff4d4d">concerts.kz</a><br>
    <span style="color:#999">Организатор: ${SUPPORT.organizer}</span>
  </td></tr>
</table>
</body></html>`;
}
