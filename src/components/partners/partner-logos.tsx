import type { PartnerItem as Partner } from "@/lib/data/types";

/**
 * Логотипы партнёров плитками одинакового размера: два-три партнёра
 * выглядят так же аккуратно, как десять.
 */
export function PartnerLogos({ partners }: { partners: Partner[] }) {
  if (!partners.length) return null;
  return (
    <ul className="flex flex-wrap gap-3 sm:gap-4">
      {partners.map((p) => {
        const inner = (
          <>
            <span className="flex h-16 w-full items-center justify-center sm:h-20">
              {p.logoUrl ? (
                <img
                  src={p.logoUrl}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  className="max-h-full max-w-[78%] rounded-lg object-contain opacity-85 transition-[opacity,transform] duration-500 group-hover:scale-[1.04] group-hover:opacity-100"
                />
              ) : (
                <span className="font-display text-base font-semibold uppercase tracking-[0.06em] text-fg-muted">{p.name}</span>
              )}
            </span>
            <span className="mt-3 truncate text-xs text-fg-subtle transition-colors group-hover:text-fg-muted">{p.name.trim()}</span>
          </>
        );
        const cls =
          "group flex h-full flex-col items-center justify-center rounded-[18px] border border-line bg-surface/50 px-4 py-5 text-center transition-[border-color,background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.9)]";
        return (
          <li key={p.id} className="w-[calc(50%-6px)] sm:w-[200px]">
            {p.websiteUrl ? (
              <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className={cls}>
                {inner}
              </a>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
