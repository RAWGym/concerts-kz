import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

/**
 * Тонкая коралловая полоса над шапкой при смене страницы — сигнал,
 * что переход случился, пока новая страница грузит данные.
 */
export function RouteProgress() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setTick((n) => n + 1);
  }, [pathname]);

  return (
    <AnimatePresence>
      {tick > 0 && (
        <motion.div
          key={tick}
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px] origin-left bg-coral shadow-[0_0_12px_rgba(255,77,77,0.8)]"
          initial={{ scaleX: 0, opacity: 1 }}
          animate={{ scaleX: 1, opacity: [1, 1, 0] }}
          transition={{ scaleX: { duration: 0.7, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.9, times: [0, 0.75, 1] } }}
        />
      )}
    </AnimatePresence>
  );
}
