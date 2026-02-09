import { useMemo } from "react";
import { motion } from "motion/react";
import { useTransferData } from "@/lib/hooks";
import { useAppStore } from "@/lib/store";
import { usePorkchop } from "@/lib/orbital/usePorkchop";
import type { TransferInputs } from "@/types/orbital";
import { TransferInputsPanel } from "./TransferInputsPanel";
import { PorkchopPlot } from "./PorkchopPlot";

export function TransfersPage() {
  const data = useTransferData();

  const originOrbit = useAppStore((s) => s.transferOriginOrbit);
  const destOrbit = useAppStore((s) => s.transferDestinationOrbit);
  const gameDate = useAppStore((s) => s.transferGameDate);
  const gridResolution = useAppStore((s) => s.transferGridResolution);

  const inputs = useMemo<TransferInputs | null>(() => {
    if (!originOrbit || !destOrbit) return null;
    return {
      originOrbit,
      destinationOrbit: destOrbit,
      gameDate,
      gridResolution,
    };
  }, [originOrbit, destOrbit, gameDate, gridResolution]);

  const { result, isComputing, compute } = usePorkchop(
    inputs,
    data?.bodies ?? null,
    data?.orbits ?? null,
  );

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="font-display text-sm tracking-wider text-[var(--color-ash)] uppercase animate-pulse">
          Loading transfer data…
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto max-w-[1800px] p-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="mb-4">
        <h2 className="font-display text-base font-semibold tracking-wide text-[var(--color-light)] uppercase">
          Transfer Planner
        </h2>
        <p className="font-body mt-1 text-xs text-[var(--color-ash)]">
          Compute interplanetary transfer windows using Lambert&#39;s problem.
          Select origin and destination orbits, then compute to generate a
          porkchop plot.
        </p>
      </div>

      <div className="flex gap-6">
        <TransferInputsPanel
          bodies={data.bodies}
          orbits={data.orbits}
          onCompute={compute}
          isComputing={isComputing}
          result={result}
        />

        <div className="flex min-h-[500px] flex-1 items-center justify-center rounded border border-[var(--color-slate)] bg-[var(--color-abyss)]/60">
          {isComputing ? (
            <div className="font-display text-sm tracking-wider text-[var(--color-ash)] uppercase animate-pulse">
              Solving Lambert transfers…
            </div>
          ) : result ? (
            <PorkchopPlot result={result} />
          ) : (
            <div className="font-display text-sm tracking-wider text-[var(--color-steel)] uppercase">
              Select orbits and compute to see the porkchop plot
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
