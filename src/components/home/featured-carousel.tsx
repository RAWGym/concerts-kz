import { motion } from "framer-motion";
import Link from "next/link";
import { useRef, useState } from "react";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import type { EventCard } from "@/lib/data/types";
import { formatEventDateTime, formatPriceFrom } from "@/lib/format";

/**
 * Карусель главных событий. Каждая карточка: размытая афиша фоном,
 * чёткая афиша сбоку и текст с кнопкой. Одно событие занимает всю
 * ширину, несколько листаются стрелками и свайпом.
 */
export function FeaturedCarousel({ events, locale, t }: { events: EventCard[]; locale: Locale; t: Dictionary }) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: events.length <= 1 });
  const single = events.length === 1;

  function onScroll() {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }

  function scroll(dir: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-card]");
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? el.clientWidth) + 16), behavior: "smooth" });
  }

  if (!events.length) return null;

  return (
    <div className="relative">
      <div
        ref={track}
        onScroll={onScroll}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6"
      >
        {events.map((e, i) => (
          <motion.div
            key={e.id}
            data-card
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            className={`snap-start ${single ? "w-full shrink-0" : "w-[86%] shrink-0 sm:w-[70%] xl:w-[calc(50%-8px)]"}`}
          >
            <Slide event={e} locale={locale} t={t} wide={single} />
          </motion.div>
        ))}
      </div>

      {!single && (
        <>
          <Arrow dir={-1} hidden={edge.start} onClick={() => scroll(-1)} />
          <Arrow dir={1} hidden={edge.end} onClick={() => scroll(1)} />
        </>
      )}
    </div>
  );
}

function Arrow({ dir, hidden, onClick }: { dir: 1 | -1; hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 1 ? "Дальше" : "Назад"}
      className={`absolute top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-ink/80 text-fg shadow-lg backdrop-blur transition-[opacity,background-color] hover:bg-coral hover:text-white md:flex ${
        dir === 1 ? "-right-3" : "-left-3"
      } ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
        <path d={dir === 1 ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
      </svg>
    </button>
  );
}

function Slide({ event, locale, t, wide }: { event: EventCard; locale: Locale; t: Dictionary; wide: boolean }) {
  const details = localePath(locale, `/events/${event.slug}`);
  const buy = event.isSoldOut ? null : (event.ticketonUrl ?? localePath(locale, `/events/${event.slug}/tickets`));
  const price = formatPriceFrom(event.priceFrom, event.currency, locale, t.event.priceFrom);
  const place = [event.city, event.venueName].filter(Boolean).join(" · ");

  return (
    <article className={`group relative isolate overflow-hidden rounded-[22px] border border-line bg-surface ${wide ? "md:h-[440px]" : "md:h-[380px]"}`}>
      {/* размытая афиша фоном */}
      {event.posterUrl && (
        <img src={event.posterUrl} alt="" aria-hidden className="absolute inset-0 -z-20 h-full w-full scale-125 object-cover opacity-50 blur-3xl" />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/80 to-ink/20" />

      <div className="flex h-full flex-col-reverse md:flex-row">
        <div className="flex flex-1 flex-col justify-end p-5 sm:p-7 md:p-9">
          {event.badge && event.badge !== "none" && (
            <span className="mb-4 w-fit rounded-full bg-coral px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
              {t.badges[event.badge as keyof typeof t.badges] ?? event.badge}
            </span>
          )}
          <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-coral">
            {formatEventDateTime(event.startsAt, locale, event.timezone)}
          </p>
          <h2 className={`mt-3 font-display font-bold uppercase leading-[0.98] tracking-[-0.02em] text-fg ${wide ? "text-4xl md:text-6xl" : "text-3xl md:text-4xl"}`}>
            <Link href={details} className="transition-colors hover:text-coral">{event.title}</Link>
          </h2>
          {event.subtitle && <p className="mt-3 max-w-md text-sm leading-6 text-fg-muted md:text-base">{event.subtitle}</p>}
          {place && <p className="mt-2 text-sm text-fg-muted">{place}</p>}

          {price && !event.isSoldOut && (
            <p className="mt-5 font-display text-lg font-semibold text-fg">{price}</p>
          )}
          <div className={`flex flex-wrap items-center gap-2.5 ${price && !event.isSoldOut ? "mt-3" : "mt-6"}`}>
            {buy ? (
              <Link href={buy} className="btn btn-primary">{t.actions.buyTicket}</Link>
            ) : (
              <span className="btn btn-secondary cursor-default opacity-70">{t.actions.soldOut}</span>
            )}
            {wide ? (
              <Link href={details} className="btn btn-secondary">{t.actions.details}</Link>
            ) : (
              <Link
                href={details}
                aria-label={t.actions.details}
                title={t.actions.details}
                className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-line-strong text-fg transition-colors hover:border-coral hover:text-coral"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            )}
          </div>
        </div>

        {/* чёткая афиша */}
        <Link href={details} className="relative block shrink-0 p-4 pb-0 md:h-full md:p-6 md:pl-0">
          <div className="relative mx-auto aspect-[4/5] w-[62%] overflow-hidden rounded-card shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/10 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-rotate-1 group-hover:scale-[1.02] md:h-full md:w-auto">
            {event.posterUrl ? (
              <img src={event.posterUrl} alt={event.title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-surface-2" />
            )}
          </div>
        </Link>
      </div>
    </article>
  );
}
