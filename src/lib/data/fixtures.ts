import type {
  RawEvent,
  RawNews,
  RawPartner,
  RawPhotoReport,
  RawSiteStat,
} from "./types";

/**
 * Демо-контент, повторяющий supabase/seed.sql.
 *
 * Нужен, пока в .env.local нет ключей Supabase: витрина рендерится на
 * этих данных, поэтому вёрстку можно смотреть до подключения проекта.
 * Формы при этом не работают — заявку писать некуда.
 */

const cities = {
  almaty: { ru: "Алматы", kz: "Алматы", en: "Almaty" },
  astana: { ru: "Астана", kz: "Астана", en: "Astana" },
  bishkek: { ru: "Бишкек", kz: "Бішкек", en: "Bishkek" },
  tashkent: { ru: "Ташкент", kz: "Ташкент", en: "Tashkent" },
  konayev: { ru: "Конаев", kz: "Қонаев", en: "Konayev" },
  issykKul: { ru: "Иссык-Куль", kz: "Ыстықкөл", en: "Issyk-Kul" },
} as const;

const venues = {
  nomadArena: {
    name: "Nomad Arena",
    city: "Бишкек",
    city_i18n: cities.bishkek,
    address: "ул. Байтик Баатыра 2",
    timezone: "Asia/Bishkek",
  },
  bishkekArena: {
    name: "Bishkek Arena",
    city: "Бишкек",
    city_i18n: cities.bishkek,
    address: "ул. Ибраимова 115",
    timezone: "Asia/Bishkek",
  },
  almatyArena: {
    name: "Almaty Arena",
    city: "Алматы",
    city_i18n: cities.almaty,
    address: "ул. Момышулы 2в",
    timezone: "Asia/Almaty",
  },
  halykArena: {
    name: "Halyk Arena",
    city: "Алматы",
    city_i18n: cities.almaty,
    address: "ул. Момышулы 4",
    timezone: "Asia/Almaty",
  },
  centralStadium: {
    name: "Central Stadium",
    city: "Алматы",
    city_i18n: cities.almaty,
    address: "пр. Абая 48",
    timezone: "Asia/Almaty",
  },
  aspArena: {
    name: "ASP Arena",
    city: "Конаев",
    city_i18n: cities.konayev,
    address: "ASP Club / ASP Arena",
    timezone: "Asia/Almaty",
  },
  motorClub: {
    name: "Motor Club",
    city: "Алматы",
    city_i18n: cities.almaty,
    address: "ул. Назарбаева 50",
    timezone: "Asia/Almaty",
  },
  uzexpo: {
    name: "Uzexpo Centre",
    city: "Ташкент",
    city_i18n: cities.tashkent,
    address: "ул. Амира Темура 107Б",
    timezone: "Asia/Tashkent",
  },
} as const;

export const demoEvents: RawEvent[] = [
  {
    id: "lucaveros-almaty-2026-10-24",
    slug: "lucaveros-almaty",
    category: "concert",
    starts_at: "2026-10-24T19:00:00+05:00",
    age_limit: 16,
    poster_url: "/events/lucaveros-almaty.jpg",
    cover_url: null,
    price_from: 15000,
    currency: "KZT",
    badge: "new",
    is_featured: true,
    is_sold_out: false,
    ticketon_url: null,
    venue: venues.motorClub,
    translations: [
      {
        locale: "ru",
        title: "Lucaveros",
        subtitle: "Special guest в Алматы",
        description: "Lucaveros выступит в Алматы в Motor Club. Начало в 19:00, вход 16+.",
      },
      {
        locale: "kz",
        title: "Lucaveros",
        subtitle: "Алматыдағы арнайы қонақ",
        description: "Lucaveros Алматыда Motor Club-та өнер көрсетеді. Басталуы 19:00, кіру 16+.",
      },
      {
        locale: "en",
        title: "Lucaveros",
        subtitle: "Special guest in Almaty",
        description: "Lucaveros performs in Almaty at Motor Club. Starts at 19:00, 16+.",
      },
    ],
  },
];

// Фотоотчёты, новости, партнёры и цифры появятся, когда будут настоящие.
// Пустые списки прячут соответствующие блоки на сайте.
export const demoPhotoReports: RawPhotoReport[] = [];
export const demoNews: RawNews[] = [];
export const demoPartners: RawPartner[] = [];
export const demoSiteStats: RawSiteStat[] = [];
