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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <Link href={localePath(locale)} className="inline-block">
              <Logo height={34} />
            </Link>
            <p className="mt-4 text-sm leading-6 text-fg-muted">
              {t.home.aboutText}
            </p>
          </div>

          <nav className="grid h-fit grid-cols-2 content-start gap-x-12 gap-y-3">
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
              <p className="flex flex-wrap gap-2.5 pt-3">
                {socials.map(([k, url]) => (
                  <a
                    key={k}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={socialLabels[k]}
                    title={socialLabels[k]}
                    className="grid h-10 w-10 place-items-center rounded-full border border-line-strong text-fg-muted transition-colors hover:border-coral hover:bg-coral hover:text-white"
                  >
                    <SocialIcon name={k} />
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
            <Link href={localePath(locale, "/legal/delivery")} className="transition-colors hover:text-coral">
              {t.footer.delivery}
            </Link>
            <Link href={localePath(locale, "/legal/how-to-buy")} className="transition-colors hover:text-coral">
              {t.footer.howToBuy}
            </Link>
          </div>
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-[11px] text-fg-subtle">
          <img src="/raw-development.png" alt="RAW Development" width={30} height={12} className="h-3.5 w-auto opacity-70" loading="lazy" />
          <span>{t.footer.madeBy}</span>
        </p>
      </div>
    </footer>
  );
}

/** Значки соцсетей для круглых кнопок в подвале. */
function SocialIcon({ name }: { name: string }) {
  const c = { viewBox: "0 0 24 24", className: "h-[18px] w-[18px]", "aria-hidden": true } as const;
  switch (name) {
    case "instagram":
      return (
        <svg {...c} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...c} fill="currentColor">
          <path d="M21.4 4.2 2.9 11.3c-1.3.5-1.2 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5Zm-3.3 3.4-8.5 7.7-.3 3.4-1.6-5 9.9-6.3c.5-.3.9 0 .5.2Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...c} fill="currentColor">
          <path d="M16.6 3c.3 2.1 1.6 3.6 3.9 3.8v3a7 7 0 0 1-3.9-1.2v6.2A5.8 5.8 0 1 1 10.8 9v3.1a2.8 2.8 0 1 0 2.8 2.8V3h3Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...c} fill="currentColor">
          <path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12c0 1.3.1 2.6.4 3.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.5.4-3.8 0-1.3-.1-2.6-.4-3.8ZM10 15V9l5.2 3L10 15Z" />
        </svg>
      );
    default:
      return <span className="text-xs font-semibold uppercase">{name.slice(0, 2)}</span>;
  }
}
