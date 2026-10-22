import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseEnv } from "./env";
import type { Database } from "./types";

let client: SupabaseClient<Database> | null = null;

/** Клиент с сессией пользователя: вход, личный кабинет, админка. */
export function createBrowserSupabase() {
  if (client) return client;
  const { url, anonKey } = requireSupabaseEnv();
  client = createClient<Database>(url, anonKey);
  return client;
}
