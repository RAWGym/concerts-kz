import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { EventPoster } from "@/components/event/event-poster";
import { EASE_OUT } from "@/components/motion/reveal";
import type { AccountDictionary } from "@/i18n/account";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/routing";
import { isPast } from "@/lib/account/api";
import type { AccountTicket } from "@/lib/account/types";
import { formatEventDate, formatEventTime, formatMoney } from "@/lib/format";

import { QrCode } from "./qr-code";
import { EmptyPanel, Segmented } from "./ui";

/** Вкладка «Мои билеты»: предстоящие и прошедшие, билет — по клику. */
export function TicketsTab({
  tickets,
  locale,
  t,
}: {
  tickets: AccountTicket[];
  locale: Locale;
  t: AccountDictionary["account"];
}) {
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const [open, setOpen] = useState<AccountTicket | null>(null);

  const upcoming = tickets.filter((x) => !isPast(x.event.startsAt));
  const past = tickets.filter((x) => isPast(x.event.startsAt)).reverse();
  const list = when === "upcoming" ? upcoming : past;

  return (
    <div>
      <Segmented
        id="tickets-when"
        value={when}
        onChange={setWhen}
        options={[
          { value: "upcoming", label: t.upcoming, count: upcoming.length },
          { value: "past", label: t.past, count: past.length },
        ]}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={when}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="mt-6"
        >
          {list.length === 0 ? (
            <EmptyPanel
              text={when === "upcoming" ? t.emptyTickets : t.emptyPast}
              action={{ href: localePath(locale, "/events"), label: t.toEvents }}
            />
          ) : (
            <ul className="grid gap-5 lg:grid-cols-2">
              {list.map((ticket, i) => (
                <motion.li
                  key={ticket.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: i * 0.06 }}
                >
                  <TicketCard ticket={ticket} locale={locale} t={t} faded={when === "past"} onOpen={() => setOpen(ticket)} />
                </motion.li>
              ))}
            </ul>
          )}
        </motion.div>
      </AnimatePresence>

      <TicketModal ticket={open} onClose={() => setOpen(null)} locale={locale} t={t} />
    </div>
  );
}

/** Билет-карточка: афиша, данные события и корешок с QR. */
function TicketCard({
  ticket,
  locale,
  t,
  faded,
  onOpen,
}: {
  ticket: AccountTicket;
  locale: Locale;
  t: AccountDictionary["account"];
  faded: boolean;
  onOpen: () => void;
}) {
  const e = ticket.event;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full overflow-hidden rounded-card border border-line bg-surface text-left transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_40px_-20px_rgba(255,77,77,0.35)] ${
        faded ? "opacity-60 grayscale-[0.6]" : ""
      }`}
    >
      <div className="relative w-[34%] shrink-0 overflow-hidden bg-ink sm:w-[30%]">
        <EventPoster src={e.posterUrl} alt={e.title} sizes="200px" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-coral">
          {formatEventDate(e.startsAt, locale, e.timezone)} · {formatEventTime(e.startsAt, locale, e.timezone)}
        </p>
        <h3 className="mt-2 truncate font-display text-lg font-bold uppercase leading-tight text-fg">{e.title}</h3>
        <p className="mt-1 truncate text-sm text-fg-muted">{[e.city, e.venueName].filter(Boolean).join(" · ")}</p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.14em] text-fg-subtle">{t.category}</p>
            <p className="truncate text-sm font-medium text-fg">
              {ticket.categoryName}
              {ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}
            </p>
          </div>
          <span className="shrink-0 font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted transition-colors group-hover:text-coral">
            <span className="hidden sm:inline">{t.showTicket} </span>→
          </span>
        </div>
      </div>

      {/* корешок */}
      <div
        className="ticket-notch relative hidden w-24 shrink-0 flex-col items-center justify-center gap-2 border-l border-dashed border-line-strong bg-surface p-3 sm:flex"
        style={{ ["--notch-bg" as string]: "var(--color-ink)" }}
      >
        <QrCode value={ticket.code} className="h-16 w-16 rounded-[6px]" />
        <span className="font-mono text-[9px] tracking-[0.06em] text-fg-subtle">{ticket.code.slice(-6)}</span>
      </div>
    </button>
  );
}

/** Полноэкранный билет для прохода: крупный QR и детали. */
function TicketModal({
  ticket,
  onClose,
  locale,
  t,
}: {
  ticket: AccountTicket | null;
  onClose: () => void;
  locale: Locale;
  t: AccountDictionary["account"];
}) {
  useEffect(() => {
    if (!ticket) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [ticket, onClose]);

  return createPortal(
    <AnimatePresence>
      {ticket && (
        <motion.div
          key="ticket"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-deep/80 p-4 backdrop-blur-md sm:items-center"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t.ticket}
            initial={{ y: 60, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm overflow-hidden rounded-[22px] bg-fg text-ink shadow-2xl"
          >
            <div className="relative h-36 overflow-hidden bg-ink">
              <EventPoster src={ticket.event.posterUrl} alt={ticket.event.title} sizes="400px" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
              <button
                type="button"
                onClick={onClose}
                aria-label={t.close}
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-ink/70 text-fg backdrop-blur transition-colors hover:bg-coral"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-coral">
                  {formatEventDate(ticket.event.startsAt, locale, ticket.event.timezone)} ·{" "}
                  {formatEventTime(ticket.event.startsAt, locale, ticket.event.timezone)}
                </p>
                <p className="mt-1 font-display text-xl font-bold uppercase text-fg">{ticket.event.title}</p>
              </div>
            </div>

            <div className="flex flex-col items-center px-6 pb-5 pt-6">
              <QrCode value={ticket.code} className="h-52 w-52" />
              <p className="mt-3 font-mono text-sm tracking-[0.12em] text-ink/70">{ticket.code}</p>
            </div>

            <div
              className="ticket-notch mx-0 border-t border-dashed border-ink/20"
              style={{ ["--notch-bg" as string]: "rgba(5,5,5,0.85)" }}
            />

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-6 py-5 text-sm">
              <Fact label={t.category} value={ticket.categoryName} />
              <Fact label={t.seat} value={ticket.seatLabel ?? "—"} />
              <Fact label={t.order} value={`№ ${ticket.orderNumber}`} />
              <Fact label={t.price} value={formatMoney(ticket.price, ticket.currency, locale)} />
              <div className="col-span-2">
                <Fact label="" value={[ticket.event.city, ticket.event.venueName, ticket.event.address].filter(Boolean).join(" · ")} />
              </div>
            </dl>

            <div className="bg-ink px-6 py-4 text-center text-xs leading-5 text-fg-muted">
              {t.entry}
              <br />
              <span className="text-fg-subtle">{t.brightness}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      {label && <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">{label}</dt>}
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}

export function TicketsSkeleton() {
  return (
    <ul className="grid gap-5 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <li key={i} className="skeleton h-40 rounded-card" />
      ))}
    </ul>
  );
}

