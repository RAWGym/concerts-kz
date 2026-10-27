import type { Metadata } from "next";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventPoster } from "@/components/event/event-poster";
import { EmptyState, PageHeading, Section } from "@/components/ui/section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getPhotoReports } from "@/lib/data/queries";


export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reports">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = getDictionary(locale);
  return {
    title: t.pages.reportsTitle,
    alternates: { canonical: localePath(locale, "/reports") },
  };
}

export default async function ReportsPage({
  params,
}: PageProps<"/[locale]/reports">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const reports = await getPhotoReports(locale);

  return (
    <Section>
      <PageHeading title={t.pages.reportsTitle} />

      {reports.length === 0 ? (
        <EmptyState text={t.pages.reportsEmpty} />
      ) : (
        <Stagger step={0.07} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <StaggerItem key={report.id}>
            <Link
              href={localePath(locale, `/reports/${report.slug}`)}
              className="group relative aspect-[4/3] overflow-hidden rounded-card bg-surface"
            >
              <EventPoster
                src={report.coverUrl}
                alt={report.title}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-deep/90 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="font-display text-base font-semibold text-fg">
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
      )}
    </Section>
  );
}
