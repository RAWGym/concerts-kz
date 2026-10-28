import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";

import { canEdit, db, roleLabels, type Role } from "./db";
import { ToastProvider } from "./toast";
import { Spinner } from "./ui";

type Staff = {
  userId: string;
  email: string;
  role: Role;
  fullName: string | null;
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
  const [newLeads, setNewLeads] = useState(0);
  const location = useLocation();

  useEffect(() => {
    if (!staff) return;
    db().from("leads").select("id", { count: "exact", head: true }).eq("status", "new")
      .then(({ count }) => setNewLeads(count ?? 0));
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
      .select("role, full_name, can_manage_scanners, can_issue_invites, is_active")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data || data.is_active === false) return setStaff(null);
        const admin = data.role === "admin";
        setStaff({
          userId: session.user.id,
          email: session.user.email ?? "",
          role: data.role as Role,
          fullName: data.full_name,
          canScanners: admin || Boolean(data.can_manage_scanners),
          canInvites: admin || Boolean(data.can_issue_invites),
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

  const edit = canEdit(staff.role);
  const isAdmin = staff.role === "admin";
  const groups: { title: string; links: { to: string; label: string; show: boolean; badge?: number }[] }[] = [
    {
      title: "",
      links: [{ to: "/admin", label: "Обзор", show: true }],
    },
    {
      title: "Афиша",
      links: [
        { to: "/admin/events", label: "События", show: true },
        { to: "/admin/venues", label: "Площадки", show: edit },
      ],
    },
    {
      title: "Продажи",
      links: [
        { to: "/admin/orders", label: "Заказы", show: true },
        { to: "/admin/leads", label: "Заявки", show: true, badge: newLeads },
      ],
    },
    {
      title: "Вход на концерт",
      links: [
        { to: "/admin/entries", label: "Проходы", show: true },
        { to: "/admin/invites", label: "Пригласительные", show: staff.canInvites },
        { to: "/admin/scanners", label: "Тикеторы и входы", show: staff.canScanners },
        { to: "/admin/entry-log", label: "Журнал входа", show: true },
      ],
    },
    {
      title: "Контент",
      links: [
        { to: "/admin/news", label: "Новости", show: edit },
        { to: "/admin/reports", label: "Фотоотчёты", show: edit },
        { to: "/admin/partners", label: "Партнёры", show: edit },
        { to: "/admin/stats", label: "Цифры", show: edit },
      ],
    },
    {
      title: "Управление",
      links: [
        { to: "/admin/staff", label: "Сотрудники", show: isAdmin },
        { to: "/admin/settings", label: "Настройки сайта", show: isAdmin },
        { to: "/admin/audit", label: "Журнал изменений", show: isAdmin },
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
            <p className="mt-0.5">{roleLabels[staff.role]}</p>
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
