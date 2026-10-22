import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";

import Link from "next/link";
import { headerLabels } from "@/components/layout/header-labels";
import { EASE_OUT } from "@/components/motion/reveal";
import { fill } from "@/i18n/account";
import { defaultLocale, isLocale } from "@/i18n/config";
import { onboardingLabels } from "@/i18n/onboarding";
import { localePath } from "@/i18n/routing";
import { formatKzPhone, isFullKzPhone, isOnboarded, saveOnboarding } from "@/lib/account/auth";
import { useSession } from "@/lib/account/session";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Третий шаг регистрации: имя, телефон, город. Сюда приходят после
 * кода из письма.
 */
export default function WelcomePage() {
  const params = useParams();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const o = onboardingLabels[locale];
  const cities = headerLabels[locale].cities;
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const session = useSession();

  const next = search.get("next");
  const after = next && next.startsWith("/") && !next.startsWith("//") ? next : localePath(locale, "/account");

  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState(cities[0]);
  const [news, setNews] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.title = `${o.profileTitle} · Concerts Prod`;
  }, [o]);

  // Подставляем то, что уже знаем (например, имя из Google).
  useEffect(() => {
    if (session.status !== "user" || meta) return;
    if (!isSupabaseConfigured) return;
    void createBrowserSupabase()
      .auth.getUser()
      .then(({ data }) => {
        const m = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
        setMeta(m);
        setName(session.user.fullName || (typeof m.name === "string" ? m.name : ""));
        if (session.user.phone) setPhone(formatKzPhone(session.user.phone));
        if (typeof m.city === "string") setCity(m.city);
      });
  }, [session, meta]);

  if (session.status === "guest") return <Navigate to={localePath(locale, "/login") + "?mode=signup"} replace />;
  if (session.status === "loading" || (session.status === "user" && !meta && isSupabaseConfigured)) {
    return <div aria-busy className="min-h-[70vh]" />;
  }
  if (meta && isOnboarded(meta) && !done) return <Navigate to={after} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(o.errorName);
    if (phone && !isFullKzPhone(phone)) return setError(o.errorPhone);
    setBusy(true);
    setError(null);
    try {
      await saveOnboarding({ fullName: name, phone, city, news });
      try {
        localStorage.setItem("city", city);
      } catch {
        /* приватный режим */
      }
      setDone(true);
    } catch {
      setError(o.tooMany);
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    await saveOnboarding({ fullName: name, phone: "", city, news: false }).catch(() => undefined);
    navigate(after, { replace: true });
  }

  const first = name.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex min-h-[calc(100vh-200px)] w-full max-w-7xl items-center justify-center px-4 pb-20 pt-8 sm:px-6">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT }}
        className="grain relative w-full max-w-lg overflow-hidden rounded-[22px] border border-line bg-[radial-gradient(120%_90%_at_100%_0%,rgba(255,77,77,0.18)_0%,transparent_60%),linear-gradient(180deg,#151515,#0f0f0f)] p-6 sm:p-10"
      >
        <div className="relative z-[2]">
          <p className="overline">{fill(o.step, { n: "3" })}</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[1, 2, 3].map((n) => (
              <span key={n} className="h-1 overflow-hidden rounded-full bg-line">
                <motion.span
                  className="block h-full bg-coral"
                  initial={{ width: n < 3 ? "100%" : "0%" }}
                  animate={{ width: n < 3 || done ? "100%" : "35%" }}
                  transition={{ duration: 0.6, ease: EASE_OUT }}
                />
              </span>
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                className="pt-10 text-center"
              >
                <motion.span
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.1 }}
                  className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[linear-gradient(135deg,#ff6b5b,#d6302c)] shadow-[0_20px_50px_-15px_rgba(255,77,77,0.9)]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9" aria-hidden>
                    <motion.path d="m5 12.5 4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.35 }} />
                  </svg>
                </motion.span>
                <h1 className="mt-7 font-display text-3xl font-bold uppercase tracking-[-0.02em] text-fg">
                  {first ? fill(o.doneTitle, { name: first }) : o.doneTitleAnon}
                </h1>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-fg-muted">{o.doneLead}</p>
                <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                  <Link href={`${localePath(locale, "/events")}?city=${encodeURIComponent(city)}`} className="btn btn-primary">
                    {o.toEvents}
                  </Link>
                  <Link href={after} className="btn btn-secondary">
                    {o.toAccount}
                  </Link>
                </div>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={onSubmit}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                <div className="pt-6">
                  <h1 className="font-display text-3xl font-bold uppercase tracking-[-0.02em] text-fg">{o.profileTitle}</h1>
                  <p className="mt-3 text-sm leading-6 text-fg-muted">{o.profileLead}</p>
                </div>

                <label className="block">
                  <span className="field-label">{o.name}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus className="field" />
                </label>

                <label className="block">
                  <span className="field-label">{o.phone}</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value ? formatKzPhone(e.target.value) : "")}
                    onFocus={() => !phone && setPhone("+7")}
                    onBlur={() => phone === "+7" && setPhone("")}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+7 (7__) ___-__-__"
                    className="field"
                  />
                  <span className="mt-2 block text-xs text-fg-subtle">{o.phoneHint}</span>
                </label>

                <fieldset>
                  <legend className="field-label">{o.city}</legend>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {cities.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCity(c)}
                        aria-pressed={city === c}
                        className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                          city === c ? "border-coral bg-coral text-white" : "border-line-strong text-fg-muted hover:border-fg-subtle hover:text-fg"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <span className="mt-2 block text-xs text-fg-subtle">{o.cityHint}</span>
                </fieldset>

                <label className="flex cursor-pointer items-start gap-3 rounded-btn border border-line bg-ink/60 p-4 text-sm text-fg-muted">
                  <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ff4d4d]" />
                  {o.news}
                </label>

                {error && (
                  <p role="alert" className="rounded-btn border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-60">
                  {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                  {o.save}
                </button>
                <button type="button" onClick={skip} disabled={busy} className="w-full text-center text-sm text-fg-subtle transition-colors hover:text-fg">
                  {o.skip}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </div>
  );
}
