import { create } from "zustand";
import type { Category } from "./types";

type State = {
  selectedId: string | null;
  hoveredId: string | null;
  focusMode: boolean;
  activeCommunity: number | null;
  activeCategories: Set<Category>;
  searchOpen: boolean;
  viewMode: "2d" | "3d";
  particleIntensity: number;
  linkIntensity: number;
  showLabels: boolean;
  labelSize: number;
  labelDensity: number;
  cameraResetToken: number;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  toggleFocus: () => void;
  setCommunity: (c: number | null) => void;
  toggleCategory: (c: Category) => void;
  setSearchOpen: (v: boolean) => void;
  toggleViewMode: () => void;
  setParticleIntensity: (v: number) => void;
  setLinkIntensity: (v: number) => void;
  setShowLabels: (v: boolean) => void;
  setLabelSize: (v: number) => void;
  setLabelDensity: (v: number) => void;
  resetCamera: () => void;
  reset: () => void;
};

export const useGraphStore = create<State>((set) => ({
  selectedId: null,
  hoveredId: null,
  focusMode: false,
  activeCommunity: null,
  activeCategories: new Set(),
  searchOpen: false,
  viewMode: "2d",
  particleIntensity: 1,
  linkIntensity: 1,
  showLabels: true,
  labelSize: 1,
  labelDensity: 1,
  cameraResetToken: 0,
  select: (id) => set({ selectedId: id }),
  hover: (id) => set({ hoveredId: id }),
  toggleFocus: () => set((s) => ({ focusMode: !s.focusMode })),
  setCommunity: (c) =>
    set((s) => ({ activeCommunity: s.activeCommunity === c ? null : c })),
  toggleCategory: (c) =>
    set((s) => {
      const next = new Set(s.activeCategories);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { activeCategories: next };
    }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === "2d" ? "3d" : "2d" })),
  setParticleIntensity: (v) => set({ particleIntensity: v }),
  setLinkIntensity: (v) => set({ linkIntensity: v }),
  setShowLabels: (v) => set({ showLabels: v }),
  setLabelSize: (v) => set({ labelSize: v }),
  setLabelDensity: (v) => set({ labelDensity: v }),
  resetCamera: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  reset: () =>
    set({
      selectedId: null,
      hoveredId: null,
      focusMode: false,
      activeCommunity: null,
      activeCategories: new Set(),
    }),
}));