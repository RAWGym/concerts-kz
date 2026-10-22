import type { Dictionary } from "@/i18n/dictionaries";
import type { EventBadge as EventBadgeValue } from "@/lib/supabase/types";

/** Классы чипов заданы в globals.css — здесь только выбор варианта. */
const chipClass: Record<Exclude<EventBadgeValue, "none">, string> = {
  new: "chip",
  soon: "chip chip-soon",
  last_tickets: "chip chip-last",
  sold_out: "chip chip-sold",
};

export function EventBadge({
  badge,
  t,
}: {
  badge: EventBadgeValue;
  t: Dictionary;
}) {
  if (badge === "none") return null;

  return <span className={chipClass[badge]}>{t.badges[badge]}</span>;
}
