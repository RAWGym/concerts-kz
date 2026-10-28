// Пригласительные в PDF: каждый билет рисуется картинкой в фирменном
// стиле и кладётся отдельной страницей. PDF собираем сами (JPEG-страницы),
// без сторонних библиотек.
import qrcode from "qrcode-generator";

import { company } from "@/lib/company";

export type InviteEvent = {
  title: string;
  startsAt: string;
  doorsOpenAt: string | null;
  timezone: string;
  venue: string | null;
  city: string | null;
  address: string | null;
  ageLimit: number | null;
  slug: string;
};

export type InviteTicket = { code: string; holderName: string | null; holderPhone: string | null };

const W = 1080;
const H = 1920;
const CORAL = "#ff4d4d";
const INK = "#0d0d0d";

const DISPLAY = '"Unbounded", "Inter", system-ui, sans-serif';
const SANS = '"Inter", system-ui, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

/** Шрифты сайта должны загрузиться до рисования, иначе canvas возьмёт системные. */
async function fontsReady() {
  const sample = "ПРИГЛАСИТЕЛЬНЫЙ БИЛЕТ Гость 0123456789 Qq";
  await Promise.all([
    document.fonts.load(`700 60px "Unbounded"`, sample),
    document.fonts.load(`500 40px "Unbounded"`, sample),
    document.fonts.load(`400 30px "Inter"`, sample),
    document.fonts.load(`600 30px "Inter"`, sample),
  ]).catch(() => undefined);
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;
function logo() {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/logo-email.png";
  });
  return logoPromise;
}

const fmt = (iso: string, tz: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ru-RU", { timeZone: tz, ...opts }).format(new Date(iso));

function maskPhone(p: string | null) {
  const m = p?.match(/^\+7(\d{3})\d{3}\d{2}(\d{2})$/);
  return m ? `+7 ${m[1]} ***-**-${m[2]}` : p ?? "";
}

/** Переносит текст по словам в заданную ширину. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: "left" | "right" = "left") {
  const chars = [...text];
  const width = chars.reduce((s, c) => s + ctx.measureText(c).width + spacing, -spacing);
  let cx = align === "right" ? x - width : x;
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
}

/** Рисует один пригласительный билет на canvas 1080×1920. */
export async function drawInvite(ev: InviteEvent, t: InviteTicket) {
  await fontsReady();
  const img = await logo();
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  // фон
  ctx.fillStyle = "#ececec";
  ctx.fillRect(0, 0, W, H);

  // тёмная шапка с коралловым свечением
  const headH = 700;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, headH);
  const glow = ctx.createRadialGradient(W - 120, 60, 10, W - 120, 60, 620);
  glow.addColorStop(0, "rgba(255,77,77,0.55)");
  glow.addColorStop(1, "rgba(255,77,77,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, headH);

  if (img) ctx.drawImage(img, 72, 70, 330, (330 * img.height) / img.width);

  ctx.fillStyle = CORAL;
  ctx.font = `700 26px ${DISPLAY}`;
  spaced(ctx, "ПРИГЛАСИТЕЛЬНЫЙ", W - 72, 112, 4, "right");
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 24px ${DISPLAY}`;
  spaced(ctx, "БИЛЕТ", W - 72, 150, 4, "right");

  // дата
  const tz = ev.timezone || "Asia/Almaty";
  const date = `${fmt(ev.startsAt, tz, { day: "numeric", month: "long" })} ${fmt(ev.startsAt, tz, { year: "numeric" })}`;
  const time = fmt(ev.startsAt, tz, { hour: "2-digit", minute: "2-digit" });
  const doors = ev.doorsOpenAt ? fmt(ev.doorsOpenAt, tz, { hour: "2-digit", minute: "2-digit" }) : null;
  ctx.fillStyle = CORAL;
  ctx.font = `600 32px ${DISPLAY}`;
  spaced(ctx, `${date} · ${time}`.toUpperCase(), 72, 300, 2);
  if (doors) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `500 28px ${SANS}`;
    ctx.fillText(`Вход с ${doors}`, 72, 348);
  }

  // название: подбираем размер, чтобы влезло в 3 строки
  const top = doors ? 370 : 330;
  let size = 104;
  let lines: string[] = [];
  for (; size >= 48; size -= 4) {
    ctx.font = `700 ${size}px ${DISPLAY}`;
    lines = wrap(ctx, ev.title.toUpperCase(), W - 144);
    if (lines.length <= 3 && top + lines.length * size * 1.08 <= headH - 100) break;
  }
  ctx.fillStyle = "#ffffff";
  let y = top + size;
  for (const l of lines.slice(0, 3)) {
    ctx.fillText(l, 72, y);
    y += size * 1.08;
  }
  const place = [ev.city, ev.venue, ev.address].filter(Boolean).join(" · ");
  if (place) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `400 30px ${SANS}`;
    const pl = wrap(ctx, place, W - 144).slice(0, 2);
    pl.forEach((l, i) => ctx.fillText(l, 72, Math.min(y + 18, headH - 70) + i * 40));
  }

  // белая часть
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, headH, W, H - headH);

  // QR
  const qr = qrcode(0, "M");
  qr.addData(t.code);
  qr.make();
  const n = qr.getModuleCount();
  const qrSize = 500;
  const cell = Math.floor(qrSize / (n + 8));
  const real = cell * (n + 8);
  const qx = (W - real) / 2;
  const qy = headH + 50;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qx, qy, real, real);
  ctx.fillStyle = INK;
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++) if (qr.isDark(r, col)) ctx.fillRect(qx + (col + 4) * cell, qy + (r + 4) * cell, cell, cell);

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.font = `500 40px ${MONO}`;
  ctx.textAlign = "center";
  spacedCenter(ctx, t.code, W / 2, qy + real + 56, 10);
  ctx.textAlign = "left";

  // пунктир
  const dashY = qy + real + 100;
  ctx.strokeStyle = "#dedede";
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 14]);
  ctx.beginPath();
  ctx.moveTo(72, dashY);
  ctx.lineTo(W - 72, dashY);
  ctx.stroke();
  ctx.setLineDash([]);

  // данные
  const facts: [string, string][] = [
    ["Тип билета", "Пригласительный"],
    ["Гость", t.holderName?.trim() || "–"],
    ["Телефон", maskPhone(t.holderPhone)],
    ...(ev.ageLimit ? ([["Возраст", `${ev.ageLimit}+`]] as [string, string][]) : []),
  ];
  const colW = (W - 144) / 2;
  facts.forEach(([label, value], i) => {
    const fx = 72 + (i % 2) * colW;
    const fy = dashY + 66 + Math.floor(i / 2) * 112;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.font = `600 22px ${SANS}`;
    spaced(ctx, label.toUpperCase(), fx, fy, 3);
    ctx.fillStyle = INK;
    let v = i < 2 ? value.toUpperCase() : value;
    // Уменьшаем шрифт, пока значение не влезет в колонку, и только потом обрезаем.
    let fs = 34;
    const font = () => (i < 2 ? `700 ${fs}px ${DISPLAY}` : `600 ${fs}px ${SANS}`);
    ctx.font = font();
    while (ctx.measureText(v).width > colW - 24 && fs > 24) {
      fs -= 2;
      ctx.font = font();
    }
    while (ctx.measureText(v).width > colW - 24 && v.length > 4) v = v.slice(0, -2) + "…";
    ctx.fillText(v, fx, fy + 50);
  });

  // правила и поддержка
  const footH = 230;
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, H - footH, W, footH);
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.font = `400 26px ${SANS}`;
  const rules = wrap(
    ctx,
    "Покажите QR-код на входе с экрана или распечатанным. Один код = один проход, после сканирования он недействителен. Не публикуйте билет в соцсетях.",
    W - 144,
  );
  rules.forEach((l, i) => ctx.fillText(l, 72, H - footH + 50 + i * 34));
  ctx.fillStyle = INK;
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText(`Поддержка: ${company.phone} · ${company.email} · concerts.kz`, 72, H - 64);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.font = `400 22px ${SANS}`;
  ctx.fillText(`Организатор: ${company.name}, БИН ${company.bin}`, 72, H - 28);

  return c;
}

function spacedCenter(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number) {
  ctx.textAlign = "left";
  const chars = [...text];
  const width = chars.reduce((s, ch) => s + ctx.measureText(ch).width + spacing, -spacing);
  spaced(ctx, text, cx - width / 2, y, spacing);
}

/* ---------------- минимальный PDF из JPEG-страниц ---------------- */

const enc = new TextEncoder();

function jpegBytes(c: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("canvas"))),
      "image/jpeg",
      0.9,
    ),
  );
}

/** Собирает PDF: одна JPEG-картинка на страницу, страница 90×160 мм. */
export function buildPdf(pages: Uint8Array[], imgW = W, imgH = H) {
  const pw = 255.12; // 90 мм в пунктах
  const ph = (pw * imgH) / imgW;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (data: Uint8Array | string) => {
    const b = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(b);
    pos += b.length;
  };
  const obj = (id: number, body: (string | Uint8Array)[]) => {
    offsets[id] = pos;
    push(`${id} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = pages.length;
  // 1 — каталог, 2 — список страниц, далее по 3 объекта на страницу.
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`]);
  pages.forEach((jpg, i) => {
    const pid = pageIds[i];
    const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(pid, [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${pid + 1} 0 R >> >> /Contents ${pid + 2} 0 R >>`,
    ]);
    obj(pid + 1, [
      `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
      jpg,
      "\nendstream",
    ]);
    obj(pid + 2, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  });
  const total = 3 + n * 3;
  const xref = pos;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) table += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

/** PDF с пригласительными: каждый билет на своей странице. */
export async function invitesPdf(ev: InviteEvent, list: InviteTicket[], onProgress?: (done: number) => void) {
  const pages: Uint8Array[] = [];
  for (const t of list) {
    pages.push(await jpegBytes(await drawInvite(ev, t)));
    onProgress?.(pages.length);
  }
  return buildPdf(pages);
}

export function pdfName(ev: InviteEvent, list: InviteTicket[]) {
  const who = list.length === 1 ? (list[0].holderName?.trim() || list[0].code) : `${list.length}-sht`;
  const safe = `${ev.slug}-${who}`.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/-+/g, "-").slice(0, 80);
  return `priglashenie-${safe}.pdf`;
}

/**
 * Отдаёт PDF: на телефоне открывает меню «Поделиться» (WhatsApp, Telegram),
 * на компьютере скачивает файл.
 */
export async function sharePdf(blob: Blob, name: string, preferShare: boolean) {
  const file = new File([blob], name, { type: "application/pdf" });
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return "shared" as const;
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled" as const;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded" as const;
}
