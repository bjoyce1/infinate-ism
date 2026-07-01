import type { Category, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS, isTsSourceNode } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { useMemo } from "react";

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
  const particleIntensity = useGraphStore((s) => s.particleIntensity);
  const setParticleIntensity = useGraphStore((s) => s.setParticleIntensity);
  const linkIntensity = useGraphStore((s) => s.linkIntensity);
  const setLinkIntensity = useGraphStore((s) => s.setLinkIntensity);
  const viewMode = useGraphStore((s) => s.viewMode);
  const showLabels = useGraphStore((s) => s.showLabels);
  const setShowLabels = useGraphStore((s) => s.setShowLabels);
  const labelSize = useGraphStore((s) => s.labelSize);
  const setLabelSize = useGraphStore((s) => s.setLabelSize);
  const labelDensity = useGraphStore((s) => s.labelDensity);
  const setLabelDensity = useGraphStore((s) => s.setLabelDensity);
  const hideCode = useGraphStore((s) => s.hideCode);
  const toggleHideCode = useGraphStore((s) => s.toggleHideCode);
  const includeTsFiles = useGraphStore((s) => s.includeTsFiles);
  const toggleIncludeTsFiles = useGraphStore((s) => s.toggleIncludeTsFiles);
  const topCommunities = graph.communities.slice(0, 12);

  const filterStats = useMemo(() => {
    const totalNodes = graph.nodes.length;
    const totalLinks = graph.links.length;

    const codeIds = new Set<string>();
    const tsIds = new Set<string>();
    for (const n of graph.nodes) {
      if (n.category === "code") codeIds.add(n.id);
      if (isTsSourceNode(n)) tsIds.add(n.id);
    }

    // Nodes/links hidden by each filter in isolation (against the raw graph).
    let codeLinks = 0;
    let tsLinks = 0;
    // Nodes/links hidden by both filters combined (current live view).
    const hiddenIds = new Set<string>();
    if (hideCode) for (const id of codeIds) hiddenIds.add(id);
    if (!includeTsFiles) for (const id of tsIds) hiddenIds.add(id);
    let visibleLinks = 0;

    for (const l of graph.links) {
      const s = l.source as unknown as string;
      const t = l.target as unknown as string;
      if (codeIds.has(s) || codeIds.has(t)) codeLinks += 1;
      if (tsIds.has(s) || tsIds.has(t)) tsLinks += 1;
      if (!hiddenIds.has(s) && !hiddenIds.has(t)) visibleLinks += 1;
    }

    const visibleNodes = totalNodes - hiddenIds.size;
    return {
      totalNodes,
      totalLinks,
      visibleNodes,
      visibleLinks,
      hiddenNodes: hiddenIds.size,
      hiddenLinks: totalLinks - visibleLinks,
      codeNodes: codeIds.size,
      codeLinks,
      tsNodes: tsIds.size,
      tsLinks,
    };
  }, [graph.nodes, graph.links, hideCode, includeTsFiles]);

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
          <div className="p-3 bg-white/5 border border-obsidian-border rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold">
                  {hideCode ? "Clean View" : "Raw View"}
                </div>
                <div className="text-[10px] font-mono text-muted-text mt-0.5 leading-relaxed">
                  {hideCode ? (
                    <>hides {filterStats.codeNodes} nodes · {filterStats.codeLinks} links</>
                  ) : (
                    <>{filterStats.codeNodes} code nodes · {filterStats.codeLinks} links shown</>
                  )}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hideCode}
                aria-label="Hide code nodes"
                onClick={toggleHideCode}
                className={`relative h-5 w-9 rounded-full border transition-colors cursor-pointer shrink-0 ${
                  hideCode
                    ? "bg-neon-primary/30 border-neon-primary"
                    : "bg-white/5 border-obsidian-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-3.5 rounded-full transition-transform ${
                    hideCode ? "translate-x-4 bg-neon-primary" : "translate-x-0.5 bg-white/60"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="p-3 bg-white/5 border border-obsidian-border rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold">
                  {includeTsFiles ? "TS Files Shown" : "TS Files Hidden"}
                </div>
                <div className="text-[10px] font-mono text-muted-text mt-0.5 leading-relaxed">
                  {includeTsFiles ? (
                    <>{filterStats.tsNodes} nodes · {filterStats.tsLinks} links shown</>
                  ) : (
                    <>hides {filterStats.tsNodes} nodes · {filterStats.tsLinks} links</>
                  )}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={includeTsFiles}
                aria-label="Include TypeScript source nodes"
                onClick={toggleIncludeTsFiles}
                className={`relative h-5 w-9 rounded-full border transition-colors cursor-pointer shrink-0 ${
                  includeTsFiles
                    ? "bg-neon-primary/30 border-neon-primary"
                    : "bg-white/5 border-obsidian-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-3.5 rounded-full transition-transform ${
                    includeTsFiles ? "translate-x-4 bg-neon-primary" : "translate-x-0.5 bg-white/60"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="px-3 py-2 rounded-lg border border-obsidian-border bg-white/[0.02] font-mono text-[10px] leading-relaxed">
            <div className="uppercase tracking-widest text-muted-text mb-1">Live totals</div>
            <div className="flex justify-between">
              <span className="text-muted-text">Nodes</span>
              <span>
                <span className="text-neon-primary">{filterStats.visibleNodes}</span>
                <span className="text-muted-text">
                  {" "}/ {filterStats.totalNodes} · {filterStats.hiddenNodes} hidden
                </span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-text">Links</span>
              <span>
                <span className="text-neon-primary">{filterStats.visibleLinks}</span>
                <span className="text-muted-text">
                  {" "}/ {filterStats.totalLinks} · {filterStats.hiddenLinks} hidden
                </span>
              </span>
            </div>
          </div>

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

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-4">
              Flow Intensity
            </h3>
            <div className="space-y-3">
              <label className="block">
                <div className="flex justify-between text-[10px] font-mono text-muted-text mb-1">
                  <span>Particles</span>
                  <span>{particleIntensity.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={particleIntensity}
                  onChange={(e) => setParticleIntensity(Number(e.target.value))}
                  className="w-full accent-neon-primary cursor-pointer"
                />
              </label>
              <label className="block">
                <div className="flex justify-between text-[10px] font-mono text-muted-text mb-1">
                  <span>Links</span>
                  <span>{linkIntensity.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={linkIntensity}
                  onChange={(e) => setLinkIntensity(Number(e.target.value))}
                  className="w-full accent-neon-primary cursor-pointer"
                />
              </label>
            </div>
          </div>

          {viewMode === "3d" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-text">
                  Labels (3D)
                </h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showLabels}
                  onClick={() => setShowLabels(!showLabels)}
                  className={`relative h-5 w-9 rounded-full border transition-colors cursor-pointer ${
                    showLabels
                      ? "bg-neon-primary/30 border-neon-primary"
                      : "bg-white/5 border-obsidian-border"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-3.5 rounded-full transition-transform ${
                      showLabels ? "translate-x-4 bg-neon-primary" : "translate-x-0.5 bg-white/60"
                    }`}
                  />
                </button>
              </div>
              <div className={`space-y-3 ${showLabels ? "" : "opacity-40 pointer-events-none"}`}>
                <label className="block">
                  <div className="flex justify-between text-[10px] font-mono text-muted-text mb-1">
                    <span>Size</span>
                    <span>{labelSize.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={labelSize}
                    onChange={(e) => setLabelSize(Number(e.target.value))}
                    className="w-full accent-neon-primary cursor-pointer"
                  />
                </label>
                <label className="block">
                  <div className="flex justify-between text-[10px] font-mono text-muted-text mb-1">
                    <span>Density</span>
                    <span>{labelDensity.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={2.5}
                    step={0.1}
                    value={labelDensity}
                    onChange={(e) => setLabelDensity(Number(e.target.value))}
                    className="w-full accent-neon-primary cursor-pointer"
                  />
                </label>
              </div>
            </div>
          )}
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