import { useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router";

import Link from "next/link";
import { Section } from "@/components/ui/section";
import { fill, getAccountDictionary } from "@/i18n/account";
import { defaultLocale, intlLocale, isLocale } from "@/i18n/config";
import { localePath } from "@/i18n/routing";
import { useSession } from "@/lib/account/session";
import { company } from "@/lib/company";
import { formatEventDateTime, formatMoney } from "@/lib/format";
import { getRefundInfo, requestRefund, TicketApiError, type RefundInfo } from "@/lib/tickets/provider";
import { seatName } from "@/lib/tickets/seats";
import type { CurrencyCode } from "@/lib/supabase/types";

const tableOf = (seat: string | null) => seat?.match(/^table-(\d+)/)?.[1] ?? null;

/** Заявка покупателя на возврат после переноса или отмены концерта (ссылка из письма). */
export default function RefundPage() {
  const params = useParams();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const t = getAccountDictionary(locale).refund;
  const session = useSession();
  const [search] = useSearchParams();
  const orderId = search.get("order") ?? "";

  const [info, setInfo] = useState<RefundInfo | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const userId = session.user?.id;
  useEffect(() => {
    document.title = `${t.title} · Concerts Prod`;
  }, [t]);
  useEffect(() => {
    if (!userId) return;
    getRefundInfo(orderId)
      .then((r) => {
        setInfo(r);
        setChosen(r.tickets.map((x) => x.id));
      })
      .catch(() => setInfo({ canRequest: false, reason: "not_found", order: null, event: null, tickets: [], request: null }));
  }, [userId, orderId]);

  if (session.status === "guest") {
    const next = encodeURIComponent(`${localePath(locale, "/refund")}?order=${orderId}`);
    return <Navigate to={`${localePath(locale, "/login")}?next=${next}`} replace />;
  }

  const email = company.email;
  const date = (iso: string) => formatEventDateTime(iso, locale, info?.event?.timezone ?? "Asia/Almaty");
  const created = (iso: string) => new Intl.DateTimeFormat(intlLocale[locale], { day: "numeric", month: "long" }).format(new Date(iso));

  // Стол возвращается целиком: отмечаем и снимаем все его места вместе.
  function toggle(id: string, on: boolean) {
    const seat = info?.tickets.find((x) => x.id === id)?.seat ?? null;
    const table = tableOf(seat);
    const group = table ? info!.tickets.filter((x) => tableOf(x.seat) === table).map((x) => x.id) : [id];
    setChosen((c) => (on ? [...new Set([...c, ...group])] : c.filter((x) => !group.includes(x))));
  }

  async function submit() {
    if (!info?.order) return;
    setBusy(true);
    setErr(null);
    try {
      await requestRefund(info.order.id, chosen, reason);
      setDone(true);
    } catch (e) {
      const code = e instanceof TicketApiError ? e.code : "";
      setErr(code === "whole_table" ? t.wholeTable : code === "request_exists" ? fill(t.exists, { date: created(new Date().toISOString()) }) : fill(t.error, { email }));
    }
    setBusy(false);
  }

  const total = (info?.tickets ?? []).filter((x) => chosen.includes(x.id)).reduce((s, x) => s + x.paid, 0);
  const cur = (info?.order?.currency ?? "KZT") as CurrencyCode;

  let blocked: string | null = null;
  if (info && !info.canRequest) {
    const r = info.request;
    if (info.reason === "request_exists" && r) blocked = fill(t.exists, { date: created(r.created_at) });
    else if (r?.status === "refunded") blocked = t.refunded;
    else if (info.reason === "event_not_changed") blocked = fill(t.notChanged, { email });
    else if (info.reason === "deadline_passed") blocked = fill(t.deadline, { email });
    else if (info.reason === "nothing_to_refund") blocked = r?.status === "rejected" ? fill(t.rejected, { note: r.decision_note ?? "", email }) : t.nothing;
    else blocked = t.notFound;
  }

  return (
    <Section>
      <div className="mx-auto max-w-xl">
        <p className="overline">{t.overline}</p>
        <h1 className="mt-2 font-display text-2xl font-bold uppercase text-fg sm:text-3xl">{info?.event?.title ?? t.title}</h1>
        {info?.order && <p className="mt-1 text-sm text-fg-subtle">{fill(t.order, { n: info.order.number })}</p>}

        {!info ? (
          <div className="mt-10 flex justify-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-line-strong border-t-coral" /></div>
        ) : (
          <>
            {info.event?.changeKind && (
              <div className={`mt-6 rounded-card border p-4 text-sm leading-6 ${info.event.changeKind === "cancelled" ? "border-coral/50 text-fg" : "border-orange/50 text-fg"}`}>
                {info.event.changeKind === "cancelled" ? t.cancelled : fill(t.postponed, { date: date(info.event.startsAt) })}
                {info.event.changeKind === "postponed" && info.event.originalStartsAt && (
                  <span className="block text-fg-subtle">{fill(t.was, { date: date(info.event.originalStartsAt) })}</span>
                )}
                <span className="mt-2 block text-xs text-fg-subtle">{t.law}</span>
              </div>
            )}

            {done ? (
              <p className="mt-8 rounded-card border border-teal/50 p-4 text-sm leading-6 text-fg">{t.sent}</p>
            ) : blocked ? (
              <p className="mt-8 rounded-card border border-dashed border-line-strong p-4 text-sm leading-6 text-fg-muted">{blocked}</p>
            ) : (
              <div className="mt-8 space-y-6">
                <div>
                  <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{t.choose}</p>
                  <ul className="mt-3 divide-y divide-line rounded-card border border-line">
                    {info.tickets.map((x) => (
                      <li key={x.id}>
                        <label className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
                          <span className="flex items-center gap-3 text-fg">
                            <input type="checkbox" className="accent-[#ff4d4d]" checked={chosen.includes(x.id)} onChange={(e) => toggle(x.id, e.target.checked)} />
                            <span>
                              {x.category}{x.seat ? ` · ${seatName(x.seat, locale)}` : ""}
                              <span className="block font-mono text-[11px] text-fg-subtle">{x.code}</span>
                            </span>
                          </span>
                          <span className="text-fg-muted">{formatMoney(x.paid, cur, locale)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {info.tickets.some((x) => tableOf(x.seat)) && <p className="mt-2 text-xs text-fg-subtle">{t.table}</p>}
                </div>
                <label className="block text-sm text-fg-muted">
                  {t.reason}
                  <textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                    className="mt-1.5 w-full rounded-btn border border-line-strong bg-surface px-3 py-2.5 text-sm text-fg outline-none focus:border-coral" />
                </label>
                <div className="flex items-baseline justify-between">
                  <span className="text-fg-muted">{t.total}</span>
                  <span className="font-display text-2xl font-bold text-fg">{formatMoney(total, cur, locale)}</span>
                </div>
                {err && <p className="text-sm text-coral">{err}</p>}
                <button type="button" disabled={busy || !chosen.length} onClick={submit} className="btn btn-primary w-full disabled:opacity-60">
                  {busy ? "…" : t.submit}
                </button>
              </div>
            )}
            <div className="mt-8 text-center">
              <Link href={localePath(locale, "/account")} className="text-sm text-fg-muted hover:text-coral">{t.toAccount}</Link>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
