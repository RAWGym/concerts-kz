
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { initialLeadFormState } from "@/lib/actions/lead-form-state";
import { submitLead } from "@/lib/actions/leads";
import type { LeadType } from "@/lib/supabase/types";

const fieldClass =
  "w-full rounded-btn border border-line-strong bg-surface px-4 py-3 text-sm text-fg placeholder:text-fg-subtle focus:border-coral focus:outline-none";

export function LeadForm({
  locale,
  t,
  defaultType = "general",
  sourceUrl,
}: {
  locale: Locale;
  t: Dictionary;
  defaultType?: LeadType;
  /** Страница, с которой пришла заявка — попадает в leads.source_url. */
  sourceUrl: string;
}) {
  const [state, formAction] = useActionState(submitLead, initialLeadFormState);

  const types: { value: LeadType; label: string }[] = [
    { value: "partner", label: t.form.typePartner },
    { value: "artist", label: t.form.typeArtist },
    { value: "booking", label: t.form.typeBooking },
    { value: "general", label: t.form.typeGeneral },
  ];

  if (state.status === "success") {
    return (
      <p className="rounded-card border border-teal/40 bg-teal/10 px-6 py-8 text-sm leading-6 text-fg">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="source_url" value={sourceUrl} />

      {/* Приманка для ботов: скрыта от людей, но не от автозаполнения скриптов. */}
      <div aria-hidden className="hidden">
        <label>
          Company website
          <input name="company_website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div>
        <label
          htmlFor="lead-type"
          className="mb-2 block text-xs text-fg-subtle"
        >
          {t.form.type}
        </label>
        <select
          id="lead-type"
          name="type"
          defaultValue={defaultType}
          className={fieldClass}
        >
          {types.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <Field
        id="lead-name"
        name="name"
        label={t.form.name}
        required
        autoComplete="name"
        hasError={state.fields.includes("name")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="lead-phone"
          name="phone"
          label={t.form.phone}
          type="tel"
          autoComplete="tel"
          hasError={state.fields.includes("phone")}
        />
        <Field
          id="lead-email"
          name="email"
          label={t.form.email}
          type="email"
          autoComplete="email"
          hasError={state.fields.includes("email")}
        />
      </div>

      <Field
        id="lead-company"
        name="company"
        label={t.form.company}
        autoComplete="organization"
      />

      <div>
        <label
          htmlFor="lead-message"
          className="mb-2 block text-xs text-fg-subtle"
        >
          {t.form.message}
        </label>
        <textarea
          id="lead-message"
          name="message"
          rows={4}
          className={`${fieldClass} resize-y`}
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-coral">
          {state.message}
        </p>
      )}

      <SubmitButton label={t.form.submit} pendingLabel={t.form.sending} />
    </form>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
  autoComplete,
  hasError = false,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  hasError?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-xs text-fg-subtle">
        {label}
        {required && <span className="text-coral"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={hasError || undefined}
        className={`${fieldClass} ${hasError ? "border-coral" : ""}`}
      />
    </div>
  );
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full disabled:opacity-60 sm:w-auto"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
