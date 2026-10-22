import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { demoUser } from "./demo";
import type { AccountUser } from "./types";

export type SessionState =
  | { status: "loading"; user: null }
  | { status: "guest"; user: null }
  | { status: "user"; user: AccountUser }
  /** База не подключена: кабинет показываем на примерах. */
  | { status: "demo"; user: AccountUser };

export function toAccountUser(session: Session): AccountUser {
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: u.id,
    email: u.email ?? "",
    fullName: typeof meta.full_name === "string" ? meta.full_name : "",
    phone: typeof meta.phone === "string" ? meta.phone : (u.phone ?? ""),
    createdAt: u.created_at ?? null,
  };
}

/** Текущий покупатель. Следит за входом и выходом в соседних вкладках. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(() =>
    isSupabaseConfigured
      ? { status: "loading", user: null }
      : { status: "demo", user: demoUser },
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = createBrowserSupabase();
    const apply = (s: Session | null) =>
      setState(s ? { status: "user", user: toAccountUser(s) } : { status: "guest", user: null });

    client.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));
    const { data } = client.auth.onAuthStateChange((_event, s) => apply(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}

/** Инициалы для аватарки: «Алия Сеитова» → «АС», почта → первая буква. */
export function initials(user: Pick<AccountUser, "fullName" | "email">): string {
  const parts = user.fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (user.email[0] ?? "?").toUpperCase();
}
