import { useEffect, useState } from "react";
import { Link } from "react-router";

import { db, money } from "./db";
import { useStaff } from "./layout";
import { Card, PageTitle } from "./ui";

export default function Dashboard() {
  const staff = useStaff();
  const [stats, setStats] = useState<{ events: number; upcoming: number; paid: number; revenue: number; leads: number } | null>(null);

  useEffect(() => {
    const c = db();
    const now = new Date().toISOString();
    Promise.all([
      c.from("events").select("id", { count: "exact", head: true }),
      c.from("events").select("id", { count: "exact", head: true }).eq("status", "published").gte("starts_at", now),
      c.from("orders").select("total").eq("status", "paid"),
      c.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    ]).then(([all, upcoming, paid, leads]) => {
      const rows = (paid.data ?? []) as { total: number }[];
      setStats({
        events: all.count ?? 0,
        upcoming: upcoming.count ?? 0,
        paid: rows.length,
        revenue: rows.reduce((s, r) => s + Number(r.total), 0),
        leads: leads.count ?? 0,
      });
    });
  }, []);

  const tiles = [
    { label: "Ближайшие события", value: stats?.upcoming, to: "/admin/events" },
    { label: "Всего событий", value: stats?.events, to: "/admin/events" },
    { label: "Оплаченные заказы", value: stats?.paid, to: "/admin/orders" },
    { label: "Выручка", value: stats ? money(stats.revenue) : undefined, to: "/admin/orders" },
    { label: "Новые заявки", value: stats?.leads, to: "/admin/leads" },
  ];

  return (
    <>
      <PageTitle title={`Здравствуйте${staff.fullName ? `, ${staff.fullName.split(" ")[0]}` : ""}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card className="transition-colors hover:border-coral/60">
              <p className="text-xs uppercase tracking-[0.08em] text-fg-subtle">{t.label}</p>
              <p className="mt-2 font-display text-3xl font-bold text-fg">{t.value ?? "…"}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
