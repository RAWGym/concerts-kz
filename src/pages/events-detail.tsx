import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventActions } from "@/components/event/event-actions";
import { EventBadge } from "@/components/event/event-badge";
import { EventPoster } from "@/components/event/event-poster";
import { ExpandableText } from "@/components/event/expandable-text";
import { Reveal } from "@/components/motion/reveal";
import { intlLocale, isLocale, locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getEventBySlug, getEventSlugs } from "@/lib/data/queries";
import {
  formatEventTime,
  formatMoney,
  formatPriceFrom,
} from "@/lib/format";
import { tickets } from "@/lib/tickets/provider";

/** Подписи, которых нет в общем словаре. */
const L: Record<Locale, Record<string, string>> = {
  ru: { home: "Главная", afisha: "Афиша", artist: "Исполнитель", age: "Возраст", date: "Дата", start: "Начало", doors: "Вход", schedule: "Расписание", tickets: "Билеты", more: "Показать полностью", less: "Скрыть", noAge: "Без ограничений", ended: "Событие прошло", reports: "Смотреть фотоотчёты", cancelled: "Концерт отменён", cancelledText: "Мы вернём полную стоимость билетов. Покупателям пришло письмо со ссылкой на заявку о возврате, её же можно открыть в личном кабинете.", postponed: "Концерт перенесён", postponedText: "Купленные билеты действуют на новую дату. Прежняя дата: {old}. Если новая дата не подходит, оформите возврат в личном кабинете до начала концерта." },
  kz: { home: "Басты бет", afisha: "Афиша", artist: "Орындаушы", age: "Жас шегі", date: "Күні", start: "Басталуы", doors: "Кіру", schedule: "Кесте", tickets: "Билеттер", more: "Толық көрсету", less: "Жасыру", noAge: "Шектеусіз", ended: "Іс-шара өтті", reports: "Фотоесептерді қарау", cancelled: "Концерт болдырылмады", cancelledText: "Билеттердің толық құнын қайтарамыз. Сатып алушыларға қайтару өтінімінің сілтемесі бар хат жіберілді, оны жеке кабинеттен де ашуға болады.", postponed: "Концерт ауыстырылды", postponedText: "Сатып алынған билеттер жаңа күнге жарамды. Бұрынғы күні: {old}. Жаңа күн сәйкес келмесе, концерт басталғанға дейін жеке кабинетте қайтаруды рәсімдеңіз." },
  en: { home: "Home", afisha: "Events", artist: "Artist", age: "Age", date: "Date", start: "Starts", doors: "Doors", schedule: "Schedule", tickets: "Tickets", more: "Show more", less: "Hide", noAge: "All ages", ended: "This event has passed", reports: "See photo reports", cancelled: "Concert cancelled", cancelledText: "We'll refund the full ticket price. Buyers received an email with a refund request link; you can also find it in your account.", postponed: "Concert postponed", postponedText: "Tickets you bought are valid for the new date. Original date: {old}. If the new date doesn't suit you, request a refund in your account before the concert starts." },
};

/** «24 октября, суббота» в часовом поясе площадки. */
function dayAndWeekday(iso: string, locale: Locale, timeZone: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat(intlLocale[locale], { day: "numeric", month: "long", timeZone }).format(d);
  const wd = new Intl.DateTimeFormat(intlLocale[locale], { weekday: "long", timeZone }).format(d);
  return { day, wd };
}


export async function generateStaticParams() {
  const slugs = await getEventSlugs();
  return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/events/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

  const event = await getEventBySlug(slug, locale);
  if (!event) return {};

  const title = event.metaTitle ?? event.title;
  const description =
    event.metaDescription ?? event.subtitle ?? event.description ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: localePath(locale, `/events/${slug}`) },
    openGraph: {
      title,
      description,
      type: "article",
      images: event.coverUrl ?? event.posterUrl ?? undefined,
    },
  };
}

export default async function EventPage({
  params,
}: PageProps<"/[locale]/events/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const l = L[locale];
  const event = await getEventBySlug(slug, locale);
  if (!event) notFound();

  const categories = await tickets.getCategories(event, locale).catch(() => []);
  const price = formatPriceFrom(event.priceFrom, event.currency, locale, t.event.priceFrom);
  const buyHref = event.ticketonUrl ?? localePath(locale, `/events/${event.slug}/tickets`);
  const external = Boolean(event.ticketonUrl);
  const { day, wd } = dayAndWeekday(event.startsAt, locale, event.timezone);
  const time = formatEventTime(event.startsAt, locale, event.timezone);
  const where = [event.venueName, event.address, event.city].filter(Boolean).join(", ");
  const mapHref = event.mapUrl ?? (where ? `https://2gis.kz/search/${encodeURIComponent(where)}` : null);
  const artist = event.lineup && event.lineup.length <= 60 && !event.lineup.includes("\n") ? event.lineup : null;

  const facts = [
    { label: l.date, value: `${day}, ${wd}` },
    { label: l.start, value: event.doorsOpenAt ? `${time} · ${l.doors} ${formatEventTime(event.doorsOpenAt, locale, event.timezone)}` : time },
    event.venueName && { label: t.eventPage.venue, value: [event.city, event.venueName].filter(Boolean).join(" · ") },
    artist && { label: l.artist, value: artist },
    event.durationMinutes && { label: t.eventPage.duration, value: `${event.durationMinutes} ${t.eventPage.minutes}` },
    { label: l.age, value: event.ageLimit !== null ? `${event.ageLimit}+` : l.noAge },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  // Через 6 часов после начала событие считаем прошедшим: продажи закрыты.
  const ended = Date.parse(event.startsAt) + 6 * 3600_000 < Date.now();
  const onSale = !event.isSoldOut && !ended;

  const card = "rounded-[20px] border border-line bg-surface p-5 md:p-7";
  const h2 = "font-display text-lg font-semibold uppercase tracking-[-0.01em] text-fg md:text-xl";

  return (
    <>
      {/* ---------- шапка события ---------- */}
      <section className="relative isolate overflow-hidden">
        {/* мягкое свечение от афиши */}
        {event.posterUrl && (
          <img src={event.posterUrl} alt="" aria-hidden className="absolute inset-0 -z-20 h-full w-full scale-125 object-cover opacity-30 blur-[90px]" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/40 via-ink/80 to-ink" />

        <div className="mx-auto max-w-7xl px-4 pb-10 pt-5 sm:px-6 md:pb-14 md:pt-7">
          <nav aria-label="breadcrumbs" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
            <Link href={localePath(locale, "/")} className="inline-flex items-center gap-1.5 transition-colors hover:text-fg">
              <span aria-hidden>←</span> {l.home}
            </Link>
            <Dot />
            <Link href={localePath(locale, "/events")} className="transition-colors hover:text-fg">{l.afisha}</Link>
            <Dot />
            <Link href={`${localePath(locale, "/events")}?category=${event.category}`} className="transition-colors hover:text-fg">
              {t.categories[event.category]}
            </Link>
            <Dot />
            <span className="truncate text-fg">{event.title}</span>
          </nav>

          <Reveal className="mt-6 grid gap-6 md:mt-8 md:grid-cols-[260px_1fr] md:gap-10 lg:grid-cols-[300px_1fr] lg:gap-12">
            <div className="relative mx-auto aspect-[4/5] w-[66%] max-w-[300px] overflow-hidden rounded-[18px] bg-surface shadow-[0_30px_70px_-25px_rgba(0,0,0,0.9)] ring-1 ring-white/10 md:mx-0 md:w-full">
              <EventPoster src={event.posterUrl ?? event.coverUrl} alt={event.title} sizes="300px" priority />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip chip-ghost">{t.categories[event.category]}</span>
                <EventBadge badge={event.badge} t={t} />
              </div>

              <h1 className="mt-4 font-display text-[34px] font-bold uppercase leading-[1] tracking-[-0.02em] text-fg md:text-5xl lg:text-6xl">
                {event.title}
              </h1>
              {event.subtitle && (
                <p className="mt-3 max-w-2xl text-base leading-7 text-fg-muted md:text-lg">{event.subtitle}</p>
              )}
              {event.changeKind && !ended && (
                <div className={`mt-5 max-w-2xl rounded-[14px] border px-4 py-3 text-sm leading-6 ${event.changeKind === "cancelled" ? "border-coral/60 bg-coral/10" : "border-orange/60 bg-orange/10"}`}>
                  <p className="font-display font-semibold uppercase tracking-[0.04em] text-fg">{event.changeKind === "cancelled" ? l.cancelled : l.postponed}</p>
                  <p className="mt-1 text-fg-muted">
                    {event.changeKind === "cancelled"
                      ? l.cancelledText
                      : l.postponedText.replace("{old}", event.originalStartsAt ? `${dayAndWeekday(event.originalStartsAt, locale, event.timezone).day}, ${formatEventTime(event.originalStartsAt, locale, event.timezone)}` : "–")}
                  </p>
                  <Link href={localePath(locale, "/account")} className="mt-2 inline-block text-xs font-semibold text-coral hover:underline">{t.checkout.myTickets} →</Link>
                </div>
              )}

              <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-3">
                {facts.map((fact) => (
                  <div key={fact.label} className="bg-ink/90 px-4 py-3.5 backdrop-blur">
                    <dt className="text-xs text-fg-subtle">{fact.label}</dt>
                    <dd className="mt-1 text-sm font-medium leading-5 text-fg first-letter:uppercase">{fact.value}</dd>
                  </div>
                ))}
              </dl>

              {/* цены по тарифам */}
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                {ended ? (
                  <>
                    <span className="btn btn-secondary cursor-default opacity-70">{l.ended}</span>
                    <Link href={localePath(locale, "/reports")} className="btn btn-primary">{l.reports}</Link>
                  </>
                ) : event.isSoldOut ? (
                  <span className="btn btn-secondary cursor-default opacity-70">{event.changeKind === "cancelled" ? l.cancelled : t.actions.soldOut}</span>
                ) : (
                  <>
                    <Link href={buyHref} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="btn btn-primary">
                      {t.actions.buyTicket}
                    </Link>
                    {categories.map((c) => (
                      <Link
                        key={c.id}
                        href={buyHref}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noreferrer" : undefined}
                        className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-ink/60 px-4 py-2.5 text-sm text-fg transition-colors hover:border-coral hover:text-coral"
                      >
                        <span className="text-fg-muted">{c.name}</span>
                        <span className="font-semibold">{formatMoney(c.price, c.currency, locale)}</span>
                      </Link>
                    ))}
                    {!categories.length && price && <span className="text-sm text-fg-muted">{price}</span>}
                  </>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Липкая панель покупки на телефоне: кнопка всегда под пальцем. */}
      {onSale && (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/85 backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-display text-xs font-semibold uppercase text-fg">{event.title}</p>
              {price && <p className="text-xs text-fg-muted">{price}</p>}
            </div>
            <Link href={buyHref} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="btn btn-primary shrink-0 !px-5 !py-3">
              {t.actions.buyTicket}
            </Link>
          </div>
        </div>
      )}

      {/* ---------- карточки ---------- */}
      <div className={`mx-auto grid max-w-7xl gap-5 px-4 ${onSale ? "pb-28" : "pb-16"} sm:px-6 md:pb-20 lg:grid-cols-[1fr_340px] lg:gap-6`}>
        <div className="min-w-0 space-y-5">
          {/* расписание */}
          <section className={card}>
            <h2 className={h2}>{l.schedule}</h2>
            <div className="mt-5 rounded-[16px] border border-line bg-ink/60 p-4 md:p-5">
              <p className="font-display text-base font-semibold text-fg md:text-lg">
                {day}, <span className="text-fg-muted">{wd}</span>
              </p>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {event.venueName && (
                    mapHref ? (
                      <a href={mapHref} target="_blank" rel="noreferrer" className="font-medium text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:text-coral hover:decoration-coral">
                        {event.venueName}
                      </a>
                    ) : (
                      <p className="font-medium text-fg">{event.venueName}</p>
                    )
                  )}
                  {(event.address || event.city) && (
                    <p className="mt-1 text-sm text-fg-muted">{[event.city, event.address].filter(Boolean).join(", ")}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="rounded-full border border-line-strong px-4 py-2.5 font-display text-sm font-semibold text-fg">{time}</span>
                  {onSale ? (
                    <Link href={buyHref} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-coral-hover">
                      {price ?? t.actions.buyTicket}
                    </Link>
                  ) : (
                    <span className="rounded-full bg-surface-2 px-5 py-2.5 text-sm text-fg-muted">{ended ? l.ended : t.actions.soldOut}</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {event.description && (
            <section className={card}>
              <h2 className={h2}>{t.eventPage.about}</h2>
              <div className="mt-4">
                <ExpandableText text={event.description} more={l.more} less={l.less} lines={5} />
              </div>
            </section>
          )}

          {event.lineup && !artist && (
            <section className={card}>
              <h2 className={h2}>{t.eventPage.lineup}</h2>
              <p className="mt-4 whitespace-pre-line text-[15px] leading-7 text-fg-muted">{event.lineup}</p>
            </section>
          )}

          {event.faq.length > 0 && (
            <section className={card}>
              <h2 className={h2}>{t.eventPage.faq}</h2>
              <div className="mt-3 divide-y divide-line">
                {event.faq.map((item) => (
                  <details key={item.q} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-fg [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong text-fg-muted transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="mt-3 text-sm leading-6 text-fg-muted">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ---------- покупка ---------- */}
        <aside className="h-fit space-y-5 lg:sticky lg:top-24">
          {onSale && (
            <section className={`${card} hidden md:block`}>
              <h2 className={h2}>{l.tickets}</h2>
              {categories.length > 0 && (
                <ul className="mt-4 divide-y divide-line">
                  {categories.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <span className="text-fg-muted">{c.name}</span>
                      <span className="font-semibold text-fg">{formatMoney(c.price, c.currency, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={buyHref} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="btn btn-primary mt-5 w-full">
                {t.actions.buyTicket}
              </Link>
            </section>
          )}
          <section className={card}>
            <EventActions event={event} locale={locale} className="space-y-2" />
          </section>
        </aside>
      </div>
    </>
  );
}

function Dot() {
  return <span aria-hidden className="h-1 w-1 rounded-full bg-fg-subtle" />;
}
