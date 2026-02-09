import { useState, useEffect } from "react";
import type { CouncilorType, Mission, Faction, Trait } from "@/types/game";
import type { SpaceBody, Orbit } from "@/types/orbital";
import {
  loadCouncilorTypes,
  loadMissions,
  loadFactions,
  loadTraits,
  loadSpaceBodies,
  loadOrbits,
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

interface TransferData {
  bodies: SpaceBody[];
  orbits: Orbit[];
}

export function useTransferData(): TransferData | null {
  const [data, setData] = useState<TransferData | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadSpaceBodies(), loadOrbits()]).then(([bodies, orbits]) => {
      if (!cancelled) {
        setData({ bodies, orbits });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
