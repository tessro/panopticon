import { useMemo, useState } from "react";
import type { CouncilorType, Mission, Trait, AffinityStatus } from "@/types/game";
import { STAT_ABBREV } from "@/types/game";
import {
  PROFESSION_STAT_GROUP_ORDER,
  getProfessionStatGroup,
  MISSION_GROUP_ORDER,
  getMissionGroup,
  getAffinityStatus,
  getHireCost,
  getTraitChance,
} from "@/lib/data";
import type { MissionGroup } from "@/lib/data";
import { useAppStore } from "@/lib/store";

interface Props {
  councilorTypes: CouncilorType[];
  missions: Mission[];
  traits: Trait[];
}

/** Label for mission group headers */
const GROUP_LABELS: Record<MissionGroup, string> = {
  Persuasion: "PER",
  Investigation: "INV",
  Espionage: "ESP",
  Command: "CMD",
  Administration: "ADM",
  Science: "SCI",
  None: "—",
  Advise: "SCI/ADM/CMD",
};

export function ProfessionsTable({ councilorTypes, missions, traits }: Props) {
  const selectedFaction = useAppStore((s) => s.selectedFaction);

  // Only show missions that appear in at least one (non-alien) councilor type's list.
  // The preprocessed data already excludes the Alien type, so this naturally filters
  // out alien-only missions and win conditions.
  const playerMissions = useMemo(() => {
    const allMissionNames = new Set(councilorTypes.flatMap((ct) => ct.missions));
    return missions.filter((m) => allMissionNames.has(m.name));
  }, [missions, councilorTypes]);

  // Group missions by attack stat
  const groupedMissions = useMemo(() => {
    const groups = new Map<MissionGroup, Mission[]>();
    for (const g of MISSION_GROUP_ORDER) {
      groups.set(g, []);
    }
    for (const m of playerMissions) {
      const group = getMissionGroup(m);
      groups.get(group)?.push(m);
    }
    // Sort within groups by sortOrder
    for (const [, ms] of groups) {
      ms.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return groups;
  }, [playerMissions]);

  // Flat ordered list of missions for columns
  const orderedMissions = useMemo(() => {
    const result: Mission[] = [];
    for (const g of MISSION_GROUP_ORDER) {
      const ms = groupedMissions.get(g);
      if (ms) result.push(...ms);
    }
    return result;
  }, [groupedMissions]);

  // Group councilor types by stat group, sorted by # of missions in that group's category
  const groupedProfessions = useMemo(() => {
    const groups = new Map<string, CouncilorType[]>();
    for (const g of PROFESSION_STAT_GROUP_ORDER) {
      groups.set(g, []);
    }
    for (const ct of councilorTypes) {
      const group = getProfessionStatGroup(ct);
      groups.get(group)?.push(ct);
    }
    // Sort within each group by count of supported missions in that category (descending)
    for (const [statGroup, professions] of groups) {
      const categoryMissions =
        groupedMissions.get(statGroup as MissionGroup) ?? [];
      const missionNames = new Set(categoryMissions.map((m) => m.name));
      professions.sort((a, b) => {
        const aCount = a.missions.filter((n) => missionNames.has(n)).length;
        const bCount = b.missions.filter((n) => missionNames.has(n)).length;
        return bCount - aCount;
      });
    }
    return groups;
  }, [councilorTypes, groupedMissions]);

  const [hoveredMission, setHoveredMission] = useState<string | null>(null);

  const govTrait = traits.find((t) => t.name === "Government");
  const crimTrait = traits.find((t) => t.name === "Criminal");

  // Fixed column count: name + primary + secondary + cost + gov + crim + missions
  const fixedCols = 6;
  const missionCols = orderedMissions.length;

  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        {/* Angled mission names row */}
        <tr>
          <th colSpan={fixedCols} />
          {orderedMissions.map((m) => (
            <th
              key={m.name}
              className="relative w-7 min-w-7 max-w-7 p-0 before:pointer-events-none before:absolute before:bottom-0 before:left-0 before:h-full before:-rotate-[55deg] before:border-l before:border-[var(--color-slate)] before:origin-bottom-left before:content-['']"
              onMouseEnter={() => setHoveredMission(m.name)}
              onMouseLeave={() => setHoveredMission(null)}
            >
              <div
                className="flex h-[104px] items-end justify-start"
              >
                <span
                  className="font-body block -rotate-[55deg] origin-bottom-left ml-[22px] mb-1 whitespace-nowrap text-[10px] leading-none text-[var(--color-ash)]"
                >
                  {m.friendlyName}
                </span>
              </div>
            </th>
          ))}
        </tr>

        {/* Column labels + mission group labels */}
        <tr className="border-b border-[var(--color-steel)]">
          <th className="sticky left-0 z-10 bg-[var(--color-deep)] px-2 py-1 text-left font-display text-[10px] font-medium tracking-widest text-[var(--color-ash)] uppercase">
            Profession
          </th>
          <th className="bg-[var(--color-deep)] px-1 py-1 font-display text-[10px] font-medium tracking-widest text-[var(--color-ash)] uppercase">
            1st
          </th>
          <th className="bg-[var(--color-deep)] px-1 py-1 font-display text-[10px] font-medium tracking-widest text-[var(--color-ash)]/50 uppercase">
            2nd
          </th>
          <th className="bg-[var(--color-deep)] px-1 py-1 font-display text-[10px] font-medium tracking-widest text-[var(--color-ash)] uppercase">
            Cost
          </th>
          <th className="bg-[var(--color-deep)] px-1 py-1 font-display text-[10px] font-medium tracking-widest text-[var(--color-ash)] uppercase">
            Gov
          </th>
          <th className="bg-[var(--color-deep)] px-1 py-1 font-display text-[10px] font-medium tracking-widest text-[var(--color-ash)] uppercase">
            Crim
          </th>
          {MISSION_GROUP_ORDER.map((group) => {
            const ms = groupedMissions.get(group);
            if (!ms || ms.length === 0) return null;
            return (
              <th
                key={group}
                colSpan={ms.length}
                className="border-l border-[var(--color-slate)] bg-[var(--color-deep)] px-1 py-1 font-display text-[10px] font-medium tracking-widest text-[var(--color-cyan-dim)] uppercase"
              >
                {GROUP_LABELS[group]}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {PROFESSION_STAT_GROUP_ORDER.map((statGroup) => {
          const professions = groupedProfessions.get(statGroup);
          if (!professions || professions.length === 0) return null;
          return (
            <ProfessionGroup
              key={statGroup}
              statGroup={statGroup}
              professions={professions}
              orderedMissions={orderedMissions}
              selectedFaction={selectedFaction}
              govTrait={govTrait}
              crimTrait={crimTrait}
              totalCols={fixedCols + missionCols}
              hoveredMission={hoveredMission}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function ProfessionGroup({
  statGroup,
  professions,
  orderedMissions,
  selectedFaction,
  govTrait,
  crimTrait,
  totalCols,
  hoveredMission,
}: {
  statGroup: string;
  professions: CouncilorType[];
  orderedMissions: Mission[];
  selectedFaction: string | null;
  govTrait: Trait | undefined;
  crimTrait: Trait | undefined;
  totalCols: number;
  hoveredMission: string | null;
}) {
  const abbrev = STAT_ABBREV[statGroup as keyof typeof STAT_ABBREV] ?? statGroup;

  return (
    <>
      {/* Group separator */}
      <tr>
        <td
          colSpan={totalCols}
          className="border-t border-[var(--color-steel)] bg-[var(--color-deep)] px-2 py-0.5 font-display text-[10px] font-semibold tracking-[0.2em] text-[var(--color-cyan-dim)] uppercase"
        >
          {abbrev}
        </td>
      </tr>
      {professions.map((ct) => (
        <ProfessionRow
          key={ct.name}
          ct={ct}
          orderedMissions={orderedMissions}
          selectedFaction={selectedFaction}
          govTrait={govTrait}
          crimTrait={crimTrait}
          hoveredMission={hoveredMission}
        />
      ))}
    </>
  );
}

function ProfessionRow({
  ct,
  orderedMissions,
  selectedFaction,
  govTrait,
  crimTrait,
  hoveredMission,
}: {
  ct: CouncilorType;
  orderedMissions: Mission[];
  selectedFaction: string | null;
  govTrait: Trait | undefined;
  crimTrait: Trait | undefined;
  hoveredMission: string | null;
}) {
  const affinity = getAffinityStatus(ct, selectedFaction);
  const cost = getHireCost(affinity);
  const govChance = govTrait ? getTraitChance(govTrait, ct.name) : 0;
  const crimChance = crimTrait ? getTraitChance(crimTrait, ct.name) : 0;

  const nameClass = getNameCellClass(affinity);
  const secondaryStat = ct.secondaryStat;
  const missionHighlight =
    hoveredMission && ct.missions.includes(hoveredMission);

  return (
    <tr className={`border-t border-[var(--color-slate)]/50 transition-colors hover:bg-[var(--color-slate)]/30 ${missionHighlight ? "bg-[var(--color-cyan)]/8" : ""}`}>
      {/* Profession name */}
      <td
        className={`sticky left-0 z-10 px-2 py-1 font-display text-xs font-medium tracking-wide ${nameClass}`}
      >
        {affinity === "ban" ? (
          <span className="line-through opacity-50">{ct.friendlyName}</span>
        ) : (
          ct.friendlyName
        )}
      </td>

      {/* Primary stat */}
      <td className="px-1 py-1 text-center font-mono text-[11px] font-medium text-[var(--color-light)]">
        {STAT_ABBREV[ct.primaryStat]}
      </td>

      {/* Secondary stat */}
      <td className="px-1 py-1 text-center font-mono text-[11px] text-[var(--color-ash)]/50">
        {secondaryStat ? STAT_ABBREV[secondaryStat] : "—"}
      </td>

      {/* Cost */}
      <td className="px-1 py-1 text-center font-mono text-[11px]">
        <CostCell cost={cost} affinity={affinity} />
      </td>

      {/* Government trait */}
      <td className="px-1 py-1 text-center font-mono text-[10px] text-[var(--color-ash)]">
        {govChance > 0 ? <TraitBadge chance={govChance} /> : "—"}
      </td>

      {/* Criminal trait */}
      <td className="px-1 py-1 text-center font-mono text-[10px] text-[var(--color-ash)]">
        {crimChance > 0 ? <TraitBadge chance={crimChance} /> : "—"}
      </td>

      {/* Mission columns */}
      {orderedMissions.map((m, i) => {
        const has = ct.missions.includes(m.name);
        const isFirstInGroup =
          i === 0 ||
          getMissionGroup(orderedMissions[i - 1]!) !== getMissionGroup(m);
        return (
          <td
            key={m.name}
            className={`px-0 py-1 text-center ${isFirstInGroup ? "border-l border-[var(--color-slate)]" : ""}`}
          >
            {has && (
              <span className="font-mono text-[11px] font-medium text-[var(--color-cyan)]">
                ×
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function getNameCellClass(affinity: AffinityStatus): string {
  switch (affinity) {
    case "good":
      return "bg-[var(--color-good-dim)] text-[var(--color-good)]";
    case "bad":
      return "bg-[var(--color-bad-dim)] text-[var(--color-bad)]";
    case "ban":
      return "bg-[var(--color-bad-dim)] text-[var(--color-ban)]";
    default:
      return "bg-[var(--color-abyss)] text-[var(--color-fog)]";
  }
}

function CostCell({
  cost,
  affinity,
}: {
  cost: number | null;
  affinity: AffinityStatus;
}) {
  if (cost === null) {
    return <span className="text-[var(--color-ban)]">✕</span>;
  }

  let colorClass = "text-[var(--color-fog)]";
  if (affinity === "good") colorClass = "text-[var(--color-good)]";
  if (affinity === "bad") colorClass = "text-[var(--color-bad)]";

  return <span className={colorClass}>{cost}</span>;
}

function TraitBadge({ chance }: { chance: number }) {
  // Color intensity based on chance
  const opacity = Math.min(1, chance / 100);
  const isHigh = chance >= 50;

  return (
    <span
      className={`inline-block min-w-[28px] rounded px-1 py-px text-center text-[10px] ${
        isHigh
          ? "bg-[var(--color-amber)]/20 text-[var(--color-amber)]"
          : "text-[var(--color-ash)]"
      }`}
      style={{ opacity: 0.4 + opacity * 0.6 }}
    >
      {chance}%
    </span>
  );
}
