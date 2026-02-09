import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AppState {
  /** Currently selected faction ideology (lowercase), or null */
  selectedFaction: string | null;
  setSelectedFaction: (faction: string | null) => void;

  /** Number of councilors selected per profession (keyed by CouncilorType.name) */
  professionCounts: Record<string, number>;
  setProfessionCount: (name: string, count: number) => void;
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
    }),
    { name: "panopticon-app" },
  ),
);
