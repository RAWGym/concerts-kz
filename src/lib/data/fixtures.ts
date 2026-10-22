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
    id: "demo-dvizh-fest",
    slug: "dvizh-fest",
    category: "festival",
    starts_at: "2026-08-01T12:00:00+05:00",
    age_limit: 16,
    poster_url: "/events/dvizh-fest.png",
    cover_url: null,
    price_from: 20000,
    currency: "KZT",
    badge: "last_tickets",
    is_featured: true,
    is_sold_out: false,
    ticketon_url: "https://ticketon.kz/event/tckt2-dvizh-fest",
    venue: venues.aspArena,
    translations: [
      {
        locale: "ru",
        title: "ДВИЖ FEST",
        subtitle: "Главный фестиваль лета в ASP Arena",
        description:
          "Три дня музыки и отдыха на берегу: концертная программа с хедлайнерами, вечерние шоу на главной арене, DJ-сеты у бассейна и пляжные вечеринки до рассвета.",
      },
      {
        locale: "kz",
        title: "ДВИЖ FEST",
        subtitle: "ASP Arena-дағы жаздың басты фестивалі",
        description:
          "Жағалаудағы үш күндік музыка мен демалыс: хедлайнерлер қатысатын концерттік бағдарлама, кешкі шоулар, бассейн жанындағы DJ-сеттер және таңға дейінгі жағажай кештері.",
      },
      {
        locale: "en",
        title: "DVIZH FEST",
        subtitle: "The summer's biggest festival at ASP Arena",
        description:
          "Three days of music and leisure by the water: a concert programme with headliners, evening shows, poolside DJ sets and beach parties until sunrise.",
      },
    ],
  },
  {
    id: "demo-bishkek-nomad-arena",
    slug: "bishkek-nomad-arena",
    category: "concert",
    starts_at: "2026-11-11T20:00:00+06:00",
    age_limit: 12,
    poster_url: "/events/bishkek-nomad-arena.jpg",
    cover_url: null,
    price_from: 7000,
    currency: "KZT",
    badge: "new",
    is_featured: true,
    is_sold_out: false,
    ticketon_url: "https://ticketon.kz/bishkek-nomad-arena",
    venue: venues.nomadArena,
    translations: [
      {
        locale: "ru",
        title: "Bishkek Nomad Arena",
        subtitle: "Главное событие осени",
        description:
          "Большой сольный концерт с новой программой и всеми любимыми треками. Живой звук, мощный свет и атмосфера, которую невозможно забыть.",
      },
      {
        locale: "kz",
        title: "Bishkek Nomad Arena",
        subtitle: "Күздің басты оқиғасы",
        description:
          "Жаңа бағдарлама мен сүйікті әндер қамтылған үлкен жеке концерт. Тірі дыбыс, қуатты жарық және ұмытылмас атмосфера.",
      },
      {
        locale: "en",
        title: "Bishkek Nomad Arena",
        subtitle: "The main event of the autumn",
        description:
          "A full solo show with a brand new programme and every track you love. Live sound, powerful lighting and an atmosphere you will not forget.",
      },
    ],
  },
  {
    id: "demo-mayot-bishkek",
    slug: "mayot-bishkek",
    category: "concert",
    starts_at: "2026-11-25T20:00:00+06:00",
    age_limit: 16,
    poster_url: null,
    cover_url: null,
    price_from: 9000,
    currency: "KZT",
    badge: "soon",
    is_featured: false,
    is_sold_out: false,
    ticketon_url: null,
    venue: venues.bishkekArena,
    translations: [
      {
        locale: "ru",
        title: "Mayot",
        subtitle: "Большой сольный концерт",
        description: "Новый альбом целиком и специальные гости вечера.",
      },
      {
        locale: "kz",
        title: "Mayot",
        subtitle: "Үлкен жеке концерт",
        description: "Жаңа альбом толығымен және кештің арнайы қонақтары.",
      },
      {
        locale: "en",
        title: "Mayot",
        subtitle: "Solo show",
        description: "The new album in full, plus special guests.",
      },
    ],
  },
  {
    id: "demo-jony-almaty",
    slug: "jony-almaty",
    category: "concert",
    starts_at: "2026-12-03T20:00:00+05:00",
    age_limit: 6,
    poster_url: "/events/jony-almaty.jpg",
    cover_url: null,
    price_from: 9000,
    currency: "KZT",
    badge: "last_tickets",
    is_featured: false,
    is_sold_out: false,
    ticketon_url: "https://ticketon.kz/jony-almaty",
    venue: venues.almatyArena,
    translations: [
      {
        locale: "ru",
        title: "Jony",
        subtitle: "Концерт в Алматы",
        description: "Лучшие песни и премьеры нового материала.",
      },
      {
        locale: "kz",
        title: "Jony",
        subtitle: "Алматыдағы концерт",
        description: "Үздік әндер және жаңа материалдың премьерасы.",
      },
      {
        locale: "en",
        title: "Jony",
        subtitle: "Live in Almaty",
        description: "Greatest hits and new material live.",
      },
    ],
  },
  {
    id: "demo-macan-almaty",
    slug: "macan-almaty",
    category: "concert",
    starts_at: "2026-12-17T20:00:00+05:00",
    age_limit: 16,
    poster_url: "/events/macan-almaty.jpg",
    cover_url: null,
    price_from: 12000,
    currency: "KZT",
    badge: "sold_out",
    is_featured: false,
    is_sold_out: true,
    ticketon_url: "https://ticketon.kz/macan-almaty",
    venue: venues.halykArena,
    translations: [
      {
        locale: "ru",
        title: "Macan",
        subtitle: "Концерт в Алматы",
        description: "Все билеты распроданы.",
      },
      {
        locale: "kz",
        title: "Macan",
        subtitle: "Алматыдағы концерт",
        description: "Барлық билет сатылып кетті.",
      },
      {
        locale: "en",
        title: "Macan",
        subtitle: "Live in Almaty",
        description: "Sold out.",
      },
    ],
  },
  {
    id: "demo-sqwoz-bab-tashkent",
    slug: "sqwoz-bab-tashkent",
    category: "concert",
    starts_at: "2026-12-28T20:00:00+05:00",
    age_limit: 12,
    poster_url: "/events/sqwoz-bab-tashkent.jpg",
    cover_url: null,
    price_from: 10000,
    currency: "KZT",
    badge: "new",
    is_featured: false,
    is_sold_out: false,
    ticketon_url: "https://ticketon.uz/sqwoz-bab",
    venue: venues.uzexpo,
    translations: [
      {
        locale: "ru",
        title: "Sqwoz Bab",
        subtitle: "Концерт в Ташкенте",
        description: "Первый большой концерт в Узбекистане.",
      },
      {
        locale: "kz",
        title: "Sqwoz Bab",
        subtitle: "Ташкенттегі концерт",
        description: "Өзбекстандағы алғашқы үлкен концерт.",
      },
      {
        locale: "en",
        title: "Sqwoz Bab",
        subtitle: "Live in Tashkent",
        description: "The first big show in Uzbekistan.",
      },
    ],
  },
];

export const demoPhotoReports: RawPhotoReport[] = [
  {
    id: "demo-report-dvizh",
    slug: "dvizh-fest-2025",
    city: "Алматы",
    city_i18n: cities.almaty,
    shot_on: "2025-12-28",
    cover_url: null,
    title: { ru: "Dvizh Fest 2025", kz: "Dvizh Fest 2025", en: "Dvizh Fest 2025" },
  },
  {
    id: "demo-report-mayot",
    slug: "mayot-almaty",
    city: "Алматы",
    city_i18n: cities.almaty,
    shot_on: "2026-03-14",
    cover_url: null,
    title: { ru: "Mayot · Алматы", kz: "Mayot · Алматы", en: "Mayot · Almaty" },
  },
  {
    id: "demo-report-jony",
    slug: "jony-astana",
    city: "Астана",
    city_i18n: cities.astana,
    shot_on: "2026-04-20",
    cover_url: null,
    title: { ru: "Jony · Астана", kz: "Jony · Астана", en: "Jony · Astana" },
  },
  {
    id: "demo-report-issyk-kul",
    slug: "open-air-issyk-kul",
    city: "Иссык-Куль",
    city_i18n: cities.issykKul,
    shot_on: "2026-07-05",
    cover_url: null,
    title: {
      ru: "Open Air · Иссык-Куль",
      kz: "Open Air · Ыстықкөл",
      en: "Open Air · Issyk-Kul",
    },
  },
];

export const demoNews: RawNews[] = [
  {
    id: "demo-news-dvizh-sale",
    slug: "dvizh-fest-2026-sale",
    cover_url: null,
    published_at: "2026-07-24T10:00:00+05:00",
    title: {
      ru: "Открыли продажи на Dvizh Fest 2026",
      kz: "Dvizh Fest 2026 билеттері сатылымда",
      en: "Dvizh Fest 2026 tickets are on sale",
    },
    excerpt: {
      ru: "Три сцены и двенадцать артистов в одном дне.",
      kz: "Бір күнде үш сахна және он екі әртіс.",
      en: "Three stages and twelve artists in one day.",
    },
  },
  {
    id: "demo-news-five-years",
    slug: "five-years",
    cover_url: null,
    published_at: "2026-07-12T10:00:00+05:00",
    title: {
      ru: "Нашей команде 5 лет: как мы работаем",
      kz: "Командамызға 5 жыл: біз қалай жұмыс істейміз",
      en: "Five years of our team: how we work",
    },
    excerpt: {
      ru: "Коротко о том, из чего складывается концерт.",
      kz: "Концерт неден құралатыны туралы қысқаша.",
      en: "A short look at what makes a show happen.",
    },
  },
];

export const demoPartners: RawPartner[] = [
  { id: "demo-partner-freedom", slug: "freedom", name: "Freedom", logo_url: null, website_url: null },
  { id: "demo-partner-nomad", slug: "nomad", name: "Nomad", logo_url: null, website_url: null },
  { id: "demo-partner-halyk", slug: "halyk", name: "Halyk", logo_url: null, website_url: null },
  { id: "demo-partner-yandex", slug: "yandex", name: "Yandex", logo_url: null, website_url: null },
  { id: "demo-partner-kaspi", slug: "kaspi", name: "Kaspi", logo_url: null, website_url: null },
  { id: "demo-partner-raw", slug: "raw", name: "Raw", logo_url: null, website_url: null },
];

export const demoSiteStats: RawSiteStat[] = [
  {
    id: "demo-stat-events",
    key: "events",
    value: "50+",
    label: { ru: "мероприятий", kz: "іс-шара", en: "events" },
  },
  {
    id: "demo-stat-visitors",
    key: "visitors",
    value: "300 000+",
    label: { ru: "посетителей", kz: "көрермен", en: "visitors" },
  },
  {
    id: "demo-stat-cities",
    key: "cities",
    value: "10+",
    label: { ru: "городов", kz: "қала", en: "cities" },
  },
  {
    id: "demo-stat-countries",
    key: "countries",
    value: "5+",
    label: { ru: "стран", kz: "ел", en: "countries" },
  },
];
