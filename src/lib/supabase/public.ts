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
let client: ReturnType<typeof createClient<Database>> | null = null;

export function createPublicClient() {
  if (client) return client;
  const { url, anonKey } = requireSupabaseEnv();
  // Один клиент на всю вкладку и свой ключ хранилища: не мешает входу пользователя.
  client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "sb-public",
    },
  });
  return client;
}
