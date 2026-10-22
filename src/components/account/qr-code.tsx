import qrcode from "qrcode-generator";
import { useMemo } from "react";

/**
 * QR-код билета в SVG: резкий на любом экране и без сети.
 * Рисуем одним path — так браузер не создаёт сотни узлов.
 */
export function QrCode({
  value,
  className = "",
  color = "#0d0d0d",
}: {
  value: string;
  className?: string;
  color?: string;
}) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      }
    }
    return { size: n, path: d };
  }, [value]);

  const pad = 2;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={value}
      className={className}
    >
      <rect x={-pad} y={-pad} width={size + pad * 2} height={size + pad * 2} fill="#fff" />
      <path d={path} fill={color} />
    </svg>
  );
}
