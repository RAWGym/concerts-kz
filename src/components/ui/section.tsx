import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Общая обёртка секции: ширина контента и вертикальные отступы.
 *
 * padding вынесен отдельным пропом, а не переопределяется через
 * className: конфликтующие утилиты Tailwind разрешаются порядком в
 * CSS, а не в строке класса, поэтому «pt-8» рядом с «py-16» сработал
 * бы не всегда.
 */
export function Section({
  children,
  className = "",
  padding = "py-16 md:py-20",
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
}) {
  return (
    <section className={`mx-auto max-w-7xl px-4 sm:px-6 ${padding} ${className}`}>
      {children}
    </section>
  );
}

/** Заголовок секции с необязательной ссылкой «смотреть все». */
export function SectionHeading({
  overline,
  title,
  action,
}: {
  overline?: string;
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {overline && <p className="overline">{overline}</p>}
        <h2 className="mt-2 font-display text-2xl font-semibold uppercase tracking-[-0.01em] text-fg md:text-3xl">
          {title}
        </h2>
      </div>

      {action && (
        <Link
          href={action.href}
          className="shrink-0 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted transition-colors hover:text-coral"
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}

/** Заголовок внутренней страницы. */
export function PageHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-10 max-w-2xl">
      <h1 className="font-display text-3xl font-bold uppercase tracking-[-0.01em] text-fg md:text-4xl">
        {title}
      </h1>
      {description && (
        <p className="mt-4 text-base leading-7 text-fg-muted">{description}</p>
      )}
    </div>
  );
}

/** Пустое состояние списка. */
export function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-card border border-dashed border-line-strong px-6 py-14 text-center text-sm text-fg-subtle">
      {text}
    </p>
  );
}
