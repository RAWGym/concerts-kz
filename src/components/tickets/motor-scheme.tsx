import { useState } from "react";

import type { Locale } from "@/i18n/config";

/**
 * Схема зала Motor Club (Алматы): два этажа.
 * 1 этаж: танцпол у сцены, бары по периметру.
 * 2 этаж: VIP-столы 1–15 и VIP-зона без рассадки вокруг проёма над танцполом.
 *
 * Коды тарифов совпадают с кодами в таблице ticket_categories
 * (админка → событие → тарифы): dancefloor, vip-table, vip-floor2.
 */

export const MOTOR_ZONES = ["dancefloor", "vip-table", "vip-floor2"] as const;
export type MotorZone = (typeof MOTOR_ZONES)[number];

export const ZONE_COLOR: Record<MotorZone, string> = {
  dancefloor: "#ff4d4d",
  "vip-table": "#f5b83d",
  "vip-floor2": "#9b8cff",
};

export const MOTOR_TEXT: Record<
  Locale,
  {
    floor1: string;
    floor2: string;
    stage: string;
    entrance: string;
    bar: string;
    dj: string;
    stairs: string;
    void: string;
    table: string;
    hint: string;
    zones: Record<MotorZone, { name: string; note: string }>;
  }
> = {
  ru: {
    floor1: "1 этаж",
    floor2: "2 этаж",
    stage: "Сцена",
    entrance: "Вход",
    bar: "Бар",
    dj: "DJ",
    stairs: "Лестница",
    void: "Проём над танцполом",
    table: "Стол",
    hint: "Нажмите на зону или стол на схеме",
    zones: {
      dancefloor: { name: "Танцпол", note: "1 этаж, у сцены, без мест" },
      "vip-table": { name: "VIP со столом", note: "2 этаж, стол на компанию" },
      "vip-floor2": { name: "VIP доступ на 2 этаж", note: "2 этаж, без рассадки" },
    },
  },
  kz: {
    floor1: "1 қабат",
    floor2: "2 қабат",
    stage: "Сахна",
    entrance: "Кіреберіс",
    bar: "Бар",
    dj: "DJ",
    stairs: "Баспалдақ",
    void: "Танцпол үстіндегі ойық",
    table: "Үстел",
    hint: "Сызбадағы аймақты немесе үстелді басыңыз",
    zones: {
      dancefloor: { name: "Танцпол", note: "1 қабат, сахна жанында, орынсыз" },
      "vip-table": { name: "Үстелі бар VIP", note: "2 қабат, компанияға үстел" },
      "vip-floor2": { name: "2 қабатқа VIP кіру", note: "2 қабат, орынсыз" },
    },
  },
  en: {
    floor1: "Floor 1",
    floor2: "Floor 2",
    stage: "Stage",
    entrance: "Entrance",
    bar: "Bar",
    dj: "DJ",
    stairs: "Stairs",
    void: "Open to the dance floor",
    table: "Table",
    hint: "Tap a zone or a table on the map",
    zones: {
      dancefloor: { name: "Dance floor", note: "Floor 1, by the stage, standing" },
      "vip-table": { name: "VIP table", note: "Floor 2, a table for your group" },
      "vip-floor2": { name: "VIP access to floor 2", note: "Floor 2, standing" },
    },
  },
};

/** Столы 2 этажа: номер и положение (как на схеме клуба). */
const TABLES: { n: number; x: number; y: number }[] = [
  { n: 6, x: 112, y: 22 }, { n: 7, x: 196, y: 22 }, { n: 8, x: 280, y: 22 },
  { n: 9, x: 364, y: 22 }, { n: 10, x: 448, y: 22 }, { n: 11, x: 560, y: 22 },
  { n: 4, x: 112, y: 76 }, { n: 5, x: 184, y: 76 }, { n: 12, x: 560, y: 76 },
  { n: 3, x: 18, y: 140 }, { n: 2, x: 18, y: 196 }, { n: 1, x: 18, y: 252 },
  { n: 13, x: 560, y: 140 }, { n: 14, x: 560, y: 196 }, { n: 15, x: 560, y: 252 },
];
export const MOTOR_TABLE_COUNT = TABLES.length;

const TW = 62;
const TH = 36;

export function MotorScheme({
  locale,
  active,
  tables,
  takenTables = [],
  onZone,
  onTable,
}: {
  locale: Locale;
  /** Зоны, которые сейчас в заказе (подсвечиваются). */
  active: MotorZone[];
  /** Выбранные столы. */
  tables: number[];
  takenTables?: number[];
  onZone: (zone: MotorZone) => void;
  onTable: (n: number) => void;
}) {
  const tx = MOTOR_TEXT[locale];
  const [floor, setFloor] = useState<1 | 2>(1);

  const zoneProps = (zone: MotorZone) => {
    const on = active.includes(zone);
    return {
      role: "button",
      tabIndex: 0,
      "aria-label": tx.zones[zone].name,
      "aria-pressed": on,
      onClick: () => onZone(zone),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onZone(zone);
        }
      },
      className: "cursor-pointer outline-none transition-[fill-opacity,stroke-opacity] duration-300 hover:fill-opacity-40 focus-visible:stroke-[3]",
      fill: ZONE_COLOR[zone],
      fillOpacity: on ? 0.38 : 0.16,
      stroke: ZONE_COLOR[zone],
      strokeOpacity: on ? 1 : 0.55,
      strokeWidth: 1.5,
    } as const;
  };

  return (
    <div className="rounded-[20px] border border-line bg-ink-deep p-3 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-surface p-1 ring-1 ring-line" role="tablist">
          {([1, 2] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={floor === f}
              onClick={() => setFloor(f)}
              className={`rounded-full px-4 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                floor === f ? "bg-coral text-white" : "text-fg-muted hover:text-fg"
              }`}
            >
              {f === 1 ? tx.floor1 : tx.floor2}
            </button>
          ))}
        </div>
        <p className="hidden text-xs text-fg-subtle sm:block">{tx.hint}</p>
      </div>

      <svg viewBox="0 0 640 440" className="h-auto w-full select-none" aria-label={floor === 1 ? tx.floor1 : tx.floor2}>
        <defs>
          <pattern id="motor-wood" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill="#1d1a18" />
            <path d="M0 5h10" stroke="#25211e" strokeWidth="1" />
          </pattern>
        </defs>

        <rect x="0" y="0" width="640" height="440" rx="14" fill="#121212" />

        {floor === 1 ? (
          <g>
            {/* танцпол: весь зал перед сценой */}
            <rect x="62" y="64" width="566" height="262" rx="10" {...zoneProps("dancefloor")} />
            <text x="345" y="200" textAnchor="middle" className="pointer-events-none fill-white font-display text-[22px] font-bold uppercase" letterSpacing="2">
              {tx.zones.dancefloor.name}
            </text>
            <text x="345" y="224" textAnchor="middle" className="pointer-events-none fill-white/60 text-[12px]">
              {tx.zones.dancefloor.note}
            </text>

            {/* бары по периметру */}
            <rect x="150" y="14" width="340" height="30" rx="4" fill="url(#motor-wood)" stroke="#3a3a3a" />
            <text x="320" y="34" textAnchor="middle" className="fill-white/60 text-[11px] uppercase" letterSpacing="1">{tx.bar} 3</text>
            <rect x="12" y="64" width="34" height="292" rx="4" fill="url(#motor-wood)" stroke="#3a3a3a" />
            <text x="33" y="210" textAnchor="middle" transform="rotate(-90 33 210)" className="fill-white/60 text-[11px] uppercase" letterSpacing="1">{tx.bar} 2</text>
            <rect x="12" y="340" width="520" height="30" rx="4" fill="url(#motor-wood)" stroke="#3a3a3a" />
            <text x="290" y="360" textAnchor="middle" className="fill-white/60 text-[11px] uppercase" letterSpacing="1">{tx.bar} 1</text>
          </g>
        ) : (
          <g>
            {/* VIP-зона без рассадки: галерея вокруг проёма */}
            <path
              d="M8 8 H632 V310 H542 V128 H104 V310 H8 Z"
              {...zoneProps("vip-floor2")}
            />
            <text x="292" y="166" textAnchor="middle" fill={ZONE_COLOR["vip-floor2"]} className="pointer-events-none text-[11px] font-semibold uppercase" letterSpacing="1.5">
              ↑ {tx.zones["vip-floor2"].name}: {tx.zones["vip-floor2"].note.split(", ").pop()}
            </text>

            {/* проём над танцполом */}
            <rect x="112" y="136" width="422" height="234" rx="8" fill="none" stroke="#2e2e2e" strokeDasharray="6 6" />
            <text x="292" y="258" textAnchor="middle" className="pointer-events-none fill-white/30 text-[12px]">{tx.void}</text>

            {/* DJ и лестница */}
            <rect x="262" y="72" width="128" height="44" rx="6" fill="#0d0d0d" stroke="#3a3a3a" />
            <text x="326" y="100" textAnchor="middle" className="pointer-events-none fill-white font-display text-[16px] font-bold">{tx.dj}</text>
            <g>
              <rect x="472" y="136" width="56" height="150" rx="4" fill="#1a1a1a" stroke="#3a3a3a" />
              {Array.from({ length: 12 }, (_, i) => (
                <path key={i} d={`M476 ${144 + i * 12} H524`} stroke="#3a3a3a" />
              ))}
              <text x="500" y="211" textAnchor="middle" transform="rotate(-90 500 211)" className="pointer-events-none fill-white/50 text-[10px] uppercase" letterSpacing="1">{tx.stairs}</text>
            </g>

            {/* столы */}
            {TABLES.map((t) => {
              const taken = takenTables.includes(t.n);
              const on = tables.includes(t.n);
              const color = ZONE_COLOR["vip-table"];
              return (
                <g
                  key={t.n}
                  role="button"
                  tabIndex={taken ? -1 : 0}
                  aria-label={`${tx.table} ${t.n}`}
                  aria-pressed={on}
                  aria-disabled={taken}
                  onClick={() => !taken && onTable(t.n)}
                  onKeyDown={(e) => {
                    if (!taken && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onTable(t.n);
                    }
                  }}
                  className={`${taken ? "cursor-not-allowed" : "cursor-pointer"} outline-none [&:focus-visible>rect]:stroke-white`}
                >
                  <rect
                    x={t.x}
                    y={t.y}
                    width={TW}
                    height={TH}
                    rx="7"
                    fill={taken ? "#262626" : on ? color : "#1a1a1a"}
                    stroke={taken ? "#3a3a3a" : color}
                    strokeWidth={on ? 2 : 1.5}
                    className="transition-[fill] duration-200"
                  />
                  <text
                    x={t.x + TW / 2}
                    y={t.y + TH / 2 + 5}
                    textAnchor="middle"
                    className={`pointer-events-none font-display text-[13px] font-bold ${taken ? "fill-white/30" : on ? "fill-[#1a1a1a]" : "fill-white"}`}
                  >
                    {t.n}
                  </text>
                </g>
              );
            })}
          </g>
        )}

        {/* сцена и вход: одинаково на обоих этажах */}
        <rect x="150" y="392" width="340" height="36" rx="6" fill="#ff8a3d" fillOpacity="0.85" />
        <text x="320" y="416" textAnchor="middle" className="fill-[#1a1a1a] font-display text-[14px] font-bold uppercase" letterSpacing="3">
          {tx.stage}
        </text>
        <rect x="548" y="396" width="80" height="28" rx="6" fill="#00c2a8" fillOpacity="0.9" />
        <text x="588" y="415" textAnchor="middle" className="fill-[#0d0d0d] text-[11px] font-semibold uppercase" letterSpacing="1">
          {tx.entrance}
        </text>
      </svg>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-fg-muted">
        {MOTOR_ZONES.map((z) => (
          <li key={z} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ZONE_COLOR[z] }} />
            {tx.zones[z].name}
          </li>
        ))}
      </ul>
    </div>
  );
}
