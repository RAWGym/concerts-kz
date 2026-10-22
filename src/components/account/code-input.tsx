import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/**
 * Поле для кода из письма: отдельная ячейка на каждую цифру,
 * вставка из буфера и автоподстановка кода на телефоне.
 */
export function CodeInput({
  value,
  onChange,
  length,
  disabled,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  length: number;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setAt(i: number, ch: string) {
    const next = (value.slice(0, i) + ch + value.slice(i + 1)).replace(/\D/g, "").slice(0, length);
    onChange(next);
  }

  function onInput(i: number, raw: string) {
    const clean = raw.replace(/\D/g, "");
    if (!clean) return;
    if (clean.length > 1) {
      // Автоподстановка или вставка всего кода в одну ячейку.
      const next = (value.slice(0, i) + clean).slice(0, length);
      onChange(next);
      refs.current[Math.min(next.length, length - 1)]?.focus();
      return;
    }
    setAt(i, clean);
    refs.current[i + 1]?.focus();
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) onChange(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft") refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight") refs.current[i + 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const clean = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!clean) return;
    e.preventDefault();
    onChange(clean);
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  }

  return (
    <div className={`flex justify-between gap-2 ${invalid ? "animate-[shake_0.35s]" : ""}`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          disabled={disabled}
          aria-label={`${i + 1}`}
          className={`h-14 w-full min-w-0 rounded-[14px] border bg-ink text-center font-display text-2xl font-bold text-fg outline-none transition-[border-color,box-shadow] focus:border-coral focus:shadow-[0_0_0_4px_rgba(255,77,77,0.15)] disabled:opacity-60 ${
            invalid ? "border-coral" : d ? "border-line-strong" : "border-line"
          }`}
        />
      ))}
    </div>
  );
}
