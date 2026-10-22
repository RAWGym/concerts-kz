import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventActions } from "@/components/event/event-actions";
import { EventBadge } from "@/components/event/event-badge";
import { EventPoster } from "@/components/event/event-poster";
import { Section } from "@/components/ui/section";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getEventBySlug, getEventSlugs } from "@/lib/data/queries";
import {
  formatEventDate,
  formatEventTime,
  formatPriceFrom,
} from "@/lib/format";


export async function generateStaticParams() {
  const slugs = await getEventSlugs();
  return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/events/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

  const event = await getEventBySlug(slug, locale);
  if (!event) return {};

  const title = event.metaTitle ?? event.title;
  const description =
    event.metaDescription ?? event.subtitle ?? event.description ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: localePath(locale, `/events/${slug}`) },
    openGraph: {
      title,
      description,
      type: "article",
      images: event.coverUrl ?? event.posterUrl ?? undefined,
    },
  };
}

export default async function EventPage({
  params,
}: PageProps<"/[locale]/events/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const event = await getEventBySlug(slug, locale);
  if (!event) notFound();

  const price = formatPriceFrom(
    event.priceFrom,
    event.currency,
    locale,
    t.event.priceFrom,
  );

  const facts = [
    {
      label: t.eventPage.schedule,
      value: `${formatEventDate(event.startsAt, locale, event.timezone)} / ${formatEventTime(event.startsAt, locale, event.timezone)}`,
    },
    event.doorsOpenAt && {
      label: t.eventPage.doorsOpen,
      value: formatEventTime(event.doorsOpenAt, locale, event.timezone),
    },
    event.durationMinutes && {
      label: t.eventPage.duration,
      value: `${event.durationMinutes} ${t.eventPage.minutes}`,
    },
    event.venueName && {
      label: t.eventPage.venue,
      value: [event.city, event.venueName].filter(Boolean).join(" · "),
    },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact));

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0">
          <EventPoster
            src={event.coverUrl ?? event.posterUrl}
            alt={event.title}
            sizes="100vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/90 to-ink/50" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-10">
          <Link
            href={localePath(locale, "/events")}
            className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted transition-colors hover:text-coral"
          >
            ← {t.eventPage.backToEvents}
          </Link>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <span className="chip chip-ghost">{t.categories[event.category]}</span>
            <EventBadge badge={event.badge} t={t} />
            {event.ageLimit !== null && (
              <span className="chip chip-ghost">{event.ageLimit}+</span>
            )}
          </div>

          <h1 className="mt-4 max-w-3xl font-display text-3xl font-bold uppercase leading-[1.08] tracking-[-0.02em] text-fg md:text-5xl">
            {event.title}
          </h1>

          {event.subtitle && (
            <p className="mt-4 max-w-xl text-base leading-7 text-fg-muted md:text-lg">
              {event.subtitle}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {!event.isSoldOut ? (
              <Link
                href={event.ticketonUrl ?? localePath(locale, `/events/${event.slug}/tickets`)}
                className="btn btn-primary"
              >
                {t.actions.buyTicket}
              </Link>
            ) : (
              <span className="btn btn-secondary cursor-default opacity-70">
                {event.isSoldOut ? t.actions.soldOut : t.actions.soon}
              </span>
            )}

            {price && !event.isSoldOut && (
              <span className="text-sm text-fg-muted">{price}</span>
            )}
          </div>
        </div>
      </section>

      <Section>
        <div className="grid gap-12 md:grid-cols-[1fr_280px]">
          <div className="space-y-12">
            {event.description && (
              <div>
                <h2 className="font-display text-xl font-semibold uppercase text-fg">
                  {t.eventPage.about}
                </h2>
                <p className="mt-4 whitespace-pre-line text-base leading-7 text-fg-muted">
                  {event.description}
                </p>
              </div>
            )}

            {event.lineup && (
              <div>
                <h2 className="font-display text-xl font-semibold uppercase text-fg">
                  {t.eventPage.lineup}
                </h2>
                <p className="mt-4 whitespace-pre-line text-base leading-7 text-fg-muted">
                  {event.lineup}
                </p>
              </div>
            )}

            {event.faq.length > 0 && (
              <div>
                <h2 className="font-display text-xl font-semibold uppercase text-fg">
                  {t.eventPage.faq}
                </h2>
                <dl className="mt-4 divide-y divide-line border-y border-line">
                  {event.faq.map((item) => (
                    <div key={item.q} className="py-5">
                      <dt className="font-display text-sm font-semibold text-fg">
                        {item.q}
                      </dt>
                      <dd className="mt-2 text-sm leading-6 text-fg-muted">
                        {item.a}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <aside className="h-fit rounded-card border border-line p-6">
            <dl className="space-y-5">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
                    {fact.label}
                  </dt>
                  <dd className="mt-1 text-sm text-fg">{fact.value}</dd>
                </div>
              ))}
            </dl>

            {event.address && (
              <p className="mt-6 border-t border-line pt-5 text-sm text-fg-muted">
                {event.address}
              </p>
            )}

            <EventActions event={event} locale={locale} />
          </aside>
        </div>
      </Section>
    </>
  );
}
