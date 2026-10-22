import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LeadForm } from "@/components/forms/lead-form";
import { PageHeading, Section } from "@/components/ui/section";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/contacts">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const t = getDictionary(locale);
  return {
    title: t.pages.contactsTitle,
    alternates: { canonical: localePath(locale, "/contacts") },
  };
}

export default async function ContactsPage({
  params,
}: PageProps<"/[locale]/contacts">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getDictionary(locale);

  return (
    <Section>
      <PageHeading title={t.pages.contactsTitle} description={t.form.text} />

      <div className="grid gap-12 md:grid-cols-2 md:gap-16">
        <dl className="space-y-8">
          <div>
            <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              {t.contacts.phoneLabel}
            </dt>
            <dd className="mt-2">
              <a
                href={`tel:${t.contacts.phone.replace(/[^\d+]/g, "")}`}
                className="font-display text-xl text-fg transition-colors hover:text-coral"
              >
                {t.contacts.phone}
              </a>
            </dd>
          </div>

          {t.contacts.email && (
          <div>
            <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              {t.contacts.emailLabel}
            </dt>
            <dd className="mt-2">
              <a
                href={`mailto:${t.contacts.email}`}
                className="font-display text-xl text-fg transition-colors hover:text-coral"
              >
                {t.contacts.email}
              </a>
            </dd>
          </div>
          )}

          <div>
            <dt className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              {t.contacts.addressLabel}
            </dt>
            <dd className="mt-2 text-base text-fg-muted">{t.footer.address}</dd>
          </div>
        </dl>

        <div className="rounded-card border border-line p-6 md:p-8">
          <h2 className="font-display text-lg font-semibold uppercase text-fg">
            {t.form.title}
          </h2>
          <div className="mt-6">
            <LeadForm
              locale={locale}
              t={t}
              sourceUrl={localePath(locale, "/contacts")}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}
