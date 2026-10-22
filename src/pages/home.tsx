import Link from "next/link";
import { notFound } from "next/navigation";

import { EventCard } from "@/components/event/event-card";
import { EventPoster } from "@/components/event/event-poster";
import { CinematicHero } from "@/components/hero/cinematic-hero";
import { demoHeroSlides, heroLabels } from "@/components/hero/demo-slides";
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


export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);

  const [events, reports, news, partners, stats] = await Promise.all([
    getEvents(locale, { limit: 8 }),
    getPhotoReports(locale, 4),
    getNews(locale, 2),
    getPartners(),
    getSiteStats(locale),
  ]);


  return (
    <>
      {/* ---------- герой ---------- */}
      <CinematicHero slides={demoHeroSlides(locale)} labels={heroLabels(t)} />

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
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                locale={locale}
                t={t}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ---------- о компании и цифры ---------- */}
      <Section className="border-y border-line">
        <div className="grid gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <p className="overline">{t.home.about}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold uppercase text-fg md:text-3xl">
              Concerts Prod
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
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 self-center">
            {stats.map((stat) => (
              <div key={stat.id}>
                <dt className="font-display text-3xl font-bold text-coral md:text-4xl">
                  {stat.value}
                </dt>
                <dd className="mt-1 text-sm text-fg-muted">{stat.label}</dd>
              </div>
            ))}
          </dl>
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

          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {reports.map((report) => (
              <Link
                key={report.id}
                href={localePath(locale, `/reports/${report.slug}`)}
                className="group relative aspect-[4/3] overflow-hidden rounded-card bg-surface"
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
            ))}
          </div>
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

          <div className="grid gap-5 md:grid-cols-2">
            {news.map((item) => (
              <Link
                key={item.id}
                href={localePath(locale, `/news/${item.slug}`)}
                className="rounded-card border border-line p-6 transition-colors hover:border-line-strong"
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
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* ---------- партнёры ---------- */}
      {partners.length > 0 && (
        <Section className="border-t border-line">
          <SectionHeading title={t.home.partners} />

          <ul className="grid grid-cols-3 gap-px overflow-hidden rounded-card bg-line md:grid-cols-6">
            {partners.map((partner) => (
              <li
                key={partner.id}
                className="flex h-24 items-center justify-center bg-ink px-4"
              >
                <span className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                  {partner.name}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ---------- призыв к действию ---------- */}
      <Section className="border-t border-line">
        <div className="rounded-card bg-[linear-gradient(120deg,#FF4D4D_0%,#c9322f_100%)] px-6 py-14 text-center md:px-16">
          <h2 className="font-display text-2xl font-bold uppercase text-white md:text-3xl">
            {t.home.ctaTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/85">
            {t.home.ctaText}
          </p>
          <Link
            href={localePath(locale, "/contacts")}
            className="btn btn-dark mt-8"
          >
            {t.actions.leaveRequest}
          </Link>
        </div>
      </Section>
    </>
  );
}
