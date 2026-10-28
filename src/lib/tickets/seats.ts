/**
 * Места за столами (Motor Club, 2 этаж).
 *
 * Метка места в заказе: "table-7-3" — стол 7, место 3.
 * У стола 6 мест: 1–3 вдоль одной стороны, 4–6 вдоль другой.
 * Старая метка "table-7" (стол целиком, до деления на места) занимает весь стол.
 */

export const TABLE_SEATS = 6;
export const SEATS_PER_SIDE = 3;

export const seatId = (table: number, seat: number) => `table-${table}-${seat}`;

export function parseSeat(label: string | null | undefined): { table: number; seat: number | null } | null {
  const m = label?.match(/^table-(\d{1,2})(?:-([1-6]))?$/);
  if (!m) return null;
  return { table: Number(m[1]), seat: m[2] ? Number(m[2]) : null };
}

const WORDS = {
  ru: { table: "Стол", seat: "место", whole: "целиком" },
  kz: { table: "Үстел", seat: "орын", whole: "толық" },
  en: { table: "Table", seat: "seat", whole: "whole" },
} as const;

/** Человеческое название места: «Стол 7 · место 3». */
export function seatName(label: string | null | undefined, locale: string = "ru"): string | null {
  if (!label) return null;
  const w = WORDS[(locale in WORDS ? locale : "ru") as keyof typeof WORDS];
  const p = parseSeat(label);
  if (!p) return label;
  return p.seat ? `${w.table} ${p.table} · ${w.seat} ${p.seat}` : `${w.table} ${p.table}`;
}

/** Все занятые места события в виде "table-N-S" (стол целиком раскрываем в 6 мест). */
export function expandTaken(labels: string[]): Set<string> {
  const out = new Set<string>();
  for (const l of labels) {
    const p = parseSeat(l);
    if (!p) continue;
    if (p.seat) out.add(seatId(p.table, p.seat));
    else for (let s = 1; s <= TABLE_SEATS; s++) out.add(seatId(p.table, s));
  }
  return out;
}
