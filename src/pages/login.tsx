import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router";

import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { EASE_OUT } from "@/components/motion/reveal";
import { fill, getAccountDictionary } from "@/i18n/account";
import { defaultLocale, isLocale } from "@/i18n/config";
import { localePath } from "@/i18n/routing";
import { CodeInput } from "@/components/account/code-input";
import { onboardingLabels } from "@/i18n/onboarding";
import { authRedirect, isStaff } from "@/lib/account/api";
import {
  CODE_LENGTH,
  getAuthProviders,
  isOnboarded,
  sendEmailCode,
  signInWithGoogle,
  verifyEmailCode,
} from "@/lib/account/auth";
import { useSession } from "@/lib/account/session";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type Mode = "login" | "signup" | "code" | "reset";
type Notice = { kind: "error" | "ok"; text: string } | null;

/**
 * Вход и регистрация покупателя. Сотрудники входят здесь же: после
 * входа с ролью в админке сразу уходят в /admin.
 */
export default function LoginPage() {
  const params = useParams();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const t = getAccountDictionary(locale).login;
  const o = onboardingLabels[locale];
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const session = useSession();

  const [mode, setMode] = useState<Mode>(search.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Вход по коду: сначала e-mail, потом код из письма.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    if (isSupabaseConfigured) void getAuthProviders().then((p) => setGoogle(p.google));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => {
    document.title = `${mode === "signup" ? t.titleSignup : t.title} · Concerts Prod`;
  }, [mode, t]);

  const next = search.get("next");
  const accountPath = localePath(locale, "/account");
  const after = next && next.startsWith("/") && !next.startsWith("//") ? next : accountPath;
  const welcome = `${localePath(locale, "/welcome")}?next=${encodeURIComponent(after)}`;
  const byCode = mode === "signup" || mode === "code";

  if (session.status === "user") return <Navigate to={after} replace />;

  function switchMode(m: Mode) {
    setMode(m);
    setNotice(null);
    setCodeSent(false);
    setCode("");
    setCodeError(false);
  }

  function requestCode() {
    if (!email || !/.+@.+\..+/.test(email)) {
      document.querySelector<HTMLInputElement>("input[name=email]")?.reportValidity();
      return;
    }
    void run(async () => {
      try {
        await sendEmailCode(email);
      } catch (e) {
        const status = (e as { status?: number }).status;
        setNotice({ kind: "error", text: status === 429 ? o.tooMany : t.errorGeneric });
        return;
      }
      setCodeSent(true);
      setCode("");
      setCooldown(60);
    });
  }

  function resend() {
    void run(async () => {
      try {
        await sendEmailCode(email);
        setNotice({ kind: "ok", text: o.resent });
        setCooldown(60);
      } catch {
        setNotice({ kind: "error", text: o.tooMany });
      }
    });
  }

  function confirm(value = code) {
    if (value.length !== CODE_LENGTH) return;
    void run(async () => {
      try {
        const user = await verifyEmailCode(email, value);
        if (isOnboarded(user.user_metadata)) {
          navigate((await isStaff(user.id)) && !next ? "/admin" : after, { replace: true });
        } else {
          navigate(welcome, { replace: true });
        }
      } catch {
        setCodeError(true);
        setNotice({ kind: "error", text: o.wrongCode });
        setTimeout(() => setCodeError(false), 400);
      }
    });
  }

  function onCode(v: string) {
    setCode(v);
    setNotice(null);
    if (v.length === CODE_LENGTH) confirm(v);
  }

  function google_() {
    void run(async () => {
      await signInWithGoogle(authRedirect(welcome));
    });
  }

  async function run(action: () => Promise<void>) {
    if (!isSupabaseConfigured) {
      navigate(after);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch {
      setNotice({ kind: "error", text: t.errorGeneric });
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (byCode) {
      if (codeSent) confirm();
      else requestCode();
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const client = isSupabaseConfigured ? createBrowserSupabase() : null;

    void run(async () => {
      if (!client) return;

      if (mode === "login") {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error || !data.user) {
          setNotice({ kind: "error", text: t.errorLogin });
          return;
        }
        navigate((await isStaff(data.user.id)) && !next ? "/admin" : after, { replace: true });
        return;
      }

      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirect(`${accountPath}?tab=profile`),
      });
      if (error) throw error;
      setNotice({ kind: "ok", text: fill(t.resetSent, { email }) });
    });
  }

  const heading = codeSent
    ? o.codeTitle
    : mode === "signup"
      ? t.titleSignup
      : mode === "reset"
        ? t.titleReset
        : t.title;
  const lead = codeSent
    ? fill(o.codeLead, { email, length: String(CODE_LENGTH) })
    : mode === "signup"
      ? o.signupLead
      : t.lead;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 sm:px-6 pb-20 pt-6 md:pt-10 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
      {/* ---------- витрина ---------- */}
      <motion.aside
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
        className="hero-ember grain relative hidden min-h-[620px] overflow-hidden rounded-[22px] lg:flex lg:flex-col"
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(5,5,5,0.85)_100%)]" />
        <div className="relative z-[2] flex flex-1 flex-col justify-between p-10">
          <Logo height={26} />

          <div>
            <p className="overline !text-white/80">{t.overline}</p>
            <p className="mt-4 font-display text-[44px] font-bold uppercase leading-[0.98] tracking-[-0.03em] text-white">
              {t.tagline.split(" ").map((word, i) => (
                <motion.span
                  key={word + i}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.25 + i * 0.07 }}
                  className={`mr-[0.25em] inline-block ${i === 2 ? "text-ink" : ""}`}
                >
                  {word}
                </motion.span>
              ))}
            </p>

            <ul className="mt-10 space-y-3">
              {t.perks.map((perk, i) => (
                <motion.li
                  key={perk}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.7 + i * 0.1 }}
                  className="flex items-start gap-3 text-sm text-white/85"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                  {perk}
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </motion.aside>

      {/* ---------- форма ---------- */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.1 }}
        className="flex flex-col justify-center rounded-[22px] border border-line bg-surface/40 p-6 sm:p-10"
      >
        <div className="mx-auto w-full max-w-sm">
          {mode === "signup" ? (
            <div className="mb-5">
              <p className="overline">{fill(o.step, { n: codeSent ? "2" : "1" })}</p>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {[1, 2, 3].map((n) => (
                  <span key={n} className="h-1 overflow-hidden rounded-full bg-line">
                    <motion.span
                      className="block h-full bg-coral"
                      initial={false}
                      animate={{ width: n <= (codeSent ? 2 : 1) ? "100%" : "0%" }}
                      transition={{ duration: 0.5, ease: EASE_OUT }}
                    />
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="overline">{t.overline}</p>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={heading}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="mt-2 font-display text-3xl font-bold uppercase tracking-[-0.02em] text-fg"
            >
              {heading}
            </motion.h1>
          </AnimatePresence>
          <p className="mt-3 text-sm leading-6 text-fg-muted">{lead}</p>

          {(mode === "login" || mode === "signup") && !codeSent && (
            <div role="tablist" className="mt-8 grid grid-cols-2 rounded-full border border-line bg-ink p-1">
              {(["login", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={`relative rounded-full py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors ${
                    mode === m ? "text-white" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {mode === m && (
                    <motion.span
                      layoutId="auth-tab"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="absolute inset-0 rounded-full bg-coral"
                    />
                  )}
                  <span className="relative">{m === "login" ? t.tabLogin : t.tabSignup}</span>
                </button>
              ))}
            </div>
          )}

          {google && (mode === "login" || mode === "signup") && !codeSent && (
            <div className="mt-7">
              <button type="button" onClick={google_} disabled={busy} className="btn btn-secondary w-full !normal-case !tracking-normal">
                <GoogleIcon />
                {o.google}
              </button>
              <div className="mt-5 flex items-center gap-4 text-[11px] uppercase tracking-[0.14em] text-fg-faint">
                <span className="h-px flex-1 bg-line" />
                {t.or}
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className={`${google && !codeSent && mode !== "reset" && mode !== "code" ? "mt-5" : "mt-7"} space-y-5`}>
            {byCode && codeSent ? (
              <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: EASE_OUT }} className="space-y-4">
                <CodeInput value={code} onChange={onCode} length={CODE_LENGTH} disabled={busy} invalid={codeError} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <button type="button" onClick={() => { setCodeSent(false); setNotice(null); }} className="text-fg-muted transition-colors hover:text-coral">
                    ← {o.changeEmail}
                  </button>
                  {cooldown > 0 ? (
                    <span className="text-fg-subtle">{fill(o.resendIn, { s: String(cooldown) })}</span>
                  ) : (
                    <button type="button" onClick={resend} disabled={busy} className="text-coral hover:underline">
                      {o.resend}
                    </button>
                  )}
                </div>
                <p className="text-xs text-fg-subtle">{o.checkSpam}</p>
              </motion.div>
            ) : (
              <label className="block">
                <span className="field-label">{t.email}</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field"
                  placeholder="you@mail.kz"
                />
              </label>
            )}

            <AnimatePresence initial={false}>
              {mode === "login" && (
                <Collapse key="password">
                  <label className="block">
                    <span className="flex items-baseline justify-between">
                      <span className="field-label">{t.password}</span>
                      <button
                        type="button"
                        onClick={() => switchMode("reset")}
                        className="text-xs text-fg-subtle transition-colors hover:text-coral"
                      >
                        {t.forgot}
                      </button>
                    </span>
                    <PasswordInput isNew={false} />
                  </label>
                </Collapse>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {notice && (
                <motion.p
                  key={notice.text}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role={notice.kind === "error" ? "alert" : "status"}
                  className={`rounded-btn border px-4 py-3 text-sm leading-6 ${
                    notice.kind === "error"
                      ? "border-coral/40 bg-coral/10 text-coral"
                      : "border-teal/40 bg-teal/10 text-teal"
                  }`}
                >
                  {notice.text}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={busy || (byCode && codeSent && code.length !== CODE_LENGTH)}
              className="btn btn-primary w-full disabled:cursor-wait disabled:opacity-60"
            >
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {byCode ? (codeSent ? o.verify : o.getCode) : mode === "reset" ? t.submitReset : t.submitLogin}
            </button>

            {mode === "login" && (
              <button type="button" onClick={() => switchMode("code")} disabled={busy} className="btn btn-secondary w-full">
                <MailIcon />
                {o.codeLogin}
              </button>
            )}

            {(mode === "reset" || mode === "code") && !codeSent && (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="w-full text-center text-sm text-fg-muted transition-colors hover:text-coral"
              >
                {t.back}
              </button>
            )}

            {mode === "signup" && !codeSent && (
              <p className="text-xs leading-5 text-fg-subtle">
                {renderTerms(t.terms, {
                  offer: (
                    <Link href={localePath(locale, "/legal/offer")} className="text-fg-muted underline-offset-2 hover:text-coral hover:underline">
                      {t.offer}
                    </Link>
                  ),
                  privacy: (
                    <Link href={localePath(locale, "/legal/privacy")} className="text-fg-muted underline-offset-2 hover:text-coral hover:underline">
                      {t.privacy}
                    </Link>
                  ),
                })}
              </p>
            )}
          </form>
        </div>
      </motion.section>
    </div>
  );
}

/** Плавно раскрывает и сворачивает поле при смене режима. */
function Collapse({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

function PasswordInput({ isNew }: { isNew: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="relative block">
      <input
        name="password"
        type={shown ? "text" : "password"}
        autoComplete={isNew ? "new-password" : "current-password"}
        required
        minLength={isNew ? 8 : undefined}
        className="field pr-12"
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-fg-subtle transition-colors hover:text-fg"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-[18px] w-[18px]">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" strokeLinecap="round" />}
        </svg>
      </button>
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5L12 13l8.5-6.5" />
    </svg>
  );
}

function renderTerms(template: string, parts: Record<string, ReactNode>) {
  return template.split(/(\{\w+\})/).map((chunk, i) => {
    const key = chunk.match(/^\{(\w+)\}$/)?.[1];
    return key ? <span key={i}>{parts[key]}</span> : chunk;
  });
}
