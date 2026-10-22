import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Число, которое «набегает» от нуля, когда попадает в экран.
 *
 * Значения в админке — строки вида «150+», «10 лет» или «1,2 млн»:
 * анимируем только первое число, а всё вокруг оставляем как есть.
 * Если числа нет, показываем строку без анимации.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();

  const match = value.match(/^(\D*)(\d[\d\s]*(?:[.,]\d+)?)(.*)$/);
  const prefix = match?.[1] ?? "";
  const raw = match?.[2] ?? "";
  const suffix = match?.[3] ?? "";
  const decimals = raw.match(/[.,](\d+)$/)?.[1].length ?? 0;
  const separator = raw.includes(",") ? "," : ".";
  const target = Number(raw.replace(/\s/g, "").replace(",", "."));
  const grouped = /\d\s\d/.test(raw);

  const hasNumber = Boolean(match) && !Number.isNaN(target);
  const [current, setCurrent] = useState(reduce || !hasNumber ? target : 0);

  useEffect(() => {
    if (!inView || reduce || !hasNumber) return;
    const controls = animate(0, target, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setCurrent,
    });
    return () => controls.stop();
  }, [inView, reduce, target, hasNumber]);

  if (!hasNumber) return <span className={className}>{value}</span>;

  let shown = current.toFixed(decimals).replace(".", separator);
  if (grouped) shown = shown.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown}
      {suffix}
    </span>
  );
}
