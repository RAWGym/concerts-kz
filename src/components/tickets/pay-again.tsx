import { useState } from "react";

import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { localePath } from "@/i18n/routing";
import { retryPayment } from "@/lib/tickets/provider";

/** Кнопка повторной оплаты заказа: ведёт на страницу банка. */
export function PayAgainButton({
  orderId,
  locale,
  label,
  className = "btn btn-primary",
}: {
  orderId: string;
  locale: Locale;
  label?: string;
  className?: string;
}) {
  const c = getDictionary(locale).checkout;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const returnUrl = `${window.location.origin}${localePath(locale, `/orders/${orderId}`)}`;
    const res = await retryPayment(orderId, returnUrl);
    if (res.paymentUrl) {
      window.location.assign(res.paymentUrl);
      return;
    }
    setBusy(false);
    if (res.error === "login_required") {
      window.location.assign(localePath(locale, `/login?next=${encodeURIComponent(window.location.pathname)}`));
    } else if (res.error === "already_paid") {
      window.location.reload();
    } else if (["not_enough_tickets", "seat_taken", "event_not_on_sale", "category_unavailable"].includes(res.error ?? "")) {
      setError(c.retrySoldOut);
    } else {
      setError(c.retryError);
    }
  }

  return (
    <>
      <button type="button" onClick={pay} disabled={busy} className={`${className} disabled:opacity-60`}>
        {busy ? "…" : (label ?? c.retry)}
      </button>
      {error && <p className="mt-3 w-full text-center text-xs leading-5 text-coral">{error}</p>}
    </>
  );
}
