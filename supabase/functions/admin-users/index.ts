// Управление сотрудниками из админки. Создавать и удалять аккаунты
// можно только ключом service role, поэтому это делает сервер.
//
// Должности и права: сотрудниками управляет тот, у кого право «Сотрудники»,
// тикеторами — право «Тикеторы». Все правила (нельзя выдать право, которого нет
// у себя; владельца меняет только владелец или тех. специалист; последний
// владелец остаётся) проверяет база в staff_check_change.
import { createClient } from "npm:@supabase/supabase-js@2";

const POSITIONS = ["owner", "tech", "admin", "marketer", "accountant", "sales", "editor", "scanner"] as const;
type Position = (typeof POSITIONS)[number];

const LABELS: Record<Position, string> = {
  owner: "Владелец",
  tech: "Тех. специалист",
  admin: "Администратор",
  marketer: "Маркетолог",
  accountant: "Бухгалтер",
  sales: "Менеджер продаж",
  editor: "Редактор",
  scanner: "Тикетор",
};

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

const isPosition = (p: unknown): p is Position => POSITIONS.includes(p as Position);

/** Старые кнопки шлют role вместо должности. */
const positionOf = (body: Record<string, unknown>): Position | null => {
  if (isPosition(body.position)) return body.position;
  if (body.role === "admin" || body.role === "editor" || body.role === "sales" || body.role === "scanner") return body.role;
  return null;
};

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
    .select("position, permissions, is_active")
    .eq("user_id", me.user.id)
    .maybeSingle();
  const myPerms: string[] = myRow?.is_active && myRow.position !== "scanner" ? myRow.permissions ?? [] : [];
  const canStaff = myPerms.includes("staff");
  const canScanners = myPerms.includes("scanners");
  if (!canStaff && !canScanners) return json({ error: "forbidden" }, 403);

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
  const audit = (record: string, action: "insert" | "update" | "delete", label: string, changed: string[] | null = null) =>
    admin.rpc("audit_as", { p_actor: me.user.id, p_table: "admins", p_record: record, p_action: action, p_label: label, p_changed: changed })
      .then(({ error }) => {
        if (error) console.error("audit_as", error.message);
      });

  /** Правила базы: null — можно, иначе текст отказа. */
  const check = async (target: string | null, position: Position | null, permissions: string[] | null, active: boolean | null, del = false) => {
    const { error } = await admin.rpc("staff_check_change", {
      p_actor: me.user.id,
      p_target: target,
      p_position: position,
      p_permissions: permissions,
      p_is_active: active,
      p_delete: del,
    });
    return error ? error.message : null;
  };

  // Цель действия: только сотрудники, а не любые покупатели. Иначе через
  // админку можно было бы захватить чужой аккаунт.
  const target = async (userId: string) => {
    const { data } = await admin.from("admins").select("user_id, position, permissions, email, full_name, is_active").eq("user_id", userId).maybeSingle();
    if (!data) return { error: json({ error: "Это не сотрудник" }, 403) };
    return { row: data as { user_id: string; position: Position; permissions: string[]; email: string | null; full_name: string | null; is_active: boolean } };
  };
  const who = (r: { full_name: string | null; email: string | null }) => r.full_name || r.email || "";

  switch (body.action) {
    case "list": {
      let q = admin
        .from("admins")
        .select("user_id, role, position, permissions, email, full_name, created_at, can_manage_scanners, can_issue_invites, is_active")
        .order("created_at");
      if (!canStaff || body.scanners_only) q = q.eq("position", "scanner");
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
        me: { permissions: myPerms, position: myRow?.position },
      });
    }

    case "create": {
      const position = positionOf(body) ?? (canStaff ? "editor" : "scanner");
      const permissions = position === "scanner" ? [] : Array.isArray(body.permissions) ? body.permissions.map(String) : null;
      const denied = await check(null, position, permissions, true);
      if (denied) return json({ error: denied }, 403);

      let email = String(body.email ?? "").trim().toLowerCase();
      if (position === "scanner" && email && !email.includes("@")) {
        if (!/^[a-z0-9._-]{3,40}$/.test(email)) return json({ error: "Логин: латиница, цифры, точка, дефис, от 3 символов" }, 400);
        email = `${email}@${SCANNER_DOMAIN}`;
      }
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim() || null;
      if (!email.includes("@")) return json({ error: "Укажите e-mail или логин" }, 400);
      if (password.length < 8) return json({ error: "Пароль от 8 символов" }, 400);
      if (position === "scanner" && !fullName) return json({ error: "Укажите имя тикетора: его видно в журнале проходов" }, 400);

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
        role: position === "scanner" ? "scanner" : "editor",
        position,
        ...(permissions ? { permissions } : {}),
        email,
        full_name: fullName,
        created_by: me.user.id,
      });
      if (insErr) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: insErr.message }, 500);
      }
      if (position === "scanner") await log(`Создан тикетор: ${fullName} (${email})`);
      await audit(created.user.id, "insert", `${fullName ?? email}: ${LABELS[position]}`, ["position"]);
      return json({ ok: true, user_id: created.user.id, email });
    }

    case "update": {
      const userId = String(body.user_id ?? "");
      const t = await target(userId);
      if (t.error) return t.error;
      const row = t.row!;
      const patch: Record<string, unknown> = {};
      const position = positionOf(body);
      let permissions = Array.isArray(body.permissions) ? body.permissions.map(String) : null;
      // Старые галочки «тикеторы» и «пригласительные».
      for (const [flag, perm] of [["can_manage_scanners", "scanners"], ["can_issue_invites", "invites"]] as const) {
        if (body[flag] === undefined) continue;
        const base = new Set(permissions ?? row.permissions);
        if (body[flag]) base.add(perm);
        else base.delete(perm);
        permissions = [...base];
      }
      const active = body.is_active === undefined ? null : Boolean(body.is_active);
      if (userId === me.user.id && active === false) return json({ error: "Нельзя отключить себя" }, 400);

      const denied = await check(userId, position, permissions, active);
      if (denied) return json({ error: denied }, 403);

      if (position) patch.position = position;
      if (permissions) patch.permissions = permissions;
      if (active !== null) patch.is_active = active;
      if (body.full_name !== undefined) patch.full_name = String(body.full_name).trim() || null;
      if (!Object.keys(patch).length) return json({ ok: true });
      const { error } = await admin.from("admins").update(patch).eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      if (row.position === "scanner" && active !== null) {
        await log(`${active ? "Включён" : "Отключён"} тикетор: ${who(row)}`);
      }
      const changes: string[] = [];
      if (position && position !== row.position) changes.push(`должность: ${LABELS[row.position]} → ${LABELS[position]}`);
      if (permissions) {
        const added = permissions.filter((p) => !row.permissions.includes(p));
        const removed = row.permissions.filter((p) => !permissions!.includes(p));
        if (added.length) changes.push(`права +${added.join(", +")}`);
        if (removed.length) changes.push(`права −${removed.join(", −")}`);
      }
      if (active !== null && active !== row.is_active) changes.push(active ? "включён" : "отключён");
      if (changes.length) await audit(userId, "update", `${who(row)}: ${changes.join("; ")}`, Object.keys(patch));
      return json({ ok: true });
    }

    case "reset_password": {
      const password = String(body.password ?? "");
      if (password.length < 8) return json({ error: "Пароль от 8 символов" }, 400);
      const userId = String(body.user_id ?? "");
      const t = await target(userId);
      if (t.error) return t.error;
      const denied = await check(userId, null, null, null);
      if (denied) return json({ error: denied }, 403);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      if (t.row!.position === "scanner") await log(`Новый пароль тикетору: ${who(t.row!)}`);
      await audit(userId, "update", `${who(t.row!)}: новый пароль`, ["password"]);
      return json({ ok: true });
    }

    case "delete": {
      const userId = String(body.user_id ?? "");
      if (userId === me.user.id) return json({ error: "Нельзя удалить себя" }, 400);
      const t = await target(userId);
      if (t.error) return t.error;
      const denied = await check(userId, null, null, null, true);
      if (denied) return json({ error: denied }, 403);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      if (t.row!.position === "scanner") await log(`Удалён тикетор: ${who(t.row!)}`);
      await audit(userId, "delete", `${who(t.row!)}: удалён (${LABELS[t.row!.position]})`, null);
      return json({ ok: true });
    }

    default:
      return json({ error: "unknown action" }, 400);
  }
});
