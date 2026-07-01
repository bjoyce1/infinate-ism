import { create } from "zustand";
import type { Category } from "./types";

type State = {
  selectedId: string | null;
  hoveredId: string | null;
  focusMode: boolean;
  activeCommunity: number | null;
  activeCategories: Set<Category>;
  searchOpen: boolean;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  toggleFocus: () => void;
  setCommunity: (c: number | null) => void;
  toggleCategory: (c: Category) => void;
  setSearchOpen: (v: boolean) => void;
  reset: () => void;
};

export const useGraphStore = create<State>((set) => ({
  selectedId: null,
  hoveredId: null,
  focusMode: false,
  activeCommunity: null,
  activeCategories: new Set(),
  searchOpen: false,
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
  reset: () =>
    set({
      selectedId: null,
      hoveredId: null,
      focusMode: false,
      activeCommunity: null,
      activeCategories: new Set(),
    }),
}));