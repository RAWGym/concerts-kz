// Управление сотрудниками из админки. Создавать и удалять аккаунты
// можно только ключом service role, поэтому это делает сервер.
//
// Администратор управляет всеми. Сотрудник с правом «Тикеторы»
// (admins.can_manage_scanners) — только аккаунтами тикеторов.
import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = ["admin", "editor", "sales", "scanner"] as const;
type Role = (typeof ROLES)[number];

/** Тикетору можно дать короткий логин: ivan → ivan@scanner.concerts.kz */
const SCANNER_DOMAIN = "scanner.concerts.kz";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "https://concerts.kz",
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
    .select("role, can_manage_scanners, is_active")
    .eq("user_id", me.user.id)
    .maybeSingle();
  const isAdmin = myRow?.role === "admin" && myRow.is_active !== false;
  const isScannerManager = Boolean(myRow && myRow.role !== "scanner" && myRow.is_active !== false && myRow.can_manage_scanners);
  if (!isAdmin && !isScannerManager) return json({ error: "forbidden" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const log = (message: string) =>
    admin.rpc("log_scanner_account", { p_actor: me.user.id, p_message: message }).then(({ error }) => {
      if (error) console.error("log_scanner_account", error.message);
    });

  // Цель действия: только сотрудники, а не любые покупатели. Иначе через
  // админку можно было бы захватить чужой аккаунт. Менеджер тикеторов
  // трогает только тикеторов.
  const target = async (userId: string) => {
    const { data } = await admin.from("admins").select("user_id, role, email, full_name").eq("user_id", userId).maybeSingle();
    if (!data) return { error: json({ error: "Это не сотрудник" }, 403) };
    if (!isAdmin && data.role !== "scanner") return { error: json({ error: "Можно менять только тикеторов" }, 403) };
    return { row: data as { user_id: string; role: Role; email: string | null; full_name: string | null } };
  };
  const who = (r: { full_name: string | null; email: string | null }) => r.full_name || r.email || "";

  switch (body.action) {
    case "list": {
      let q = admin
        .from("admins")
        .select("user_id, role, email, full_name, created_at, can_manage_scanners, can_issue_invites, is_active")
        .order("created_at");
      if (!isAdmin || body.scanners_only) q = q.eq("role", "scanner");
      const { data: rows, error } = await q;
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
      const role = isAdmin ? body.role : "scanner";
      if (!isRole(role)) return json({ error: "Неизвестная роль" }, 400);
      let email = String(body.email ?? "").trim().toLowerCase();
      if (role === "scanner" && email && !email.includes("@")) {
        if (!/^[a-z0-9._-]{3,40}$/.test(email)) return json({ error: "Логин: латиница, цифры, точка, дефис, от 3 символов" }, 400);
        email = `${email}@${SCANNER_DOMAIN}`;
      }
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim() || null;
      if (!email.includes("@")) return json({ error: "Укажите e-mail или логин" }, 400);
      if (password.length < 8) return json({ error: "Пароль от 8 символов" }, 400);
      if (role === "scanner" && !fullName) return json({ error: "Укажите имя тикетора: его видно в журнале проходов" }, 400);

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, onboarded: true },
      });
      if (error || !created.user) {
        const taken = /already|registered|exists/i.test(error?.message ?? "");
        return json({ error: taken ? "Такой e-mail или логин уже занят" : error?.message ?? "Не удалось создать" }, 400);
      }
      const { error: insErr } = await admin.from("admins").insert({
        user_id: created.user.id,
        role,
        email,
        full_name: fullName,
        created_by: me.user.id,
      });
      if (insErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: insErr.message }, 500);
      }
      if (role === "scanner") await log(`Создан тикетор: ${fullName} (${email})`);
      return json({ ok: true, user_id: created.user.id, email });
    }

    case "update": {
      const userId = String(body.user_id ?? "");
      const t = await target(userId);
      if (t.error) return t.error;
      const patch: Record<string, unknown> = {};
      if (body.role !== undefined) {
        if (!isAdmin) return json({ error: "Роли меняет администратор" }, 403);
        if (!isRole(body.role)) return json({ error: "Неизвестная роль" }, 400);
        if (userId === me.user.id && body.role !== "admin") {
          return json({ error: "Нельзя снять роль админа с себя" }, 400);
        }
        // Тикетор и сотрудник админки — разные аккаунты.
        if ((body.role === "scanner") !== (t.row!.role === "scanner")) {
          return json({ error: "Тикетора нельзя сделать сотрудником админки и наоборот. Создайте отдельный аккаунт." }, 400);
        }
        patch.role = body.role;
      }
      if (body.full_name !== undefined) patch.full_name = String(body.full_name).trim() || null;
      for (const flag of ["can_manage_scanners", "can_issue_invites"] as const) {
        if (body[flag] === undefined) continue;
        if (!isAdmin) return json({ error: "Права выдаёт администратор" }, 403);
        if (t.row!.role === "scanner") return json({ error: "Тикетору нельзя выдать права админки" }, 400);
        patch[flag] = Boolean(body[flag]);
      }
      if (body.is_active !== undefined) {
        if (userId === me.user.id) return json({ error: "Нельзя отключить себя" }, 400);
        patch.is_active = Boolean(body.is_active);
      }
      if (!Object.keys(patch).length) return json({ ok: true });
      const { error } = await admin.from("admins").update(patch).eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      if (t.row!.role === "scanner" && patch.is_active !== undefined) {
        await log(`${patch.is_active ? "Включён" : "Отключён"} тикетор: ${who(t.row!)}`);
      }
      return json({ ok: true });
    }

    case "reset_password": {
      const password = String(body.password ?? "");
      if (password.length < 8) return json({ error: "Пароль от 8 символов" }, 400);
      const t = await target(String(body.user_id ?? ""));
      if (t.error) return t.error;
      const { error } = await admin.auth.admin.updateUserById(String(body.user_id), { password });
      if (error) return json({ error: error.message }, 400);
      if (t.row!.role === "scanner") await log(`Новый пароль тикетору: ${who(t.row!)}`);
      return json({ ok: true });
    }

    case "delete": {
      const userId = String(body.user_id ?? "");
      if (userId === me.user.id) return json({ error: "Нельзя удалить себя" }, 400);
      const t = await target(userId);
      if (t.error) return t.error;
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      if (t.row!.role === "scanner") await log(`Удалён тикетор: ${who(t.row!)}`);
      return json({ ok: true });
    }

    default:
      return json({ error: "unknown action" }, 400);
  }
});
