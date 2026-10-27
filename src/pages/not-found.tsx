import Link from "next/link";

import { defaultLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

/**
 * not-found.tsx не получает params, поэтому локаль здесь неизвестна —
 * показываем текст на языке по умолчанию.
 */
export default function NotFound({ failed = false, detail }: { failed?: boolean; detail?: string }) {
  const t = getDictionary(defaultLocale);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-7xl flex-col items-center justify-center px-4 sm:px-6 text-center">
      <p className="font-display text-6xl font-bold text-coral">{failed ? "Упс" : "404"}</p>
      <p className="mt-4 max-w-sm text-sm leading-6 text-fg-muted">
        {failed
          ? "Страница не загрузилась. Обновите её, обычно это помогает."
          : "Такой страницы нет. Возможно, ссылка устарела или событие уже прошло."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {failed && (
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary">
            Обновить
          </button>
        )}
        <Link href={localePath(defaultLocale)} className="btn btn-secondary">
          {t.nav.home}
        </Link>
      </div>
      {detail && <p className="mt-6 max-w-md break-words text-[11px] text-fg-subtle/60">{detail.slice(0, 200)}</p>}
    </div>
  );
}
