import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PhotoBackdrop, PhotoStrip } from "@/components/ui/photo-strip";
import { PageHeading, Section } from "@/components/ui/section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getSiteStats } from "@/lib/data/queries";


export async function generateMetadata({
  params,
}: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = getDictionary(locale);
  return {
    title: t.pages.aboutTitle,
    description: t.home.aboutText,
    alternates: { canonical: localePath(locale, "/about") },
  };
}

export default async function AboutPage({
  params,
}: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const stats = await getSiteStats(locale);

  return (
    <Section>
      <PageHeading title={t.pages.aboutTitle} description={t.about.lead} />

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
