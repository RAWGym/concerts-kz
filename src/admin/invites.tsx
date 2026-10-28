import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { invitesPdf, pdfName, sharePdf, type InviteEvent, type InviteTicket } from "@/lib/tickets/invite-pdf";

import { db, dbError, formatDateTime, titleOf } from "./db";
import { loadTickets, prettyPhone, statusLabels, statusTones, timeIn, type TicketRow } from "./entry-data";
import { EventSelect, useEventOptions, useSelectedEvent } from "./event-select";
import { useStaff } from "./layout";
import { useToast } from "./toast";
import { Card, Field, Notice, PageTitle, Pill, Spinner, Table, inputCls } from "./ui";

type Guest = { phone: string; name: string; count: string };
const blankGuest = (): Guest => ({ phone: "", name: "", count: "1" });

/** Нормализует номер как база: +7XXXXXXXXXX или null. */
function normPhone(p: string) {
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d.length === 11 && d[0] === "7" ? `+${d}` : null;
}

/** «+7 777 111 22 33 Иван Петров» → гость. Номер обязателен, имя по желанию. */
function parseList(text: string): { guests: Guest[]; bad: string[] } {
  const guests: Guest[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([+\d][\d\s()+-]{8,})[\s,;:–-]*(.*)$/);
    const phone = m && normPhone(m[1]);
    if (!phone) {
      bad.push(line);
      continue;
    }
    guests.push({ phone, name: m![2].trim(), count: "1" });
  }
  return { guests, bad };
}

const ticketUrl = (code: string) => `${window.location.origin}/ru/ticket/${code}`;
const isTouch = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;

export default function Invites() {
  const me = useStaff();
  const toast = useToast();
  const events = useEventOptions(true);
  const [event, setEvent] = useSelectedEvent(events);
  const [details, setDetails] = useState<InviteEvent | null>(null);
  const [service, setService] = useState<string[]>(["+77777777777"]);
  const [guests, setGuests] = useState<Guest[]>([blankGuest()]);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<TicketRow[] | null>(null);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(me.role !== "admin");
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  useEffect(() => {
    db().from("site_settings").select("value").eq("key", "invites").maybeSingle().then(({ data }) => {
      const list = (data?.value as { service_phones?: string[] } | null)?.service_phones;
      if (list?.length) setService(list.map((p) => normPhone(p) ?? p));
    });
  }, []);

  useEffect(() => {
    setDetails(null);
    if (!event) return;
    db()
      .from("events")
      .select("slug, starts_at, doors_open_at, age_limit, venue:venues(name, city, address, timezone), translations:event_translations(locale, title)")
      .eq("id", event.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const e = data as unknown as {
          slug: string; starts_at: string; doors_open_at: string | null; age_limit: number | null;
          venue: { name: string; city: string; address: string | null; timezone: string } | null;
          translations: { locale: string; title: string }[];
        };
        setDetails({
          title: titleOf(e),
          startsAt: e.starts_at,
          doorsOpenAt: e.doors_open_at,
          timezone: e.venue?.timezone ?? "Asia/Almaty",
          venue: e.venue?.name ?? null,
          city: e.venue?.city ?? null,
          address: e.venue?.address ?? null,
          ageLimit: e.age_limit,
          slug: e.slug,
        });
      });
  }, [event]);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      setRows(await loadTickets(event.id, "invite"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [event]);

  useEffect(() => {
    setRows(null);
    setSelected(new Set());
    setLastBatch(null);
    load();
  }, [load]);

  const isService = (p: string) => {
    const n = normPhone(p);
    return Boolean(n && service.includes(n));
  };

  const setGuest = (i: number, patch: Partial<Guest>) => setGuests((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const total = guests.reduce((s, g) => s + (isService(g.phone) ? Math.max(1, Number(g.count) || 1) : 1), 0);

  async function issue(e: FormEvent) {
    e.preventDefault();
    if (!event) return;
    setError("");
    const filled = guests.filter((g) => g.phone.trim());
    if (!filled.length) return setError("Впишите хотя бы один номер телефона");
    const bad = filled.filter((g) => !normPhone(g.phone));
    if (bad.length) return setError(`Неверный номер: ${bad.map((g) => g.phone).join(", ")}. Нужен формат +7 XXX XXX XX XX`);
    const phones = filled.map((g) => normPhone(g.phone)!).filter((p) => !service.includes(p));
    const dupes = phones.filter((p, i) => phones.indexOf(p) !== i);
    if (dupes.length) return setError(`Номер повторяется в списке: ${[...new Set(dupes)].map(prettyPhone).join(", ")}`);
    if (!window.confirm(`Выписать ${total} ${plural(total, "пригласительный", "пригласительных", "пригласительных")} на «${event.title}»?`)) return;

    setBusy(true);
    const payload = filled.map((g) => ({
      phone: normPhone(g.phone),
      name: g.name.trim(),
      count: isService(g.phone) ? Math.max(1, Math.min(500, Number(g.count) || 1)) : 1,
    }));
    const { data, error } = await db().rpc("issue_invites", { p_event: event.id, p_guests: payload, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setError(dbError(error));
    const res = data as { batch_id: string; tickets: { id: string }[] };
    toast(`Выписано: ${res.tickets.length}`);
    setGuests([blankGuest()]);
    setNote("");
    setLastBatch(res.batch_id);
    await load();
    setSelected(new Set(res.tickets.map((t) => t.id)));
  }

  function applyPaste() {
    const { guests: parsed, bad } = parseList(pasteText);
    if (bad.length) return setError(`Не распознаны строки: ${bad.slice(0, 5).join(" | ")}${bad.length > 5 ? "…" : ""}`);
    if (!parsed.length) return setError("Вставьте список: на каждой строке номер и, если нужно, имя");
    setError("");
    setGuests((g) => [...g.filter((x) => x.phone.trim()), ...parsed]);
    setPasting(false);
    setPasteText("");
  }

  const shown = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => !onlyMine || r.issued_by === me.userId)
        .filter((r) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          const digits = q.replace(/\D/g, "");
          return [r.holder_name, r.code, r.issued_by_name, r.note].some((v) => v?.toLowerCase().includes(q)) ||
            (digits.length >= 3 && (r.holder_phone ?? "").replace(/\D/g, "").includes(digits));
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [rows, onlyMine, query, me.userId],
  );
  const batch = lastBatch ? (rows ?? []).filter((r) => r.batch_id === lastBatch) : [];

  async function pdf(list: TicketRow[], key: string) {
    if (!details || !list.length) return;
    const usable = list.filter((r) => r.status !== "void");
    if (!usable.length) return toast("Аннулированные билеты не отправляются", "error");
    setPdfBusy(key);
    try {
      const tickets: InviteTicket[] = usable.map((r) => ({ code: r.code, holderName: r.holder_name, holderPhone: r.holder_phone }));
      const blob = await invitesPdf(details, tickets);
      const how = await sharePdf(blob, pdfName(details, tickets), isTouch());
      if (how === "downloaded") toast(`PDF готов: ${usable.length} ${plural(usable.length, "билет", "билета", "билетов")}`);
    } catch (e) {
      toast(`Не удалось собрать PDF: ${(e as Error).message}`, "error");
    }
    setPdfBusy(null);
  }

  async function copyLink(r: TicketRow) {
    try {
      await navigator.clipboard.writeText(ticketUrl(r.code));
      toast("Ссылка на билет скопирована");
    } catch {
      window.prompt("Скопируйте ссылку", ticketUrl(r.code));
    }
  }

  async function voidTicket(r: TicketRow) {
    const reason = window.prompt(`Аннулировать пригласительный ${r.code} (${r.holder_name || prettyPhone(r.holder_phone)})? По нему нельзя будет пройти. Причина:`);
    if (!reason?.trim()) return;
    const { error } = await db().rpc("void_ticket", { p_ticket: r.id, p_reason: reason });
    if (error) return toast(dbError(error), "error");
    toast("Билет аннулирован");
    load();
  }

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const selectable = shown.filter((r) => r.status !== "void");
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const chosen = (rows ?? []).filter((r) => selected.has(r.id));

  if (!events) return <Spinner />;
  if (!events.length) return <Notice>Концертов пока нет.</Notice>;

  return (
    <>
      <PageTitle title="Пригласительные">
        <EventSelect events={events} value={event?.id ?? ""} onChange={setEvent} />
      </PageTitle>

      <Card className="mb-8">
        <form onSubmit={issue} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-sm font-bold uppercase text-fg">Выписать</p>
            <p className="text-xs text-fg-subtle">
              Владелец билета: {me.fullName || me.email}. Цены в билете нет, тип «Пригласительный».
            </p>
          </div>

          <div className="space-y-3">
            {guests.map((g, i) => {
              const svc = isService(g.phone);
              return (
                <div key={i} className="grid gap-3 rounded-btn border border-line bg-surface/40 p-3 sm:grid-cols-[1.1fr_1.3fr_auto_auto] sm:items-end sm:border-0 sm:bg-transparent sm:p-0">
                  <Field label={i === 0 ? "Телефон *" : ""} hint={svc ? "Служебный номер: можно сколько угодно билетов" : undefined}>
                    <input inputMode="tel" className={inputCls} placeholder="+7 777 123 45 67" value={g.phone}
                      onChange={(e) => setGuest(i, { phone: e.target.value })}
                      onBlur={(e) => { const n = normPhone(e.target.value); if (n) setGuest(i, { phone: prettyPhone(n) }); }} />
                  </Field>
                  <Field label={i === 0 ? "Имя гостя (по желанию)" : ""}>
                    <input className={inputCls} placeholder="Без имени" value={g.name} maxLength={120} onChange={(e) => setGuest(i, { name: e.target.value })} />
                  </Field>
                  <Field label={i === 0 ? "Билетов" : ""}>
                    <input type="number" min={1} max={svc ? 500 : 1} disabled={!svc} className={`${inputCls} sm:w-24`} value={svc ? g.count : "1"}
                      onChange={(e) => setGuest(i, { count: e.target.value })} />
                  </Field>
                  <button type="button" className="btn btn-secondary mt-1.5 disabled:opacity-40" disabled={guests.length === 1}
                    onClick={() => setGuests((list) => list.filter((_, j) => j !== i))} aria-label="Убрать гостя">✕</button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => setGuests((g) => [...g, blankGuest()])}>+ Ещё гость</button>
            <button type="button" className="btn btn-secondary" onClick={() => setPasting((v) => !v)}>{pasting ? "Скрыть список" : "Вставить списком"}</button>
          </div>

          {pasting && (
            <div className="space-y-2">
              <textarea rows={6} className={inputCls} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                placeholder={"По одному гостю на строку: номер, затем имя (по желанию)\n+7 777 111 22 33 Данияр Ахметов\n87015554433\n+7 702 000 11 22, Ержан"} />
              <button type="button" className="btn btn-secondary" onClick={applyPaste}>Добавить в список</button>
            </div>
          )}

          <Field label="Комментарий (видно только в админке)">
            <input className={inputCls} value={note} maxLength={300} placeholder="Например: для партнёров, от артиста" onChange={(e) => setNote(e.target.value)} />
          </Field>

          {error && <Notice kind="error">{error}</Notice>}

          <button disabled={busy || !event} className="btn btn-primary disabled:opacity-60">
            {busy ? "Выписываю…" : `Выписать ${total} ${plural(total, "билет", "билета", "билетов")}`}
          </button>
        </form>
      </Card>

      {batch.length > 0 && (
        <Card className="mb-8 border-teal/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg">Только что выписано: <b>{batch.length}</b>. Отправьте гостям PDF.</p>
            <div className="flex flex-wrap gap-2">
              {batch.length > 1 && (
                <button className="btn btn-primary disabled:opacity-60" disabled={!!pdfBusy} onClick={() => pdf(batch, "batch")}>
                  {pdfBusy === "batch" ? "Собираю…" : `Один PDF на всех (${batch.length})`}
                </button>
              )}
              {batch.length === 1 && (
                <button className="btn btn-primary disabled:opacity-60" disabled={!!pdfBusy} onClick={() => pdf(batch, "batch")}>
                  {pdfBusy === "batch" ? "Собираю…" : "Скачать / отправить PDF"}
                </button>
              )}
            </div>
          </div>
          {batch.length > 1 && <p className="mt-2 text-xs text-fg-muted">Каждому отдельно: кнопка «PDF» в строке гостя ниже. Новые билеты уже отмечены галочками.</p>}
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Имя, телефон, код"
          className="w-64 max-w-full rounded-btn border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus:border-coral" />
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" className="accent-coral" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Только выписанные мной
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn btn-primary disabled:opacity-50" disabled={!chosen.length || !!pdfBusy} onClick={() => pdf(chosen, "chosen")}>
            {pdfBusy === "chosen" ? "Собираю…" : `PDF отмеченных (${chosen.length})`}
          </button>
          {chosen.length > 0 && <button className="btn btn-secondary" onClick={() => setSelected(new Set())}>Снять отметки</button>}
        </div>
      </div>

      {!rows ? <Spinner /> : !rows.length ? (
        <Notice>На этот концерт пригласительных ещё нет.</Notice>
      ) : (
        <Table head={["", "Гость", "Код", "Выписал", "Статус", ""]}>
          <tr className="bg-surface/30">
            <td className="px-4 py-2">
              <input type="checkbox" className="accent-coral" checked={allChecked} aria-label="Отметить все"
                onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())} />
            </td>
            <td colSpan={5} className="px-4 py-2 text-xs text-fg-subtle">Показано {shown.length} из {rows.length}</td>
          </tr>
          {shown.map((r) => (
            <tr key={r.id} className={r.status === "void" ? "opacity-55" : ""}>
              <td className="px-4 py-3">
                <input type="checkbox" className="accent-coral" disabled={r.status === "void"} checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Отметить ${r.code}`} />
              </td>
              <td className="px-4 py-3">
                <div className="text-fg">{r.holder_name || "Без имени"}</div>
                <div className="text-xs text-fg-muted">{prettyPhone(r.holder_phone)}{r.is_service && " · служебный"}</div>
                {r.note && <div className="text-xs text-fg-subtle">{r.note}</div>}
              </td>
              <td className="px-4 py-3 font-mono text-xs tracking-[0.12em] text-fg-muted">{r.code}</td>
              <td className="px-4 py-3 text-fg-muted">
                <div>{r.issued_by_name}</div>
                <div className="text-xs">{formatDateTime(r.created_at)}</div>
              </td>
              <td className="px-4 py-3">
                <Pill tone={statusTones[r.status]}>{statusLabels[r.status]}</Pill>
                {r.used_at && <div className="mt-1 text-xs text-fg-subtle">{timeIn(r.used_at)}{r.used_by_name ? ` · ${r.used_by_name}` : ""}</div>}
                {r.status === "void" && r.void_reason && <div className="mt-1 text-xs text-fg-subtle">{r.void_reason}</div>}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                {r.status !== "void" && (
                  <>
                    <button className="text-coral hover:underline disabled:opacity-50" disabled={!!pdfBusy} onClick={() => pdf([r], r.id)}>
                      {pdfBusy === r.id ? "…" : "PDF"}
                    </button>
                    <button className="ml-4 text-fg-muted hover:text-coral" onClick={() => copyLink(r)}>Ссылка</button>
                  </>
                )}
                {r.status === "valid" && (me.role === "admin" || r.issued_by === me.userId) && (
                  <button className="ml-4 text-fg-muted hover:text-coral" onClick={() => voidTicket(r)}>Аннулировать</button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
