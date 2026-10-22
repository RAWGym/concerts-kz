import { useEffect } from "react";
import { Navigate, Outlet, useParams, useRouteError } from "react-router";

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

  useEffect(() => {
    if (isLocale(locale)) document.documentElement.lang = htmlLang[locale];
  }, [locale]);

  if (!isLocale(locale)) return <LocaleRedirect />;
  const t = getDictionary(locale);

  return (
    <>
      <SiteHeader locale={locale} t={t} />
      {/* Компенсируем fixed-шапку: полноэкранные блоки гасят это
          отрицательным margin и уходят под капсулу. */}
      <main className="flex-1 pt-[68px] sm:pt-[72px]">
        <Outlet />
      </main>
      <SiteFooter locale={locale} t={t} />
    </>
  );
}

export function RouteError() {
  const error = useRouteError();
  if (!(error instanceof NotFoundError)) console.error(error);
  return <NotFound />;
}
