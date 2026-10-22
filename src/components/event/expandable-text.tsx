import { useEffect, useRef, useState } from "react";

/**
 * Длинный текст, свёрнутый до нескольких строк, с кнопкой
 * «Показать полностью / Скрыть». Кнопка появляется, только если
 * текст правда не влезает.
 */
export function ExpandableText({ text, more, less, lines = 6 }: { text: string; more: string; less: string; lines?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setLong(el.scrollHeight > el.clientHeight + 4);
  }, [text]);

  return (
    <div>
      <div className="relative">
        <p
          ref={ref}
          className="whitespace-pre-line text-[15px] leading-7 text-fg-muted"
          style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {text}
        </p>
        {long && !open && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-coral transition-colors hover:text-coral-hover"
        >
          {open ? less : more}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
