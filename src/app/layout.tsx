import { motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams, useRouteError } from "react-router";

import { RouteProgress } from "@/components/motion/route-progress";

import { Announcement } from "@/components/layout/announcement";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { defaultLocale, htmlLang, isLocale, matchLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import NotFound from "@/pages/not-found";
import { NotFoundError } from "next/navigation";

const LOCALE_KEY = "locale";

function savedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    return v && isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

export function rememberLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // приватный режим: просто не запоминаем
  }
}

/** «/» и пути без локали отправляем на язык посетителя. */
export function LocaleRedirect() {
  const locale = savedLocale() ?? matchLocale(navigator.languages?.join(",") ?? null) ?? defaultLocale;
  const path = window.location.pathname === "/" ? "" : window.location.pathname;
  return <Navigate to={`/${locale}${path}${window.location.search}`} replace />;
}

export function SiteLayout() {
  const { locale = "" } = useParams();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();

  useEffect(() => {
    if (isLocale(locale)) document.documentElement.lang = htmlLang[locale];
  }, [locale]);

  if (!isLocale(locale)) return <LocaleRedirect />;
  const t = getDictionary(locale);

  return (
    <>
      <RouteProgress />
      <SiteHeader locale={locale} t={t} />
      {/* Компенсируем fixed-шапку: полноэкранные блоки гасят это
          отрицательным margin и уходят под капсулу. */}
      <main className="flex-1 pt-14 lg:pt-[108px]">
        {/* Переход между страницами: новая страница мягко всплывает.
            Ключ — путь без query, чтобы смена вкладки в кабинете или
            фильтра в афише не перерисовывала страницу целиком. */}
        <motion.div
          key={pathname}
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>
      <SiteFooter locale={locale} t={t} />
      <Announcement locale={locale} />
    </>
  );
}

/** После выкладки старые файлы страниц удаляются: открытая вкладка их не найдёт. */
export function isStaleChunk(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|module script|ChunkLoadError|Unable to preload/i.test(msg);
}

/** Один раз перезагружаем страницу, чтобы взять свежую версию сайта. */
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem("chunk-reload") ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem("chunk-reload", String(Date.now()));
  } catch {
    /* без хранилища просто перезагружаем */
  }
  window.location.reload();
  return true;
}

export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  const notFound = error instanceof NotFoundError;
  const stale = !notFound && isStaleChunk(error);
  // Случайный сбой отрисовки (часто из-за расширений браузера, которые
  // правят страницу): тихо перерисовываем ту же страницу один раз.
  const retry = !notFound && !stale && firstRetry(location.pathname);

  useEffect(() => {
    if (retry) navigate(location.pathname + location.search, { replace: true });
  }, [retry, navigate, location.pathname, location.search]);

  if (notFound) return <NotFound />;
  if (stale && reloadOnce()) return null;
  if (retry) return null;
  console.error(error);
  return <NotFound failed detail={error instanceof Error ? error.message : String(error)} />;
}

const retried = new Map<string, number>();
function firstRetry(path: string) {
  const last = retried.get(path) ?? 0;
  if (Date.now() - last < 10_000) return false;
  retried.set(path, Date.now());
  return true;
}
