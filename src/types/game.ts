export type StatName =
  | "Persuasion"
  | "Investigation"
  | "Espionage"
  | "Command"
  | "Administration"
  | "Science";

export const STAT_ABBREV: Record<StatName, string> = {
  Persuasion: "PER",
  Investigation: "INV",
  Espionage: "ESP",
  Command: "CMD",
  Administration: "ADM",
  Science: "SCI",
};

export const STAT_ORDER: StatName[] = [
  "Persuasion",
  "Investigation",
  "Espionage",
  "Command",
  "Administration",
  "Science",
];

export interface StatBlock {
  base: number;
  rand: number;
}

export interface CouncilorType {
  name: string;
  friendlyName: string;
  primaryStat: StatName;
  secondaryStat: StatName | null;
  affinities: string[];
  antiAffinities: string[];
  missions: string[];
  weight: number;
  stats: {
    persuasion: StatBlock;
    investigation: StatBlock;
    espionage: StatBlock;
    command: StatBlock;
    administration: StatBlock;
    science: StatBlock;
  };
}

export interface Mission {
  name: string;
  friendlyName: string;
  attackStat: StatName | null;
  resourceType: string | null;
  sortOrder: number;
}

export interface Faction {
  name: string;
  friendlyName: string;
  ideology: string;
  color: { r: number; g: number; b: number; a: number };
  backgroundColor: string;
}

export interface TraitChance {
  class: string;
  chance: number;
}

export interface Trait {
  name: string;
  classChance: TraitChance[];
}

/** Affinity status for a councilor type relative to the selected faction */
export type AffinityStatus = "good" | "bad" | "ban" | "neutral";
