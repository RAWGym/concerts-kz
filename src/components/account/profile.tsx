import { AnimatePresence, motion } from "framer-motion";
import { useState, type FormEvent, type ReactNode } from "react";

import Link from "next/link";
import type { AccountDictionary } from "@/i18n/account";
import { changePassword, updateProfile } from "@/lib/account/api";
import type { AccountUser } from "@/lib/account/types";
import { company } from "@/lib/company";

type Status = "idle" | "busy" | "done" | "error";

/** Вкладка «Профиль»: личные данные, пароль, выход. */
export function ProfileTab({
  user,
  t,
  errorText,
  staff,
  onSignOut,
}: {
  user: AccountUser;
  t: AccountDictionary["account"];
  errorText: string;
  staff: boolean;
  onSignOut: () => void;
}) {
  const p = t.profile;
  const [info, setInfo] = useState<Status>("idle");
  const [pass, setPass] = useState<Status>("idle");

  async function saveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setInfo("busy");
    try {
      await updateProfile({ fullName: String(f.get("name") ?? ""), phone: String(f.get("phone") ?? "") });
      setInfo("done");
    } catch {
      setInfo("error");
    }
  }

  async function savePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const value = String(new FormData(form).get("password") ?? "");
    if (value.length < 8) {
      setPass("error");
      return;
    }
    setPass("busy");
    try {
      await changePassword(value);
      setPass("done");
      form.reset();
    } catch {
      setPass("error");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card title={p.personal} hint={p.personalHint}>
        <form onSubmit={saveInfo} onChange={() => info === "done" && setInfo("idle")} className="grid gap-5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="field-label">{p.name}</span>
            <input name="name" defaultValue={user.fullName} autoComplete="name" className="field" />
          </label>
          <label className="block">
            <span className="field-label">{p.phone}</span>
            <input name="phone" type="tel" defaultValue={user.phone} autoComplete="tel" placeholder="+7" className="field" />
          </label>
          <label className="block">
            <span className="field-label">{p.email}</span>
            <input value={user.email} disabled className="field" />
            <span className="mt-2 block text-xs text-fg-subtle">{p.emailHint}</span>
          </label>
          <div className="flex items-center gap-4 sm:col-span-2">
            <button type="submit" disabled={info === "busy"} className="btn btn-primary">
              {p.save}
            </button>
            <Feedback status={info} ok={p.saved} error={errorText} />
          </div>
        </form>
      </Card>

      <div className="grid gap-5">
        <Card title={p.security} hint={p.securityHint}>
          <form onSubmit={savePassword} className="space-y-4">
            <label className="block">
              <span className="field-label">{p.newPassword}</span>
              <input name="password" type="password" autoComplete="new-password" minLength={8} required className="field" />
            </label>
            <div className="flex items-center gap-4">
              <button type="submit" disabled={pass === "busy"} className="btn btn-secondary">
                {p.changePassword}
              </button>
              <Feedback status={pass} ok={p.passwordChanged} error={errorText} />
            </div>
          </form>
        </Card>

        <div className="rounded-card border border-line p-6">
          {staff && (
            <Link href="/admin" className="btn btn-secondary mb-3 w-full">
              {p.admin} →
            </Link>
          )}
          <button type="button" onClick={onSignOut} className="btn w-full border-line-strong text-fg-muted hover:border-coral hover:text-coral">
            {p.signOut}
          </button>
          <p className="mt-5 text-center text-xs leading-5 text-fg-subtle">
            {p.help.split("{email}")[0]}
            <a href={`mailto:${company.email}`} className="text-fg-muted hover:text-coral">
              {company.email}
            </a>
            {p.help.split("{email}")[1]}
          </p>
        </div>
      </div>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface/40 p-6 sm:p-7">
      <h3 className="font-display text-base font-semibold uppercase text-fg">{title}</h3>
      <p className="mt-1 text-sm text-fg-subtle">{hint}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Feedback({ status, ok, error }: { status: Status; ok: string; error: string }) {
  return (
    <AnimatePresence mode="wait">
      {(status === "done" || status === "error") && (
        <motion.span
          key={status}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          role="status"
          className={`flex items-center gap-1.5 text-sm ${status === "done" ? "text-teal" : "text-coral"}`}
        >
          {status === "done" && (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M5 12l5 5 9-10" />
            </svg>
          )}
          {status === "done" ? ok : error}
        </motion.span>
      )}
      {status === "busy" && (
        <motion.span key="busy" className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-coral" />
      )}
    </AnimatePresence>
  );
}
