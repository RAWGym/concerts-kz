import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, PageHeading, Section } from "@/components/ui/section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getNews } from "@/lib/data/queries";
import { formatNewsDate } from "@/lib/format";


export async function generateMetadata({
  params,
}: PageProps<"/[locale]/news">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = getDictionary(locale);
  return {
    title: t.pages.newsTitle,
    alternates: { canonical: localePath(locale, "/news") },
  };
}

export default async function NewsPage({
  params,
}: PageProps<"/[locale]/news">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const news = await getNews(locale);

  return (
    <Section>
      <PageHeading title={t.pages.newsTitle} />

      {news.length === 0 ? (
        <EmptyState text={t.pages.newsEmpty} />
      ) : (
        <div className="divide-y divide-line border-y border-line">
          {news.map((item) => (
            <article key={item.id} className="py-8">
              <Link
                href={localePath(locale, `/news/${item.slug}`)}
                className="group block"
              >
                {item.publishedAt && (
                  <p className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-coral">
                    {formatNewsDate(item.publishedAt, locale)}
                  </p>
                )}
                <h2 className="mt-3 font-display text-xl font-semibold text-fg transition-colors group-hover:text-coral md:text-2xl">
                  {item.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-fg-muted">
                  {item.excerpt}
                </p>
              </Link>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
