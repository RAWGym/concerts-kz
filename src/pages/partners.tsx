import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { LeadForm } from "@/components/forms/lead-form";
import { PageHeading, Section } from "@/components/ui/section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getPartners } from "@/lib/data/queries";


export async function generateMetadata({
  params,
}: PageProps<"/[locale]/partners">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = getDictionary(locale);
  return {
    title: t.pages.partnersTitle,
    description: t.home.ctaText,
    alternates: { canonical: localePath(locale, "/partners") },
  };
}

export default async function PartnersPage({
  params,
}: PageProps<"/[locale]/partners">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);
  const partners = await getPartners();

  return (
    <Section>
      <PageHeading
        title={t.pages.partnersTitle}
        description={t.partnersPage.lead}
      />

      <div className="mb-16">
        <h2 className="font-display text-xl font-semibold uppercase text-fg">
          {t.partnersPage.formatsTitle}
        </h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-card bg-line sm:grid-cols-2">
          {t.partnersPage.formats.map((format) => (
            <div key={format.title} className="bg-ink p-7">
              <h3 className="font-display text-base font-semibold text-fg">
                {format.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-fg-muted">
                {format.text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-16">
        <h2 className="font-display text-xl font-semibold uppercase text-fg">
          {t.partnersPage.benefitsTitle}
        </h2>
        <ul className="mt-6 space-y-3">
          {t.partnersPage.benefits.map((benefit) => (
            <li
              key={benefit}
              className="flex gap-3 text-sm leading-6 text-fg-muted"
            >
              <span aria-hidden className="text-coral">
                —
              </span>
              {benefit}
            </li>
          ))}
        </ul>
      </div>

      {partners.length > 0 && (
        <>
          <h2 className="mb-6 font-display text-xl font-semibold uppercase text-fg">
            {t.partnersPage.logosTitle}
          </h2>
          <ul className="mb-16 grid grid-cols-2 gap-px overflow-hidden rounded-card bg-line sm:grid-cols-3 lg:grid-cols-6">
          {partners.map((partner) => {
            const content = partner.logoUrl ? (
              <Image
                src={partner.logoUrl}
                alt={partner.name}
                width={120}
                height={40}
                className="max-h-10 w-auto opacity-70 transition-opacity hover:opacity-100"
              />
            ) : (
              <span className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                {partner.name}
              </span>
            );

            return (
              <li
                key={partner.id}
                className="flex h-28 items-center justify-center bg-ink px-4"
              >
                {partner.websiteUrl ? (
                  <a
                    href={partner.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {content}
                  </a>
                ) : (
                  content
                )}
              </li>
            );
            })}
          </ul>
        </>
      )}

      <div className="mx-auto max-w-2xl rounded-card border border-line p-6 md:p-10">
        <h2 className="font-display text-xl font-semibold uppercase text-fg">
          {t.home.ctaTitle}
        </h2>
        <p className="mt-3 text-sm leading-6 text-fg-muted">{t.form.text}</p>
        <div className="mt-8">
          <LeadForm
            locale={locale}
            t={t}
            defaultType="partner"
            sourceUrl={localePath(locale, "/partners")}
          />
        </div>
      </div>
    </Section>
  );
}
