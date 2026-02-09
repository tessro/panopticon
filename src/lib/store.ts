import { create } from "zustand";
import { persist } from "zustand/middleware";

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
      setTransferGameDate: (date) => set({ transferGameDate: date }),
      transferOriginOrbit: null,
      setTransferOriginOrbit: (orbit) => set({ transferOriginOrbit: orbit }),
      transferDestinationOrbit: null,
      setTransferDestinationOrbit: (orbit) =>
        set({ transferDestinationOrbit: orbit }),
      transferGridResolution: 80,
      setTransferGridResolution: (resolution) =>
        set({ transferGridResolution: resolution }),
    }),
    { name: "panopticon-app" },
  ),
);
