import { useEffect, useState } from "react";

import { db, dbError } from "./db";
import { useToast } from "./toast";
import { inputCls } from "./ui";

export type VenueGate = { id: string; name: string; sort_order: number };

export async function loadVenueGates(venueId: string) {
  const { data } = await db().from("venue_gates").select("id, name, sort_order").eq("venue_id", venueId).order("sort_order").order("name");
  return (data ?? []) as VenueGate[];
}

/** Заготовки входов площадки: подставляются в каждый концерт на ней. */
export function VenueGates({ venueId }: { venueId: string }) {
  const toast = useToast();
  const [list, setList] = useState<VenueGate[] | null>(null);
  const [name, setName] = useState("");

  const load = () => loadVenueGates(venueId).then(setList);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function add() {
    const n = name.trim();
    if (!n) return;
    const { error } = await db().from("venue_gates").insert({ venue_id: venueId, name: n, sort_order: (list?.length ?? 0) * 10 });
    if (error) return toast(dbError(error), "error");
    setName("");
    load();
  }

  async function remove(g: VenueGate) {
    if (!window.confirm(`Удалить заготовку входа «${g.name}»? Входы уже созданных концертов не изменятся.`)) return;
    const { error } = await db().from("venue_gates").delete().eq("id", g.id);
    if (error) return toast(dbError(error), "error");
    load();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-subtle">
        Входы и зоны этой площадки (например: Главный, VIP, Служебный). Они подставляются в каждый концерт здесь, для концерта можно добавить свои.
      </p>
      <div className="flex flex-wrap gap-2">
        {list?.map((g) => (
          <span key={g.id} className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-sm text-fg">
            {g.name}
            <button type="button" className="text-fg-subtle hover:text-coral" onClick={() => remove(g)} aria-label={`Удалить ${g.name}`}>✕</button>
          </span>
        ))}
        {list && !list.length && <span className="text-sm text-fg-muted">Пока нет заготовок.</span>}
      </div>
      <div className="flex gap-2">
        <input className={inputCls} value={name} maxLength={60} placeholder="Название входа" onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn btn-secondary mt-1.5 shrink-0" onClick={add}>Добавить</button>
      </div>
    </div>
  );
}
