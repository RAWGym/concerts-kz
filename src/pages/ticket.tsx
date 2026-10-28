import { useEffect, useState } from "react";
import { useParams } from "react-router";

import Link from "next/link";
import { QrCode } from "@/components/account/qr-code";
import { Logo } from "@/components/layout/logo";
import { Section } from "@/components/ui/section";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { localePath } from "@/i18n/routing";
import { company } from "@/lib/company";
import { formatEventDate, formatEventTime, formatMoney } from "@/lib/format";
import { getTicket } from "@/lib/tickets/provider";
import type { TicketView } from "@/lib/tickets/types";

const L = {
  ru: {
    eticket: "Электронный билет",
    invite: "Пригласительный билет",
    guest: "Гость",
    issued: "Выписан",
    used: "По этому билету уже прошли",
    voided: "Билет аннулирован и недействителен",
    of: "из",
    category: "Тариф",
    seat: "Место",
    noSeat: "Без места",
    table: "Стол",
    price: "Цена",
    order: "Заказ",
    buyer: "Покупатель",
    bought: "Дата покупки",
    email: "E-mail",
    phone: "Телефон",
    age: "Возраст",
    doors: "вход с",
    rules: "Покажите QR-код на входе с экрана или распечатанным. Один код = один проход, после сканирования он недействителен. Не публикуйте билет в соцсетях.",
    support: "Поддержка",
    organizer: "Организатор",
    print: "Скачать PDF / печать",
    account: "Мои билеты",
    notFound: "Билет не найден. Проверьте ссылку из письма или откройте билет в личном кабинете.",
    loading: "Загружаем билет…",
  },
  kz: {
    eticket: "Электронды билет",
    invite: "Шақыру билеті",
    guest: "Қонақ",
    issued: "Берілген күні",
    used: "Бұл билет бойынша кіріп қойған",
    voided: "Билет жойылған, жарамсыз",
    of: "/",
    category: "Тариф",
    seat: "Орын",
    noSeat: "Орынсыз",
    table: "Үстел",
    price: "Бағасы",
    order: "Тапсырыс",
    buyer: "Сатып алушы",
    bought: "Сатып алған күні",
    email: "E-mail",
    phone: "Телефон",
    age: "Жас шегі",
    doors: "кіру",
    rules: "Кіреберісте QR-кодты экраннан немесе басып шығарып көрсетіңіз. Бір код = бір кіру, сканерлегеннен кейін жарамсыз. Билетті әлеуметтік желіде жарияламаңыз.",
    support: "Қолдау",
    organizer: "Ұйымдастырушы",
    print: "PDF жүктеу / басып шығару",
    account: "Менің билеттерім",
    notFound: "Билет табылмады. Хаттағы сілтемені тексеріңіз немесе жеке кабинеттен ашыңыз.",
    loading: "Билет жүктелуде…",
  },
  en: {
    eticket: "E-ticket",
    invite: "Invitation",
    guest: "Guest",
    issued: "Issued",
    used: "This ticket has already been used",
    voided: "This ticket has been cancelled",
    of: "of",
    category: "Tariff",
    seat: "Seat",
    noSeat: "General admission",
    table: "Table",
    price: "Price",
    order: "Order",
    buyer: "Buyer",
    bought: "Purchased",
    email: "E-mail",
    phone: "Phone",
    age: "Age",
    doors: "doors",
    rules: "Show the QR code at the entrance on screen or printed. One code, one entry: it becomes invalid once scanned. Do not post your ticket on social media.",
    support: "Support",
    organizer: "Organizer",
    print: "Download PDF / print",
    account: "My tickets",
    notFound: "Ticket not found. Check the link from the e-mail or open the ticket in your account.",
    loading: "Loading ticket…",
  },
} satisfies Record<Locale, Record<string, string>>;

/** Отдельная страница билета: открывается из письма и кабинета, печатается в PDF. */
export default function TicketPage() {
  const params = useParams();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const t = L[locale];
  const [ticket, setTicket] = useState<TicketView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!params.code) return;
    getTicket(params.code, locale)
      .then(setTicket)
      .catch(() => setMissing(true));
  }, [params.code, locale]);

  if (!ticket) {
    return (
      <Section>
        <p className="mx-auto max-w-md py-20 text-center text-sm text-fg-muted">{missing ? t.notFound : t.loading}</p>
      </Section>
    );
  }

  return (
    <Section>
      <div className="mx-auto max-w-[760px]">
        <div className="mb-6 flex flex-wrap justify-end gap-3 print:hidden">
          {ticket.kind !== "invite" && (
            <Link href={localePath(locale, "/account")} className="btn btn-secondary">
              {t.account}
            </Link>
          )}
          <button type="button" onClick={() => window.print()} className="btn btn-primary">
            {t.print}
          </button>
        </div>
        <TicketSheet ticket={ticket} locale={locale} />
      </div>
    </Section>
  );
}

export function seatLabel(seat: string | null, locale: Locale) {
  if (!seat) return L[locale].noSeat;
  const m = seat.match(/^table-(\d+)$/);
  return m ? `${L[locale].table} ${m[1]}` : seat;
}

/** Сам билет: фирменная шапка, событие, QR-корешок, данные и правила. */
export function TicketSheet({ ticket, locale }: { ticket: TicketView; locale: Locale }) {
  const t = L[locale];
  const e = ticket.event;
  const date = formatEventDate(e.startsAt, locale, e.timezone);
  const time = formatEventTime(e.startsAt, locale, e.timezone);
  const doors = e.doorsOpenAt ? formatEventTime(e.doorsOpenAt, locale, e.timezone) : null;
  const bought = ticket.purchasedAt
    ? new Intl.DateTimeFormat(locale === "kz" ? "kk-KZ" : locale === "en" ? "en-GB" : "ru-RU", {
        timeZone: e.timezone,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(ticket.purchasedAt))
    : "–";
  const place = [e.city, e.venue, e.address].filter(Boolean).join(" · ");
  const invite = ticket.kind === "invite";
  const stateNote = ticket.status === "used" ? t.used : ticket.status === "void" ? t.voided : null;

  return (
    <article className="ticket-print overflow-hidden rounded-[22px] bg-white text-[#0d0d0d] shadow-[0_30px_80px_-40px_rgba(255,77,77,0.45)] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
      {/* шапка */}
      <header className="relative overflow-hidden bg-[#0d0d0d] px-6 pb-7 pt-5 text-white sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #ff4d4d 0%, transparent 70%)" }}
        />
        <div className="relative flex items-center justify-between gap-4">
          <Logo height={30} />
          <p className="text-right font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ff4d4d]">
            {invite ? t.invite : t.eticket}
            {!invite && (
              <>
                <br />
                <span className="text-white/50">
                  {ticket.index} {t.of} {ticket.count}
                </span>
              </>
            )}
          </p>
        </div>
        <p className="relative mt-7 font-display text-xs font-semibold uppercase tracking-[0.14em] text-[#ff4d4d]">
          {date} · {time}
          {doors && (
            <span className="text-white/60">
              {" "}
              · {t.doors} {doors}
            </span>
          )}
        </p>
        <h1 className="relative mt-2 font-display text-3xl font-bold uppercase leading-[1.05] tracking-[-0.01em] sm:text-4xl">
          {e.title}
        </h1>
        {place && <p className="relative mt-2 text-sm text-white/70">{place}</p>}
      </header>

      <div className="grid sm:grid-cols-[1fr_250px]">
        {/* данные */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-6 py-7 text-sm sm:px-8">
          {stateNote && (
            <p className="col-span-2 rounded-xl bg-[#ff4d4d]/10 px-4 py-3 text-sm font-semibold text-[#d93030]">{stateNote}</p>
          )}
          {invite ? (
            <>
              <Fact label={t.category} value={ticket.category} strong />
              <Fact label={t.guest} value={ticket.buyer.name || "–"} strong />
              <Fact label={t.phone} value={ticket.buyer.phone} />
              <Fact label={t.issued} value={bought} />
            </>
          ) : (
            <>
              <Fact label={t.category} value={ticket.category} strong />
              <Fact label={t.seat} value={seatLabel(ticket.seat, locale)} strong />
              <Fact label={t.price} value={formatMoney(ticket.price, ticket.currency, locale)} />
              <Fact label={t.order} value={`№ ${ticket.orderNumber}`} />
              <Fact label={t.buyer} value={ticket.buyer.name} />
              <Fact label={t.bought} value={bought} />
              <Fact label={t.email} value={ticket.buyer.email} />
              <Fact label={t.phone} value={ticket.buyer.phone} />
            </>
          )}
          {e.ageLimit != null && e.ageLimit > 0 && <Fact label={t.age} value={`${e.ageLimit}+`} />}
        </dl>

        {/* корешок с QR */}
        <div
          className="ticket-notch flex flex-col items-center justify-center border-t-2 border-dashed border-black/10 px-6 py-7 sm:border-l-2 sm:border-t-0"
          style={{ ["--notch-bg" as string]: "var(--color-ink)" }}
        >
          <QrCode value={ticket.code} className="h-48 w-48" />
          <p className="mt-3 font-mono text-sm tracking-[0.2em] text-black/70">{ticket.code}</p>
        </div>
      </div>

      <footer className="bg-[#f4f4f4] px-6 py-5 text-xs leading-5 text-black/60 sm:px-8">
        <p>{t.rules}</p>
        <p className="mt-2">
          <b className="text-[#0d0d0d]">{t.support}:</b> {company.phone} ·{" "}
          <a href={`mailto:${company.email}`} className="text-[#e03a3a]">
            {company.email}
          </a>{" "}
          · concerts.kz
        </p>
        <p className="mt-1 text-black/40">
          {t.organizer}: {company.name}, БИН {company.bin}
        </p>
      </footer>
    </article>
  );
}

function Fact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/45">{label}</dt>
      <dd className={`mt-1 break-words ${strong ? "font-display text-base font-bold uppercase" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
