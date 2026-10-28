import type { Dictionary } from "@/i18n/dictionaries";

/** Подпись вместо кнопки покупки: распродано или продажи закрыты (с меткой «Скоро»: скоро откроются). */
export function unavailableLabel(event: { salesClosed: boolean; badge: string }, t: Dictionary): string {
  if (!event.salesClosed) return t.actions.soldOut;
  return event.badge === "soon" ? t.actions.salesSoon : t.actions.salesClosed;
}
