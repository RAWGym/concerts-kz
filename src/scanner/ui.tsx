import type { ReactNode } from "react";

/* Общие элементы экранов приложения тикетора. */

export function Logo({ className = "w-[136px]" }: { className?: string }) {
  return <img src="/logo-header.svg" alt="Concerts" className={`h-auto ${className}`} draggable={false} />;
}

export function NetBadge({ online }: { online: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${online ? "text-fg-subtle" : "text-coral"}`}>
      <span className={`h-2 w-2 rounded-full ${online ? "bg-[#1fc77a]" : "animate-pulse bg-coral"}`} />
      {online ? "Онлайн" : "Нет сети"}
    </span>
  );
}

/** Заголовок вкладки: крупное название слева, действие справа. */
export function TabHeader({ title, eyebrow, right }: { title: string; eyebrow?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pb-3 pt-5">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-coral">{eyebrow}</p>}
        <h1 className="truncate font-display text-[22px] font-bold uppercase leading-none">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{children}</div>
      {note && <p className="px-1 text-xs leading-5 text-fg-subtle">{note}</p>}
    </section>
  );
}

export function Row({ title, hint, right, onClick, danger }: { title: ReactNode; hint?: ReactNode; right?: ReactNode; onClick?: () => void; danger?: boolean }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] ${danger ? "text-coral" : "text-fg"}`}>{title}</span>
        {hint && <span className="mt-0.5 block text-xs leading-4 text-fg-subtle">{hint}</span>}
      </span>
      {right}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3.5 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} active:bg-surface-2`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-coral" : "bg-surface-2"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-btn bg-ink p-1">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-[7px] px-2 py-2 text-xs font-semibold ${v === value ? "bg-surface-2 text-fg" : "text-fg-subtle"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Панель снизу поверх экрана. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/70" onClick={onClose}>
      <div
        className="max-h-[88dvh] overflow-y-auto rounded-t-[22px] border-t border-line bg-surface px-5 pt-3 [padding-bottom:calc(env(safe-area-inset-bottom)+24px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-2" />
        <p className="font-display text-base font-bold uppercase">{title}</p>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export type PillTone = "ok" | "warn" | "bad" | "muted";
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  const c = {
    ok: "bg-[#1fc77a]/15 text-[#4ee09c]",
    warn: "bg-orange/15 text-orange",
    bad: "bg-coral/15 text-coral",
    muted: "bg-surface-2 text-fg-muted",
  }[tone];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${c}`}>{children}</span>;
}

/* ---------- значки (обводка, 24×24) ---------- */

const I = ({ d, className = "h-6 w-6" }: { d: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {d}
  </svg>
);

export const Icon = {
  events: (c?: string) => <I className={c} d={<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>} />,
  scan: (c?: string) => <I className={c} d={<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M8 12h8" /></>} />,
  history: (c?: string) => <I className={c} d={<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>} />,
  bell: (c?: string) => <I className={c} d={<><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 0 0 4 0" /></>} />,
  user: (c?: string) => <I className={c} d={<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>} />,
  camera: (c?: string) => <I className={c} d={<><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="4" /></>} />,
  download: (c?: string) => <I className={c} d={<><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>} />,
  check: (c?: string) => <I className={c} d={<path d="M5 12l5 5L20 7" />} />,
  shield: (c?: string) => <I className={c} d={<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>} />,
  chevron: (c?: string) => <I className={c} d={<path d="M9 6l6 6-6 6" />} />,
  refresh: (c?: string) => <I className={c} d={<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>} />,
};
