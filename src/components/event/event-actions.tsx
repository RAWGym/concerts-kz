import { useState } from "react";

import type { Locale } from "@/i18n/config";
import type { EventDetail } from "@/lib/data/types";

/**
 * Кнопки на странице события: добавить в календарь, поделиться,
 * открыть на карте. Подписи свои, чтобы не трогать общий словарь.
 */

const L = {
  ru: { calendar: "В календарь", google: "Google Календарь", ics: "Apple / Outlook (.ics)", share: "Поделиться", copied: "Ссылка скопирована", map: "Открыть в 2ГИС" },
  kz: { calendar: "Күнтізбеге", google: "Google Күнтізбе", ics: "Apple / Outlook (.ics)", share: "Бөлісу", copied: "Сілтеме көшірілді", map: "2ГИС-те ашу" },
  en: { calendar: "Add to calendar", google: "Google Calendar", ics: "Apple / Outlook (.ics)", share: "Share", copied: "Link copied", map: "Open in 2GIS" },
} as const;

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function endOf(event: EventDetail) {
  const minutes = event.durationMinutes ?? 180;
  return new Date(Date.parse(event.startsAt) + minutes * 60000).toISOString();
}

export function EventActions({ event, locale }: { event: EventDetail; locale: Locale }) {
  const l = L[locale];
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const url = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
  const where = [event.venueName, event.address, event.city].filter(Boolean).join(", ");

  const google =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(event.title)}` +
    `&dates=${stamp(event.startsAt)}/${stamp(endOf(event))}` +
    `&location=${encodeURIComponent(where)}` +
    `&details=${encodeURIComponent(url)}`;

  function downloadIcs() {
    const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//concerts.kz//RU", "BEGIN:VEVENT",
      `UID:${event.id}@concerts.kz`, `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(event.startsAt)}`, `DTEND:${stamp(endOf(event))}`,
      `SUMMARY:${esc(event.title)}`, `LOCATION:${esc(where)}`, `URL:${url}`, `DESCRIPTION:${esc(url)}`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = `${event.slug}.ics`;
    a.click();
    URL.revokeObjectURL(href);
    setOpen(false);
  }

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNote(l.copied);
      setTimeout(() => setNote(null), 2500);
    } catch {
      /* пользователь закрыл окно */
    }
  }

  const mapHref = event.mapUrl ?? (where ? `https://2gis.kz/search/${encodeURIComponent(where)}` : null);
  const btn = "flex w-full items-center justify-between rounded-btn border border-line-strong px-4 py-2.5 text-sm text-fg transition-colors hover:border-coral hover:text-coral";

  return (
    <div className="mt-6 space-y-2 border-t border-line pt-5">
      <div className="relative">
        <button type="button" className={btn} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {l.calendar} <span aria-hidden>{open ? "−" : "+"}</span>
        </button>
        {open && (
          <div className="mt-2 space-y-1 rounded-btn border border-line bg-surface p-1">
            <a href={google} target="_blank" rel="noreferrer" className="block rounded-btn px-3 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg" onClick={() => setOpen(false)}>{l.google}</a>
            <button type="button" onClick={downloadIcs} className="block w-full rounded-btn px-3 py-2 text-left text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">{l.ics}</button>
          </div>
        )}
      </div>
      <button type="button" className={btn} onClick={share}>
        {note ?? l.share} <span aria-hidden>↗</span>
      </button>
      {mapHref && (
        <a href={mapHref} target="_blank" rel="noreferrer" className={btn}>
          {l.map} <span aria-hidden>→</span>
        </a>
      )}
    </div>
  );
}
