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

function isValidGameDate(value: string): boolean {
  return Number.isFinite(Date.parse(`${value}T00:00:00Z`));
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
  const departureHorizonYears = useAppStore((s) => s.transferDepartureHorizonYears);
  const setDepartureHorizonYears = useAppStore((s) => s.setTransferDepartureHorizonYears);
  const launchAcceleration = useAppStore((s) => s.transferLaunchAcceleration);
  const setLaunchAcceleration = useAppStore((s) => s.setTransferLaunchAcceleration);
  const maxDeltaV = useAppStore((s) => s.transferMaxDeltaV);
  const setMaxDeltaV = useAppStore((s) => s.setTransferMaxDeltaV);
  const probeMode = useAppStore((s) => s.transferProbeMode);
  const setProbeMode = useAppStore((s) => s.setTransferProbeMode);
  const probeHighThrust = useAppStore((s) => s.transferProbeHighThrust);
  const setProbeHighThrust = useAppStore((s) => s.setTransferProbeHighThrust);

  const hasValidDate = isValidGameDate(gameDate);
  const canCompute = Boolean(
    destOrbit &&
    (probeMode || originOrbit) &&
    (probeMode || originOrbit !== destOrbit) &&
    hasValidDate &&
    !isComputing,
  );

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
          max={300}
          step={5}
          value={gridResolution}
          onChange={(e) => {
            const next = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(next)) {
              setGridResolution(next);
            }
          }}
          className="w-full rounded border border-[var(--color-slate)] bg-[var(--color-deep)] px-3 py-1.5 font-mono text-xs text-[var(--color-fog)] outline-none focus:border-[var(--color-cyan-dim)]"
        />
      </div>

      <div>
        <Label className="font-display mb-1 block text-xs tracking-wide text-[var(--color-ash)] uppercase">
          Departure Horizon (Years)
        </Label>
        <input
          type="number"
          min={0}
          max={5}
          step={0.1}
          value={departureHorizonYears}
          onChange={(e) => {
            const next = Number.parseFloat(e.target.value);
            if (!Number.isNaN(next)) {
              setDepartureHorizonYears(next);
            }
          }}
          className="w-full rounded border border-[var(--color-slate)] bg-[var(--color-deep)] px-3 py-1.5 font-mono text-xs text-[var(--color-fog)] outline-none focus:border-[var(--color-cyan-dim)]"
        />
        <p className="mt-1 font-body text-[10px] text-[var(--color-steel)]">
          Controls how far out departure dates are scanned (max 5 years).
        </p>
      </div>

      <div>
        <Label className="font-display mb-1 block text-xs tracking-wide text-[var(--color-ash)] uppercase">
          Cruise Accel (mG)
        </Label>
        <input
          type="number"
          min={0}
          step={1}
          value={launchAcceleration}
          disabled={probeMode}
          onChange={(e) => {
            const next = Number.parseFloat(e.target.value);
            if (!Number.isNaN(next)) {
              setLaunchAcceleration(next);
            }
          }}
          className="w-full rounded border border-[var(--color-slate)] bg-[var(--color-deep)] px-3 py-1.5 font-mono text-xs text-[var(--color-fog)] outline-none disabled:cursor-not-allowed disabled:opacity-50 focus:border-[var(--color-cyan-dim)]"
        />
        <p className="mt-1 font-body text-[10px] text-[var(--color-steel)]">
          Used as fixed ship acceleration for boost/capture burn duration checks.
        </p>
      </div>

      <div>
        <Label className="font-display mb-1 block text-xs tracking-wide text-[var(--color-ash)] uppercase">
          Max Total ΔV (km/s)
        </Label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={maxDeltaV}
          disabled={probeMode}
          onChange={(e) => {
            const next = Number.parseFloat(e.target.value);
            if (!Number.isNaN(next)) {
              setMaxDeltaV(next);
            }
          }}
          className="w-full rounded border border-[var(--color-slate)] bg-[var(--color-deep)] px-3 py-1.5 font-mono text-xs text-[var(--color-fog)] outline-none disabled:cursor-not-allowed disabled:opacity-50 focus:border-[var(--color-cyan-dim)]"
        />
      </div>

      <label className="flex items-center gap-2 rounded border border-[var(--color-slate)] bg-[var(--color-deep)]/40 px-2 py-2">
        <input
          type="checkbox"
          checked={probeMode}
          onChange={(e) => setProbeMode(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-cyan)]"
        />
        <div className="flex flex-col">
          <span className="font-display text-xs tracking-wide text-[var(--color-light)] uppercase">
            Probe Mode
          </span>
          <span className="font-body text-[10px] text-[var(--color-steel)]">
            Uses Earth launch assumptions, uncapped transfer dV, and a fixed probe timeline.
          </span>
        </div>
      </label>

      {probeMode && (
        <p className="font-body text-[10px] text-[var(--color-steel)]">
          Probe mode always launches from Low Earth Orbit 1, ignores the Max ΔV cap, and plots a launch-to-arrival line.
        </p>
      )}

      <label className="flex items-center gap-2 rounded border border-[var(--color-slate)] bg-[var(--color-deep)]/40 px-2 py-2">
        <input
          type="checkbox"
          checked={probeHighThrust}
          disabled={!probeMode}
          onChange={(e) => setProbeHighThrust(e.target.checked)}
          className="h-4 w-4 accent-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex flex-col">
          <span className="font-display text-xs tracking-wide text-[var(--color-light)] uppercase">
            High Thrust Probes
          </span>
          <span className="font-body text-[10px] text-[var(--color-steel)]">
            Increases the fixed probe acceleration model.
          </span>
        </div>
      </label>

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
              {result.optimal.boostBurnDays != null && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-ash)]">Boost Burn</span>
                  <span>{result.optimal.boostBurnDays.toFixed(1)} days</span>
                </div>
              )}
              {result.optimal.decelBurnDays != null && (
                <div className="flex justify-between">
                  <span className="text-[var(--color-ash)]">Capture Burn</span>
                  <span>{result.optimal.decelBurnDays.toFixed(1)} days</span>
                </div>
              )}
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
