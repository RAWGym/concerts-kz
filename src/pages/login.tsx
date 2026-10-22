import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";

import { Section } from "@/components/ui/section";
import { defaultLocale, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  const params = useParams();
  const locale = params.locale && isLocale(params.locale) ? params.locale : defaultLocale;
  const t = getDictionary(locale);
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSupabaseConfigured) return;

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await createBrowserSupabase().auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);

    if (error) setError(t.auth.error);
    else navigate("/admin");
  }

  const input =
    "mt-2 w-full rounded-btn border border-line-strong bg-surface px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-coral";

  return (
    <Section>
      <div className="mx-auto max-w-sm">
        <h1 className="font-display text-3xl font-bold uppercase tracking-[-0.01em] text-fg">
          {t.auth.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-fg-muted">{t.auth.subtitle}</p>

        {!isSupabaseConfigured && (
          <p className="mt-6 rounded-card border border-dashed border-line-strong px-4 py-3 text-sm text-fg-muted">
            {t.auth.disabled}
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <label className="block text-xs font-medium text-fg-muted">
            {t.auth.email}
            <input name="email" type="email" autoComplete="email" required className={input} />
          </label>
          <label className="block text-xs font-medium text-fg-muted">
            {t.auth.password}
            <input name="password" type="password" autoComplete="current-password" required className={input} />
          </label>

          {error && <p className="text-sm text-coral">{error}</p>}

          <button
            type="submit"
            disabled={busy || !isSupabaseConfigured}
            className="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t.auth.submit}
          </button>
        </form>
      </div>
    </Section>
  );
}
