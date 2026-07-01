import type { NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";

export function DetailPanel({ graph }: { graph: NormalizedGraph }) {
  const selectedId = useGraphStore((s) => s.selectedId);
  const select = useGraphStore((s) => s.select);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const node = selectedId ? graph.byId.get(selectedId) : null;

  if (!node) {
    return (
      <aside className="w-96 border-l border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 h-full">
        <div className="p-8 flex-1 flex flex-col items-center justify-center text-center gap-4">
          <div className="size-2 rounded-full bg-neon-primary shadow-[0_0_10px_#3DED97] animate-pulse" />
          <p className="text-xs font-mono uppercase tracking-widest text-muted-text">
            No node selected
          </p>
          <p className="text-sm text-white/60 max-w-[220px] leading-relaxed">
            Click a star in the constellation to trace its connections.
          </p>
        </div>
      </aside>
    );
  }

  const neighbors = Array.from(graph.neighbors.get(node.id) ?? [])
    .map((id) => graph.byId.get(id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .slice(0, 40);

  const color = CATEGORY_COLORS[node.category];

  return (
    <aside className="w-96 border-l border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 h-full overflow-y-auto">
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <span
            className="px-2 py-0.5 border rounded text-[10px] font-mono uppercase"
            style={{
              color,
              borderColor: `${color}40`,
              backgroundColor: `${color}1a`,
            }}
          >
            {node.category}
          </span>
          <span className="text-xs text-muted-text font-mono">
            deg {node.degree} · c{node.community ?? "—"}
          </span>
        </div>

        <h2 className="text-2xl font-light mb-2 leading-tight break-words">{node.label}</h2>
        {node.source_file && (
          <p className="text-sm text-muted-text leading-relaxed mb-8 font-mono break-all">
            {node.source_file}
            {node.source_location ? `:${node.source_location}` : ""}
          </p>
        )}

        <div className="space-y-6">
          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-3">
              Direct Neighbors ({neighbors.length})
            </h4>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {neighbors.length === 0 && (
                <div className="text-xs text-muted-text font-mono">no connections</div>
              )}
              {neighbors.map((nb) => (
                <button
                  key={nb.id}
                  type="button"
                  onClick={() => select(nb.id)}
                  className="w-full p-3 bg-white/5 border border-obsidian-border rounded-lg flex items-center justify-between hover:border-white/20 cursor-pointer transition-colors text-left"
                >
                  <span className="text-xs truncate pr-2">{nb.label}</span>
                  <div
                    className="size-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[nb.category] }}
                  />
                </button>
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-3">
              Metadata
            </h4>
            <div className="grid grid-cols-2 gap-y-4">
              <div>
                <div className="text-[10px] text-muted-text mb-1">Origin</div>
                <div className="text-xs font-mono">{node._origin ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-text mb-1">Community</div>
                <div className="text-xs font-mono">
                  {node.community != null ? String(node.community).padStart(3, "0") : "—"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] text-muted-text mb-1">Node ID</div>
                <div className="text-[10px] font-mono text-white/60 break-all">{node.id}</div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="mt-auto p-8 border-t border-obsidian-border flex gap-4">
        <button
          type="button"
          onClick={toggleFocus}
          className={`flex-1 py-3 rounded font-semibold text-xs uppercase tracking-wider cursor-pointer transition-colors ${
            focusMode
              ? "bg-neon-primary text-obsidian-bg"
              : "bg-white text-obsidian-bg hover:brightness-110"
          }`}
        >
          {focusMode ? "Exit Focus" : "Focus Neighborhood"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (node.source_file && typeof navigator !== "undefined") {
              void navigator.clipboard?.writeText(
                node.source_location ? `${node.source_file}:${node.source_location}` : node.source_file,
              );
            }
          }}
          title="Copy source path"
          className="p-3 bg-white/5 border border-obsidian-border rounded cursor-pointer hover:border-white/20 transition-colors"
        >
          <div className="size-4 border border-white/40 rounded-sm" />
        </button>
      </div>
    </aside>
  );
}