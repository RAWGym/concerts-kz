import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PhotoBackdrop, PhotoStrip } from "@/components/ui/photo-strip";
import { Section } from "@/components/ui/section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { EventPoster } from "@/components/event/event-poster";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import type { Locale } from "@/i18n/config";
import { ARTISTS, COMPANY } from "@/i18n/company";
import { getPhotoReports, getSiteStats } from "@/lib/data/queries";

const L: Record<Locale, { projects: string; projectsLead: string; others: string; reports: string; all: string; geo: string; cis: string; europe: string; cisList: string[]; euList: string[] }> = {
  ru: {
    projects: "Проекты",
    projectsLead: "Артисты, с которыми мы делали концерты и туры.",
    others: "и другие артисты",
    reports: "Фотоотчёты",
    all: "Все фотоотчёты",
    geo: "Где мы работали",
    cis: "Казахстан и СНГ",
    europe: "Европа",
    cisList: ["Казахстан", "Россия", "Кыргызстан", "Узбекистан"],
    euList: ["Испания", "Нидерланды", "Германия"],
  },
  kz: {
    projects: "Жобалар",
    projectsLead: "Біз концерттер мен турлар өткізген әртістер.",
    others: "және басқа әртістер",
    reports: "Фотоесептер",
    all: "Барлық фотоесептер",
    geo: "Қай елдерде жұмыс істедік",
    cis: "Қазақстан және ТМД",
    europe: "Еуропа",
    cisList: ["Қазақстан", "Ресей", "Қырғызстан", "Өзбекстан"],
    euList: ["Испания", "Нидерланд", "Германия"],
  },
  en: {
    projects: "Projects",
    projectsLead: "Artists we have produced concerts and tours with.",
    others: "and many more",
    reports: "Photo reports",
    all: "All photo reports",
    geo: "Where we have worked",
    cis: "Kazakhstan & CIS",
    europe: "Europe",
    cisList: ["Kazakhstan", "Russia", "Kyrgyzstan", "Uzbekistan"],
    euList: ["Spain", "Netherlands", "Germany"],
  },
};


export async function generateMetadata({
  params,
}: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = getDictionary(locale);
  return {
    title: t.pages.aboutTitle,
    description: `${COMPANY[locale].lead} ${COMPANY[locale].intro[0]}`,
    alternates: { canonical: localePath(locale, "/about") },
  };
}

export default async function AboutPage({
  params,
}: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const [stats, projects] = await Promise.all([getSiteStats(locale), getPhotoReports(locale)]);
  const l = L[locale];
  const c = COMPANY[locale];
  const club = c.club;

  return (
    <Section>
      {/* ---------- вступление ---------- */}
      <div className="mb-12">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-coral">{c.over}</p>
        <h1 className="mt-4 max-w-4xl font-display text-3xl font-bold uppercase leading-[1.05] tracking-[-0.01em] text-fg md:text-5xl">
          {c.lead}
        </h1>
        <div className="mt-8 grid gap-6 text-base leading-7 text-fg-muted md:grid-cols-3">
          {c.intro.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>

      <PhotoStrip
        className="mb-14"
        photos={[
          { src: "/reports/leningrad/31.jpg", alt: "Ленинград" },
          { src: "/reports/dvizh-fest/01.jpg", alt: "Движ Фест" },
          { src: "/reports/leningrad/48.jpg", alt: "Ленинград" },
        ]}
      />

      {stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 border-y border-line py-12 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.id}>
              <dt className="font-display text-4xl font-bold text-coral">
                {stat.value}
              </dt>
              <dd className="mt-2 text-sm text-fg-muted">{stat.label}</dd>
            </div>
          ))}
        </dl>
      )}


      {/* ---------- артисты и проекты ---------- */}
      <div className="mt-16">
        <h2 className="font-display text-xl font-semibold uppercase text-fg">{c.artistsTitle}</h2>
        <p className="mt-2 text-sm text-fg-muted">{c.artistsLead}</p>
        <Reveal>
          <ul className="mt-8 flex flex-wrap items-baseline gap-x-5 gap-y-3 rounded-[20px] bg-surface p-6 ring-1 ring-line sm:gap-x-7 sm:p-10">
            {ARTISTS.map((name, i) => (
              <li
                key={name}
                className={`font-display font-bold uppercase leading-none tracking-tight transition-colors duration-300 hover:text-coral ${
                  i % 3 === 0 ? "text-2xl text-fg sm:text-4xl" : i % 3 === 1 ? "text-xl text-fg/80 sm:text-3xl" : "text-lg text-fg/60 sm:text-2xl"
                }`}
              >
                {name}
              </li>
            ))}
            <li className="text-sm text-fg-muted sm:text-base">{c.others}</li>
          </ul>
        </Reveal>
      </div>

      {/* ---------- больше, чем концерты ---------- */}
      <Reveal className="mt-16 grid gap-6 border-y border-line py-12 md:grid-cols-[1fr_1.4fr] md:gap-12">
        <h2 className="font-display text-3xl font-bold uppercase leading-none text-fg md:text-5xl">{c.beyondTitle}</h2>
        <div className="space-y-4 text-base leading-7 text-fg-muted">
          {c.beyond.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </Reveal>

      {/* ---------- география ---------- */}
      <Reveal className="mt-16">
        <h2 className="font-display text-xl font-semibold uppercase text-fg">{l.geo}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            { title: l.cis, list: l.cisList },
            { title: l.europe, list: l.euList },
          ].map((g) => (
            <div key={g.title} className="rounded-[20px] border border-line bg-surface/50 p-6 md:p-7">
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-fg-muted">{g.title}</p>
                <span className="font-display text-3xl font-bold text-coral">{g.list.length}</span>
              </div>
              <ul className="mt-5 flex flex-wrap gap-2">
                {g.list.map((c) => (
                  <li key={c} className="rounded-full border border-line-strong bg-ink/60 px-4 py-2 text-sm text-fg">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ---------- экосистема ---------- */}
      <div className="mt-16">
        <h2 className="font-display text-xl font-semibold uppercase text-fg">{c.ecoTitle}</h2>
        <div className="mt-4 grid max-w-4xl gap-4 text-base leading-7 text-fg-muted md:grid-cols-2">
          {c.eco.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <Stagger className="mt-8 grid gap-4 md:grid-cols-3">
          {c.ecoItems.map((item, i) => (
            <StaggerItem key={item.title} className="rounded-[20px] bg-surface p-6 ring-1 ring-line md:p-7">
              <span className="font-display text-sm font-bold tabular-nums text-coral">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-4 font-display text-lg font-semibold uppercase text-fg">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-fg-muted">{item.text}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      {/* ---------- Club Motor: собственная площадка ---------- */}
      <Reveal className="mt-16">
        <div id="club-motor" className="relative scroll-mt-24 overflow-hidden rounded-[24px] bg-surface p-7 ring-1 ring-line sm:p-12">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-coral/20 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-coral">{club.over}</p>
              <h2 className="mt-3 font-display text-4xl font-bold uppercase leading-none text-fg sm:text-6xl">Club Motor</h2>
              <p className="mt-5 max-w-md text-base leading-7 text-fg">{club.lead}</p>
            </div>
            <div>
              <p className="text-sm leading-7 text-fg-muted">{club.text}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {club.tags.map((tag) => (
                  <li key={tag} className="rounded-full px-4 py-2 text-sm text-fg ring-1 ring-line">{tag}</li>
                ))}
              </ul>
              <Link
                href={localePath(locale, "/events") + "?q=Motor"}
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-coral px-6 py-3 font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-white transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-16px_rgba(255,77,77,0.8)]"
              >
                {club.cta} →
              </Link>
            </div>
          </div>
        </div>
      </Reveal>

      {/* ---------- билетное агентство ---------- */}
      <Reveal className="mt-6 grid gap-6 rounded-[24px] border border-line p-7 sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-coral">concerts.kz</p>
          <h2 className="mt-3 font-display text-3xl font-bold uppercase leading-none text-fg sm:text-5xl">{c.ticketsTitle}</h2>
        </div>
        <div>
          <div className="space-y-4 text-sm leading-7 text-fg-muted">
            {c.tickets.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <Link href={localePath(locale, "/events")} className="btn btn-secondary mt-7">
            {c.ticketsCta} →
          </Link>
        </div>
      </Reveal>

      {projects.length > 0 && (
        <div className="mt-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-xl font-semibold uppercase text-fg">{l.reports}</h2>
            <Link
              href={localePath(locale, "/reports")}
              className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-muted transition-colors hover:text-coral"
            >
              {l.all} →
            </Link>
          </div>
          <Stagger className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <StaggerItem key={p.id}>
                <Link
                  href={localePath(locale, `/reports/${p.slug}`)}
                  className="group relative block aspect-[4/3] overflow-hidden rounded-[20px] bg-surface ring-1 ring-line transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-24px_rgba(255,77,77,0.5)]"
                >
                  <EventPoster src={p.coverUrl} alt={p.title} sizes="(max-width: 640px) 100vw, 33vw" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-deep/95 via-ink-deep/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="font-display text-lg font-bold uppercase leading-tight text-white">{p.title}</p>
                    <p className="mt-1 text-sm text-white/70">
                      {[p.city, p.shotOn ? new Date(p.shotOn).getFullYear() : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-ink/70 text-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                      <path d="M7 17 17 7M9 7h8v8" />
                    </svg>
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}

      <div className="mt-16">
        <h2 className="font-display text-xl font-semibold uppercase text-fg">
          {t.about.servicesTitle}
        </h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-card bg-line sm:grid-cols-2">
          {t.about.services.map((service) => (
            <div key={service.title} className="bg-ink p-7">
              <h3 className="font-display text-base font-semibold text-fg">
                {service.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-fg-muted">
                {service.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-16">
        <h2 className="font-display text-xl font-semibold uppercase text-fg">
          {t.about.howTitle}
        </h2>
        <ol className="mt-8 divide-y divide-line border-y border-line">
          {t.about.steps.map((step, index) => (
            <li key={step.title} className="flex gap-6 py-6">
              <span className="w-8 shrink-0 pt-0.5 font-display text-sm font-bold tabular-nums text-coral">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-base font-semibold text-fg">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-muted">
                  {step.text}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* ---------- слоган ---------- */}
      <Reveal className="mt-20 text-center">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">Concerts Prod</p>
        <p className="mx-auto mt-4 max-w-4xl font-display text-4xl font-bold uppercase leading-[0.95] text-fg md:text-7xl">
          We create <span className="text-coral">unforgettable</span> shows.
        </p>
        <p className="mt-6 text-base text-fg-muted">{c.motto}</p>
      </Reveal>

      <div className="relative mt-14 overflow-hidden rounded-card bg-surface px-6 py-12 md:px-12 md:py-16">
        <PhotoBackdrop src="/reports/dvizh-fest/02.jpg" />
        <div className="relative">
        <h2 className="font-display text-2xl font-semibold uppercase text-fg">
          {t.home.ctaTitle}
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-fg-muted">
          {t.home.ctaText}
        </p>
        <Link
          href={localePath(locale, "/contacts")}
          className="btn btn-primary mt-8"
        >
          {t.actions.leaveRequest}
        </Link>
        </div>
      </div>
    </Section>
  );
}
