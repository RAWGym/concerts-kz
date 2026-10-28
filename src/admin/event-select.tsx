import { useEffect, useState } from "react";

import { db, formatDateTime, titleOf } from "./db";

export type EventOption = {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  status: string;
  venue: { id: string; name: string; city: string; timezone: string } | null;
};

const KEY = "admin:entry-event";

/** Концерты для разделов входа: ближайшие и недавние (или все, если нужно). */
export function useEventOptions(withPast = false) {
  const [events, setEvents] = useState<EventOption[] | null>(null);
  useEffect(() => {
    let q = db()
      .from("events")
      .select("id, slug, status, starts_at, venue:venues(id, name, city, timezone), translations:event_translations(locale, title)")
      .order("starts_at", { ascending: true });
    if (!withPast) q = q.gte("starts_at", new Date(Date.now() - 3 * 86400000).toISOString());
    q.then(({ data }) =>
      setEvents(
        ((data ?? []) as unknown as (Omit<EventOption, "title"> & { translations: { locale: string; title: string }[] })[]).map((e) => ({
          id: e.id,
          slug: e.slug,
          status: e.status,
          starts_at: e.starts_at,
          venue: e.venue,
          title: titleOf(e),
        })),
      ),
    );
  }, [withPast]);
  return events;
}

/** Выбранный концерт помним между разделами «Проходы», «Пригласительные», «Тикеторы». */
export function useSelectedEvent(events: EventOption[] | null) {
  const [id, setId] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    if (!events?.length) return;
    if (id && events.some((e) => e.id === id)) return;
    // По умолчанию ближайший предстоящий.
    const soon = events.find((e) => new Date(e.starts_at).getTime() > Date.now() - 12 * 3600000) ?? events[events.length - 1];
    setId(soon.id);
  }, [events, id]);
  const select = (v: string) => {
    setId(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* без памяти тоже работает */
    }
  };
  return [events?.find((e) => e.id === id) ?? null, select] as const;
}

export function EventSelect({ events, value, onChange }: { events: EventOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <select
      className="max-w-full rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {events.map((e) => (
        <option key={e.id} value={e.id}>
          {e.title} · {formatDateTime(e.starts_at, e.venue?.timezone)}
          {e.status !== "published" ? " (не опубликовано)" : ""}
        </option>
      ))}
    </select>
  );
}
