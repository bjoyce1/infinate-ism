import { useGraphStore } from "@/lib/graph/useGraphStore";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Menu, PanelRight } from "lucide-react";

export function TopBar() {
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const selectedId = useGraphStore((s) => s.selectedId);
  const reset = useGraphStore((s) => s.reset);
  const viewMode = useGraphStore((s) => s.viewMode);
  const toggleViewMode = useGraphStore((s) => s.toggleViewMode);
  const resetCamera = useGraphStore((s) => s.resetCamera);
  const recenterOnHub = useGraphStore((s) => s.recenterOnHub);
  const autoRotate = useGraphStore((s) => s.autoRotate);
  const toggleAutoRotate = useGraphStore((s) => s.toggleAutoRotate);
  const toggleLeftPanel = useGraphStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useGraphStore((s) => s.toggleRightPanel);
  const handleRecenter = () => {
    recenterOnHub();
    toast.success("Re-centering on mrcap1.com", {
      description: "Camera locked back on the hub under current filters.",
    });
  };

  const copyPermalink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Permalink copied", { description: "Share this URL to open the same view." });
    } catch {
      toast.error("Couldn't copy link", { description: url });
    }
  };

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

      <div className="flex flex-wrap gap-1.5 sm:gap-2 pointer-events-auto w-full md:w-auto md:ml-auto">
        <button
          type="button"
          onClick={reset}
          className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-[10px] sm:text-xs font-medium hover:bg-white/5 transition-colors cursor-pointer whitespace-nowrap"
        >
          RESET
        </button>
        <button
          type="button"
          onClick={copyPermalink}
          className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-[10px] sm:text-xs font-medium hover:border-neon-primary transition-colors cursor-pointer whitespace-nowrap"
          title="Copy a link that preserves the current view and selection"
        >
          SHARE VIEW
        </button>
        <Link
          to="/analytics"
          className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-[10px] sm:text-xs font-medium hover:border-neon-primary transition-colors cursor-pointer whitespace-nowrap"
          title="View aggregated click counts for external + mailto links"
        >
          ANALYTICS
        </Link>
        {viewMode === "3d" && (
          <button
            type="button"
            onClick={resetCamera}
            className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-[10px] sm:text-xs font-medium hover:border-neon-primary transition-colors cursor-pointer whitespace-nowrap"
          >
            RESET CAMERA
          </button>
        )}
        <button
          type="button"
          onClick={handleRecenter}
          className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-amber-500/40 rounded-lg text-[10px] sm:text-xs font-medium text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer whitespace-nowrap"
          title="Re-center the view on the mrcap1.com hub"
        >
          <span className="sm:hidden">◎ HUB</span>
          <span className="hidden sm:inline">◎ RE-CENTER · MRCAP1</span>
        </button>
        <button
          type="button"
          onClick={toggleViewMode}
          className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-[10px] sm:text-xs font-medium hover:border-neon-primary transition-colors cursor-pointer whitespace-nowrap"
          title="Toggle 2D / 3D view"
        >
          {viewMode === "2d" ? "2D VIEW" : "3D VIEW"}
        </button>
        <button
          type="button"
          onClick={toggleAutoRotate}
          className={`px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-medium transition-colors cursor-pointer border whitespace-nowrap ${
            autoRotate
              ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
              : "bg-obsidian-surface border-obsidian-border hover:border-neon-primary"
          }`}
          title="Slowly rotate the graph"
        >
          {autoRotate ? "↻ ROTATE ON" : "↻ ROTATE OFF"}
        </button>
        <button
          type="button"
          disabled={!selectedId}
          onClick={toggleFocus}
          className={`px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap ${
            focusMode
              ? "bg-neon-primary text-obsidian-bg"
              : "bg-obsidian-surface border border-obsidian-border hover:border-neon-primary"
          }`}
        >
          {focusMode ? "FOCUS ON" : "FOCUS MODE"}
        </button>
      </div>
    </header>
  );
}