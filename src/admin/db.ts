import type { SupabaseClient } from "@supabase/supabase-js";

import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * Клиент админки с сессией сотрудника. Без строгих типов таблиц:
 * права всё равно проверяет база (RLS), а формы работают с простыми
 * объектами.
 */
export function db(): SupabaseClient {
  return createBrowserSupabase() as unknown as SupabaseClient;
}

export type Role = "admin" | "editor" | "sales";

export const roleLabels: Record<Role, string> = {
  admin: "Администратор",
  editor: "Редактор",
  sales: "Продажи",
};

export const roleHints: Record<Role, string> = {
  admin: "Всё, включая сотрудников и роли",
  editor: "События, площадки и контент сайта",
  sales: "Заказы и заявки, без правки контента",
};

export const canEdit = (role: Role | null) => role === "admin" || role === "editor";

/** Вызов функции admin-users (создание и удаление сотрудников). */
export async function staffApi<T = { ok: true }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().functions.invoke("admin-users", { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) message = j.error;
    } catch {
      /* оставляем исходный текст */
    }
    throw new Error(message);
  }
  return data as T;
}

/* ---------- даты в часовом поясе площадки ---------- */

function offsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** ISO → значение для <input type="datetime-local"> во времени площадки. */
export function toLocalInput(iso: string | null, timeZone: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() + offsetMinutes(d, timeZone) * 60000);
  return local.toISOString().slice(0, 16);
}

/** Значение datetime-local во времени площадки → ISO. */
export function fromLocalInput(value: string, timeZone: string) {
  if (!value) return null;
  const guess = new Date(`${value}:00Z`);
  const off = offsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - off * 60000).toISOString();
}

export function formatDateTime(iso: string | null, timeZone = "Asia/Almaty") {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function money(n: number | null | undefined, currency = "KZT") {
  if (n == null) return "–";
  const sign: Record<string, string> = { KZT: "₸", KGS: "сом", UZS: "сум" };
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(n))} ${sign[currency] ?? currency}`;
}

export function slugify(s: string) {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
    ә: "a", ғ: "g", қ: "k", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
  };
  return s
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Загрузка файла в публичный бакет Storage, возвращает адрес. */
export async function uploadPublic(bucket: string, file: File, prefix = "file") {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await db().storage.from(bucket).upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return { path, url: db().storage.from(bucket).getPublicUrl(path).data.publicUrl };
}

export type I18n = { ru?: string; kz?: string; en?: string };

/** Убирает пустые языки, чтобы сайт откатывался на русский. */
export function cleanI18n(v: I18n): I18n {
  const out: I18n = {};
  for (const k of ["ru", "kz", "en"] as const) if (v[k]?.trim()) out[k] = v[k]!.trim();
  return out;
}
