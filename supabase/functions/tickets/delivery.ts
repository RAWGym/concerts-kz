// Выдача билетов: данные для страницы билета, QR-картинка и письмо покупателю.
//
// Секреты функции для писем:
//   RESEND_API_KEY=<ключ Resend>
//   MAIL_FROM=Concerts Prod <tickets@concerts.kz>
// Без ключа письмо не отправляется, билеты всё равно есть в личном кабинете.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import qrcode from "npm:qrcode-generator@1.4.4";

const SITE = () => (Deno.env.get("SITE_URL") ?? "https://concerts.kz").replace(/\/$/, "");
const FN = () => (Deno.env.get("PUBLIC_FUNCTION_URL") ?? "").replace(/\/$/, "");

export const SUPPORT = {
  phone: "+7 700 258 62 49",
  email: "barsuklighter@gmail.com",
  organizer: "ИП «BSL Production», БИН 870613300367",
};

export type TicketView = {
  code: string;
  /** sale — купленный, invite — пригласительный (без цены). */
  kind: "sale" | "invite";
  /** valid — действует, used — по нему уже прошли, void — аннулирован. */
  status: "valid" | "used" | "void";
  usedAt: string | null;
  index: number;
  count: number;
  category: string;
  seat: string | null;
  price: number;
  currency: string;
  orderNumber: number;
  purchasedAt: string | null;
  buyer: { name: string; email: string; phone: string };
  event: {
    title: string;
    startsAt: string;
    doorsOpenAt: string | null;
    timezone: string;
    ageLimit: number | null;
    posterUrl: string | null;
    venue: string | null;
    city: string | null;
    address: string | null;
    slug: string;
  };
};

type Row = {
  id: string;
  number: number;
  status: string;
  locale: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  updated_at: string;
  created_at: string;
  currency: string;
  items: { id: string; category_name: string; seat_label: string | null; quantity: number; unit_price: number; ticket_code: string | null }[];
  event: {
    slug: string;
    starts_at: string;
    doors_open_at: string | null;
    age_limit: number | null;
    poster_url: string | null;
    venue: { name: string; city: string; address: string | null; timezone: string } | null;
    translations: { locale: string; title: string }[];
  } | null;
};

const SELECT = `id, number, status, locale, buyer_name, buyer_email, buyer_phone, updated_at, created_at, currency,
  items:order_items ( id, category_name, seat_label, quantity, unit_price, ticket_code ),
  event:events ( slug, starts_at, doors_open_at, age_limit, poster_url,
    venue:venues ( name, city, address, timezone ),
    translations:event_translations ( locale, title ) )`;

/** Билеты оплаченного заказа: каждая единица отдельно, у каждой свой код. */
function expand(o: Row, locale?: string): TicketView[] {
  if (o.status !== "paid" || !o.event) return [];
  const e = o.event;
  const lang = locale ?? o.locale ?? "ru";
  const title = e.translations.find((t) => t.locale === lang)?.title ?? e.translations.find((t) => t.locale === "ru")?.title ?? e.translations[0]?.title ?? e.slug;
  const units: { item: Row["items"][number]; code: string }[] = [];
  for (const item of o.items) {
    if (!item.ticket_code) continue;
    if (item.quantity === 1) units.push({ item, code: item.ticket_code });
    else for (let n = 1; n <= item.quantity; n++) units.push({ item, code: `${item.ticket_code}-${n}` });
  }
  return units.map(({ item, code }, i) => ({
    code,
    kind: "sale" as const,
    status: "valid" as const,
    usedAt: null,
    index: i + 1,
    count: units.length,
    category: item.category_name,
    seat: item.seat_label,
    price: Number(item.unit_price),
    currency: o.currency,
    orderNumber: o.number,
    purchasedAt: o.updated_at ?? o.created_at,
    buyer: { name: o.buyer_name, email: o.buyer_email, phone: o.buyer_phone },
    event: {
      title,
      startsAt: e.starts_at,
      doorsOpenAt: e.doors_open_at,
      timezone: e.venue?.timezone ?? "Asia/Almaty",
      ageLimit: e.age_limit,
      posterUrl: e.poster_url,
      venue: e.venue?.name ?? null,
      city: e.venue?.city ?? null,
      address: e.venue?.address ?? null,
      slug: e.slug,
    },
  }));
}

/** Один билет по коду из QR. Код и есть пропуск, поэтому почту и телефон прячем частично. */
export async function ticketByCode(db: SupabaseClient, raw: string, locale?: string): Promise<TicketView | null> {
  const code = raw.trim().toUpperCase();
  if (!/^[0-9A-F]{12}(-\d{1,3})?$/.test(code)) return null;
  // Состояние на входе (прошёл / аннулирован) ведёт общий список билетов.
  const { data: state } = await db.from("tickets").select("kind, status, used_at").eq("code", code).maybeSingle();
  if (state?.kind === "invite") return inviteByCode(db, code, locale);
  const base = code.slice(0, 12);
  const { data: item } = await db.from("order_items").select("order_id").eq("ticket_code", base).maybeSingle();
  if (!item) return null;
  const { data: order } = await db.from("orders").select(SELECT).eq("id", item.order_id).single();
  const ticket = order ? expand(order as unknown as Row, locale).find((t) => t.code === code) : undefined;
  if (!ticket) return null;
  return {
    ...ticket,
    status: (state?.status as TicketView["status"]) ?? "valid",
    usedAt: state?.used_at ?? null,
    buyer: { ...ticket.buyer, email: maskEmail(ticket.buyer.email), phone: maskPhone(ticket.buyer.phone) },
  };
}

/** Пригласительный: без цены и заказа, имя гостя по желанию. */
async function inviteByCode(db: SupabaseClient, code: string, locale?: string): Promise<TicketView | null> {
  const { data } = await db
    .from("tickets")
    .select(`code, status, used_at, holder_name, holder_phone, created_at,
      event:events ( slug, starts_at, doors_open_at, age_limit, poster_url,
        venue:venues ( name, city, address, timezone ),
        translations:event_translations ( locale, title ) )`)
    .eq("code", code)
    .eq("kind", "invite")
    .maybeSingle();
  const t = data as unknown as {
    code: string; status: TicketView["status"]; used_at: string | null; holder_name: string | null;
    holder_phone: string; created_at: string; event: Row["event"];
  } | null;
  if (!t?.event) return null;
  const e = t.event;
  const lang = locale ?? "ru";
  const title = e.translations.find((x) => x.locale === lang)?.title ?? e.translations.find((x) => x.locale === "ru")?.title ?? e.translations[0]?.title ?? e.slug;
  return {
    code: t.code,
    kind: "invite",
    status: t.status,
    usedAt: t.used_at,
    index: 1,
    count: 1,
    category: lang === "en" ? "Invitation" : lang === "kz" ? "Шақыру билеті" : "Пригласительный",
    seat: null,
    price: 0,
    currency: "KZT",
    orderNumber: 0,
    purchasedAt: t.created_at,
    buyer: { name: t.holder_name ?? "", email: "", phone: maskPhone(t.holder_phone) },
    event: {
      title,
      startsAt: e.starts_at,
      doorsOpenAt: e.doors_open_at,
      timezone: e.venue?.timezone ?? "Asia/Almaty",
      ageLimit: e.age_limit,
      posterUrl: e.poster_url,
      venue: e.venue?.name ?? null,
      city: e.venue?.city ?? null,
      address: e.venue?.address ?? null,
      slug: e.slug,
    },
  };
}

const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, (_m, a, b) => `${a}***${b}`);
const maskPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.length >= 10 ? `+${d.slice(0, 1)} ${d.slice(1, 4)} ***-**-${d.slice(-2)}` : p;
};

/** QR билета картинкой (GIF): для письма, где SVG не показывается. */
export function qrGif(code: string) {
  const qr = qrcode(0, "M");
  qr.addData(code);
  qr.make();
  const url = qr.createDataURL(8, 4);
  return Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
}

/* ---------------- письмо ---------------- */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const money = (n: number, cur: string) => `${new Intl.NumberFormat("ru-RU").format(n)} ${cur === "KZT" ? "₸" : cur}`;

const when = (iso: string, tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: tz, ...opts }).format(new Date(iso));

export const seatText = (seat: string | null) => (seat ? seat.replace(/^table-(\d+)$/, "Стол $1") : "Без места");

function ticketHtml(t: TicketView) {
  const e = t.event;
  const date = when(e.startsAt, e.timezone, { day: "numeric", month: "long", year: "numeric" });
  const time = when(e.startsAt, e.timezone, { hour: "2-digit", minute: "2-digit" });
  const doors = e.doorsOpenAt ? when(e.doorsOpenAt, e.timezone, { hour: "2-digit", minute: "2-digit" }) : null;
  const bought = t.purchasedAt ? when(t.purchasedAt, e.timezone, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const place = [e.city, e.venue, e.address].filter(Boolean).join(", ");
  const fact = (label: string, value: string) =>
    `<td style="padding:6px 0;vertical-align:top;width:50%"><div style="font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#8a8a8a">${label}</div><div style="font-size:14px;color:#0d0d0d;font-weight:600;margin-top:2px">${esc(value)}</div></td>`;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto 28px;border-radius:18px;overflow:hidden;background:#ffffff;border:1px solid #e6e6e6">
  <tr><td style="background:#0d0d0d;padding:18px 24px">
    <table role="presentation" width="100%"><tr>
      <td><img src="${SITE()}/logo-email.png" width="150" alt="Concerts Prod" style="display:block;border:0"></td>
      <td align="right" style="font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:#ff4d4d;font-weight:700">Электронный билет<br><span style="color:#9a9a9a">${t.index} из ${t.count}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#0d0d0d;padding:4px 24px 22px">
    <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#ff4d4d;font-weight:700">${esc(date)} · ${esc(time)}${doors ? ` · вход с ${esc(doors)}` : ""}</div>
    <div style="font-size:26px;line-height:1.15;color:#ffffff;font-weight:800;text-transform:uppercase;margin-top:6px">${esc(e.title)}</div>
    <div style="font-size:13px;color:#bdbdbd;margin-top:6px">${esc(place)}</div>
  </td></tr>
  <tr><td align="center" style="padding:26px 24px 8px">
    <img src="${FN()}/tickets/qr?code=${encodeURIComponent(t.code)}" width="220" height="220" alt="QR ${esc(t.code)}" style="display:block;border:0">
    <div style="font-family:Menlo,Consolas,monospace;font-size:15px;letter-spacing:3px;color:#333;margin-top:10px">${esc(t.code)}</div>
  </td></tr>
  <tr><td style="padding:0 24px"><div style="border-top:2px dashed #e0e0e0;margin:14px 0"></div></td></tr>
  <tr><td style="padding:0 24px 10px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${fact("Тариф", t.category)}${fact("Место", seatText(t.seat))}</tr>
      <tr>${fact("Цена", money(t.price, t.currency))}${fact("Заказ", `№ ${t.orderNumber}`)}</tr>
      <tr>${fact("Покупатель", t.buyer.name)}${fact("Дата покупки", bought)}</tr>
      <tr>${fact("E-mail", t.buyer.email)}${fact("Телефон", t.buyer.phone)}</tr>
      ${e.ageLimit ? `<tr>${fact("Возраст", `${e.ageLimit}+`)}<td></td></tr>` : ""}
    </table>
  </td></tr>
  <tr><td style="padding:6px 24px 20px">
    <a href="${SITE()}/ru/ticket/${encodeURIComponent(t.code)}" style="display:inline-block;background:#ff4d4d;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase;padding:12px 20px;border-radius:999px">Открыть билет</a>
  </td></tr>
  <tr><td style="background:#f4f4f4;padding:16px 24px;font-size:12px;line-height:1.6;color:#555">
    Покажите QR-код на входе с экрана или распечатанным. Один код = один проход, после сканирования он недействителен. Не публикуйте билет в соцсетях.<br>
    <b style="color:#0d0d0d">Поддержка:</b> ${SUPPORT.phone} · <a href="mailto:${SUPPORT.email}" style="color:#ff4d4d">${SUPPORT.email}</a> · <a href="${SITE()}" style="color:#ff4d4d">concerts.kz</a><br>
    <span style="color:#999">Организатор: ${SUPPORT.organizer}</span>
  </td></tr>
</table>`;
}

/** Отправляет билеты оплаченного заказа на почту покупателя (один раз, сразу после оплаты). */
export async function emailTickets(db: SupabaseClient, orderId: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("tickets email skipped: RESEND_API_KEY is not set");
    return false;
  }
  const { data } = await db.from("orders").select(SELECT).eq("id", orderId).single();
  if (!data) return false;
  const order = data as unknown as Row;
  const list = expand(order, "ru");
  if (!list.length) return false;

  const e = list[0].event;
  const html = `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#ececec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<p style="max-width:560px;margin:0 auto 18px;font-size:15px;color:#222">Здравствуйте, ${esc(order.buyer_name)}! Спасибо за покупку. Ваши билеты ниже, они также сохранены в <a href="${SITE()}/ru/account" style="color:#ff4d4d">личном кабинете</a>.</p>
${list.map(ticketHtml).join("")}
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("MAIL_FROM") || "Concerts Prod <tickets@concerts.kz>",
      to: [order.buyer_email],
      reply_to: SUPPORT.email,
      subject: `Билеты: ${e.title}, заказ № ${order.number}`,
      html,
    }),
  });
  if (!res.ok) {
    console.error("tickets email failed", res.status, (await res.text()).slice(0, 500));
    return false;
  }
  return true;
}
