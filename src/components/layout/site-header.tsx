
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { NavDrawer } from "./nav-drawer";
import { isActiveNavItem, mainNav, type NavItem } from "./nav";

/**
 * Шапка-капсула: плавающая стеклянная панель, не прижатая к краям.
 *
 * На десктопе логотип стоит слева и дальше идут пункты меню. На узких
 * экранах он переключается в absolute по центру — там по краям бургер
 * и поиск, а меню уезжает в боковую шторку.
 */
export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);

  // Запоминаем путь, на котором шторку открыли: переход по ссылке не
  // размонтирует шапку, поэтому «открыта» считается только пока путь
  // тот же. Так состояние выводится при рендере и не нужен эффект,
  // закрывающий меню после навигации.
  const [drawer, setDrawer] = useState({ isOpen: false, path: pathname });
  const isDrawerOpen = drawer.isOpen && drawer.path === pathname;

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const items = mainNav(locale, t);

  return (
    <>
      {/* fixed, а не sticky: шапка не занимает место в потоке, поэтому
          герой начинается от самого верха и капсула лежит поверх него. */}
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:px-6 sm:pt-4">
        <div
          className={`relative mx-auto flex h-14 max-w-6xl items-center rounded-full border border-line px-3 backdrop-blur-xl transition-[background-color,box-shadow] duration-300 motion-reduce:transition-none sm:px-4 ${
            isScrolled
              ? "bg-surface/80 shadow-lg shadow-black/40"
              : "bg-surface/60"
          }`}
        >
          {/* ---------- бургер, только на узких ---------- */}
          <button
            type="button"
            onClick={() => setDrawer({ isOpen: true, path: pathname })}
            aria-label={t.nav.menu}
            aria-expanded={isDrawerOpen}
            className="flex h-9 w-9 shrink-0 flex-col items-center justify-center gap-[5px] rounded-full text-fg transition-colors hover:text-coral lg:hidden"
          >
            <span aria-hidden className="h-px w-4 bg-current" />
            <span aria-hidden className="h-px w-4 bg-current" />
          </button>

          {/* ---------- логотип ----------
              На узких экранах — absolute по центру между бургером и
              поиском. С lg встаёт в поток слева, перед пунктами. */}
          <div className="pointer-events-none absolute inset-x-0 flex justify-center lg:static lg:inset-auto lg:block lg:shrink-0">
            <Link
              href={localePath(locale)}
              aria-label="Concerts Prod"
              className="pointer-events-auto"
            >
              <Logo height={22} />
            </Link>
          </div>

          {/* ---------- пункты меню ---------- */}
          {/* mx-auto центрирует меню в свободном месте между логотипом
              и правой группой — они разной ширины, поэтому абсолютное
              центрирование по капсуле давало бы наложение на 1024px. */}
          <nav aria-label={t.nav.mainLabel} className="hidden lg:mx-auto lg:block">
            <ul className="flex items-center gap-4 xl:gap-7">
              {items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </ul>
          </nav>

          {/* ---------- поиск и языки ---------- */}
          <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0 lg:gap-2">
            <Link
              href={localePath(locale, "/events")}
              aria-label={t.actions.search}
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-coral"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                aria-hidden
                className="h-4 w-4"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </Link>

            <div className="hidden lg:block">
              <LocaleSwitcher current={locale} />
            </div>

            <Link
              href={localePath(locale, "/login")}
              className="ml-1 hidden rounded-full border border-coral px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-coral transition-colors hover:bg-coral hover:text-white sm:inline-flex"
            >
              {t.auth.login}
            </Link>
          </div>
        </div>
      </header>

      <NavDrawer
        isOpen={isDrawerOpen}
        onClose={() => setDrawer({ isOpen: false, path: pathname })}
        items={items}
        pathname={pathname}
        locale={locale}
        title={t.nav.menu}
      />
    </>
  );
}

/** Пункт капсулы: активный раздел горит кораллом. */
function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = isActiveNavItem(pathname, item.href);

  return (
    <li>
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`whitespace-nowrap font-display text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors xl:text-[12px] xl:tracking-[0.08em] ${
          isActive ? "text-coral" : "text-fg-muted hover:text-coral"
        }`}
      >
        {item.label}
      </Link>
    </li>
  );
}
