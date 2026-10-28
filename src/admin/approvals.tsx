import { useEffect, useState } from "react";
import { Link } from "react-router";

import { db, formatDateTime } from "./db";
import { useStaff } from "./layout";
import { useToast } from "./toast";
import { Card, Notice, PageTitle, Pill, Spinner } from "./ui";

type Request = {
  id: string;
  event_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_by: string | null;
  requested_by_name: string | null;
  created_at: string;
  expires_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  event: { slug: string; starts_at: string; change_kind: string | null; translations: { locale: string; title: string }[] } | null;
};

const statusText = { approved: "Удалено", rejected: "Отклонено", cancelled: "Отозвано" } as const;

/** Запросы на удаление событий с продажами: подтверждает владелец, не автор запроса. */
export default function Approvals() {
  const staff = useStaff();
  const toast = useToast();
  const [rows, setRows] = useState<Request[] | null>(null);
  const [sold, setSold] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await db()
      .from("event_deletion_requests")
      .select("*, event:events(slug, starts_at, change_kind, translations:event_translations(locale, title))")
      .order("created_at", { ascending: false })
      .limit(50);
    const list = (data ?? []) as Request[];
    setRows(list);
    const pending = list.filter((r) => r.status === "pending");
    const counts = await Promise.all(pending.map((r) => db().rpc("event_sold_count", { p_event: r.event_id }).then(({ data: n }) => [r.event_id, Number(n ?? 0)] as const)));
    setSold(Object.fromEntries(counts));
  }
  useEffect(() => { load(); }, []);

  if (!staff.can("events.delete", "events.delete_confirm")) return <Notice>Раздел доступен владельцу и тем, кто удаляет события.</Notice>;

  async function decide(r: Request, approve: boolean) {
    const own = r.requested_by === staff.userId;
    let note: string | null = null;
    if (approve) {
      if (!confirm("Подтвердить удаление? Событие уйдёт в архив и пропадёт с сайта. Данные о продажах останутся.")) return;
    } else {
      note = window.prompt(own ? "Отозвать запрос? Комментарий (необязательно):" : "Причина отказа:", "");
      if (note === null) return;
    }
    setBusy(r.id);
    const { error } = await db().rpc("decide_event_deletion", { p_request: r.id, p_approve: approve, p_note: note || null });
    setBusy(null);
    if (error) return toast(error.message, "error");
    toast(approve ? "Событие удалено (в архиве)" : own ? "Запрос отозван" : "Запрос отклонён");
    load();
  }

  const now = Date.now();
  const pending = (rows ?? []).filter((r) => r.status === "pending" && Date.parse(r.expires_at) > now);
  const done = (rows ?? []).filter((r) => !pending.includes(r));
  const title = (r: Request) => r.event?.translations.find((t) => t.locale === "ru")?.title ?? r.event?.slug ?? "Событие";

  return (
    <>
      <PageTitle title="На подтверждение" />
      {!rows ? <Spinner /> : (
        <>
          {pending.length === 0 && <p className="mb-8 text-sm text-fg-muted">Запросов на подтверждение нет.</p>}
          <div className="mb-10 space-y-4">
            {pending.map((r) => {
              const own = r.requested_by === staff.userId;
              const left = sold[r.event_id] ?? 0;
              const blocked = r.event?.change_kind !== "cancelled" && left > 0;
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.1em] text-fg-subtle">Удаление события с продажами</p>
                      <Link to={`/admin/events/${r.event_id}`} className="mt-1 block font-medium text-fg hover:text-coral">{title(r)}</Link>
                      <p className="mt-1 text-xs text-fg-muted">
                        {r.event ? `Концерт ${formatDateTime(r.event.starts_at)} · ` : ""}запросил {r.requested_by_name ?? "сотрудник"} {formatDateTime(r.created_at)} · действует до {formatDateTime(r.expires_at)}
                      </p>
                      <p className="mt-3 text-sm text-fg">Причина: {r.reason}</p>
                      {blocked && (
                        <p className="mt-2 text-xs text-orange">Действующих билетов: {left}. Подтвердить можно после отмены события или возврата всех билетов.</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {!own && staff.can("events.delete_confirm") && (
                        <>
                          <button disabled={busy === r.id || blocked} className="btn btn-primary disabled:opacity-50" onClick={() => decide(r, true)}>Подтвердить</button>
                          <button disabled={busy === r.id} className="btn btn-secondary" onClick={() => decide(r, false)}>Отклонить</button>
                        </>
                      )}
                      {own && (
                        <>
                          <span className="self-center text-xs text-fg-subtle">Ждёт подтверждения другого владельца</span>
                          <button disabled={busy === r.id} className="btn btn-secondary" onClick={() => decide(r, false)}>Отозвать</button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {done.length > 0 && (
            <>
              <h2 className="mb-3 font-display text-sm font-semibold uppercase text-fg">История</h2>
              <div className="space-y-2">
                {done.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line px-4 py-3 text-sm">
                    <Pill tone={r.status === "approved" ? "coral" : "muted"}>{r.status === "pending" ? "Истёк срок" : statusText[r.status]}</Pill>
                    <span className="text-fg">{title(r)}</span>
                    <span className="text-xs text-fg-subtle">
                      {r.requested_by_name} → {r.decided_by_name ?? "–"} · {formatDateTime(r.decided_at ?? r.expires_at)}
                      {r.decision_note ? ` · ${r.decision_note}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
