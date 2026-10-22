/**
 * Полоса живых фото с наших концертов. Используется точечно на
 * внутренних страницах, чтобы оживить текст, но не перегружать.
 */
export function PhotoStrip({ photos, className = "" }: { photos: { src: string; alt: string }[]; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 md:grid-cols-[1.6fr_1fr_1fr] ${className}`}>
      {photos.map((p, i) => (
        <div
          key={p.src}
          className={`relative overflow-hidden rounded-card bg-surface ${i === 0 ? "col-span-2 aspect-[16/9] md:col-span-1 md:aspect-auto md:h-full" : "aspect-[4/5]"}`}
        >
          <img src={p.src} alt={p.alt} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-[1.03]" />
        </div>
      ))}
    </div>
  );
}

/** Фон из фото с затемнением для CTA-блоков. */
export function PhotoBackdrop({ src }: { src: string }) {
  return (
    <>
      <img src={src} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/40" />
    </>
  );
}
