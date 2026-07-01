import type { Category, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";

const CATS: { key: Category; label: string }[] = [
  { key: "code", label: ".Code" },
  { key: "blog", label: ".Blog" },
  { key: "music", label: ".Audio" },
  { key: "image", label: ".Visual" },
];

export function LeftSidebar({ graph }: { graph: NormalizedGraph }) {
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const setCommunity = useGraphStore((s) => s.setCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const toggleCategory = useGraphStore((s) => s.toggleCategory);
  const focusMode = useGraphStore((s) => s.focusMode);
  const selectedId = useGraphStore((s) => s.selectedId);
  const topCommunities = graph.communities.slice(0, 12);

  const selected = selectedId ? graph.byId.get(selectedId) : null;
  const focusLabel = focusMode && selected ? selected.label : null;

  return (
    <aside className="w-72 border-r border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 h-full">
      <div className="p-6 border-b border-obsidian-border">
        <div className="flex items-center gap-2 mb-8">
          <div className="size-3 rounded-full bg-neon-primary shadow-[0_0_10px_#3DED97]" />
          <span className="font-semibold tracking-tight text-lg">MNEMOSYNE v1.0</span>
        </div>

        <nav className="space-y-6">
          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-4">
              Communities
            </h3>
            <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {topCommunities.map((c) => {
                const active = activeCommunity === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setCommunity(c.id)}
                      className={`w-full flex items-center justify-between group py-1.5 px-2 rounded transition-colors cursor-pointer ${
                        active ? "bg-neon-primary/10 text-neon-primary" : "hover:bg-white/5 text-white/80"
                      }`}
                    >
                      <span className="text-sm">Cluster {String(c.id).padStart(3, "0")}</span>
                      <span className="font-mono text-[10px] text-muted-text bg-white/5 px-1.5 py-0.5 rounded">
                        {c.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-4">
              Filter by Type
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {CATS.map((c) => {
                const active = activeCategories.has(c.key);
                const count = graph.categoryCounts[c.key];
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleCategory(c.key)}
                    className={`px-3 py-2 border rounded text-xs text-left transition-colors cursor-pointer flex items-center gap-2 ${
                      active
                        ? "border-neon-primary bg-neon-primary/10 text-neon-primary"
                        : "bg-white/5 border-obsidian-border hover:border-neon-primary text-white/80"
                    }`}
                  >
                    <span
                      className="size-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[c.key] }}
                    />
                    <span className="flex-1">{c.label}</span>
                    <span className="text-[10px] text-muted-text font-mono">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      <div className="mt-auto p-6">
        <div className="p-4 bg-neon-dim/20 border border-neon-primary/20 rounded-lg">
          <p className="text-xs text-neon-primary leading-relaxed font-mono">
            {focusLabel
              ? `Focus: ${focusLabel.slice(0, 32)}`
              : `Exploring ${graph.nodes.length} nodes across ${graph.communities.length} clusters.`}
          </p>
        </div>
      </div>
    </aside>
  );
}