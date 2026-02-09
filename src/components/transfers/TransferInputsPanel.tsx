import type { SpaceBody, Orbit, PorkchopResult } from "@/types/orbital";
import { useAppStore } from "@/lib/store";
import { OrbitPicker } from "./OrbitPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface TransferInputsPanelProps {
  bodies: SpaceBody[];
  orbits: Orbit[];
  onCompute: () => void;
  isComputing: boolean;
  result: PorkchopResult | null;
}

function formatDate(dayTimestamp: number): string {
  const date = new Date(dayTimestamp * 86400000);
  return date.toISOString().split("T")[0] ?? "";
}

export function TransferInputsPanel({
  bodies,
  orbits,
  onCompute,
  isComputing,
  result,
}: TransferInputsPanelProps) {
  const gameDate = useAppStore((s) => s.transferGameDate);
  const setGameDate = useAppStore((s) => s.setTransferGameDate);
  const originOrbit = useAppStore((s) => s.transferOriginOrbit);
  const setOriginOrbit = useAppStore((s) => s.setTransferOriginOrbit);
  const destOrbit = useAppStore((s) => s.transferDestinationOrbit);
  const setDestOrbit = useAppStore((s) => s.setTransferDestinationOrbit);
  const gridResolution = useAppStore((s) => s.transferGridResolution);
  const setGridResolution = useAppStore((s) => s.setTransferGridResolution);

  const canCompute = originOrbit && destOrbit && originOrbit !== destOrbit && !isComputing;

  return (
    <div className="flex w-80 shrink-0 flex-col gap-4">
      <div>
        <Label className="font-display mb-1 block text-xs tracking-wide text-[var(--color-ash)] uppercase">
          Game Date
        </Label>
        <input
          type="date"
          value={gameDate}
          onChange={(e) => setGameDate(e.target.value)}
          className="w-full rounded border border-[var(--color-slate)] bg-[var(--color-deep)] px-3 py-1.5 font-mono text-xs text-[var(--color-fog)] outline-none focus:border-[var(--color-cyan-dim)]"
        />
      </div>

      <div>
        <Label className="font-display mb-1 block text-xs tracking-wide text-[var(--color-ash)] uppercase">
          Origin
        </Label>
        <OrbitPicker
          value={originOrbit}
          onChange={setOriginOrbit}
          bodies={bodies}
          orbits={orbits}
          label="Select origin orbit…"
        />
      </div>

      <div>
        <Label className="font-display mb-1 block text-xs tracking-wide text-[var(--color-ash)] uppercase">
          Destination
        </Label>
        <OrbitPicker
          value={destOrbit}
          onChange={setDestOrbit}
          bodies={bodies}
          orbits={orbits}
          label="Select destination orbit…"
        />
      </div>

      <div>
        <Label className="font-display mb-1 block text-xs tracking-wide text-[var(--color-ash)] uppercase">
          Grid Resolution
        </Label>
        <input
          type="number"
          min={20}
          max={150}
          step={10}
          value={gridResolution}
          onChange={(e) => setGridResolution(Number(e.target.value))}
          className="w-full rounded border border-[var(--color-slate)] bg-[var(--color-deep)] px-3 py-1.5 font-mono text-xs text-[var(--color-fog)] outline-none focus:border-[var(--color-cyan-dim)]"
        />
      </div>

      <Button
        onClick={onCompute}
        disabled={!canCompute}
        className="font-display w-full tracking-wide uppercase"
      >
        {isComputing ? (
          <span className="animate-pulse">Computing…</span>
        ) : (
          "Compute Transfer"
        )}
      </Button>

      {result?.optimal && (
        <div className="rounded border border-[var(--color-slate)] bg-[var(--color-deep)]/60 p-3">
          <h4 className="font-display mb-2 text-xs font-medium tracking-wide text-[var(--color-cyan)] uppercase">
            Optimal Transfer
          </h4>
          <div className="flex flex-col gap-1 font-mono text-xs text-[var(--color-fog)]">
            <div className="flex justify-between">
              <span className="text-[var(--color-ash)]">Launch</span>
              <span>{formatDate(result.optimal.launchDay)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-ash)]">Arrival</span>
              <span>{formatDate(result.optimal.arrivalDay)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-ash)]">Transit</span>
              <span>{Math.round(result.optimal.transitDays)} days</span>
            </div>
            <div className="mt-1 border-t border-[var(--color-slate)] pt-1">
              <div className="flex justify-between">
                <span className="text-[var(--color-ash)]">Departure ΔV</span>
                <span>{result.optimal.departureDV.toFixed(2)} km/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-ash)]">Arrival ΔV</span>
                <span>{result.optimal.arrivalDV.toFixed(2)} km/s</span>
              </div>
              <div className="flex justify-between font-medium text-[var(--color-cyan)]">
                <span>Total ΔV</span>
                <span>{result.optimal.totalDV.toFixed(2)} km/s</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
