import { db } from "./db";

export type TicketRow = {
  id: string;
  code: string;
  event_id: string;
  kind: "sale" | "invite";
  order_id: string | null;
  category_code: string | null;
  category_name: string;
  seat_label: string | null;
  price: number;
  currency: string | null;
  holder_name: string | null;
  holder_phone: string | null;
  holder_email: string | null;
  issued_by: string | null;
  issued_by_name: string | null;
  batch_id: string | null;
  is_service: boolean;
  note: string | null;
  status: "valid" | "used" | "void";
  used_at: string | null;
  used_by_name: string | null;
  used_gate_name: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  created_at: string;
  order: { number: number } | null;
};

export const TICKET_SELECT = "*, order:orders(number)";

/** Все билеты концерта. Сервер отдаёт до 1000 строк за раз, поэтому читаем страницами. */
export async function loadTickets(eventId: string, kind?: TicketRow["kind"]) {
  const page = 1000;
  const out: TicketRow[] = [];
  for (let from = 0; from < 50000; from += page) {
    let q = db().from("tickets").select(TICKET_SELECT).eq("event_id", eventId).order("created_at").order("code").range(from, from + page - 1);
    if (kind) q = q.eq("kind", kind);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as TicketRow[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export const statusLabels = { valid: "Не прошёл", used: "Прошёл", void: "Аннулирован" } as const;
export const statusTones = { valid: "muted", used: "teal", void: "coral" } as const;

export function seatText(seat: string | null) {
  if (!seat) return null;
  const m = seat.match(/^table-(\d+)$/);
  return m ? `Стол ${m[1]}` : seat;
}

/** +77011234567 → +7 701 123 45 67 */
export function prettyPhone(p: string | null | undefined) {
  if (!p) return "";
  const m = p.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}

export function timeIn(iso: string | null, tz = "Asia/Almaty") {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

/** CSV для Excel (точка с запятой, BOM для кириллицы). */
export function downloadCsv(name: string, head: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
