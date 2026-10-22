import Link from "next/link";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";

import { PaymentBadges } from "@/components/payment-badges";
import { company } from "@/lib/company";

import { Logo } from "./logo";
import { mainNav } from "./nav";

export function SiteFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  const year = new Date().getFullYear();

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
            <p>{t.footer.address}</p>
            <p>
              <a
                href={`tel:${t.contacts.phone.replace(/[^\d+]/g, "")}`}
                className="transition-colors hover:text-coral"
              >
                {t.contacts.phone}
              </a>
            </p>
            {t.contacts.email && (
            <p>
              <a
                href={`mailto:${t.contacts.email}`}
                className="transition-colors hover:text-coral"
              >
                {t.contacts.email}
              </a>
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
