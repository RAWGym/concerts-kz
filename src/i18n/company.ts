import type { Locale } from "@/i18n/config";

/** Артисты из портфолио (одинаково на всех языках). */
export const ARTISTS = [
  "Макс Корж", "Егор Крид", "Nathan", "Ленинград", "Loboda", "OG Buda", "Mayot",
  "Мияги & Эндшпиль", "T-Fest", "Пошлая Молли", "Macan", "Xcho", "Три дня дождя",
  "Mary Gu", "Элджей", "Big Baby Tape", "Feduk", "Skally Milano",
];

/** Слоган на английском, общий для всех языков. */
export const SLOGAN = "We create unforgettable shows.";

type Company = {
  over: string;
  lead: string;
  intro: string[];
  artistsTitle: string;
  artistsLead: string;
  others: string;
  beyondTitle: string;
  beyond: string[];
  club: { over: string; lead: string; text: string; tags: string[]; cta: string };
  ecoTitle: string;
  eco: string[];
  ecoItems: { title: string; text: string }[];
  ticketsTitle: string;
  tickets: string[];
  ticketsCta: string;
  motto: string;
};

export const COMPANY: Record<Locale, Company> = {
  ru: {
    over: "Concerts Prod | Live entertainment",
    lead: "Мы создаём события, которые становятся частью музыкальной истории.",
    intro: [
      "Concerts Prod: профессиональная концертная компания, реализующая масштабные музыкальные события, сольные концерты, фестивали и гастрольные туры.",
      "Наше портфолио включает проекты с участием ведущих артистов, собирающих многотысячную аудиторию и формирующих новые стандарты живых выступлений.",
      "Мы проводили концерты в Казахстане, Кыргызстане, Узбекистане, России, Испании, Нидерландах и Германии.",
    ],
    artistsTitle: "Артисты и проекты",
    artistsLead: "В нашем портфолио:",
    others: "и многие другие артисты",
    beyondTitle: "Больше, чем концерты",
    beyond: [
      "Каждый проект Concerts Prod это тщательно выстроенный опыт и впечатления, которые остаются с аудиторией надолго.",
      "От камерных выступлений до масштабных фестивалей и стадионных шоу: мы объединяем артистов и зрителей, превращая музыку в яркие события высокого уровня.",
    ],
    club: {
      over: "Собственная площадка",
      lead: "Собственная концертная площадка Concerts Prod и ключевая часть нашей экосистемы.",
      text: "Здесь проходят концерты, клубные события, специальные проекты и выступления артистов. Мы создаём пространство, где музыка, аудитория и энергия живого выступления объединяются в цельный и запоминающийся опыт.",
      tags: ["Концерты", "Клубные события", "Спецпроекты", "Выступления артистов"],
      cta: "События в Club Motor",
    },
    ecoTitle: "Собственная экосистема",
    eco: [
      "Мы развиваем собственную экосистему, объединяющую концертное производство, клубную площадку и билетное агентство.",
      "Это позволяет нам контролировать каждый этап работы над событием: от разработки концепции и организации до продажи билетов и прямого взаимодействия со зрителями.",
    ],
    ecoItems: [
      { title: "Концертное производство", text: "Концепция, артист, площадка, техника и команда события." },
      { title: "Club Motor", text: "Своя сцена для концертов, клубных вечеров и спецпроектов." },
      { title: "Билетное агентство", text: "Продажа билетов и прямой контакт со зрителем." },
    ],
    ticketsTitle: "Билетное агентство",
    tickets: [
      "Наше билетное агентство обеспечивает аудитории удобный, надёжный и комфортный доступ к концертам, фестивалям и клубным мероприятиям.",
      "Мы создаём единую инфраструктуру для артистов, площадок и зрителей, обеспечивая высокий уровень сервиса на каждом этапе посещения события.",
    ],
    ticketsCta: "Смотреть афишу",
    motto: "Музыка объединяет. Мы создаём моменты.",
  },
  kz: {
    over: "Concerts Prod | Live entertainment",
    lead: "Біз музыка тарихының бір бөлігіне айналатын оқиғалар жасаймыз.",
    intro: [
      "Concerts Prod: ауқымды музыкалық іс-шаралар, жеке концерттер, фестивальдер мен гастрольдік турлар өткізетін кәсіби концерттік компания.",
      "Портфолиомызда мыңдаған аудитория жинайтын және тірі өнердің жаңа стандарттарын қалыптастыратын жетекші әртістермен жобалар бар.",
      "Біз Қазақстанда, Қырғызстанда, Өзбекстанда, Ресейде, Испанияда, Нидерландта және Германияда концерттер өткіздік.",
    ],
    artistsTitle: "Әртістер мен жобалар",
    artistsLead: "Біздің портфолиода:",
    others: "және басқа да көптеген әртістер",
    beyondTitle: "Концерттен де көп",
    beyond: [
      "Concerts Prod-тың әр жобасы мұқият құрылған тәжірибе және аудиторияның есінде ұзақ қалатын әсерлер.",
      "Камералық кештерден ауқымды фестивальдер мен стадиондық шоуларға дейін: біз әртістер мен көрермендерді біріктіріп, музыканы жоғары деңгейлі жарқын оқиғаларға айналдырамыз.",
    ],
    club: {
      over: "Өз алаңымыз",
      lead: "Concerts Prod-тың өз концерттік алаңы және экожүйеміздің негізгі бөлігі.",
      text: "Мұнда концерттер, клубтық кештер, арнайы жобалар мен әртістердің өнері өтеді. Біз музыка, аудитория және тірі өнердің энергиясы біртұтас әрі есте қаларлық тәжірибеге айналатын кеңістік жасаймыз.",
      tags: ["Концерттер", "Клубтық кештер", "Арнайы жобалар", "Әртістер өнері"],
      cta: "Club Motor іс-шаралары",
    },
    ecoTitle: "Өз экожүйеміз",
    eco: [
      "Біз концерттік өндірісті, клубтық алаңды және билет агенттігін біріктіретін өз экожүйемізді дамытамыз.",
      "Бұл іс-шара жұмысының әр кезеңін бақылауға мүмкіндік береді: тұжырымдама мен ұйымдастырудан бастап билет сатуға және көрермендермен тікелей байланысқа дейін.",
    ],
    ecoItems: [
      { title: "Концерттік өндіріс", text: "Тұжырымдама, әртіс, алаң, техника және іс-шара командасы." },
      { title: "Club Motor", text: "Концерттер, клубтық кештер мен арнайы жобаларға арналған өз сахнамыз." },
      { title: "Билет агенттігі", text: "Билет сату және көрерменмен тікелей байланыс." },
    ],
    ticketsTitle: "Билет агенттігі",
    tickets: [
      "Біздің билет агенттігіміз аудиторияға концерттерге, фестивальдерге және клубтық іс-шараларға ыңғайлы, сенімді әрі жайлы қолжетімділік береді.",
      "Біз әртістер, алаңдар және көрермендер үшін бірыңғай инфрақұрылым жасап, іс-шараға барудың әр кезеңінде жоғары сервис деңгейін қамтамасыз етеміз.",
    ],
    ticketsCta: "Афишаны қарау",
    motto: "Музыка біріктіреді. Біз сәттер жасаймыз.",
  },
  en: {
    over: "Concerts Prod | Live entertainment",
    lead: "We create events that become part of music history.",
    intro: [
      "Concerts Prod is a professional concert company producing large-scale music events, solo concerts, festivals and touring shows.",
      "Our portfolio includes projects with leading artists who draw audiences of thousands and set new standards for live performance.",
      "We have held concerts in Kazakhstan, Kyrgyzstan, Uzbekistan, Russia, Spain, the Netherlands and Germany.",
    ],
    artistsTitle: "Artists and projects",
    artistsLead: "Our portfolio includes:",
    others: "and many more artists",
    beyondTitle: "More than concerts",
    beyond: [
      "Every Concerts Prod project is a carefully built experience that stays with the audience for a long time.",
      "From intimate shows to large festivals and stadium productions, we bring artists and audiences together and turn music into vivid, high-level events.",
    ],
    club: {
      over: "Our own venue",
      lead: "Concerts Prod's own concert venue and a key part of our ecosystem.",
      text: "It hosts concerts, club nights, special projects and artist performances. We build a space where music, the audience and the energy of a live show come together into one memorable experience.",
      tags: ["Concerts", "Club nights", "Special projects", "Artist performances"],
      cta: "Events at Club Motor",
    },
    ecoTitle: "Our own ecosystem",
    eco: [
      "We are building our own ecosystem that brings together concert production, a club venue and a ticket agency.",
      "This lets us control every stage of an event: from concept and organisation to ticket sales and direct contact with the audience.",
    ],
    ecoItems: [
      { title: "Concert production", text: "Concept, artist, venue, equipment and the event team." },
      { title: "Club Motor", text: "Our own stage for concerts, club nights and special projects." },
      { title: "Ticket agency", text: "Ticket sales and direct contact with the audience." },
    ],
    ticketsTitle: "Ticket agency",
    tickets: [
      "Our ticket agency gives the audience easy, reliable and comfortable access to concerts, festivals and club events.",
      "We build one infrastructure for artists, venues and guests, keeping the service level high at every step of attending an event.",
    ],
    ticketsCta: "See what's on",
    motto: "Music unites. We create moments.",
  },
};
