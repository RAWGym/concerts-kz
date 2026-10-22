import { isLocale, type Locale } from "./config";

/**
 * Все внутренние ссылки строим через эту функцию: локаль — первый
 * сегмент пути, забыть про неё нельзя, иначе proxy.ts отправит
 * посетителя в редирект.
 */
export function localePath(locale: Locale, path = "/"): string {
  if (path === "/") return `/${locale}`;
  return `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Меняет локаль в текущем пути, сохраняя страницу:
 * /ru/events/jony-almaty → /en/events/jony-almaty
 */
export function switchLocaleInPath(pathname: string, next: Locale): string {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length > 0 && isLocale(segments[0])) {
    segments[0] = next;
    return `/${segments.join("/")}`;
  }

  return localePath(next, pathname);
}
