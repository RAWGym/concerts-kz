import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Section } from "@/components/ui/section";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getNewsBySlug, getNewsSlugs } from "@/lib/data/queries";
import { formatNewsDate } from "@/lib/format";


export async function generateStaticParams() {
  const slugs = await getNewsSlugs();
  return locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/news/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};

  const item = await getNewsBySlug(slug, locale);
  if (!item) return {};

  return {
    title: item.title,
    description: item.excerpt || undefined,
    alternates: { canonical: localePath(locale, `/news/${slug}`) },
    openGraph: {
      type: "article",
      title: item.title,
      description: item.excerpt || undefined,
      publishedTime: item.publishedAt ?? undefined,
      images: item.coverUrl ?? undefined,
    },
  };
}

export default async function NewsArticlePage({
  params,
}: PageProps<"/[locale]/news/[slug]">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const item = await getNewsBySlug(slug, locale);
  if (!item) notFound();

  return (
    <Section>
      <article className="mx-auto max-w-2xl">
        <Link
          href={localePath(locale, "/news")}
          className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted transition-colors hover:text-coral"
        >
          ← {t.actions.allNews}
        </Link>

        {item.publishedAt && (
          <p className="mt-8 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-coral">
            {formatNewsDate(item.publishedAt, locale)}
          </p>
        )}

        <h1 className="mt-3 font-display text-3xl font-bold uppercase leading-tight tracking-[-0.01em] text-fg md:text-4xl">
          {item.title}
        </h1>

        <p className="mt-6 text-lg leading-8 text-fg-muted">{item.excerpt}</p>

        {item.body && item.body !== item.excerpt && (
          <div className="mt-8 whitespace-pre-line text-base leading-7 text-fg-muted">
            {item.body}
          </div>
        )}
      </article>
    </Section>
  );
}
