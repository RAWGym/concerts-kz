import Link from "next/link";

import { defaultLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

/**
 * not-found.tsx не получает params, поэтому локаль здесь неизвестна —
 * показываем текст на языке по умолчанию.
 */
export default function NotFound() {
  const t = getDictionary(defaultLocale);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center px-5 text-center">
      <p className="font-display text-6xl font-bold text-coral">404</p>
      <p className="mt-4 max-w-sm text-sm leading-6 text-fg-muted">
        {t.home.emptyEvents}
      </p>
      <Link href={localePath(defaultLocale)} className="btn btn-secondary mt-8">
        {t.nav.home}
      </Link>
    </div>
  );
}
