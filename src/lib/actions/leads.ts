
import { defaultLocale, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createPublicClient } from "@/lib/supabase/public";
import type { LeadType } from "@/lib/supabase/types";

import type { LeadFormState } from "./lead-form-state";

const leadTypes: LeadType[] = ["partner", "artist", "booking", "general"];

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Пишет заявку в public.leads анонимным ключом. RLS пропускает такой
 * insert только со status = 'new' — поле выставляем здесь, из формы
 * оно не приходит.
 */
export async function submitLead(
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const rawLocale = formData.get("locale");
  const locale =
    typeof rawLocale === "string" && isLocale(rawLocale)
      ? rawLocale
      : defaultLocale;

  const t = getDictionary(locale);

  // Ловушка для ботов: люди это поле не видят и не заполняют.
  if (text(formData, "company_website")) {
    return { status: "success", message: t.form.success, fields: [] };
  }

  const name = text(formData, "name");
  const phone = text(formData, "phone");
  const email = text(formData, "email");

  if (!name) {
    return { status: "error", message: t.form.nameRequired, fields: ["name"] };
  }

  if (!phone && !email) {
    return {
      status: "error",
      message: t.form.contactRequired,
      fields: ["phone", "email"],
    };
  }

  if (!isSupabaseConfigured) {
    return { status: "error", message: t.form.disabled, fields: [] };
  }

  const rawType = formData.get("type");
  const type =
    typeof rawType === "string" && leadTypes.includes(rawType as LeadType)
      ? (rawType as LeadType)
      : "general";

  const { error } = await createPublicClient().from("leads").insert({
    type,
    name,
    phone,
    email,
    company: text(formData, "company"),
    message: text(formData, "message"),
    locale,
    source_url: text(formData, "source_url"),
    status: "new",
  });

  if (error) {
    console.error("Не удалось сохранить заявку:", error.message);
    return { status: "error", message: t.form.error, fields: [] };
  }

  return { status: "success", message: t.form.success, fields: [] };
}
