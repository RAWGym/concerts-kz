import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Длина кода из письма. Должна совпадать с «Email OTP Length» в Supabase. */
export const CODE_LENGTH = 6;

/** Шлёт на почту код входа. Новый пользователь создаётся автоматически. */
export async function sendEmailCode(email: string) {
  if (!isSupabaseConfigured) return;
  const { error } = await createBrowserSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Проверяет код из письма. Возвращает пользователя после входа. */
export async function verifyEmailCode(email: string, token: string) {
  const { data, error } = await createBrowserSupabase().auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) throw error ?? new Error("no user");
  return data.user;
}

/** Прошёл ли пользователь онбординг (имя, телефон, город). */
export function isOnboarded(meta: Record<string, unknown> | undefined | null) {
  return Boolean(meta?.onboarded);
}

export type OnboardingData = { fullName: string; phone: string; city: string; news: boolean };

export async function saveOnboarding(d: OnboardingData) {
  if (!isSupabaseConfigured) return;
  const { error } = await createBrowserSupabase().auth.updateUser({
    data: { full_name: d.fullName.trim(), phone: d.phone.trim(), city: d.city, news_opt_in: d.news, onboarded: true },
  });
  if (error) throw error;
}

/** «+7 (701) 234-56-78» из любых цифр. */
export function formatKzPhone(input: string) {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (!d.startsWith("7")) d = "7" + d;
  d = d.slice(0, 11);
  const p = d.slice(1);
  let out = "+7";
  if (p.length) out += ` (${p.slice(0, 3)}`;
  if (p.length >= 3) out += ")";
  if (p.length > 3) out += ` ${p.slice(3, 6)}`;
  if (p.length > 6) out += `-${p.slice(6, 8)}`;
  if (p.length > 8) out += `-${p.slice(8, 10)}`;
  return out;
}
export const isFullKzPhone = (v: string) => v.replace(/\D/g, "").length === 11;
