import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { PaymentBadges } from "@/components/payment-badges";
import { Section } from "@/components/ui/section";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary, type Dictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { getEventBySlug } from "@/lib/data/queries";
import type { EventDetail } from "@/lib/data/types";
import { formatEventDateTime, formatMoney } from "@/lib/format";
import { isSalesEnabled, tickets } from "@/lib/tickets/provider";
import type { TicketCategory } from "@/lib/tickets/types";
import {
  MOTOR_TABLE_COUNT,
  MOTOR_TEXT,
  MOTOR_ZONES,
  MotorScheme,
  ZONE_COLOR,
  type MotorZone,
} from "@/components/tickets/motor-scheme";

/** Тариф из админки → зона схемы: по коду или по названию. */
function zoneOf(cat: TicketCategory): MotorZone | null {
  if ((MOTOR_ZONES as readonly string[]).includes(cat.id)) return cat.id as MotorZone;
  const n = cat.name.toLowerCase();
  if (/стол|table|үстел/.test(n)) return "vip-table";
  if (/2\s*(этаж|floor|қабат)|второй этаж/.test(n)) return "vip-floor2";
  if (/танцпол|dance|фан|fan/.test(n)) return "dancefloor";
  return null;
}

/** Схема Motor Club включается для событий в этом клубе с тарифами по зонам. */
function hasMotorScheme(event: EventDetail, categories: TicketCategory[]) {
  const atMotor = /motor/i.test(`${event.venueName ?? ""}`);
  const zoned = categories.some((c) => zoneOf(c) === "vip-table" || zoneOf(c) === "vip-floor2");
  const ramil = /рамил|ramil/i.test(`${event.title} ${event.slug}`);
  return atMotor && (zoned || ramil);
}

/** Тарифы схемы: из админки, если заведены, иначе без цены. */
function motorCategories(event: EventDetail, categories: TicketCategory[], locale: Locale): TicketCategory[] {
  return MOTOR_ZONES.map((zone) => {
    const fromDb = categories.find((c) => zoneOf(c) === zone);
    if (fromDb && fromDb.price > 0) {
      return { ...fromDb, id: zone, serverId: fromDb.id, maxPerOrder: zone === "vip-table" ? MOTOR_TABLE_COUNT : fromDb.maxPerOrder };
    }
    return {
      id: zone,
      name: fromDb?.name ?? MOTOR_TEXT[locale].zones[zone].name,
      price: 0,
      currency: event.currency,
      available: event.isSoldOut ? 0 : null,
      maxPerOrder: zone === "vip-table" ? MOTOR_TABLE_COUNT : 10,
      priceTbd: true,
    };
  });
}

/**
 * Оформление заказа: категории билетов → контакты → оплата.
 * Повторяет шаги из дизайн-проекта (страница 08). Схема зала с выбором
 * конкретных мест появится, когда будет доступен API Ticketon.
 */

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/events/[slug]/tickets">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).checkout.title };
}

export default async function CheckoutPage({
  params,
}: PageProps<"/[locale]/events/[slug]/tickets">) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  const event = await getEventBySlug(slug, locale);
  if (!event) notFound();

  const raw = await tickets.getCategories(event, locale).catch(() => []);
  const motor = hasMotorScheme(event, raw);
  const categories = motor ? motorCategories(event, raw, locale) : raw;
  return <Checkout event={event} categories={categories} locale={locale} motor={motor} />;
}

function Checkout({
  event,
  categories,
  locale,
  motor = false,
}: {
  event: EventDetail;
  categories: TicketCategory[];
  locale: Locale;
  motor?: boolean;
}) {
  const t = getDictionary(locale);
  const c = t.checkout;

  const [rawQty, setQty] = useState<Record<string, number>>({});
  const [tables, setTables] = useState<number[]>([]);
  // Для стола количество = число выбранных столов на схеме.
  const qty = useMemo(
    () => (motor ? { ...rawQty, "vip-table": tables.length } : rawQty),
    [motor, rawQty, tables],
  );
  const tbd = categories.some((cat) => cat.priceTbd && (qty[cat.id] ?? 0) > 0);

  function pickZone(zone: MotorZone) {
    if (zone === "vip-table") return;
    setQty((prev) => ({ ...prev, [zone]: Math.max(1, prev[zone] ?? 0) }));
  }
  function toggleTable(n: number) {
    setTables((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  }
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = useMemo(
    () => categories.reduce((sum, cat) => sum + cat.price * (qty[cat.id] ?? 0), 0),
    [categories, qty],
  );
  const currency = categories[0]?.currency ?? event.currency;

  function change(cat: TicketCategory, delta: number) {
    setQty((prev) => {
      const limit = Math.min(cat.maxPerOrder, cat.available ?? cat.maxPerOrder);
      const next = Math.max(0, Math.min(limit, (prev[cat.id] ?? 0) + delta));
      return { ...prev, [cat.id]: next };
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const buyer = {
      name: String(form.get("name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
    };

    if (count === 0) return setError(c.chooseTickets);
    if (tbd) return setError(c.priceSoon);
    if (!buyer.name || !buyer.phone || !buyer.email) return setError(c.fillContacts);
    if (!accepted) return setError(c.acceptTerms);
    if (!isSalesEnabled) return setError(c.salesSoon);

    setBusy(true);
    try {
      const order = await tickets.createOrder({
        eventId: event.id,
        eventSlug: event.slug,
        items: Object.entries(qty)
          .filter(([, n]) => n > 0)
          .map(([categoryId, quantity]) => ({
            categoryId: categories.find((cat) => cat.id === categoryId)?.serverId ?? categoryId,
            quantity,
            ...(categoryId === "vip-table" && motor ? { seats: tables.map((n) => `table-${n}`) } : {}),
          })),
        buyer,
        locale,
        acceptedTerms: accepted,
      });
      const returnUrl = `${window.location.origin}${localePath(locale, `/orders/${order.id}`)}`;
      const { paymentUrl } = await tickets.startPayment(order.id, returnUrl);
      window.location.assign(paymentUrl);
    } catch {
      setError(c.error);
      setBusy(false);
    }
  }

  const input =
    "mt-2 w-full rounded-btn border border-line-strong bg-surface px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-coral";

  return (
    <Section>
      <Link
        href={localePath(locale, `/events/${event.slug}`)}
        className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-muted transition-colors hover:text-coral"
      >
        ← {event.title}
      </Link>

      <h1 className="mt-6 font-display text-3xl font-bold uppercase tracking-[-0.01em] text-fg md:text-4xl">
        {c.title}
      </h1>
      <p className="mt-3 text-sm text-fg-muted">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.1em] text-coral">
          {formatEventDateTime(event.startsAt, locale, event.timezone)}
        </span>
        {(event.city || event.venueName) && (
          <> · {[event.city, event.venueName].filter(Boolean).join(" · ")}</>
        )}
      </p>

      {!isSalesEnabled && (
        <p className="mt-6 rounded-card border border-dashed border-line-strong px-4 py-3 text-sm text-fg-muted">
          {c.salesSoon}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-10 grid gap-10 md:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          <Step n={1} title={c.step1}>
            {motor && (
              <div className="mb-5">
                <MotorScheme
                  locale={locale}
                  active={MOTOR_ZONES.filter((z) => (qty[z] ?? 0) > 0)}
                  tables={tables}
                  onZone={pickZone}
                  onTable={toggleTable}
                />
              </div>
            )}
            <ul className="space-y-3">
              {categories.map((cat) => {
                const n = qty[cat.id] ?? 0;
                const soldOut = cat.available === 0;
                return (
                  <li
                    key={cat.id}
                    className="flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.04em] text-fg">
                        {motor && (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ZONE_COLOR[cat.id as MotorZone] }} />
                        )}
                        {cat.name}
                      </p>
                      {motor && (
                        <p className="mt-1 text-xs text-fg-subtle">{MOTOR_TEXT[locale].zones[cat.id as MotorZone]?.note}</p>
                      )}
                      <p className="mt-1 text-sm text-fg-muted">
                        {soldOut
                          ? c.soldOut
                          : cat.priceTbd
                            ? c.priceTbd
                            : `${formatMoney(cat.price, cat.currency, locale)} ${cat.id === "vip-table" && motor ? c.perTable : c.perTicket}`}
                      </p>
                      {motor && cat.id === "vip-table" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {tables.length === 0 ? (
                            <span className="text-xs text-fg-subtle">{c.pickTable}</span>
                          ) : (
                            tables.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => toggleTable(t)}
                                className="rounded-full bg-[#f5b83d] px-3 py-1 text-xs font-semibold text-[#1a1a1a] transition-opacity hover:opacity-80"
                                aria-label={`${MOTOR_TEXT[locale].table} ${t}: ${c.remove}`}
                              >
                                {MOTOR_TEXT[locale].table} {t} ×
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    {motor && cat.id === "vip-table" ? (
                      <span className="shrink-0 font-display text-base text-fg">{n}</span>
                    ) : (
                      <div className="flex shrink-0 items-center gap-3">
                        <Stepper label="−" onClick={() => change(cat, -1)} disabled={n === 0} />
                        <span className="w-5 text-center font-display text-base text-fg">{n}</span>
                        <Stepper label="+" onClick={() => change(cat, 1)} disabled={soldOut} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Step>

          <Step n={2} title={c.step2}>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-xs font-medium text-fg-muted sm:col-span-2">
                {c.name}
                <input name="name" autoComplete="name" required className={input} />
              </label>
              <label className="block text-xs font-medium text-fg-muted">
                {c.phone}
                <input name="phone" type="tel" autoComplete="tel" required placeholder="+7" className={input} />
              </label>
              <label className="block text-xs font-medium text-fg-muted">
                {c.email}
                <input name="email" type="email" autoComplete="email" required className={input} />
              </label>
            </div>
            <p className="mt-3 text-xs text-fg-subtle">{c.emailHint}</p>
          </Step>
        </div>

        <aside className="h-fit rounded-card border border-line p-6 md:sticky md:top-24">
          <Summary t={t} categories={categories} qty={qty} locale={locale} />

          <div className="mt-5 flex items-baseline justify-between border-t border-line pt-5">
            <span className="text-sm text-fg-muted">{c.total}</span>
            <span className="font-display text-2xl font-bold text-fg">
              {tbd ? c.priceTbd : formatMoney(total, currency, locale)}
            </span>
          </div>

          <label className="mt-6 flex gap-3 text-xs leading-5 text-fg-muted">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#ff4d4d]"
            />
            <span>
              {c.agree1}{" "}
              <Link href={localePath(locale, "/legal/offer")} className="text-coral underline-offset-2 hover:underline">
                {c.offer}
              </Link>{" "}
              {c.agree2}{" "}
              <Link href={localePath(locale, "/legal/privacy")} className="text-coral underline-offset-2 hover:underline">
                {c.privacy}
              </Link>
              .{" "}
              <Link href={localePath(locale, "/legal/refund")} className="underline-offset-2 hover:underline">
                {c.refundNote}
              </Link>
            </span>
          </label>

          {error && <p className="mt-4 text-sm text-coral">{error}</p>}

          <button
            type="submit"
            disabled={busy || tbd}
            className="btn btn-primary mt-5 w-full disabled:opacity-60"
          >
            {tbd ? c.priceSoon : `${c.pay} · ${formatMoney(total, currency, locale)}`}
          </button>

          <p className="mt-4 text-xs leading-5 text-fg-subtle">{c.secure}</p>
          <PaymentBadges className="mt-4" />
        </aside>
      </form>
    </Section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-5 flex items-center gap-3 font-display text-lg font-semibold uppercase text-fg">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-coral text-xs text-white">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stepper({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-lg text-fg transition-colors hover:border-coral hover:text-coral disabled:opacity-30 disabled:hover:border-line-strong disabled:hover:text-fg"
    >
      {label}
    </button>
  );
}

function Summary({
  t,
  categories,
  qty,
  locale,
}: {
  t: Dictionary;
  categories: TicketCategory[];
  qty: Record<string, number>;
  locale: Locale;
}) {
  const chosen = categories.filter((cat) => (qty[cat.id] ?? 0) > 0);
  if (chosen.length === 0) {
    return <p className="text-sm text-fg-subtle">{t.checkout.chooseTickets}</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {chosen.map((cat) => (
        <li key={cat.id} className="flex justify-between gap-4 text-fg-muted">
          <span>
            {cat.name} × {qty[cat.id]}
          </span>
          <span className="text-fg">
            {cat.priceTbd ? "–" : formatMoney(cat.price * (qty[cat.id] ?? 0), cat.currency, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
