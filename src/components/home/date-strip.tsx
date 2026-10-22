import Link from "next/link";

import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/routing";
import type { EventCard } from "@/lib/data/types";

const intl = { ru: "ru-RU", kz: "kk-KZ", en: "en-GB" } as const;
const all = { ru: "Все даты", kz: "Барлық күндер", en: "All dates" } as const;

/** Дата события в часовом поясе площадки: «2026-10-24». */
export function localDay(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/**
 * Лента дат на три недели вперёд. Дни с событиями подсвечены
 * точкой и ведут в афишу с фильтром ?date=.
 */
export function DateStrip({ events, locale, days = 21 }: { events: EventCard[]; locale: Locale; days?: number }) {
  const withEvents = new Set(events.map((e) => localDay(e.startsAt, e.timezone)));
  const today = new Date();
  const list = Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { d, key, has: withEvents.has(key), weekend: d.getDay() === 0 || d.getDay() === 6 };
  });
  const month = (d: Date) => new Intl.DateTimeFormat(intl[locale], { month: "long" }).format(d);
  const dow = (d: Date) => new Intl.DateTimeFormat(intl[locale], { weekday: "short" }).format(d).replace(".", "");
  const events_ = localePath(locale, "/events");

  return (
    <div className="flex items-stretch gap-3 rounded-[22px] border border-line bg-surface/50 p-3 sm:p-4">
      <div className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
        {list.map(({ d, key, has, weekend }, i) => {
          const showMonth = i === 0 || d.getDate() === 1;
          return (
            <div key={key} className="relative flex shrink-0 flex-col">
              <span className={`h-5 pl-2 text-[11px] capitalize text-fg-subtle ${showMonth ? "" : "invisible"}`}>{month(d)}</span>
              <Link
                href={`${events_}?date=${key}`}
                aria-label={d.toLocaleDateString(intl[locale])}
                className={`group flex w-12 flex-col items-center rounded-btn py-2 transition-colors sm:w-14 ${
                  i === 0 ? "bg-coral/12" : "hover:bg-surface-2"
                } ${has ? "" : "opacity-60 hover:opacity-100"}`}
              >
                <span className={`font-display text-lg font-semibold leading-none ${i === 0 ? "text-coral" : weekend ? "text-orange" : "text-fg"}`}>
                  {d.getDate()}
                </span>
                <span className={`mt-1 text-[11px] uppercase ${weekend ? "text-orange/80" : "text-fg-subtle"}`}>{dow(d)}</span>
                <span className={`mt-1.5 h-1 w-1 rounded-full ${has ? "bg-coral" : "bg-transparent"}`} />
              </Link>
            </div>
          );
        })}
      </div>
      <Link
        href={events_}
        aria-label={all[locale]}
        title={all[locale]}
        className="flex w-12 shrink-0 items-center justify-center self-center rounded-full border border-line-strong py-3 text-fg-muted transition-colors hover:border-coral hover:text-coral sm:w-14 sm:py-4"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  );
}
