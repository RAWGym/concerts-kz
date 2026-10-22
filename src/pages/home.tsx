import Link from "next/link";
import { notFound } from "next/navigation";

import { EventCard } from "@/components/event/event-card";
import { EventPoster } from "@/components/event/event-poster";
import { PartnerLogos } from "@/components/partners/partner-logos";
import { DateStrip } from "@/components/home/date-strip";
import { FeaturedCarousel } from "@/components/home/featured-carousel";
import { CountUp } from "@/components/motion/count-up";
import { Marquee } from "@/components/motion/marquee";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { EmptyState, Section, SectionHeading } from "@/components/ui/section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import {
  getEvents,
  getNews,
  getPartners,
  getPhotoReports,
  getSiteStats,
} from "@/lib/data/queries";
import { formatNewsDate } from "@/lib/format";
import type { Locale } from "@/i18n/config";

/** География из дизайн-бука — бегущая строка под героем. */
const geography: Record<Locale, string[]> = {
  ru: ["Казахстан", "Россия", "Узбекистан", "Кыргызстан", "Таджикистан", "Армения"],
  kz: ["Қазақстан", "Ресей", "Өзбекстан", "Қырғызстан", "Тәжікстан", "Армения"],
  en: ["Kazakhstan", "Russia", "Uzbekistan", "Kyrgyzstan", "Tajikistan", "Armenia"],
};

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);

  const [upcoming, reports, news, partners, stats] = await Promise.all([
    getEvents(locale, { limit: 60 }),
    getPhotoReports(locale, 4),
    getNews(locale, 2),
    getPartners(),
    getSiteStats(locale),
  ]);
  const events = upcoming.slice(0, 8);
  // Фото в блоке «О компании» — обложка фотоотчёта, её меняют в админке.
  const aboutReport = reports.find((r) => r.slug === "dvizh-fest") ?? reports[0];
  const aboutPhoto = aboutReport?.coverUrl ?? "/reports/dvizh-fest/01.jpg";
  // В карусели сначала отмеченные «главными», потом ближайшие.
  const featured = [...upcoming.filter((e) => e.isFeatured), ...upcoming.filter((e) => !e.isFeatured)].slice(0, 6);


  return (
    <>
      {/* ---------- герой ---------- */}
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 md:pt-8">
        <h1 className="sr-only">Concerts Production</h1>
        <FeaturedCarousel events={featured} locale={locale} t={t} />
        <div className="mt-6 md:mt-8">
          <DateStrip events={upcoming} locale={locale} />
        </div>
      </section>

      {/* ---------- бегущая строка: где мы работаем ---------- */}
      <div className="mt-8 border-y border-line bg-ink-deep py-4 md:mt-10" aria-label={geography[locale].join(", ")}>
        <Marquee speed={45}>
          {geography[locale].map((country) => (
            <span key={country} aria-hidden className="flex items-center">
              <span className="px-6 font-display text-sm font-semibold uppercase tracking-[0.18em] text-fg-muted md:text-base">
                {country}
              </span>
              <svg viewBox="0 0 24 24" className="h-3 w-3 text-coral" fill="currentColor">
                <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
              </svg>
            </span>
          ))}
        </Marquee>
      </div>

      {/* ---------- ближайшие события ----------
          Верхний отступ урезан: секция идёт сразу за баннером и не
          должна отваливаться от него пустотой. */}
      <Section padding="pt-7 pb-16 md:pt-10 md:pb-20">
        <SectionHeading
          overline={t.home.categories}
          title={t.home.upcoming}
          action={{
            href: localePath(locale, "/events"),
            label: t.actions.viewAll,
          }}
        />

        {events.length === 0 ? (
          <EmptyState text={t.home.emptyEvents} />
        ) : (
          <Stagger className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {events.map((event) => (
              <StaggerItem key={event.id}>
                <EventCard event={event} locale={locale} t={t} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </Section>

      {/* ---------- о компании и цифры ---------- */}
      <Section className="border-y border-line">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <Reveal>
            <p className="overline">{t.home.about}</p>
            <h2 className="mt-3 font-display text-3xl font-bold uppercase leading-[1.02] tracking-[-0.03em] text-fg md:text-[44px]">
              We create <span className="text-coral">experiences</span> that stay
            </h2>
            <p className="mt-5 text-base leading-7 text-fg-muted">
              {t.home.aboutText}
            </p>
            <Link
              href={localePath(locale, "/about")}
              className="btn btn-secondary mt-7"
            >
              {t.actions.details}
            </Link>
          </Reveal>

          <div className="flex flex-col gap-5 self-center">
            {/* Живое фото с Движ Феста: огонь сцены в тон кораллу. */}
            <Reveal delay={0.1} className="grain group relative aspect-[4/3] overflow-hidden rounded-card bg-surface">
              <img
                src={aboutPhoto}
                alt={aboutReport?.title ?? "Concerts Prod"}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.04]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-deep/90 via-ink-deep/20 to-transparent" />
              <p className="absolute inset-x-0 bottom-0 z-[2] p-7 font-display text-xl font-bold uppercase leading-tight text-white md:text-2xl">
                Music
                <br />
                People
                <br />
                Emotions
              </p>
            </Reveal>

            {stats.length > 0 && (
              <Stagger as="dl" className="grid grid-cols-2 gap-px overflow-hidden rounded-card bg-line">
                {stats.map((stat) => (
                  <StaggerItem key={stat.id} className="bg-ink p-6">
                    <dt className="font-display text-3xl font-bold text-coral md:text-[40px]">
                      <CountUp value={stat.value} />
                    </dt>
                    <dd className="mt-2 text-sm text-fg-muted">{stat.label}</dd>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>
        </div>
      </Section>

      {/* ---------- фотоотчёты ---------- */}
      {reports.length > 0 && (
        <Section>
          <SectionHeading
            title={t.home.reports}
            action={{
              href: localePath(locale, "/reports"),
              label: t.actions.allReports,
            }}
          />

          <Stagger className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {reports.map((report) => (
              <StaggerItem key={report.id}>
              <Link
                href={localePath(locale, `/reports/${report.slug}`)}
                className="group relative block aspect-[4/3] overflow-hidden rounded-card bg-surface"
              >
                <EventPoster
                  src={report.coverUrl}
                  alt={report.title}
                  sizes="(max-width: 1024px) 50vw, 25vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-deep/90 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="font-display text-sm font-semibold text-fg">
                    {report.title}
                  </p>
                  {report.city && (
                    <p className="mt-1 text-xs text-fg-muted">{report.city}</p>
                  )}
                </div>
              </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {/* ---------- новости ---------- */}
      {news.length > 0 && (
        <Section className="border-t border-line">
          <SectionHeading
            title={t.home.news}
            action={{
              href: localePath(locale, "/news"),
              label: t.actions.allNews,
            }}
          />

          <Stagger className="grid gap-5 md:grid-cols-2">
            {news.map((item) => (
              <StaggerItem key={item.id}>
              <Link
                href={localePath(locale, `/news/${item.slug}`)}
                className="group block h-full rounded-card border border-line p-6 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-coral/50"
              >
                {item.publishedAt && (
                  <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-coral">
                    {formatNewsDate(item.publishedAt, locale)}
                  </p>
                )}
                <h3 className="mt-3 font-display text-lg font-semibold text-fg">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-fg-muted">
                  {item.excerpt}
                </p>
                <span className="mt-5 inline-block font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-subtle transition-colors group-hover:text-coral">
                  {t.actions.details} →
                </span>
              </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </Section>
      )}

      {/* ---------- партнёры ---------- */}
      {partners.length > 0 && (
        <Section className="border-t border-line">
          <SectionHeading title={t.home.partners} />

          <PartnerLogos partners={partners} />
        </Section>
      )}

      {/* ---------- призыв к действию ---------- */}
      <Section className="border-t border-line">
        <Reveal>
          <div className="grain group relative overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#FF4D4D_0%,#c9322f_100%)] px-6 py-16 text-center md:px-16 md:py-20">
            {/* Мягкий блик, который медленно плывёт по плашке. */}
            <div className="pointer-events-none absolute -left-1/4 top-0 h-full w-1/2 rotate-12 bg-white/10 blur-3xl transition-transform duration-[1.6s] ease-out group-hover:translate-x-[160%]" />
            <svg aria-hidden viewBox="0 0 24 24" className="absolute right-8 top-8 h-6 w-6 text-white/40" fill="currentColor">
              <path d="M12 0l2.6 9.4L24 12l-9.4 2.6L12 24l-2.6-9.4L0 12l9.4-2.6z" />
            </svg>
            <h2 className="relative z-[2] font-display text-3xl font-bold uppercase tracking-[-0.02em] text-white md:text-5xl">
              {t.home.ctaTitle}
            </h2>
            <p className="relative z-[2] mx-auto mt-5 max-w-xl text-sm leading-6 text-white/85 md:text-base">
              {t.home.ctaText}
            </p>
            <Link
              href={localePath(locale, "/contacts")}
              className="btn btn-dark relative z-[2] mt-9 hover:bg-ink-deep"
            >
              {t.actions.leaveRequest} →
            </Link>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
