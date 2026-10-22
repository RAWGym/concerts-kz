
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { HeroLabels, HeroSlide } from "./types";

/**
 * Кинематографичный герой главной.
 *
 * Порядок слоёв: фон → имя → портрет → зерно → инфо-блок. Зерно лежит
 * ровно между портретом и инфо-блоком, поэтому ложится на фон, слово
 * и артиста, но не трогает текст с кнопками внизу.
 *
 * Параллакс и интро разведены по разным элементам: снаружи motion-слой
 * со смещением от мыши, внутри — со своей анимацией появления. Если
 * задать и то и другое на одном узле, `y` из `initial` перебивает
 * motion-value параллакса, и он просто не работает.
 */

/**
 * Плёночное зерно. baseFrequency задаёт размер частиц: чем меньше
 * значение, тем крупнее «песок».
 *
 * feColorMatrix обесцвечивает шум: feTurbulence генерирует его по
 * трём каналам независимо, и без этого зерно цветное — на коралле
 * лезут посторонние оттенки.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** Доля ширины экрана, которую занимает гигантское имя. */
const WORD_FILL = 0.94;
/** Кегль, на котором меряем слово, чтобы вычислить итоговый. */
const MEASURE_SIZE = 100;

/** Амплитуда параллакса в пикселях. */
const SHIFT = { glow: 3, word: 10, portrait: 5 };

/** Инертность слоёв: чем мягче пружина, тем «тяжелее» слой. */
const SPRING = {
  glow: { stiffness: 26, damping: 22 },
  word: { stiffness: 55, damping: 20 },
  portrait: { stiffness: 95, damping: 18 },
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Подбирает кегль так, чтобы имя целиком помещалось по ширине.
 * Меряем скрытым клоном на фиксированном кегле и пересчитываем
 * пропорцией — работает для имени любой длины.
 */
function useFittedFontSize(text: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const fit = () => {
      const width = measure.offsetWidth;
      if (!width) return;
      setFontSize((container.clientWidth * WORD_FILL * MEASURE_SIZE) / width);
    };

    fit();
    // Шрифт может доехать позже — иначе кегль подберётся под
    // запасной шрифт и слово вылезет за экран.
    document.fonts?.ready.then(fit).catch(() => {});

    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text]);

  return { containerRef, measureRef, fontSize };
}

/** Положение мыши в диапазоне -1..1 от центра экрана. */
function usePointer(enabled: boolean) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  useEffect(() => {
    if (!enabled) return;

    const onMove = (event: PointerEvent) => {
      // На тач-экранах pointermove сыплется во время скролла и кадр
      // дёргается — реагируем только на настоящую мышь.
      if (event.pointerType === "touch") return;
      x.set((event.clientX / window.innerWidth) * 2 - 1);
      y.set((event.clientY / window.innerHeight) * 2 - 1);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [enabled, x, y]);

  return { x, y };
}

/** Пара «пружина + амплитуда» для одного слоя. */
function useLayerShift(
  x: ReturnType<typeof useMotionValue<number>>,
  y: ReturnType<typeof useMotionValue<number>>,
  spring: { stiffness: number; damping: number },
  shift: number,
) {
  const sx = useSpring(x, spring);
  const sy = useSpring(y, spring);
  return {
    x: useTransform(sx, (v) => v * shift),
    y: useTransform(sy, (v) => v * shift),
  };
}

export function CinematicHero({
  slides,
  labels,
}: {
  slides: HeroSlide[];
  labels: HeroLabels;
}) {
  const reduceMotion = useReducedMotion();
  const animated = !reduceMotion;

  const { x, y } = usePointer(animated);
  const glow = useLayerShift(x, y, SPRING.glow, SHIFT.glow);
  const word = useLayerShift(x, y, SPRING.word, SHIFT.word);
  const portrait = useLayerShift(x, y, SPRING.portrait, SHIFT.portrait);

  const slide = slides[0];
  const { containerRef, measureRef, fontSize } = useFittedFontSize(
    slide?.name ?? "",
  );

  if (!slide) return null;

  return (
    // Отрицательный margin гасит отступ под fixed-шапку из layout:
    // кадр начинается от самого верха, капсула лежит поверх него.
    <section className="relative isolate -mt-[68px] flex min-h-[80svh] flex-col overflow-hidden bg-ink sm:-mt-[72px] md:min-h-[100svh]">
      {/* ---------- слой 1: фон, свечения, виньетка ---------- */}
      <motion.div
        aria-hidden
        className="absolute inset-0 -z-30"
        style={{ x: glow.x, y: glow.y }}
      >
        <motion.div
          className="absolute inset-0"
          initial={animated ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        >
          {/* Свечение цветом артиста */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(55% 45% at 50% 40%, ${slide.mood.glow} 0%, transparent 72%)`,
            }}
          />
          {/* Приглушённые подсветки: тёплая слева, холодная справа,
              белая сверху. Каждая едва заметна, вместе дают объём. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(38% 44% at 14% 62%, rgba(255,77,77,0.13) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(34% 40% at 88% 34%, rgba(255,255,255,0.07) 0%, transparent 72%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(46% 26% at 50% 6%, rgba(255,255,255,0.05) 0%, transparent 75%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(30% 34% at 78% 82%, rgba(255,120,90,0.08) 0%, transparent 70%)",
            }}
          />
          {/* Виньетка собирает кадр к центру */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 100% at 50% 45%, transparent 32%, rgba(0,0,0,0.55) 74%, rgba(0,0,0,0.88) 100%)",
            }}
          />
        </motion.div>
      </motion.div>

      {/* ---------- слой 2: гигантское имя ---------- */}
      <div
        ref={containerRef}
        aria-hidden
        // На мобильной слово опущено так, чтобы голова артиста
        // перекрывала его нижнюю треть, но верх букв не уезжал под
        // капсулу шапки.
        className="pointer-events-none absolute inset-x-0 top-[12.5%] -z-20 flex justify-center md:top-[20%]"
      >
        {/* Скрытый клон для замера ширины на фиксированном кегле. */}
        <span
          ref={measureRef}
          className="invisible absolute whitespace-nowrap font-display font-bold uppercase tracking-[-0.04em]"
          style={{ fontSize: MEASURE_SIZE, lineHeight: 1 }}
        >
          {slide.name}
        </span>

        <motion.div style={{ x: word.x, y: word.y }}>
          <motion.span
            className="block whitespace-nowrap font-display font-bold uppercase leading-[0.78] tracking-[-0.04em]"
            style={{
              // Чистая заливка акцентом. Зерно на буквы даёт общий
              // слой шума, который лежит выше по стопке: подмешивать
              // его ещё и в саму заливку нельзя — цвет уходит.
              color: slide.mood.accent,
              fontSize: fontSize ? `${fontSize}px` : undefined,
              // Пока кегль не посчитан — прячем, иначе виден скачок.
              visibility: fontSize ? "visible" : "hidden",
            }}
            initial={animated ? { opacity: 0, filter: "blur(14px)" } : false}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.3, delay: 0.25, ease: "easeOut" }}
          >
            {slide.name}
          </motion.span>
        </motion.div>
      </div>

      {/* ---------- слой 3: портрет ---------- */}
      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 flex justify-center"
        style={{ x: portrait.x, y: portrait.y }}
      >
        <motion.div
          // Контейнер шире экрана: при object-contain портрет
          // упирался в ширину телефона и выходил мелким. Лишние
          // прозрачные поля по бокам обрезает overflow секции.
          className="relative h-[68svh] w-[162vw] max-w-none shrink-0 md:h-[88svh] md:w-full md:max-w-[920px]"
          initial={
            animated ? { opacity: 0, y: 34, filter: "blur(10px)" } : false
          }
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.4, delay: 0.5, ease: EASE_OUT }}
        >
          <Image
            src={slide.portraitUrl}
            alt={slide.name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 920px"
            className="object-contain object-bottom"
          />
        </motion.div>
      </motion.div>

      {/* ---------- слой 4: зерно ----------
          Между портретом и инфо-блоком: ложится на фон, слово и
          артиста, но не на текст с кнопками. */}
      <div
        aria-hidden
        // soft-light вместо overlay: overlay выбеливал светлые места
        // и уводил цвет, мягкий свет только подмешивает фактуру.
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.45] mix-blend-soft-light"
        style={{ backgroundImage: GRAIN, backgroundSize: "320px 320px" }}
      />

      {/* ---------- слой 5: инфо-блок ---------- */}
      <div
        aria-hidden
        // На мобильной затемнение короче, иначе оно съедает артиста.
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[38%] bg-gradient-to-t from-ink via-ink/80 to-transparent md:h-1/2 md:via-ink/75"
      />

      <motion.div
        className="relative z-20 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-5 pb-4 pt-24 md:pb-7"
        initial={animated ? "hidden" : false}
        animate="shown"
        variants={{
          hidden: {},
          shown: { transition: { delayChildren: 0.95, staggerChildren: 0.12 } },
        }}
      >
        <div className="max-w-md">
          <Reveal>
            <p className="overline">{labels.overline}</p>
          </Reveal>

          <Reveal>
            <h1 className="mt-3 font-display text-3xl font-bold uppercase leading-[1.05] tracking-[-0.02em] text-fg md:text-4xl">
              {slide.name}
            </h1>
          </Reveal>

          {slide.subtitle && (
            <Reveal>
              <p className="mt-2 text-sm leading-6 text-fg-muted md:text-base">
                {slide.subtitle}
              </p>
            </Reveal>
          )}

          <Reveal>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-display text-xs font-semibold uppercase tracking-[0.1em] text-coral">
                {slide.schedule}
              </span>
              {(slide.city || slide.venue) && (
                <span className="text-fg-muted">
                  {[slide.city, slide.venue].filter(Boolean).join(" · ")}
                </span>
              )}
              {slide.price && (
                <span className="text-fg-muted">{slide.price}</span>
              )}
            </div>
          </Reveal>

          <Reveal>
            <div className="mt-2.5 flex flex-wrap gap-3">
              {slide.ticketonUrl ? (
                <a
                  href={slide.ticketonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  {labels.buyTicket}
                </a>
              ) : (
                <span className="btn btn-secondary cursor-default opacity-70">
                  {labels.soon}
                </span>
              )}

              <Link href={slide.detailsHref} className="btn btn-secondary">
                {labels.details}
              </Link>
            </div>
          </Reveal>
        </div>
      </motion.div>
    </section>
  );
}

/** Строка инфо-блока: выезжает снизу в общей очереди stagger. */
function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 18 }, shown: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
