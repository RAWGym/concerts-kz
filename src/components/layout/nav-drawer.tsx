
import Link from "next/link";
import { useEffect, useRef } from "react";

import { LocaleSwitcher } from "./locale-switcher";
import { isActiveNavItem, type NavItem } from "./nav";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

/**
 * Боковая шторка навигации для экранов уже 1024px.
 *
 * Стекло и коралловый акцент те же, что у капсулы шапки, — меню
 * читается как её продолжение, а не как отдельный экран.
 */
export function NavDrawer({
  isOpen,
  onClose,
  items,
  pathname,
  locale,
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: NavItem[];
  pathname: string;
  locale: Locale;
  title: string;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Подложка: гасит фон и ловит клик мимо шторки. */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink-deep/70 backdrop-blur-sm transition-opacity duration-300 motion-reduce:transition-none lg:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Пока шторка закрыта, её содержимое убрано из фокуса и от
        // скринридеров — иначе Tab уводит в невидимое меню.
        inert={!isOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col border-r border-line bg-surface/80 backdrop-blur-xl transition-transform duration-300 ease-out motion-reduce:transition-none lg:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-end px-5">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={title}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-line-strong text-fg-muted transition-colors hover:border-coral hover:text-coral"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav aria-label={title} className="flex-1 overflow-y-auto px-5 pb-6">
          <ul className="flex flex-col">
            {items.map((item) => {
              const isActive = isActiveNavItem(pathname, item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? "page" : undefined}
                    className={`block border-b border-line py-4 font-display text-lg font-semibold uppercase tracking-[0.02em] transition-colors ${
                      isActive ? "text-coral" : "text-fg hover:text-coral"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="safe-bottom flex items-center justify-between gap-4 border-t border-line px-5 py-5">
          <LocaleSwitcher current={locale} />
          <Link
            href={localePath(locale, "/login")}
            onClick={onClose}
            className="rounded-full border border-coral px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-coral"
          >
            {getDictionary(locale).auth.login}
          </Link>
        </div>
      </div>
    </>
  );
}
