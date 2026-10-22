import Link from "next/link";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

import { PaymentBadges } from "@/components/payment-badges";
import { company } from "@/lib/company";
import { contactsFor, socialLabels, useSiteSettings } from "@/lib/site-settings";

import { Logo } from "./logo";
import { mainNav } from "./nav";

export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  const year = new Date().getFullYear();
  const settings = useSiteSettings();
  const c = contactsFor(settings, t, locale);
  const socials = Object.entries(settings.socials).filter(([, url]) => url) as [keyof typeof socialLabels, string][];

  return (
    <footer className="border-t border-line bg-ink-deep">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Link href={localePath(locale)} className="inline-block">
              <Logo height={34} />
            </Link>
            <p className="mt-4 text-sm leading-6 text-fg-muted">
              {t.home.aboutText}
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-x-10 gap-y-3">
            {mainNav(locale, t).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-fg-muted transition-colors hover:text-coral"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <address className="space-y-2 text-sm not-italic text-fg-muted">
            <p>{c.address}</p>
            <p>
              <a
                href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                className="transition-colors hover:text-coral"
              >
                {c.phone}
              </a>
            </p>
            {c.email && (
            <p>
              <a
                href={`mailto:${c.email}`}
                className="transition-colors hover:text-coral"
              >
                {c.email}
              </a>
            </p>
            )}
            {c.whatsapp && (
              <p>
                <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="transition-colors hover:text-coral">
                  WhatsApp
                </a>
              </p>
            )}
            {socials.length > 0 && (
              <p className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
                {socials.map(([k, url]) => (
                  <a key={k} href={url} target="_blank" rel="noreferrer" className="transition-colors hover:text-coral">
                    {socialLabels[k]}
                  </a>
                ))}
              </p>
            )}
          </address>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs leading-5 text-fg-subtle md:flex-row md:items-center md:justify-between">
          <div>
          <p>
            {company.name} · БИН {company.bin} · {company.address}
          </p>
          <p>
            {company.bank} · БИК {company.bik} · КБе {company.kbe} · IBAN{" "}
            {company.account}
          </p>
          </div>
          <PaymentBadges />
        </div>

        <div className="mt-6 flex flex-col gap-3 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} Concerts Prod. {t.footer.rights}.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href={localePath(locale, "/legal/offer")} className="transition-colors hover:text-coral">
              {t.footer.offer}
            </Link>
            <Link href={localePath(locale, "/legal/privacy")} className="transition-colors hover:text-coral">
              {t.footer.privacy}
            </Link>
            <Link href={localePath(locale, "/legal/refund")} className="transition-colors hover:text-coral">
              {t.footer.refund}
            </Link>
            <Link href={localePath(locale, "/legal/payment")} className="transition-colors hover:text-coral">
              {t.footer.payment}
            </Link>
            <Link href={localePath(locale, "/legal/how-to-buy")} className="transition-colors hover:text-coral">
              {t.footer.howToBuy}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
