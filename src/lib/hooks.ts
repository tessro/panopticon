import { useState, useEffect } from "react";
import type { CouncilorType, Mission, Faction, Trait } from "@/types/game";
import {
  loadCouncilorTypes,
  loadMissions,
  loadFactions,
  loadTraits,
} from "./data";

interface GameData {
  councilorTypes: CouncilorType[];
  missions: Mission[];
  factions: Faction[];
  traits: Trait[];
}

export function useGameData(): GameData | null {
  const [data, setData] = useState<GameData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadCouncilorTypes(),
      loadMissions(),
      loadFactions(),
      loadTraits(),
    ]).then(([councilorTypes, missions, factions, traits]) => {
      if (!cancelled) {
        setData({ councilorTypes, missions, factions, traits });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
