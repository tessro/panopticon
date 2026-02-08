import { useGameData } from "@/lib/hooks";
import { ProfessionsTable } from "./ProfessionsTable";
import { motion } from "motion/react";

export function ProfessionsPage() {
  const data = useGameData();

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="font-display text-sm tracking-wider text-[var(--color-ash)] uppercase animate-pulse">
          Loading game data…
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
          Councilor Professions
        </h2>
        <p className="font-body mt-1 text-xs text-[var(--color-ash)]">
          Profession capabilities, faction affinities, and available missions.
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-[var(--color-slate)] bg-[var(--color-abyss)]/60">
        <ProfessionsTable
          councilorTypes={data.councilorTypes}
          missions={data.missions}
          traits={data.traits}
        />
      </div>
    </motion.div>
  );
}
