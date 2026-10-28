import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Лёгкие графики для админки на SVG, без сторонних библиотек.
 * Тёмная тема сайта: сетка приглушённая, данные кораллом, подписи
 * текстовыми цветами (не цветом серии).
 */

export type Point = { key: string; label: string; value: number; tip?: ReactNode };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** «Круглые» деления оси: 0, 25 000, 50 000… */
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(v);
  return out;
}

/** Короткая запись чисел на оси: 1,2 млн, 250 тыс. */
export function compact(n: number) {
  const abs = Math.abs(n);
  const f = (v: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);
  if (abs >= 1e6) return `${f(n / 1e6)} млн`;
  if (abs >= 1e3) return `${f(n / 1e3)} тыс`;
  return f(n);
}

/** Столбики (или нарастающая площадь) по времени с подсказкой при наведении. */
export function TimeChart({
  data,
  mode = "bar",
  height = 240,
  format = compact,
  ariaLabel,
}: {
  data: Point[];
  mode?: "bar" | "area";
  height?: number;
  format?: (n: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 12, right: 8, bottom: 26, left: 52 };
  const w = Math.max(width - pad.left - pad.right, 10);
  const h = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const n = Math.max(data.length, 1);
  const band = w / n;
  const y = (v: number) => pad.top + h - (v / top) * h;
  const xc = (i: number) => pad.left + band * i + band / 2;

  // Подписи по оси X без наложений: примерно каждые 64px.
  const every = Math.max(1, Math.ceil(64 / Math.max(band, 1)));
  const barW = Math.max(2, Math.min(band - 2, 28));

  const linePath = data.map((d, i) => `${i ? "L" : "M"}${xc(i)},${y(d.value)}`).join(" ");
  const areaPath = data.length
    ? `${linePath} L${xc(data.length - 1)},${y(0)} L${xc(0)},${y(0)} Z`
    : "";

  const hp = hover != null ? data[hover] : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          <defs>
            <linearGradient id="fin-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-coral)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--color-coral)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeDasharray={t ? "2 4" : undefined} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-fg-subtle text-[10px] tabular-nums">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % every === 0 ? (
              <text key={d.key} x={xc(i)} y={height - 8} textAnchor="middle" className="fill-fg-subtle text-[10px]">
                {d.label}
              </text>
            ) : null,
          )}

          {mode === "bar" &&
            data.map((d, i) => {
              if (d.value <= 0) return null;
              const x = xc(i) - barW / 2;
              const yy = y(d.value);
              const bh = y(0) - yy;
              const r = Math.min(4, barW / 2, bh);
              return (
                <path
                  key={d.key}
                  d={`M${x},${y(0)} L${x},${yy + r} Q${x},${yy} ${x + r},${yy} L${x + barW - r},${yy} Q${x + barW},${yy} ${x + barW},${yy + r} L${x + barW},${y(0)} Z`}
                  fill="var(--color-coral)"
                  opacity={hover == null || hover === i ? 1 : 0.45}
                  className="transition-opacity"
                />
              );
            })}

          {mode === "area" && data.length > 0 && (
            <>
              <path d={areaPath} fill="url(#fin-area)" />
              <path d={linePath} fill="none" stroke="var(--color-coral)" strokeWidth={2} strokeLinejoin="round" />
              {hp && (
                <>
                  <line x1={xc(hover!)} x2={xc(hover!)} y1={pad.top} y2={y(0)} stroke="var(--color-line-strong)" />
                  <circle cx={xc(hover!)} cy={y(hp.value)} r={5} fill="var(--color-coral)" stroke="var(--color-ink)" strokeWidth={2} />
                </>
              )}
            </>
          )}

          {/* зоны наведения шире самих столбиков */}
          {data.map((d, i) => (
            <rect
              key={`hit-${d.key}`}
              x={pad.left + band * i}
              y={pad.top}
              width={band}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          ))}
        </svg>
      )}
      {hp && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] rounded-btn border border-line-strong bg-ink-deep/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{
            left: Math.min(Math.max(xc(hover!) - 75, 0), Math.max(width - 170, 0)),
            top: Math.max(y(hp.value) - 96, 0),
          }}
        >
          {hp.tip ?? (
            <>
              <p className="text-fg-subtle">{hp.label}</p>
              <p className="mt-0.5 font-semibold text-fg tabular-nums">{format(hp.value)}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Горизонтальные полосы долей: тарифы, концерты и т. п. */
export function ShareBars({
  rows,
  format,
}: {
  rows: { key: string; label: ReactNode; value: number; hint?: ReactNode }[];
  format: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-fg">{r.label}</span>
            <span className="shrink-0 tabular-nums text-fg">
              {format(r.value)} <span className="text-xs text-fg-subtle">{Math.round((r.value / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full bg-coral transition-[width] duration-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.hint && <p className="mt-1 text-[11px] text-fg-subtle">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Полоса из частей (статусы заказов) с легендой: цвет никогда не один. */
export function StackBar({ parts }: { parts: { key: string; label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="text-sm text-fg-subtle">Нет заказов за период.</p>;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} title={`${p.label}: ${p.value}`} style={{ flexGrow: p.value, background: p.color }} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="text-fg-muted">{p.label}</span>
            <span className="ml-auto tabular-nums text-fg">{p.value}</span>
            <span className="w-9 text-right tabular-nums text-fg-subtle">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Тонкая полоса заполнения 0–100%. */
export function Meter({ value, tone = "coral" }: { value: number; tone?: "coral" | "teal" }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-2">
      <div className={`h-1.5 rounded-full ${tone === "teal" ? "bg-teal" : "bg-coral"}`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}
