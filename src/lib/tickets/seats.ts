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

/**
 * Столы Motor Club продаются целиком: цена тарифа — за стол, а отмеченные
 * места показывают, сколько придёт гостей. Стол, где занято хоть одно место,
 * другим покупателям недоступен.
 */
export const TABLES_SOLD_WHOLE = true;

/** Номер стола по метке места или null. */
export const tableOf = (label: string | null | undefined) => parseSeat(label)?.table ?? null;

/**
 * Цена билета для показа: у мест за столом — цена всего стола (сумма долей
 * всех мест этого стола в заказе), у остальных — своя цена.
 */
export function displayPrice<T extends { seatLabel: string | null; unitPrice: number; quantity: number }>(
  item: T,
  orderItems: T[],
): number {
  const table = TABLES_SOLD_WHOLE ? tableOf(item.seatLabel) : null;
  if (table === null) return item.unitPrice;
  return orderItems.filter((i) => tableOf(i.seatLabel) === table).reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

/** Строки заказа для показа: места одного стола сливаются в одну строку «Стол 7 · места 1, 2, 3». */
export function groupItemsByTable<T extends { id: string; categoryName: string; seatLabel: string | null; unitPrice: number; quantity: number }>(
  items: T[],
): { id: string; categoryName: string; table: number | null; seats: number[]; label: string | null; quantity: number; amount: number }[] {
  const out: ReturnType<typeof groupItemsByTable<T>> = [];
  const byTable = new Map<number, (typeof out)[number]>();
  for (const it of items) {
    const p = TABLES_SOLD_WHOLE ? parseSeat(it.seatLabel) : null;
    if (!p) {
      out.push({ id: it.id, categoryName: it.categoryName, table: null, seats: [], label: it.seatLabel, quantity: it.quantity, amount: it.unitPrice * it.quantity });
      continue;
    }
    let row = byTable.get(p.table);
    if (!row) {
      row = { id: it.id, categoryName: it.categoryName, table: p.table, seats: [], label: it.seatLabel, quantity: 0, amount: 0 };
      byTable.set(p.table, row);
      out.push(row);
    }
    if (p.seat) row.seats.push(p.seat);
    row.quantity += it.quantity;
    row.amount += it.unitPrice * it.quantity;
  }
  for (const r of out) r.seats.sort((a, b) => a - b);
  return out;
}

/** «Стол 7 · места 1, 2, 3» / «Table 7 · seats 1, 2, 3». */
export function tableSeatsName(table: number, seats: number[], locale: string = "ru"): string {
  const w = {
    ru: ["Стол", "место", "места"],
    kz: ["Үстел", "орын", "орындар"],
    en: ["Table", "seat", "seats"],
  }[locale in { ru: 1, kz: 1, en: 1 } ? (locale as "ru" | "kz" | "en") : "ru"];
  if (!seats.length) return `${w[0]} ${table}`;
  return `${w[0]} ${table} · ${seats.length === 1 ? w[1] : w[2]} ${seats.join(", ")}`;
}
