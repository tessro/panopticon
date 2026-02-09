import { create } from "zustand";
import { persist } from "zustand/middleware";

const GRID_RESOLUTION_MIN = 20;
const GRID_RESOLUTION_MAX = 150;
const LAUNCH_ACCELERATION_MIN = 0;
const LAUNCH_ACCELERATION_MAX = 50;
const MAX_DELTA_V_MIN = 0.1;
const MAX_DELTA_V_MAX = 500;

function isValidDateInput(value: string): boolean {
  return Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function clampGridResolution(value: number): number {
  if (!Number.isFinite(value)) return 80;
  const normalized = Math.floor(value);
  return Math.max(GRID_RESOLUTION_MIN, Math.min(GRID_RESOLUTION_MAX, normalized));
}

function clampLaunchAcceleration(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(
    LAUNCH_ACCELERATION_MIN,
    Math.min(LAUNCH_ACCELERATION_MAX, value),
  );
}

function clampMaxDeltaV(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(MAX_DELTA_V_MIN, Math.min(MAX_DELTA_V_MAX, value));
}

interface AppState {
  /** Currently selected faction ideology (lowercase), or null */
  selectedFaction: string | null;
  setSelectedFaction: (faction: string | null) => void;

  /** Number of councilors selected per profession (keyed by CouncilorType.name) */
  professionCounts: Record<string, number>;
  setProfessionCount: (name: string, count: number) => void;

  /** Transfer planner state */
  transferGameDate: string;
  setTransferGameDate: (date: string) => void;
  transferOriginOrbit: string | null;
  setTransferOriginOrbit: (orbit: string | null) => void;
  transferDestinationOrbit: string | null;
  setTransferDestinationOrbit: (orbit: string | null) => void;
  transferGridResolution: number;
  setTransferGridResolution: (resolution: number) => void;
  transferLaunchAcceleration: number;
  setTransferLaunchAcceleration: (acceleration: number) => void;
  transferMaxDeltaV: number;
  setTransferMaxDeltaV: (deltaV: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedFaction: null,
      setSelectedFaction: (faction) => set({ selectedFaction: faction }),

      professionCounts: {},
      setProfessionCount: (name, count) =>
        set((state) => ({
          professionCounts: {
            ...state.professionCounts,
            [name]: Math.max(0, count),
          },
        })),

      transferGameDate: "2022-01-01",
      setTransferGameDate: (date) => {
        if (!isValidDateInput(date)) return;
        set({ transferGameDate: date });
      },
      transferOriginOrbit: null,
      setTransferOriginOrbit: (orbit) => set({ transferOriginOrbit: orbit }),
      transferDestinationOrbit: null,
      setTransferDestinationOrbit: (orbit) =>
        set({ transferDestinationOrbit: orbit }),
      transferGridResolution: 80,
      setTransferGridResolution: (resolution) =>
        set({ transferGridResolution: clampGridResolution(resolution) }),
      transferLaunchAcceleration: 0,
      setTransferLaunchAcceleration: (acceleration) =>
        set({ transferLaunchAcceleration: clampLaunchAcceleration(acceleration) }),
      transferMaxDeltaV: 50,
      setTransferMaxDeltaV: (deltaV) =>
        set({ transferMaxDeltaV: clampMaxDeltaV(deltaV) }),
    }),
    { name: "panopticon-app" },
  ),
);
