import type { ReactNode } from "react";

/** Мелкие общие элементы админки в стиле сайта. */

export const inputCls =
  "mt-1.5 w-full rounded-btn border border-line-strong bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-coral disabled:opacity-50";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-xs font-medium text-fg-muted ${className}`}>
      {label}
      {children}
      {hint && <span className="mt-1 block text-[11px] font-normal text-fg-subtle">{hint}</span>}
    </label>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[-0.01em] text-fg">{title}</h1>
      {children && <div className="flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-surface/40 p-5 ${className}`}>{children}</div>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: ReactNode }) {
  const color = kind === "error" ? "border-coral/50 text-coral" : kind === "ok" ? "border-teal/50 text-teal" : "border-line-strong text-fg-muted";
  return <p className={`rounded-card border border-dashed px-4 py-3 text-sm ${color}`}>{children}</p>;
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "coral" | "teal" | "orange" }) {
  const map = {
    muted: "bg-surface-2 text-fg-muted",
    coral: "bg-coral/15 text-coral",
    teal: "bg-teal/15 text-teal",
    orange: "bg-orange/15 text-orange",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${map[tone]}`}>{children}</span>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
          <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Spinner() {
  return <div className="py-16 text-center text-sm text-fg-subtle">Загрузка…</div>;
}

const LANGS = [
  { code: "ru", label: "RU" },
  { code: "kz", label: "KZ" },
  { code: "en", label: "EN" },
] as const;
type Lang = (typeof LANGS)[number]["code"];

/**
 * Поля на трёх языках с общим переключателем. values — объект
 * { поле: { ru, kz, en } }, fields — подписи и тип поля.
 */
export function I18nFields({
  values,
  onChange,
  fields,
  lang,
  setLang,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: Record<string, any>;
  onChange: (field: string, lang: Lang, value: string) => void;
  fields: { key: string; label: string; rows?: number }[];
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {LANGS.map((l) => (
          <button key={l.code} type="button" onClick={() => setLang(l.code)}
            className={`rounded-btn px-3 py-1.5 text-xs font-semibold tracking-[0.06em] ${lang === l.code ? "bg-coral text-white" : "text-fg-muted hover:text-fg"}`}>
            {l.label}
          </button>
        ))}
      </div>
      {fields.map((f) => (
        <Field key={f.key} label={`${f.label}${lang === "ru" ? "" : ` (${lang.toUpperCase()})`}`}>
          {f.rows ? (
            <textarea rows={f.rows} className={inputCls} value={values[f.key]?.[lang] ?? ""} onChange={(e) => onChange(f.key, lang, e.target.value)} />
          ) : (
            <input className={inputCls} value={values[f.key]?.[lang] ?? ""} onChange={(e) => onChange(f.key, lang, e.target.value)} />
          )}
        </Field>
      ))}
      {lang !== "ru" && <p className="text-xs text-fg-subtle">Пустой перевод заменится русским текстом.</p>}
    </div>
  );
}

export type { Lang };
