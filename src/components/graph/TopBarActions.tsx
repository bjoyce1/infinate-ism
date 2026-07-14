import { useGraphStore } from "@/lib/graph/useGraphStore";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { CapturesDrawer } from "./CapturesDrawer";
import { SpcArtistsDrawer } from "./SpcArtistsDrawer";
import type { NormalizedGraph } from "@/lib/graph/types";

export function TopBarActions({
  graph,
  layout = "row",
}: {
  graph?: NormalizedGraph;
  layout?: "row" | "stack";
}) {
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const selectedId = useGraphStore((s) => s.selectedId);
  const reset = useGraphStore((s) => s.reset);
  const viewMode = useGraphStore((s) => s.viewMode);
  const setViewMode = useGraphStore((s) => s.setViewMode);
  const resetCamera = useGraphStore((s) => s.resetCamera);
  const recenterOnHub = useGraphStore((s) => s.recenterOnHub);
  const autoRotate = useGraphStore((s) => s.autoRotate);
  const toggleAutoRotate = useGraphStore((s) => s.toggleAutoRotate);
  const orbitLayout = useGraphStore((s) => s.orbitLayout);
  const toggleOrbitLayout = useGraphStore((s) => s.toggleOrbitLayout);

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

  const wrapCls =
    layout === "stack"
      ? "flex flex-col gap-1.5 pointer-events-auto w-full [&>*]:w-full [&>*]:text-left"
      : "flex flex-wrap gap-1.5 sm:gap-2 pointer-events-auto w-full md:w-auto md:ml-auto";

  return (
    <div className={wrapCls}>
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
        className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-[10px] sm:text-xs font-medium hover:border-neon-primary transition-colors cursor-pointer whitespace-nowrap inline-block"
        title="View aggregated click counts for external + mailto links"
      >
        ANALYTICS
      </Link>
      <CapturesDrawer />
      {graph && <SpcArtistsDrawer graph={graph} />}
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
      <div className="pointer-events-auto inline-flex rounded-lg border border-obsidian-border bg-obsidian-surface overflow-hidden">
        {(["2d", "3d", "street", "tree"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setViewMode(v)}
            className={`px-3 py-2 text-[10px] sm:text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
              viewMode === v ? "bg-neon-primary text-obsidian-bg" : "hover:bg-white/5"
            }`}
            title={`${v.toUpperCase()} view`}
          >
            {v === "2d" ? "2D" : v === "3d" ? "3D" : v === "street" ? "STREET" : "TREE"}
          </button>
        ))}
      </div>
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
        onClick={toggleOrbitLayout}
        className={`px-3 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-medium transition-colors cursor-pointer border whitespace-nowrap ${
          orbitLayout
            ? "bg-amber-500/20 border-amber-400 text-amber-200"
            : "bg-obsidian-surface border-obsidian-border hover:border-neon-primary"
        }`}
        title="Toggle between organized orbit layout and free-drift physics"
      >
        {orbitLayout ? "◎ ORBIT" : "∿ FREE DRIFT"}
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
  );
}