// Управление сотрудниками из админки. Создавать и удалять аккаунты
// можно только ключом service role, поэтому это делает сервер.
// Вызывать может только сотрудник с ролью admin.
import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["admin", "editor", "sales"] as const;
type Role = (typeof ROLES)[number];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

const isRole = (r: unknown): r is Role => ROLES.includes(r as Role);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Кто вызывает
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: me } = await admin.auth.getUser(token);
  if (!me?.user) return json({ error: "unauthorized" }, 401);
  const { data: myRow } = await admin
    .from("admins")
    .select("role")
    .eq("user_id", me.user.id)
    .maybeSingle();
  if (myRow?.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  switch (body.action) {
    case "list": {
      const { data: rows, error } = await admin
        .from("admins")
        .select("user_id, role, email, full_name, created_at")
        .order("created_at");
      if (error) return json({ error: error.message }, 500);
      const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const byId = new Map((users?.users ?? []).map((u) => [u.id, u]));
      return json({
        staff: (rows ?? []).map((r) => ({
          ...r,
          email: r.email ?? byId.get(r.user_id)?.email ?? null,
          last_sign_in_at: byId.get(r.user_id)?.last_sign_in_at ?? null,
        })),
      });
    }

    case "create": {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim() || null;
      if (!email.includes("@")) return json({ error: "Укажите e-mail" }, 400);
      if (password.length < 8) return json({ error: "Пароль от 8 символов" }, 400);
      if (!isRole(body.role)) return json({ error: "Неизвестная роль" }, 400);

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !created.user) {
        return json({ error: error?.message ?? "Не удалось создать" }, 400);
      }
      const { error: insErr } = await admin.from("admins").insert({
        user_id: created.user.id,
        role: body.role,
        email,
        full_name: fullName,
        created_by: me.user.id,
      });
      if (insErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: insErr.message }, 500);
      }
      return json({ ok: true, user_id: created.user.id });
    }

    case "update": {
      const userId = String(body.user_id ?? "");
      const patch: Record<string, unknown> = {};
      if (body.role !== undefined) {
        if (!isRole(body.role)) return json({ error: "Неизвестная роль" }, 400);
        if (userId === me.user.id && body.role !== "admin") {
          return json({ error: "Нельзя снять роль админа с себя" }, 400);
        }
        patch.role = body.role;
      }
      if (body.full_name !== undefined) patch.full_name = String(body.full_name).trim() || null;
      const { error } = await admin.from("admins").update(patch).eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    case "reset_password": {
      const password = String(body.password ?? "");
      if (password.length < 8) return json({ error: "Пароль от 8 символов" }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(body.user_id), { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    case "delete": {
      const userId = String(body.user_id ?? "");
      if (userId === me.user.id) return json({ error: "Нельзя удалить себя" }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    default:
      return json({ error: "unknown action" }, 400);
  }
});
