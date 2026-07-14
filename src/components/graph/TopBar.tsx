import { useGraphStore } from "@/lib/graph/useGraphStore";
import { Menu, PanelRight } from "lucide-react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { TopBarActions } from "./TopBarActions";

export function TopBar({ graph }: { graph?: NormalizedGraph }) {
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const viewMode = useGraphStore((s) => s.viewMode);
  const toggleLeftPanel = useGraphStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useGraphStore((s) => s.toggleRightPanel);
  const isStreet = viewMode === "street";

  return (
    <header className="absolute top-0 left-0 w-full p-3 sm:p-4 md:p-6 z-10 pointer-events-none flex flex-wrap items-center gap-2 sm:gap-3">
      <button
        type="button"
        onClick={toggleLeftPanel}
        aria-label="Toggle filters panel"
        className="md:hidden pointer-events-auto p-2 bg-obsidian-surface/80 border border-obsidian-border rounded-lg backdrop-blur cursor-pointer hover:border-white/20 transition-colors shrink-0"
      >
        <Menu className="size-4" />
      </button>

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="pointer-events-auto bg-obsidian-surface/80 border border-obsidian-border rounded-full px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-md shadow-xl backdrop-blur cursor-pointer hover:border-white/20 transition-colors"
      >
        <div className="size-4 border-2 border-muted-text/30 rounded-full shrink-0" />
        <span className="text-xs sm:text-sm text-muted-text flex-1 text-left font-mono truncate">Search your mind...</span>
        <span className="text-[10px] font-mono text-muted-text shrink-0 hidden sm:inline">⌘K</span>
      </button>

      <button
        type="button"
        onClick={toggleRightPanel}
        aria-label="Toggle detail panel"
        className="md:hidden pointer-events-auto p-2 bg-obsidian-surface/80 border border-obsidian-border rounded-lg backdrop-blur cursor-pointer hover:border-white/20 transition-colors shrink-0 order-last ml-auto"
      >
        <PanelRight className="size-4" />
      </button>

      {!isStreet && <TopBarActions graph={graph} layout="row" />}
    </header>
  );
}