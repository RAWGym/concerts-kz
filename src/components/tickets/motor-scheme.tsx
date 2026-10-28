import { useEffect, useState } from "react";

import type { Locale } from "@/i18n/config";
import { SEATS_PER_SIDE, TABLE_SEATS, seatId } from "@/lib/tickets/seats";

/**
 * Схема зала Motor Club (Алматы): два этажа.
 * 1 этаж: танцпол у сцены, бары по периметру.
 * 2 этаж: VIP-столы 1–15 и VIP-зона без рассадки вокруг проёма над танцполом.
 * У каждого стола 6 мест: 1–3 вдоль верхней стороны, 4–6 вдоль нижней.
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
    seat: string;
    free: string;
    taken: string;
    yours: string;
    wholeTable: string;
    clearTable: string;
    close: string;
    seatsOf: string;
    soldOut: string;
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
    seat: "Место",
    free: "Свободно",
    taken: "Занято",
    yours: "Ваше",
    wholeTable: "Все свободные места",
    clearTable: "Снять выбор",
    close: "Закрыть",
    seatsOf: "свободно {free} из 6",
    soldOut: "все места заняты",
    zones: {
      dancefloor: { name: "Танцпол", note: "1 этаж, у сцены, без мест" },
      "vip-table": { name: "VIP со столом", note: "2 этаж, место за столом, 6 мест у стола" },
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
    seat: "Орын",
    free: "Бос",
    taken: "Бос емес",
    yours: "Сіздікі",
    wholeTable: "Барлық бос орындар",
    clearTable: "Таңдауды алу",
    close: "Жабу",
    seatsOf: "6 орынның {free} бос",
    soldOut: "барлық орын бос емес",
    zones: {
      dancefloor: { name: "Танцпол", note: "1 қабат, сахна жанында, орынсыз" },
      "vip-table": { name: "Үстелі бар VIP", note: "2 қабат, үстел басындағы орын, үстелде 6 орын" },
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
    seat: "Seat",
    free: "Free",
    taken: "Taken",
    yours: "Yours",
    wholeTable: "All free seats",
    clearTable: "Clear",
    close: "Close",
    seatsOf: "{free} of 6 free",
    soldOut: "fully booked",
    zones: {
      dancefloor: { name: "Dance floor", note: "Floor 1, by the stage, standing" },
      "vip-table": { name: "VIP table", note: "Floor 2, a seat at a table, 6 seats per table" },
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

/** Места стола по порядку: 1–3 — верхняя сторона, 4–6 — нижняя. */
const tableSeats = (n: number) => Array.from({ length: TABLE_SEATS }, (_, i) => seatId(n, i + 1));

/** Центр места на схеме: три места над столом и три под ним. */
function seatDot(t: { x: number; y: number }, i: number) {
  const col = i % SEATS_PER_SIDE;
  const top = i < SEATS_PER_SIDE;
  return { cx: t.x + (TW * (col + 0.5)) / SEATS_PER_SIDE, cy: top ? t.y - 5 : t.y + TH + 5 };
}

export function MotorScheme({
  locale,
  active,
  seats,
  taken,
  openTable,
  onZone,
  onTable,
  onSeat,
  onWholeTable,
  onCloseTable,
}: {
  locale: Locale;
  /** Зоны, которые сейчас в заказе (подсвечиваются). */
  active: MotorZone[];
  /** Выбранные места, например "table-7-3". */
  seats: string[];
  /** Занятые места (проданы или в чужой брони). */
  taken: Set<string>;
  /** Стол, места которого сейчас выбирают. */
  openTable: number | null;
  onZone: (zone: MotorZone) => void;
  onTable: (n: number) => void;
  onSeat: (seat: string) => void;
  /** Выбрать все свободные места стола или снять выбор со стола. */
  onWholeTable: (n: number) => void;
  onCloseTable: () => void;
}) {
  const tx = MOTOR_TEXT[locale];
  const [floor, setFloor] = useState<1 | 2>(1);
  const chosen = new Set(seats);
  // Стол открыли из списка выбранных мест — показываем 2 этаж.
  useEffect(() => {
    if (openTable !== null) setFloor(2);
  }, [openTable]);

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

            {/* столы и места: точка над/под столом — одно место */}
            {TABLES.map((t) => {
              const ids = tableSeats(t.n);
              const free = ids.filter((id) => !taken.has(id)).length;
              const mine = ids.filter((id) => chosen.has(id)).length;
              const full = free === 0;
              const open = openTable === t.n;
              const color = ZONE_COLOR["vip-table"];
              return (
                <g
                  key={t.n}
                  role="button"
                  tabIndex={full ? -1 : 0}
                  aria-label={`${tx.table} ${t.n}: ${full ? tx.soldOut : tx.seatsOf.replace("{free}", String(free))}`}
                  aria-pressed={open}
                  aria-disabled={full}
                  onClick={() => !full && onTable(t.n)}
                  onKeyDown={(e) => {
                    if (!full && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onTable(t.n);
                    }
                  }}
                  className={`${full ? "cursor-not-allowed" : "cursor-pointer"} outline-none [&:focus-visible>rect]:stroke-white`}
                >
                  {/* невидимая зона нажатия чуть больше стола вместе с местами */}
                  <rect x={t.x - 4} y={t.y - 11} width={TW + 8} height={TH + 22} fill="transparent" />
                  <rect
                    x={t.x}
                    y={t.y}
                    width={TW}
                    height={TH}
                    rx="7"
                    fill={full ? "#262626" : mine ? color : "#1a1a1a"}
                    fillOpacity={mine && mine < TABLE_SEATS ? 0.55 : 1}
                    stroke={full ? "#3a3a3a" : open ? "#ffffff" : color}
                    strokeWidth={open ? 2.5 : mine ? 2 : 1.5}
                    className="transition-[fill,stroke] duration-200"
                  />
                  <text
                    x={t.x + TW / 2}
                    y={t.y + TH / 2 + 5}
                    textAnchor="middle"
                    className={`pointer-events-none font-display text-[13px] font-bold ${full ? "fill-white/30" : mine ? "fill-[#1a1a1a]" : "fill-white"}`}
                  >
                    {t.n}
                  </text>
                  {ids.map((id, i) => {
                    const d = seatDot(t, i);
                    const isTaken = taken.has(id);
                    const isMine = chosen.has(id);
                    return (
                      <circle
                        key={id}
                        cx={d.cx}
                        cy={d.cy}
                        r="3.6"
                        className="pointer-events-none transition-[fill] duration-200"
                        fill={isMine ? color : isTaken ? "#3a3a3a" : "#121212"}
                        stroke={isTaken && !isMine ? "#3a3a3a" : color}
                        strokeWidth="1.2"
                      />
                    );
                  })}
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

      {floor === 2 && openTable !== null && (
        <TablePicker
          n={openTable}
          locale={locale}
          chosen={chosen}
          taken={taken}
          onSeat={onSeat}
          onWhole={() => onWholeTable(openTable)}
          onClose={onCloseTable}
        />
      )}

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

/** Крупный выбор мест одного стола: удобно попадать пальцем на телефоне. */
function TablePicker({
  n,
  locale,
  chosen,
  taken,
  onSeat,
  onWhole,
  onClose,
}: {
  n: number;
  locale: Locale;
  chosen: Set<string>;
  taken: Set<string>;
  onSeat: (seat: string) => void;
  onWhole: () => void;
  onClose: () => void;
}) {
  const tx = MOTOR_TEXT[locale];
  const ids = tableSeats(n);
  const free = ids.filter((id) => !taken.has(id)).length;
  const mine = ids.filter((id) => chosen.has(id)).length;
  const color = ZONE_COLOR["vip-table"];

  const seatButton = (id: string, i: number) => {
    const isTaken = taken.has(id);
    const isMine = chosen.has(id);
    return (
      <button
        key={id}
        type="button"
        disabled={isTaken}
        aria-pressed={isMine}
        aria-label={`${tx.table} ${n}, ${tx.seat.toLowerCase()} ${i + 1}: ${isTaken ? tx.taken : isMine ? tx.yours : tx.free}`}
        onClick={() => onSeat(id)}
        className={`flex h-11 w-11 items-center justify-center rounded-full font-display text-sm font-bold transition-[background-color,color,transform] duration-150 active:scale-95 sm:h-12 sm:w-12 ${
          isTaken
            ? "cursor-not-allowed bg-[#262626] text-white/25 line-through"
            : isMine
              ? "bg-[#f5b83d] text-[#1a1a1a] shadow-[0_0_0_3px_rgba(245,184,61,0.25)]"
              : "border-[1.5px] border-[#f5b83d] text-fg hover:bg-[#f5b83d]/15"
        }`}
      >
        {i + 1}
      </button>
    );
  };

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-4 sm:p-5" role="group" aria-label={`${tx.table} ${n}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-bold uppercase tracking-[0.04em] text-fg">
            {tx.table} {n}
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">{tx.seatsOf.replace("{free}", String(free))}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tx.close}
          className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-fg-muted transition-colors hover:bg-ink-deep hover:text-fg"
        >
          ×
        </button>
      </div>

      <div className="mx-auto mt-4 flex max-w-[260px] flex-col items-center gap-2.5">
        <div className="flex w-full justify-around">{ids.slice(0, SEATS_PER_SIDE).map((id, i) => seatButton(id, i))}</div>
        <div
          className="flex h-14 w-full items-center justify-center rounded-xl font-display text-lg font-bold"
          style={{ background: mine ? `${color}33` : "#1a1a1a", border: `1.5px solid ${color}`, color }}
        >
          {n}
        </div>
        <div className="flex w-full justify-around">
          {ids.slice(SEATS_PER_SIDE).map((id, i) => seatButton(id, i + SEATS_PER_SIDE))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex gap-4 text-[11px] text-fg-muted">
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-[#f5b83d]" />{tx.free}</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#f5b83d]" />{tx.yours}</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#3a3a3a]" />{tx.taken}</li>
        </ul>
        {free > 0 && (
          <button
            type="button"
            onClick={onWhole}
            className="rounded-full border border-line-strong px-3.5 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-[#f5b83d] hover:text-[#f5b83d]"
          >
            {mine > 0 ? tx.clearTable : tx.wholeTable}
          </button>
        )}
      </div>
    </div>
  );
}
