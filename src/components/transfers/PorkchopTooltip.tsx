import type { PorkchopCell } from "@/types/orbital";

interface PorkchopTooltipProps {
  cell: PorkchopCell;
}

function formatDate(dayTimestamp: number): string {
  const date = new Date(dayTimestamp * 86400000);
  return date.toISOString().split("T")[0] ?? "";
}

export function PorkchopTooltip({ cell }: PorkchopTooltipProps) {
  return (
    <div className="rounded border border-[var(--color-slate)] bg-[var(--color-abyss)] px-3 py-2 shadow-lg">
      <div className="flex flex-col gap-1 font-mono text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-[var(--color-ash)]">Launch</span>
          <span className="text-[var(--color-fog)]">{formatDate(cell.launchDay)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--color-ash)]">Arrival</span>
          <span className="text-[var(--color-fog)]">{formatDate(cell.arrivalDay)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-[var(--color-ash)]">Transit</span>
          <span className="text-[var(--color-fog)]">{Math.round(cell.transitDays)}d</span>
        </div>
        <div className="mt-1 border-t border-[var(--color-slate)] pt-1">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-ash)]">Dep. ΔV (raw)</span>
            <span className="text-[var(--color-fog)]">{cell.departureDVRaw.toFixed(2)} km/s</span>
          </div>
          {cell.launchImpulseDV > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-ash)]">Launch impulse</span>
              <span className="text-[var(--color-fog)]">-{cell.launchImpulseDV.toFixed(2)} km/s</span>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-ash)]">Dep. ΔV (net)</span>
            <span className="text-[var(--color-fog)]">{cell.departureDV.toFixed(2)} km/s</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-ash)]">Arr. ΔV</span>
            <span className="text-[var(--color-fog)]">{cell.arrivalDV.toFixed(2)} km/s</span>
          </div>
          <div className="flex justify-between gap-4 font-medium text-[var(--color-cyan)]">
            <span>Total ΔV</span>
            <span>{cell.totalDV.toFixed(2)} km/s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
