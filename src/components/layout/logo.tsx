/**
 * Логотип для тёмной шапки — public/logo-header.svg.
 *
 * В исходном logo.svg фоном лежит белый прямоугольник во весь холст,
 * из-за него под знаком была белая плашка. В версии для шапки эта
 * группа удалена, а начертание перекрашено в белое — тёмное на фоне
 * #0D0D0D не читалось бы. Красный оставлен родной.
 *
 * Холст остался 1536×1024, знак занимает в нём 978×262 со смещением
 * (287, 379) — поэтому кадрируем средствами CSS.
 */

const CANVAS = { width: 1536, height: 1024 };
const MARK = { x: 287, y: 379, width: 978, height: 262 };

export function Logo({ height = 32 }: { height?: number }) {
  const scale = height / MARK.height;

  return (
    <span
      role="img"
      aria-label="Concerts Prod"
      className="block shrink-0 bg-no-repeat"
      style={{
        width: Math.round(MARK.width * scale),
        height,
        backgroundImage: "url(/logo-header.svg)",
        backgroundSize: `${Math.round(CANVAS.width * scale)}px ${Math.round(CANVAS.height * scale)}px`,
        backgroundPosition: `${-Math.round(MARK.x * scale)}px ${-Math.round(MARK.y * scale)}px`,
      }}
    />
  );
}
