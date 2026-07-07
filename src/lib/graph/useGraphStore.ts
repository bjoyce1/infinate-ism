import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Category } from "./types";
import type { CaptureInput } from "./loadGraph";

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
  spawnOrbitRadius: number;
  spawnOrbitSpeed: number;
  orbitLayout: boolean;
  showLabels: boolean;
  labelSize: number;
  labelDensity: number;
  cameraResetToken: number;
  recenterToken: number;
  hideCode: boolean;
  includeTsFiles: boolean;
  autoRotate: boolean;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  captures: CaptureInput[];
  pulseNodeId: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  toggleFocus: () => void;
  setCommunity: (c: number | null) => void;
  toggleCategory: (c: Category) => void;
  setSearchOpen: (v: boolean) => void;
  toggleViewMode: () => void;
  setViewMode: (v: "2d" | "3d") => void;
  setParticleIntensity: (v: number) => void;
  setLinkIntensity: (v: number) => void;
  setSpawnOrbitRadius: (v: number) => void;
  setSpawnOrbitSpeed: (v: number) => void;
  toggleOrbitLayout: () => void;
  setOrbitLayout: (v: boolean) => void;
  setShowLabels: (v: boolean) => void;
  setLabelSize: (v: number) => void;
  setLabelDensity: (v: number) => void;
  resetCamera: () => void;
  recenterOnHub: () => void;
  toggleHideCode: () => void;
  setHideCode: (v: boolean) => void;
  toggleIncludeTsFiles: () => void;
  setIncludeTsFiles: (v: boolean) => void;
  toggleAutoRotate: () => void;
  setAutoRotate: (v: boolean) => void;
  toggleLeftPanel: () => void;
  setLeftPanel: (v: boolean) => void;
  toggleRightPanel: () => void;
  setRightPanel: (v: boolean) => void;
  setLeftPanelWidth: (v: number) => void;
  setRightPanelWidth: (v: number) => void;
  setCaptures: (c: CaptureInput[]) => void;
  addCapture: (c: CaptureInput) => void;
  pulseNode: (id: string | null) => void;
  reset: () => void;
};

export const useGraphStore = create<State>()(
  persist(
    (set) => ({
  selectedId: null,
  hoveredId: null,
  focusMode: false,
  activeCommunity: null,
  activeCategories: new Set(),
  searchOpen: false,
  viewMode: "2d",
  particleIntensity: 1,
  linkIntensity: 1,
  spawnOrbitRadius: 1,
  spawnOrbitSpeed: 1,
  orbitLayout: true,
  showLabels: true,
  labelSize: 1,
  labelDensity: 1,
  cameraResetToken: 0,
  recenterToken: 0,
  hideCode: false,
  includeTsFiles: false,
  autoRotate: false,
  leftPanelOpen: false,
  rightPanelOpen: false,
  leftPanelWidth: 288,
  rightPanelWidth: 384,
  captures: [],
  pulseNodeId: null,
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
  toggleViewMode: () =>
    set((s) => ({
      viewMode: s.viewMode === "2d" ? "3d" : "2d",
    })),
  setViewMode: (v) => set({ viewMode: v }),
  setParticleIntensity: (v) => set({ particleIntensity: v }),
  setLinkIntensity: (v) => set({ linkIntensity: v }),
  setSpawnOrbitRadius: (v) => set({ spawnOrbitRadius: v }),
  setSpawnOrbitSpeed: (v) => set({ spawnOrbitSpeed: v }),
  toggleOrbitLayout: () => set((s) => ({ orbitLayout: !s.orbitLayout })),
  setOrbitLayout: (v) => set({ orbitLayout: v }),
  setShowLabels: (v) => set({ showLabels: v }),
  setLabelSize: (v) => set({ labelSize: v }),
  setLabelDensity: (v) => set({ labelDensity: v }),
  resetCamera: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  recenterOnHub: () => set((s) => ({ recenterToken: s.recenterToken + 1 })),
  toggleHideCode: () => set((s) => ({ hideCode: !s.hideCode })),
  setHideCode: (v) => set({ hideCode: v }),
  toggleIncludeTsFiles: () => set((s) => ({ includeTsFiles: !s.includeTsFiles })),
  setIncludeTsFiles: (v) => set({ includeTsFiles: v }),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  setAutoRotate: (v) => set({ autoRotate: v }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  setLeftPanel: (v) => set({ leftPanelOpen: v }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setRightPanel: (v) => set({ rightPanelOpen: v }),
  setLeftPanelWidth: (v) => set({ leftPanelWidth: Math.max(220, Math.min(560, v)) }),
  setRightPanelWidth: (v) => set({ rightPanelWidth: Math.max(260, Math.min(640, v)) }),
  setCaptures: (c) => set({ captures: c }),
  addCapture: (c) =>
    set((s) => (s.captures.some((x) => x.id === c.id) ? s : { captures: [...s.captures, c] })),
  pulseNode: (id) => set({ pulseNodeId: id }),
  reset: () =>
    set({
      selectedId: null,
      hoveredId: null,
      focusMode: false,
      activeCommunity: null,
      activeCategories: new Set(),
    }),
    }),
    {
      name: "infinite-ism:panels",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        leftPanelOpen: s.leftPanelOpen,
        rightPanelOpen: s.rightPanelOpen,
        leftPanelWidth: s.leftPanelWidth,
        rightPanelWidth: s.rightPanelWidth,
      }),
      skipHydration: typeof window === "undefined",
    },
  ),
);