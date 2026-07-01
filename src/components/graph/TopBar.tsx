import { useGraphStore } from "@/lib/graph/useGraphStore";

export function TopBar() {
  const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const selectedId = useGraphStore((s) => s.selectedId);
  const reset = useGraphStore((s) => s.reset);

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
        <div
          className="px-4 py-2 bg-obsidian-surface border border-obsidian-border rounded-lg text-xs font-medium text-muted-text"
          title="3D view — coming soon"
        >
          2D VIEW
        </div>
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