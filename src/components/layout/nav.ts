import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/routing";
import type { Dictionary } from "@/i18n/dictionaries";

export type NavItem = { href: string; label: string };

/** Главное меню: капсула шапки, боковая шторка и футер. */
export function mainNav(locale: Locale, t: Dictionary): NavItem[] {
  return [
    { href: localePath(locale, "/events"), label: t.nav.events },
    { href: localePath(locale, "/reports"), label: t.nav.reports },
    { href: localePath(locale, "/news"), label: t.nav.news },
    { href: localePath(locale, "/about"), label: t.nav.about },
    { href: localePath(locale, "/partners"), label: t.nav.partners },
    { href: localePath(locale, "/contacts"), label: t.nav.contacts },
  ];
}

/**
 * Активен ли пункт для текущего пути. Вложенные страницы тоже
 * подсвечивают раздел: /ru/events/dvizh-fest → «События».
 */
export function isActiveNavItem(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
