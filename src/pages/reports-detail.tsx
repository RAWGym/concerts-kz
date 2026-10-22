import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeading, Section } from "@/components/ui/section";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getPhotoReportBySlug, getPhotoReportSlugs } from "@/lib/data/queries";
import { formatNewsDate } from "@/lib/format";


export async function generateStaticParams() {
  const slugs = await getPhotoReportSlugs();
  return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reports/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

  const report = await getPhotoReportBySlug(slug, locale);
  if (!report) return {};

  return {
    title: report.title,
    description: report.description || undefined,
    alternates: { canonical: localePath(locale, `/reports/${slug}`) },
  };
}

export default async function ReportPage({
  params,
}: PageProps<"/[locale]/reports/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const report = await getPhotoReportBySlug(slug, locale);
  if (!report) notFound();

  const meta = [
    report.city,
    report.shotOn ? formatNewsDate(report.shotOn, locale) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Section>
      <Link
        href={localePath(locale, "/reports")}
        className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted transition-colors hover:text-coral"
      >
        ← {t.actions.allReports}
      </Link>

      <div className="mt-8">
        <PageHeading title={report.title} description={meta || undefined} />
      </div>

      {report.description && (
        <p className="mb-10 max-w-2xl whitespace-pre-line text-base leading-7 text-fg-muted">
          {report.description}
        </p>
      )}

      {report.images.length === 0 ? (
        <p className="text-sm text-fg-subtle">{t.pages.reportsEmpty}</p>
      ) : (
        <div className="columns-1 gap-5 sm:columns-2 lg:columns-3">
          {report.images.map((image) => (
            <figure
              key={image.id}
              className="mb-5 overflow-hidden rounded-card bg-surface"
            >
              <Image
                src={image.url}
                alt={image.alt || report.title}
                width={image.width ?? 1200}
                height={image.height ?? 800}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="h-auto w-full"
              />
            </figure>
          ))}
        </div>
      )}
    </Section>
  );
}
