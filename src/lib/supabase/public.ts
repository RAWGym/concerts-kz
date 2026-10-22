import { createClient } from "@supabase/supabase-js";

import { requireSupabaseEnv } from "./env";
import type { Database } from "./types";

/**
 * Анонимный клиент без сессии и без cookies.
 *
 * Именно им читает публичная витрина: раз запрос не зависит от
 * пользователя, страницы остаются статическими и обновляются по ISR.
 * Для админки нужен клиент с сессией — см. ./server.
 */
export function createPublicClient() {
  const { url, anonKey } = requireSupabaseEnv();

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
