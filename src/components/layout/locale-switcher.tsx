
import Link from "next/link";
import { usePathname } from "next/navigation";

import { locales, localeLabels, type Locale } from "@/i18n/config";
import { switchLocaleInPath } from "@/i18n/routing";

/**
 * Переключатель RU / KZ / EN. Ведёт на ту же страницу в другой локали
 * и запоминает выбор — тот же cookie читает proxy.ts.
 */
/** Тот же cookie читает proxy.ts, когда локали в пути нет. */
function rememberLocale(locale: Locale) {
  const year = 60 * 60 * 24 * 365;
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${year}; samesite=lax`;
}

export function LocaleSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-0.5 sm:gap-1" aria-label="Язык / Language">
      {locales.map((locale) => {
        const isCurrent = locale === current;

        return (
          <Link
            key={locale}
            href={switchLocaleInPath(pathname, locale)}
            hrefLang={locale}
            aria-current={isCurrent ? "true" : undefined}
            onClick={() => rememberLocale(locale)}
            className={`rounded-md px-1.5 py-1 font-display text-[10px] font-semibold tracking-[0.06em] transition-colors sm:px-2 sm:text-[11px] sm:tracking-[0.12em] ${
              isCurrent
                ? "bg-surface-2 text-fg"
                : "text-fg-subtle hover:text-fg"
            }`}
          >
            {localeLabels[locale]}
          </Link>
        );
      })}
    </div>
  );
}
