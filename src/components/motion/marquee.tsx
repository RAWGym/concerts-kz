import type { ReactNode } from "react";

/**
 * Бесконечная бегущая строка. Контент рисуется дважды, а лента едет
 * ровно на половину своей ширины — шов получается невидимым.
 */
export function Marquee({
  children,
  speed = 38,
  className = "",
}: {
  children: ReactNode;
  /** Секунд на полный круг: больше — медленнее. */
  speed?: number;
  className?: string;
}) {
  return (
    <div
      className={`marquee-paused overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] ${className}`}
    >
      <div className="marquee" style={{ ["--marquee-speed" as string]: `${speed}s` }}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div aria-hidden className="flex shrink-0 items-center">
          {children}
        </div>
      </div>
    </div>
  );
}
