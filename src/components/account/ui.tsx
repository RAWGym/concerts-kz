import { motion } from "framer-motion";

import Link from "next/link";
import type { OrderStatus } from "@/lib/tickets/types";

/** Переключатель-капсула с бегущей подложкой. */
export function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="inline-flex rounded-full border border-line bg-ink p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative flex items-center gap-2 rounded-full px-3 py-2 sm:px-4 font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
              active ? "text-ink" : "text-fg-muted hover:text-fg"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-fg"
              />
            )}
            <span className="relative">{o.label}</span>
            {o.count !== undefined && (
              <span
                className={`relative rounded-full px-1.5 text-[10px] ${
                  active ? "bg-ink text-fg" : "bg-surface-2 text-fg-muted"
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyPanel({
  text,
  action,
}: {
  text: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="relative overflow-hidden rounded-card border border-dashed border-line-strong px-6 py-16 text-center">
      <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 rounded-full bg-coral/10 blur-3xl" />
      <TicketGlyph />
      <p className="relative mx-auto mt-5 max-w-xs text-sm leading-6 text-fg-muted">{text}</p>
      {action && (
        <Link href={action.href} className="btn btn-primary relative mt-7">
          {action.label}
        </Link>
      )}
    </div>
  );
}

function TicketGlyph() {
  return (
    <svg viewBox="0 0 64 40" className="relative mx-auto h-10 w-16 text-coral" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6a2 2 0 012-2h52a2 2 0 012 2v8a6 6 0 000 12v8a2 2 0 01-2 2H6a2 2 0 01-2-2v-8a6 6 0 000-12V6z" />
      <path d="M42 6v28" strokeDasharray="2 3" />
    </svg>
  );
}

const statusTone: Record<OrderStatus, string> = {
  paid: "bg-teal/12 text-teal border-teal/30",
  pending: "bg-orange/12 text-orange border-orange/30",
  failed: "bg-coral/12 text-coral border-coral/30",
  expired: "bg-surface-2 text-fg-subtle border-line-strong",
  refunded: "bg-surface-2 text-fg-muted border-line-strong",
};

export function StatusPill({ status, label }: { status: OrderStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.1em] ${statusTone[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${status === "pending" ? "animate-pulse" : ""}`} />
      {label}
    </span>
  );
}
