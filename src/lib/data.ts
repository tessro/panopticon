import type {
  CouncilorType,
  Mission,
  Faction,
  Trait,
  StatName,
  AffinityStatus,
} from "@/types/game";

let _councilorTypes: CouncilorType[] | null = null;
let _missions: Mission[] | null = null;
let _factions: Faction[] | null = null;
let _traits: Trait[] | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function loadCouncilorTypes(): Promise<CouncilorType[]> {
  if (!_councilorTypes) {
    _councilorTypes = await fetchJson<CouncilorType[]>(
      "data/councilor-types.json",
    );
  }
  return _councilorTypes;
}

export async function loadMissions(): Promise<Mission[]> {
  if (!_missions) {
    _missions = await fetchJson<Mission[]>("data/missions.json");
  }
  return _missions;
}

export async function loadFactions(): Promise<Faction[]> {
  if (!_factions) {
    _factions = await fetchJson<Faction[]>("data/factions.json");
  }
  return _factions;
}

export async function loadTraits(): Promise<Trait[]> {
  if (!_traits) {
    _traits = await fetchJson<Trait[]>("data/traits.json");
  }
  return _traits;
}

/**
 * Determine the stat-based grouping for the professions table.
 * Groups councilor types by their primary stat, with Astronaut
 * forced into the PER group per PLAN.md.
 */
export const PROFESSION_STAT_GROUP_ORDER: StatName[] = [
  "Persuasion",
  "Investigation",
  "Espionage",
  "Command",
  "Administration",
  "Science",
];

export function getProfessionStatGroup(ct: CouncilorType): StatName {
  // Exception: Astronaut grouped with PER professions
  if (ct.name === "Astronaut") return "Persuasion";
  return ct.primaryStat;
}

/**
 * Mission grouping for columns. Missions are grouped by their attack stat.
 * "No stat" missions have attackStat === null.
 * "Advise" gets its own special group.
 */
export type MissionGroup = StatName | "None" | "Advise";

export const MISSION_GROUP_ORDER: MissionGroup[] = [
  "Persuasion",
  "Investigation",
  "Espionage",
  "Command",
  "Administration",
  "None",
  "Advise",
];

export function getMissionGroup(m: Mission): MissionGroup {
  if (m.name === "Advise") return "Advise";
  return m.attackStat ?? "None";
}

/**
 * Given a faction ideology, determine the affinity status for a councilor type.
 */
export function getAffinityStatus(
  ct: CouncilorType,
  factionIdeology: string | null,
): AffinityStatus {
  if (!factionIdeology) return "neutral";

  const ideology =
    factionIdeology.charAt(0).toUpperCase() + factionIdeology.slice(1);

  const isGood = ct.affinities.includes(ideology);
  const isBad = ct.antiAffinities.includes(ideology);

  // Ban = both good and bad? Or a specific rule?
  // In Terra Invicta, ban means the type is unavailable. We'll treat
  // antiAffinity as "bad" (2x cost) for now, since the game data doesn't
  // have a separate "ban" concept in the templates.
  if (isBad) return "bad";
  if (isGood) return "good";
  return "neutral";
}

/**
 * Compute councilor hire cost given affinity status.
 * Base cost is 60 INF.
 */
export function getHireCost(status: AffinityStatus): number | null {
  switch (status) {
    case "good":
      return 30;
    case "bad":
      return 120;
    case "ban":
      return null;
    default:
      return 60;
  }
}

/**
 * Get trait chance for a councilor type.
 */
export function getTraitChance(
  trait: Trait,
  councilorName: string,
): number {
  const entry = trait.classChance.find((c) => c.class === councilorName);
  return entry?.chance ?? 0;
}
