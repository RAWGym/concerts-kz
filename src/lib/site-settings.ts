import { useEffect, useState } from "react";

import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Настройки сайта из таблицы site_settings: контакты, соцсети и
 * объявление над шапкой. Их правит админ в разделе «Настройки».
 * Пока база не ответила, работают значения из словаря.
 */

type I18n = Partial<Record<Locale, string>>;

export type SiteSettings = {
  contacts: { phone?: string; email?: string; whatsapp?: string; address?: I18n };
  socials: { instagram?: string; telegram?: string; tiktok?: string; youtube?: string };
  announcement: { enabled?: boolean; text?: I18n; link?: string };
};

const empty: SiteSettings = { contacts: {}, socials: {}, announcement: {} };

let cache: Promise<SiteSettings> | null = null;

export function getSiteSettings(): Promise<SiteSettings> {
  if (!isSupabaseConfigured) return Promise.resolve(empty);
  cache ??= (async () => {
    try {
      const { data } = await (createPublicClient() as unknown as import("@supabase/supabase-js").SupabaseClient)
        .from("site_settings")
        .select("key, value");
      const out: SiteSettings = { ...empty };
      for (const row of (data ?? []) as { key: keyof SiteSettings; value: never }[]) out[row.key] = row.value;
      return out;
    } catch {
      return empty;
    }
  })();
  return cache;
}

export function useSiteSettings(): SiteSettings {
  const [s, setS] = useState<SiteSettings>(empty);
  useEffect(() => {
    let alive = true;
    getSiteSettings().then((v) => alive && setS(v));
    return () => { alive = false; };
  }, []);
  return s;
}

/** Контакты с откатом на словарь. */
export function contactsFor(s: SiteSettings, t: Dictionary, locale: Locale) {
  return {
    phone: s.contacts.phone || t.contacts.phone,
    email: s.contacts.email ?? t.contacts.email,
    whatsapp: s.contacts.whatsapp || "",
    address: s.contacts.address?.[locale] || s.contacts.address?.ru || t.footer.address,
  };
}

export const socialLabels: Record<keyof SiteSettings["socials"], string> = {
  instagram: "Instagram",
  telegram: "Telegram",
  tiktok: "TikTok",
  youtube: "YouTube",
};
