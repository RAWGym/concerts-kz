import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router";

import { canEdit, db, roleLabels, type Role } from "./db";
import { Spinner } from "./ui";

type Staff = { userId: string; email: string; role: Role; fullName: string | null };

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
      .select("role, full_name")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) =>
        setStaff(
          data
            ? { userId: session.user.id, email: session.user.email ?? "", role: data.role as Role, fullName: data.full_name }
            : null,
        ),
      );
  }, [session]);

  if (session === undefined || (session && staff === undefined)) return <Spinner />;
  if (!session) return <Navigate to="/ru/login" replace />;

  async function signOut() {
    await db().auth.signOut();
    navigate("/ru/login");
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

  const links: { to: string; label: string; show: boolean }[] = [
    { to: "/admin", label: "Обзор", show: true },
    { to: "/admin/events", label: "События", show: true },
    { to: "/admin/venues", label: "Площадки", show: canEdit(staff.role) },
    { to: "/admin/news", label: "Новости", show: canEdit(staff.role) },
    { to: "/admin/reports", label: "Фотоотчёты", show: canEdit(staff.role) },
    { to: "/admin/partners", label: "Партнёры", show: canEdit(staff.role) },
    { to: "/admin/stats", label: "Цифры", show: canEdit(staff.role) },
    { to: "/admin/orders", label: "Заказы", show: true },
    { to: "/admin/leads", label: "Заявки", show: true },
    { to: "/admin/staff", label: "Сотрудники", show: staff.role === "admin" },
  ];

  return (
    <StaffContext.Provider value={staff}>
      <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]">
        <aside className="border-b border-line bg-ink-deep px-5 py-5 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
          <Link to="/" className="block">
            <img src="/logo-header.svg" alt="Concerts Prod" className="h-auto w-32" />
          </Link>
          <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-fg-subtle">Админка</p>
          <nav className="mt-6 flex gap-1 overflow-x-auto md:flex-col">
            {links.filter((l) => l.show).map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/admin"}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-btn px-3 py-2 text-sm transition-colors ${isActive ? "bg-coral/15 text-coral" : "text-fg-muted hover:bg-surface hover:text-fg"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-6 border-t border-line pt-4 text-xs text-fg-subtle md:absolute md:inset-x-5 md:bottom-5">
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
    </StaffContext.Provider>
  );
}
