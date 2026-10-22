import type { Locale } from "@/i18n/config";

/** Подписи новой шапки. Отдельно от общего словаря, чтобы не плодить правок в нём. */
export const headerLabels: Record<Locale, {
  afisha: string;
  allCities: string;
  search: string;
  myTickets: string;
  cities: string[];
}> = {
  ru: { afisha: "Афиша", allCities: "Все города", search: "Поиск событий, артистов, площадок", myTickets: "Мои билеты", cities: ["Алматы", "Астана", "Шымкент", "Караганда", "Москва", "Санкт-Петербург"] },
  kz: { afisha: "Афиша", allCities: "Барлық қалалар", search: "Іс-шаралар, әртістер, алаңдар", myTickets: "Билеттерім", cities: ["Алматы", "Астана", "Шымкент", "Қарағанды", "Мәскеу", "Санкт-Петербург"] },
  en: { afisha: "Events", allCities: "All cities", search: "Search events, artists, venues", myTickets: "My tickets", cities: ["Almaty", "Astana", "Shymkent", "Karaganda", "Moscow", "Saint Petersburg"] },
};
