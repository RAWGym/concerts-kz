import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";

import { OrdersTab } from "@/components/account/orders";
import { ProfileTab } from "@/components/account/profile";
import { TicketsSkeleton, TicketsTab } from "@/components/account/tickets";
import { CountUp } from "@/components/motion/count-up";
import { EASE_OUT } from "@/components/motion/reveal";
import { fill, getAccountDictionary } from "@/i18n/account";
import { defaultLocale, intlLocale, isLocale } from "@/i18n/config";
import { localePath } from "@/i18n/routing";
import { getMyOrders, isStaff, signOut, ticketsFromOrders } from "@/lib/account/api";
import { initials, useSession } from "@/lib/account/session";
import type { AccountOrder } from "@/lib/account/types";

const TABS = ["tickets", "orders", "profile"] as const;
type Tab = (typeof TABS)[number];

/** Личный кабинет покупателя: билеты, заказы, профиль. */
export default function AccountPage() {
  const params = useParams();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const dict = getAccountDictionary(locale);
  const t = dict.account;
  const navigate = useNavigate();
  const session = useSession();
  const [search, setSearch] = useSearchParams();

  const tabParam = search.get("tab");
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "tickets";

  const [orders, setOrders] = useState<AccountOrder[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [staff, setStaff] = useState(false);

  const userId = session.user?.id;

  useEffect(() => {
    document.title = `${t.title} · Concerts Prod`;
  }, [t]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getMyOrders(userId, locale)
      .then((list) => alive && setOrders(list))
      .catch(() => alive && (setLoadError(true), setOrders([])));
    isStaff(userId).then((v) => alive && setStaff(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, locale]);

  const tickets = useMemo(() => ticketsFromOrders(orders ?? []), [orders]);

  if (session.status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-coral" />
      </div>
    );
  }

  if (session.status === "guest") {
    const next = encodeURIComponent(localePath(locale, "/account"));
    return <Navigate to={`${localePath(locale, "/login")}?next=${next}`} replace />;
  }

  const u = session.user;
  const firstName = u.fullName.split(/\s+/)[0];
  const since = u.createdAt
    ? new Intl.DateTimeFormat(intlLocale[locale], { month: "long", year: "numeric" }).format(new Date(u.createdAt))
    : null;
  const eventCount = new Set(tickets.map((x) => x.event.id)).size;

  async function onSignOut() {
    await signOut();
    navigate(localePath(locale), { replace: true });
  }

  function selectTab(next: Tab) {
    const p = new URLSearchParams(search);
    if (next === "tickets") p.delete("tab");
    else p.set("tab", next);
    setSearch(p, { replace: true, preventScrollReset: true });
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-24 pt-6 md:pt-10">
      {/* ---------- шапка кабинета ---------- */}
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        className="grain relative overflow-hidden rounded-[22px] border border-line bg-[radial-gradient(120%_140%_at_100%_0%,rgba(255,77,77,0.28)_0%,rgba(255,77,77,0.06)_38%,transparent_65%),linear-gradient(180deg,#151515,#0f0f0f)] p-6 sm:p-9"
      >
        <div className="relative z-[2] flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#ff6b5b,#d6302c)] font-display text-lg font-bold text-white shadow-[0_10px_30px_-10px_rgba(255,77,77,0.8)] sm:h-20 sm:w-20 sm:text-2xl">
              {initials(u)}
            </span>
            <div className="min-w-0">
              <p className="overline">{t.title}</p>
              <h1 className="mt-1.5 font-display text-xl font-bold leading-tight uppercase tracking-[-0.02em] text-fg sm:text-4xl">
                {firstName ? fill(t.hello, { name: firstName }) : t.helloAnon}
              </h1>
              <p className="mt-1 text-sm text-fg-muted">
                <span className="break-all">{u.email}</span>
                {since && <span className="block text-fg-subtle sm:inline"><span className="hidden sm:inline"> · </span>{fill(t.since, { date: since })}</span>}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 md:items-end">
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex w-fit items-center gap-2 self-start rounded-full border border-line-strong bg-ink/60 px-4 py-2 text-sm text-fg-muted backdrop-blur transition-colors hover:border-coral hover:text-coral md:self-end"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
            </svg>
            {t.profile.signOut}
          </button>
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { n: tickets.length, label: t.stats.tickets },
              { n: eventCount, label: t.stats.events },
              { n: orders?.length ?? 0, label: t.stats.orders },
            ].map((s) => (
              <div key={s.label} className="min-w-[88px] rounded-btn border border-line bg-ink/60 px-4 py-3 backdrop-blur">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <CountUp key={`${s.label}-${orders ? "ready" : "wait"}`} value={String(s.n)} className="font-display text-2xl font-bold text-fg" />
                  <span className="mt-0.5 block text-[11px] text-fg-subtle">{s.label}</span>
                </dd>
              </div>
            ))}
          </dl>
          </div>
        </div>
      </motion.header>

      {session.status === "demo" && (
        <p className="mt-4 rounded-btn border border-dashed border-line-strong px-4 py-2.5 text-xs text-fg-subtle">{t.demo}</p>
      )}

      {/* ---------- вкладки ---------- */}
      <nav className="no-scrollbar sticky top-16 z-30 -mx-4 mt-8 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:top-[72px]">
        <ul className="flex w-max gap-1 rounded-full border border-line bg-ink/80 p-1 backdrop-blur-xl">
          {TABS.map((key) => {
            const active = key === tab;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => selectTab(key)}
                  aria-current={active ? "page" : undefined}
                  className={`relative rounded-full px-4 py-2.5 font-display sm:px-5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                    active ? "text-white" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="account-tab"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-full bg-coral"
                    />
                  )}
                  <span className="relative">{t.tabs[key]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {loadError && <p className="mt-6 text-sm text-coral">{t.loadError}</p>}

      <AnimatePresence mode="wait">
        <motion.section
          key={tab}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="mt-8"
        >
          {tab === "tickets" &&
            (orders ? <TicketsTab tickets={tickets} locale={locale} t={t} /> : <TicketsSkeleton />)}
          {tab === "orders" &&
            (orders ? <OrdersTab orders={orders} locale={locale} t={t} /> : <TicketsSkeleton />)}
          {tab === "profile" && (
            <ProfileTab user={u} t={t} errorText={dict.login.errorGeneric} staff={staff} onSignOut={onSignOut} />
          )}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}
