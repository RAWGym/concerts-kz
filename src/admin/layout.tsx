import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";

import { db, type Role } from "./db";
import { positionLabels, type Permission, type Position } from "./permissions";
import { ToastProvider } from "./toast";
import { Spinner } from "./ui";

type Staff = {
  userId: string;
  email: string;
  /** Старое деление на роли (admin, editor, sales): следует за должностью. */
  role: Role;
  position: Position;
  permissions: Permission[];
  fullName: string | null;
  /** Есть ли право. Проверку всё равно делает база, это для меню и кнопок. */
  can: (...perms: Permission[]) => boolean;
  /** Может создавать тикеторов и настраивать входы. */
  canScanners: boolean;
  /** Может выписывать пригласительные. */
  canInvites: boolean;
};

const StaffContext = createContext<Staff | null>(null);

export function useStaff() {
  const s = useContext(StaffContext);
  if (!s) throw new Error("useStaff вне админки");
  return s;
}

/** Обёртка /admin: проверяет вход и роль, рисует меню. */
export function AdminLayout() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [staff, setStaff] = useState<Staff | null | undefined>(undefined);
  const [badges, setBadges] = useState({ leads: 0, approvals: 0, refunds: 0 });
  const location = useLocation();

  useEffect(() => {
    if (!staff) return;
    const c = db();
    const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0, () => 0);
    Promise.all([
      staff.can("leads") ? count(c.from("leads").select("id", { count: "exact", head: true }).eq("status", "new")) : 0,
      staff.can("events.delete_confirm")
        ? count(c.from("event_deletion_requests").select("id", { count: "exact", head: true }).eq("status", "pending").neq("requested_by", staff.userId).gt("expires_at", new Date().toISOString()))
        : 0,
      staff.can("refunds") ? count(c.from("refund_requests").select("id", { count: "exact", head: true }).eq("status", "new")) : 0,
    ]).then(([leads, approvals, refunds]) => setBadges({ leads, approvals, refunds }));
  }, [staff, location.pathname]);

  useEffect(() => {
    document.title = "Админка · Concerts Prod";
    const client = db();
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      if (session === null) setStaff(null);
      return;
    }
    db()
      .from("admins")
      .select("role, position, permissions, full_name, is_active")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || data.is_active === false) return setStaff(null);
        const permissions = (data.permissions ?? []) as Permission[];
        const can = (...perms: Permission[]) => perms.some((p) => permissions.includes(p));
        setStaff({
          userId: session.user.id,
          email: session.user.email ?? "",
          role: data.role as Role,
          position: (data.position ?? data.role) as Position,
          permissions,
          fullName: data.full_name,
          can,
          canScanners: can("scanners"),
          canInvites: can("invites"),
        });
      });
  }, [session]);

  if (session === undefined || (session && staff === undefined)) return <Spinner />;
  if (!session) return <Navigate to="/ru/login" replace />;

  async function signOut() {
    await db().auth.signOut();
    navigate("/ru/login");
  }

  if (staff?.role === "scanner") {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-bold uppercase text-fg">Аккаунт тикетора</h1>
        <p className="mt-3 text-sm text-fg-muted">
          Этот аккаунт работает только в сканере билетов. Откройте приложение или страницу сканера.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/scanner" className="btn btn-primary">Открыть сканер</Link>
          <button onClick={signOut} className="btn btn-secondary">Выйти</button>
        </div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-bold uppercase text-fg">Нет доступа</h1>
        <p className="mt-3 text-sm text-fg-muted">
          Аккаунт {session.user.email} не добавлен в сотрудники. Попросите администратора выдать вам роль.
        </p>
        <button onClick={signOut} className="btn btn-secondary mt-6">Выйти</button>
      </div>
    );
  }

  const can = staff.can;
  const groups: { title: string; links: { to: string; label: string; show: boolean; badge?: number }[] }[] = [
    {
      title: "",
      links: [
        { to: "/admin", label: "Обзор", show: true },
        { to: "/admin/approvals", label: "На подтверждение", show: can("events.delete_confirm", "events.delete"), badge: badges.approvals },
      ],
    },
    {
      title: "Афиша",
      links: [
        { to: "/admin/events", label: "События", show: true },
        { to: "/admin/venues", label: "Площадки", show: can("content") },
      ],
    },
    {
      title: "Продажи",
      links: [
        { to: "/admin/finance", label: "Финансы", show: can("finance", "metrics") },
        { to: "/admin/orders", label: "Заказы", show: can("orders", "finance", "refunds") },
        { to: "/admin/refunds", label: "Возвраты", show: can("orders", "finance", "refunds"), badge: badges.refunds },
        { to: "/admin/leads", label: "Заявки", show: can("leads"), badge: badges.leads },
      ],
    },
    {
      title: "Вход на концерт",
      links: [
        { to: "/admin/entries", label: "Проходы", show: can("entries") },
        { to: "/admin/invites", label: "Пригласительные", show: staff.canInvites },
        { to: "/admin/scanners", label: "Тикеторы и входы", show: staff.canScanners },
        { to: "/admin/entry-log", label: "Журнал входа", show: can("entries", "scanners") },
      ],
    },
    {
      title: "Контент",
      links: [
        { to: "/admin/news", label: "Новости", show: can("content") },
        { to: "/admin/reports", label: "Фотоотчёты", show: can("content") },
        { to: "/admin/partners", label: "Партнёры", show: can("content") },
        { to: "/admin/stats", label: "Цифры", show: can("content") },
      ],
    },
    {
      title: "Управление",
      links: [
        { to: "/admin/staff", label: "Сотрудники", show: can("staff") },
        { to: "/admin/settings", label: "Настройки сайта", show: can("settings") },
        { to: "/admin/audit", label: "Журнал изменений", show: can("audit") },
      ],
    },
  ];

  return (
    <StaffContext.Provider value={staff}>
      <ToastProvider>
      <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
        <aside className="border-b border-line bg-ink-deep px-5 py-5 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
          <Link to="/" className="block">
            <img src="/logo-header.svg" alt="Concerts Prod" className="h-auto w-32" />
          </Link>
          <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-fg-subtle">Админка</p>
          <nav className="mt-6 flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0 md:overflow-visible">
            {groups.map((g) => {
              const shown = g.links.filter((l) => l.show);
              if (!shown.length) return null;
              return (
                <div key={g.title || "main"} className="flex gap-1 md:mb-4 md:flex-col">
                  {g.title && <p className="hidden px-3 pb-1 text-[10px] uppercase tracking-[0.14em] text-fg-faint md:block">{g.title}</p>}
                  {shown.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.to === "/admin"}
                      className={({ isActive }) =>
                        `flex items-center justify-between gap-2 whitespace-nowrap rounded-btn px-3 py-2 text-sm transition-colors ${isActive ? "bg-coral/15 text-coral" : "text-fg-muted hover:bg-surface hover:text-fg"}`
                      }
                    >
                      {l.label}
                      {!!l.badge && <span className="rounded-full bg-coral px-1.5 text-[10px] font-semibold leading-4 text-white">{l.badge}</span>}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="mt-6 border-t border-line pt-4 text-xs text-fg-subtle md:mt-auto">
            <p className="truncate text-fg-muted">{staff.fullName || staff.email}</p>
            <p className="mt-0.5">{positionLabels[staff.position] ?? staff.position}</p>
            <div className="mt-3 flex gap-4">
              <Link to="/admin/account" className="hover:text-coral">Пароль</Link>
              <Link to="/" className="hover:text-coral">На сайт</Link>
              <button onClick={signOut} className="hover:text-coral">Выйти</button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 px-5 py-8 md:px-10 md:py-10">
          <Outlet />
        </main>
      </div>
      </ToastProvider>
    </StaffContext.Provider>
  );
}
