import Image from "next/image";

/**
 * Афиша события. Пока картинки нет (демо-данные, свежесозданное
 * событие) — рисуем коралловый градиент с инициалами, чтобы сетка
 * карточек не разъезжалась.
 */
export function EventPoster({
  src,
  alt,
  sizes,
  priority = false,
  className = "",
}: {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover transition-[transform,filter] duration-[900ms] ${className} ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]`}
      />
    );
  }

  const initials = alt
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center bg-[radial-gradient(120%_100%_at_20%_0%,#3a1f22_0%,#1a1a1a_55%,#111_100%)]"
    >
      <span className="font-display text-4xl font-bold tracking-[0.06em] text-coral/45">
        {initials}
      </span>
    </div>
  );
}
