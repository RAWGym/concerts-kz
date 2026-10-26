// После сборки:
// 1. 404.html — копия приложения, чтобы неизвестные пути открывались.
// 2. Для каждой известной страницы кладём свой index.html с заголовком,
//    описанием и превью для соцсетей. GitHub Pages тогда отдаёт её со
//    статусом 200, а не 404, и поисковики с мессенджерами видят нормальные
//    заголовки и картинки.
// 3. sitemap.xml и robots.txt.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SITE = "https://concerts.kz";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://jlpfqasntsnuzxlouqvq.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ykrPRTVb4iLTvdGtuE0MRA_3qrcQO6n";
const LOCALES = ["ru", "kz", "en"];
const OG_LANG = { ru: "ru_RU", kz: "kk_KZ", en: "en_US" };
const BRAND = "Concerts Prod";
const DEFAULT_IMAGE = `${SITE}/reports/dvizh-fest/01.jpg`;

const template = readFileSync("dist/index.html", "utf8");
copyFileSync("dist/index.html", "dist/404.html");

const pages = {
  "": {
    ru: ["Concerts Prod | концерты в Казахстане и России", "Концерты и фестивали с 2015 года в Казахстане, России, Кыргызстане, Узбекистане и Европе. Афиша, билеты онлайн, фотоотчёты."],
    kz: ["Concerts Prod | Қазақстан мен Ресейдегі концерттер", "2015 жылдан бері концерттер мен фестивальдер ұйымдастырамыз. Афиша, онлайн билеттер."],
    en: ["Concerts Prod | concerts in Kazakhstan and Russia", "Concerts and festivals since 2015. Events, tickets online, photo reports."],
  },
  events: {
    ru: ["Афиша концертов", "Ближайшие концерты, фестивали и шоу. Билеты онлайн."],
    kz: ["Концерттер афишасы", "Жақындағы концерттер, фестивальдер және шоулар. Онлайн билеттер."],
    en: ["Events", "Upcoming concerts, festivals and shows. Tickets online."],
  },
  reports: {
    ru: ["Фотоотчёты", "Фото с наших концертов и фестивалей."],
    kz: ["Фотоесептер", "Біздің концерттер мен фестивальдерден фото."],
    en: ["Photo reports", "Photos from our concerts and festivals."],
  },
  news: {
    ru: ["Новости", "Новости Concerts Prod: анонсы, старт продаж, итоги концертов."],
    kz: ["Жаңалықтар", "Concerts Prod жаңалықтары."],
    en: ["News", "Concerts Prod news: announcements and on-sale dates."],
  },
  about: {
    ru: ["О компании", "Concerts Prod организует концерты с 2015 года в Казахстане, России, Кыргызстане, Узбекистане, Испании, Нидерландах и Германии."],
    kz: ["Компания туралы", "Concerts Prod 2015 жылдан бері концерттер ұйымдастырады."],
    en: ["About us", "Concerts Prod has produced concerts since 2015 in Kazakhstan, Russia, Kyrgyzstan, Uzbekistan, Spain, the Netherlands and Germany."],
  },
  partners: {
    ru: ["Партнёрам", "Площадкам, брендам и медиа: как мы работаем с партнёрами."],
    kz: ["Серіктестерге", "Алаңдарға, брендтерге және медиаға."],
    en: ["Partners", "For venues, brands and media."],
  },
  contacts: {
    ru: ["Контакты", "Как с нами связаться: телефон, e-mail, адрес офиса в Алматы."],
    kz: ["Байланыс", "Бізбен байланысу: телефон, e-mail, Алматыдағы кеңсе."],
    en: ["Contacts", "Phone, e-mail and our office address in Almaty."],
  },
  "legal/offer": { ru: ["Публичная оферта"], kz: ["Жария оферта"], en: ["Public offer"] },
  "legal/privacy": { ru: ["Политика конфиденциальности"], kz: ["Құпиялылық саясаты"], en: ["Privacy policy"] },
  "legal/refund": { ru: ["Возврат билетов"], kz: ["Билеттерді қайтару"], en: ["Refunds"] },
  "legal/payment": { ru: ["Оплата и безопасность"], kz: ["Төлем және қауіпсіздік"], en: ["Payment and security"] },
  "legal/how-to-buy": { ru: ["Как купить билет"], kz: ["Билетті қалай сатып алуға болады"], en: ["How to buy a ticket"] },
};

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const abs = (url) => (!url ? null : /^https?:\/\//.test(url) ? url : `${SITE}${url.startsWith("/") ? "" : "/"}${url}`);
const clip = (s, n = 180) => {
  const t = String(s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const pick = (v, locale) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v[locale] || v.ru || Object.values(v)[0] || "";
};

/** Пишет dist/<path>/index.html с нужными мета-тегами. */
function writePage(path, locale, { title, description, image, type = "website", jsonLd }) {
  const url = `${SITE}/${path}`.replace(/\/$/, "");
  const fullTitle = title.includes(BRAND) ? title : `${title} · ${BRAND}`;
  const alt = LOCALES.map((l) => {
    const p = path.replace(/^(ru|kz|en)(?=\/|$)/, l);
    return `<link rel="alternate" hreflang="${l === "kz" ? "kk" : l}" href="${SITE}/${p}" />`;
  }).join("\n    ");
  const head = [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    alt,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:locale" content="${OG_LANG[locale]}" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${esc(image || DEFAULT_IMAGE)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : "",
  ].filter(Boolean).join("\n    ");

  const html = template
    .replace(/<html lang="[^"]*"/, `<html lang="${locale === "kz" ? "kk" : locale}"`)
    .replace(/<title>[\s\S]*?<\/title>\s*/, "")
    .replace(/<meta name="description"[^>]*>\s*/, "")
    .replace("</head>", `    ${head}\n  </head>`);
  const file = `dist/${path ? `${path}/` : ""}index.html`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return url;
}

async function rest(query) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`postbuild: не получилось загрузить ${query.split("?")[0]} (${e.message}), пропускаю`);
    return [];
  }
}

const [events, reports, news] = await Promise.all([
  rest(
    "events?select=slug,starts_at,age_limit,poster_url,cover_url,price_from,currency,is_sold_out,updated_at," +
      "venue:venues(name,city,address,timezone),translations:event_translations(locale,title,subtitle,description,meta_title,meta_description)" +
      "&status=eq.published&order=starts_at.desc",
  ),
  rest("photo_reports?select=slug,title,city,cover_url,shot_on,updated_at&status=eq.published"),
  rest("news?select=slug,title,excerpt,cover_url,published_at,updated_at&status=eq.published"),
]);

const urls = [];
const add = (url, lastmod, priority) => urls.push({ url, lastmod, priority });

for (const locale of LOCALES) {
  for (const [path, byLocale] of Object.entries(pages)) {
    const [title, description] = byLocale[locale];
    const full = path ? `${locale}/${path}` : locale;
    add(writePage(full, locale, { title, description: description ?? pages[""][locale][1] }), null, path ? (path.startsWith("legal") ? 0.3 : 0.7) : 1);
  }

  for (const e of events) {
    const tr = e.translations?.find((x) => x.locale === locale) ?? e.translations?.find((x) => x.locale === "ru") ?? {};
    const date = new Intl.DateTimeFormat(locale === "kz" ? "kk-KZ" : locale === "en" ? "en-GB" : "ru-RU", {
      day: "numeric", month: "long", timeZone: e.venue?.timezone || "Asia/Almaty",
    }).format(new Date(e.starts_at));
    const place = [e.venue?.city, e.venue?.name].filter(Boolean).join(", ");
    const description = clip(tr.meta_description || [`${date}${place ? `, ${place}` : ""}.`, tr.subtitle, tr.description].filter(Boolean).join(" "));
    const image = abs(e.poster_url || e.cover_url);
    const url = `${SITE}/${locale}/events/${e.slug}`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "MusicEvent",
      name: tr.title || e.slug,
      startDate: e.starts_at,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      image: image ? [image] : undefined,
      description: clip(tr.description || tr.subtitle, 300) || undefined,
      url,
      location: e.venue
        ? { "@type": "Place", name: e.venue.name, address: [e.venue.address, e.venue.city].filter(Boolean).join(", ") }
        : undefined,
      organizer: { "@type": "Organization", name: BRAND, url: SITE },
      offers: e.price_from != null
        ? {
            "@type": "Offer",
            price: Number(e.price_from),
            priceCurrency: e.currency || "KZT",
            availability: e.is_sold_out ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
            url,
          }
        : undefined,
    };
    add(
      writePage(`${locale}/events/${e.slug}`, locale, { title: `${tr.title || e.slug}, ${date}${e.venue?.city ? `, ${e.venue.city}` : ""}`, description, image, type: "article", jsonLd }),
      e.updated_at,
      new Date(e.starts_at) > new Date() ? 0.9 : 0.4,
    );
  }

  for (const r of reports) {
    const title = pick(r.title, locale) || r.slug;
    add(
      writePage(`${locale}/reports/${r.slug}`, locale, {
        title: `${title} | ${pages.reports[locale][0]}`,
        description: clip([title, r.city].filter(Boolean).join(", ")),
        image: abs(r.cover_url),
        type: "article",
      }),
      r.updated_at,
      0.5,
    );
  }

  for (const n of news) {
    const title = pick(n.title, locale) || n.slug;
    add(
      writePage(`${locale}/news/${n.slug}`, locale, {
        title,
        description: clip(pick(n.excerpt, locale) || title),
        image: abs(n.cover_url),
        type: "article",
      }),
      n.updated_at || n.published_at,
      0.5,
    );
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.url}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}<priority>${u.priority}</priority></url>`,
  )
  .join("\n")}
</urlset>
`;
writeFileSync("dist/sitemap.xml", sitemap);

writeFileSync(
  "dist/robots.txt",
  `User-agent: *
Allow: /
Disallow: /admin
Disallow: /*/account
Disallow: /*/login
Disallow: /*/welcome
Disallow: /*/orders/
Disallow: /*/events/*/tickets

Sitemap: ${SITE}/sitemap.xml
`,
);

console.log(`postbuild: ${urls.length} страниц, ${events.length} событий, ${reports.length} отчётов, ${news.length} новостей`);
