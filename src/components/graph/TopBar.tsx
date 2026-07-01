import { useGraphStore } from "@/lib/graph/useGraphStore";
import { toast } from "sonner";

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
  const hideCode = useGraphStore((s) => s.hideCode);
  const includeTsFiles = useGraphStore((s) => s.includeTsFiles);

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
    <header className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10 pointer-events-none">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="pointer-events-auto bg-obsidian-surface/80 border border-obsidian-border rounded-full px-4 py-2 flex items-center gap-3 w-96 shadow-xl backdrop-blur cursor-pointer hover:border-white/20 transition-colors"
      >
        <div className="size-4 border-2 border-muted-text/30 rounded-full" />
        <span className="text-sm text-muted-text flex-1 text-left font-mono">Search your mind...</span>
        <span className="text-[10px] font-mono text-muted-text">⌘K</span>
      </button>

      <div className="flex gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-xs font-medium hover:bg-white/5 transition-colors cursor-pointer"
        >
          RESET
        </button>
        <button
          type="button"
          onClick={copyPermalink}
          className="px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-xs font-medium hover:border-neon-primary transition-colors cursor-pointer"
          title="Copy a link that preserves the current view and selection"
        >
          SHARE VIEW
        </button>
        {viewMode === "3d" && (
          <button
            type="button"
            onClick={resetCamera}
            className="px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-xs font-medium hover:border-neon-primary transition-colors cursor-pointer"
          >
            RESET CAMERA
          </button>
        )}
        <button
          type="button"
          onClick={handleRecenter}
          className="px-4 py-2 bg-obsidian-surface border border-amber-500/40 rounded-lg text-xs font-medium text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
          title="Re-center the view on the mrcap1.com hub"
        >
          ◎ RE-CENTER · MRCAP1
        </button>
        {(hideCode || !includeTsFiles) && null}
        <button
          type="button"
          onClick={toggleViewMode}
          className="px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-xs font-medium hover:border-neon-primary transition-colors cursor-pointer"
          title="Toggle 2D / 3D view"
        >
          {viewMode === "2d" ? "2D VIEW" : "3D VIEW"}
        </button>
        <button
          type="button"
          disabled={!selectedId}
          onClick={toggleFocus}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
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