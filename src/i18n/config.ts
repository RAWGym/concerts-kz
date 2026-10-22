export const locales = ["ru", "kz", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ru";

/** Что показываем в переключателе языка в шапке. */
export const localeLabels: Record<Locale, string> = {
  ru: "RU",
  kz: "KZ",
  en: "EN",
};

/**
 * В URL и в базе локаль называется `kz` — так её видит менеджер и так
 * она подписана в макете. В атрибут <html lang> уходит корректный
 * BCP-47, иначе поисковики и скринридеры считают язык казахским
 * ошибочно (`kz` — это код Казахстана, а не языка).
 */
export const htmlLang: Record<Locale, string> = {
  ru: "ru",
  kz: "kk",
  en: "en",
};

/** Локаль для Intl.NumberFormat / Intl.DateTimeFormat. */
export const intlLocale: Record<Locale, string> = {
  ru: "ru-RU",
  kz: "kk-KZ",
  en: "en-GB",
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** Определяет локаль по заголовку Accept-Language. */
export function matchLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      return { tag: tag.toLowerCase(), quality: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (base === "kk" || base === "kz") return "kz";
    if (base === "ru") return "ru";
    if (base === "en") return "en";
  }

  return defaultLocale;
}
