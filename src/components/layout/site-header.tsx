
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { initials, useSession } from "@/lib/account/session";
import { motion } from "framer-motion";

import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./logo";
import { NavDrawer } from "./nav-drawer";
import { headerLabels } from "./header-labels";
import { isActiveNavItem, mainNav } from "./nav";

/**
 * Шапка в две строки.
 *
 * Сверху: логотип, кнопка «Афиша», выбор города, поиск, язык, «Мои
 * билеты» и вход. Снизу — жанры и разделы сайта; при прокрутке
 * нижняя строка сворачивается, остаётся компактная панель.
 * На телефоне: бургер, логотип, поиск по нажатию и аватар.
 */
export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  const pathname = usePathname();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const l = headerLabels[locale];

  const [drawer, setDrawer] = useState({ isOpen: false, path: pathname });
  const isDrawerOpen = drawer.isOpen && drawer.path === pathname;

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const items = mainNav(locale, t);
  const eventsPath = localePath(locale, "/events");
  const onEvents = pathname === eventsPath;
  const activeCategory = onEvents ? params.get("category") : null;
  const activeCity = onEvents ? params.get("city") : null;

  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
    setMobileSearch(false);
    navigate(q ? `${eventsPath}?q=${encodeURIComponent(q)}` : eventsPath);
  }

  const searchField = (autoFocus = false) => (
    <form onSubmit={search} role="search" className="relative w-full">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        name="q"
        type="search"
        defaultValue={onEvents ? (params.get("q") ?? "") : ""}
        key={onEvents ? params.get("q") : "x"}
        autoFocus={autoFocus}
        placeholder={l.search}
        aria-label={t.actions.search}
        className="h-11 w-full rounded-full border border-line-strong bg-surface/70 pl-11 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle hover:border-fg-faint focus:border-coral focus:bg-surface"
      />
    </form>
  );

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b border-line backdrop-blur-xl transition-[background-color,box-shadow] duration-300 ${
          isScrolled ? "bg-ink/92 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)]" : "bg-ink/80"
        }`}
      >
        {/* ---------- верхняя строка ---------- */}
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:h-16 lg:gap-4">
          <button
            type="button"
            onClick={() => setDrawer({ isOpen: true, path: pathname })}
            aria-label={t.nav.menu}
            aria-expanded={isDrawerOpen}
            className="-ml-1 flex h-9 w-9 shrink-0 flex-col items-center justify-center gap-[5px] rounded-full text-fg transition-colors hover:text-coral lg:hidden"
          >
            <span aria-hidden className="h-px w-4 bg-current" />
            <span aria-hidden className="h-px w-4 bg-current" />
          </button>

          <Link href={localePath(locale)} aria-label="Concerts Prod" className="shrink-0">
            <Logo height={24} />
          </Link>

          <Link
            href={eventsPath}
            className="hidden shrink-0 items-center gap-2 rounded-full bg-coral px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_8px_24px_-10px_rgba(255,77,77,0.8)] transition-[background-color,transform] hover:-translate-y-px hover:bg-coral-hover md:inline-flex"
          >
            <TicketIcon className="h-4 w-4" />
            {l.afisha}
          </Link>

          <CityPicker locale={locale} active={activeCity} eventsPath={eventsPath} />

          <div className="hidden min-w-0 flex-1 sm:block">{searchField()}</div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0 lg:gap-3">
            <button
              type="button"
              onClick={() => setMobileSearch((v) => !v)}
              aria-label={t.actions.search}
              aria-expanded={mobileSearch}
              className="flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-coral sm:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden className="h-4 w-4">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>

            <div className="hidden xl:block">
              <LocaleSwitcher current={locale} />
            </div>

            <Link
              href={localePath(locale, "/account")}
              className="hidden flex-col items-center gap-0.5 px-1 text-fg-muted transition-colors hover:text-coral lg:flex"
            >
              <TicketIcon className="h-[18px] w-[18px]" />
              <span className="text-[11px] font-medium">{l.myTickets}</span>
            </Link>

            <AccountButton locale={locale} t={t} />
          </div>
        </div>

        {/* ---------- поиск на телефоне ---------- */}
        {mobileSearch && <div className="px-4 pb-3 sm:hidden">{searchField(true)}</div>}

        {/* ---------- нижняя строка: жанры и разделы ---------- */}
        <div
          className={`hidden overflow-hidden border-t border-line/70 transition-[max-height,opacity] duration-300 lg:block ${
            isScrolled ? "max-h-0 opacity-0" : "max-h-12 opacity-100"
          }`}
        >
          <div className="mx-auto flex h-11 max-w-7xl items-center gap-1 px-3">
            {CATEGORIES.map((c) => {
              const isActive = activeCategory === c;
              return (
                <Link
                  key={c}
                  href={`${eventsPath}?category=${c}`}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    isActive ? "bg-coral/15 text-coral" : "text-fg hover:bg-surface hover:text-coral"
                  }`}
                >
                  {t.categories[c]}
                </Link>
              );
            })}

            <span aria-hidden className="mx-3 h-4 w-px bg-line-strong" />

            <nav aria-label={t.nav.mainLabel} className="flex items-center gap-1">
              {items.filter((i) => i.href !== eventsPath).map((item) => {
                const isActive = isActiveNavItem(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative rounded-full px-3 py-1.5 text-[13px] transition-colors ${
                      isActive ? "text-coral" : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    {item.label}
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        className="absolute inset-x-3 -bottom-[7px] h-0.5 rounded-full bg-coral"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
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

const CATEGORIES = ["concert", "festival", "standup", "show", "open_air"] as const;

function TicketIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2.2" />
    </svg>
  );
}

/** Выбор города: ведёт в афишу с фильтром ?city=. */
function CityPicker({ locale, active, eventsPath }: { locale: Locale; active: string | null; eventsPath: string }) {
  const l = headerLabels[locale];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative hidden shrink-0 md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm text-fg transition-colors hover:text-coral"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4 text-coral">
          <path d="M21 3 3 10.5l7.2 2.3L12.5 20z" />
        </svg>
        <span className="max-w-[120px] truncate">{active ?? l.allCities}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={`h-3 w-3 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 top-full mt-2 w-56 overflow-hidden rounded-card border border-line bg-surface p-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]">
          {[null, ...l.cities].map((c) => (
            <li key={c ?? "all"}>
              <Link
                href={c ? `${eventsPath}?city=${encodeURIComponent(c)}` : eventsPath}
                onClick={() => setOpen(false)}
                className={`block rounded-btn px-3 py-2 text-sm transition-colors hover:bg-surface-2 ${active === c ? "text-coral" : "text-fg-muted hover:text-fg"}`}
              >
                {c ?? l.allCities}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Вход или аватар покупателя. Пока сессия проверяется, держим место
 * пустым кругом, чтобы капсула не прыгала.
 */
function AccountButton({ locale, t }: { locale: Locale; t: Dictionary }) {
  const session = useSession();

  if (session.status === "loading") {
    return <span aria-hidden className="ml-1 hidden h-9 w-9 rounded-full bg-surface-2/60 sm:block" />;
  }

  if (session.status === "user") {
    return (
      <Link
        href={localePath(locale, "/account")}
        aria-label={t.auth.account}
        title={session.user.email}
        className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ff6b5b,#d6302c)] font-display text-[11px] font-bold text-white ring-2 ring-transparent transition-[box-shadow,transform] hover:scale-105 hover:ring-coral/40"
      >
        {initials(session.user)}
      </Link>
    );
  }

  return (
    <Link
      href={localePath(locale, "/login")}
      className="ml-1 hidden items-center gap-2 rounded-full border border-coral px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-coral transition-colors hover:bg-coral hover:text-white sm:inline-flex"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
      </svg>
      {t.auth.login}
    </Link>
  );
}
