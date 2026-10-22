// Адрес проекта и publishable-ключ публичные: они и так видны в браузере,
// доступ к данным ограничивают политики RLS. Секретные ключи сюда нельзя.
export const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://jlpfqasntsnuzxlouqvq.supabase.co";
export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_ykrPRTVb4iLTvdGtuE0MRA_3qrcQO6n";

/**
 * Пока ключи не заполнены в .env.local, витрина рендерится на демо-данных
 * из src/lib/data/fixtures.ts — чтобы вёрстку можно было смотреть до
 * подключения проекта Supabase.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function requireSupabaseEnv(): { url: string; anonKey: string } {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.",
    );
  }
  return { url: supabaseUrl, anonKey: supabaseAnonKey };
}
