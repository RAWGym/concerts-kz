/**
 * Знаки принимаемых карт. Банки-эквайеры требуют показывать их на сайте
 * рядом с оплатой и в подвале.
 */
export function PaymentBadges({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-label="Visa, Mastercard">
      <span className="flex h-7 items-center rounded-md bg-white px-2.5">
        <svg viewBox="0 0 48 16" className="h-3.5" role="img" aria-label="Visa">
          <text x="0" y="14" fontFamily="Arial, sans-serif" fontSize="17" fontStyle="italic" fontWeight="800" fill="#1a1f71">
            VISA
          </text>
        </svg>
      </span>
      <span className="flex h-7 items-center rounded-md bg-white px-2">
        <svg viewBox="0 0 32 20" className="h-4" role="img" aria-label="Mastercard">
          <circle cx="11" cy="10" r="9" fill="#eb001b" />
          <circle cx="21" cy="10" r="9" fill="#f79e1b" />
          <path d="M16 2.5a9 9 0 0 1 0 15 9 9 0 0 1 0-15z" fill="#ff5f00" />
        </svg>
      </span>
      <span className="flex h-7 items-center rounded-md border border-line-strong px-2 font-display text-[9px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
        3-D Secure
      </span>
    </div>
  );
}
