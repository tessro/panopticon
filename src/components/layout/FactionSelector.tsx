import { useGameData } from "@/lib/hooks";
import { useAppStore } from "@/lib/store";

export function FactionSelector() {
  const data = useGameData();
  const { selectedFaction, setSelectedFaction } = useAppStore();

  if (!data) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="font-display text-[10px] font-medium tracking-widest text-[var(--color-ash)] uppercase">
        Faction
      </label>
      <select
        value={selectedFaction ?? ""}
        onChange={(e) =>
          setSelectedFaction(e.target.value || null)
        }
        className="font-body cursor-pointer rounded border border-[var(--color-steel)] bg-[var(--color-deep)] px-2 py-1 text-xs text-[var(--color-fog)] outline-none transition-colors focus:border-[var(--color-cyan-dim)]"
      >
        <option value="">None</option>
        {data.factions.map((f) => (
          <option key={f.name} value={f.ideology}>
            {f.friendlyName}
          </option>
        ))}
      </select>
    </div>
  );
}
