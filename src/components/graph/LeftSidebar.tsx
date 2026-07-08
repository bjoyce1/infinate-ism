import type { Category, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS, isTsSourceNode } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import React, { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ResizeHandle } from "./ResizeHandle";
import { useIsDesktop } from "@/hooks/useIsDesktop";

function LinkCount({
  children,
  tip,
}: {
  children: React.ReactNode;
  tip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="underline decoration-dotted underline-offset-2 decoration-white/30 cursor-help">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-obsidian-surface border border-obsidian-border text-white/90 max-w-[220px]"
      >
        <p className="text-[11px] leading-snug">{tip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

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
  const spawnOrbitRadius = useGraphStore((s) => s.spawnOrbitRadius);
  const setSpawnOrbitRadius = useGraphStore((s) => s.setSpawnOrbitRadius);
  const spawnOrbitSpeed = useGraphStore((s) => s.spawnOrbitSpeed);
  const setSpawnOrbitSpeed = useGraphStore((s) => s.setSpawnOrbitSpeed);
  const linkStrength = useGraphStore((s) => s.linkStrength);
  const setLinkStrength = useGraphStore((s) => s.setLinkStrength);
  const chargeStrength = useGraphStore((s) => s.chargeStrength);
  const setChargeStrength = useGraphStore((s) => s.setChargeStrength);
  const collideRadius = useGraphStore((s) => s.collideRadius);
  const setCollideRadius = useGraphStore((s) => s.setCollideRadius);
  const centroidPull = useGraphStore((s) => s.centroidPull);
  const setCentroidPull = useGraphStore((s) => s.setCentroidPull);
  const resetForceParams = useGraphStore((s) => s.resetForceParams);
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

  const HUB_ID = "site_mrcap1_com";
  const hubStats = useMemo(() => {
    const hub = graph.byId.get(HUB_ID);
    if (!hub) return null;

    const codeIds = new Set<string>();
    const tsIds = new Set<string>();
    for (const n of graph.nodes) {
      if (n.category === "code") codeIds.add(n.id);
      if (isTsSourceNode(n)) tsIds.add(n.id);
    }
    const hiddenIds = new Set<string>();
    if (hideCode) for (const id of codeIds) hiddenIds.add(id);
    if (!includeTsFiles) for (const id of tsIds) hiddenIds.add(id);

    const neighbors = graph.neighbors.get(HUB_ID) ?? new Set<string>();
    let neighborsVisible = 0;
    for (const id of neighbors) if (!hiddenIds.has(id)) neighborsVisible += 1;
    const neighborsHidden = neighbors.size - neighborsVisible;

    let spawnTotal = 0;
    let spawnActive = 0;
    for (const l of graph.links) {
      const s = l.source as unknown as string;
      const t = l.target as unknown as string;
      if (s !== HUB_ID && t !== HUB_ID) continue;
      spawnTotal += 1;
      if (!hiddenIds.has(s) && !hiddenIds.has(t)) spawnActive += 1;
    }

    const hubHidden = hiddenIds.has(HUB_ID);
    return {
      label: hub.label,
      hubHidden,
      neighborsTotal: neighbors.size,
      neighborsVisible,
      neighborsHidden,
      spawnTotal,
      spawnActive,
      spawnHidden: spawnTotal - spawnActive,
    };
  }, [graph, hideCode, includeTsFiles]);

  const selected = selectedId ? graph.byId.get(selectedId) : null;
  const focusLabel = focusMode && selected ? selected.label : null;

  const leftPanelOpen = useGraphStore((s) => s.leftPanelOpen);
  const setLeftPanel = useGraphStore((s) => s.setLeftPanel);
  const leftPanelWidth = useGraphStore((s) => s.leftPanelWidth);
  const setLeftPanelWidth = useGraphStore((s) => s.setLeftPanelWidth);
  const isDesktop = useIsDesktop();

  return (
    <TooltipProvider delayDuration={150}>
      {leftPanelOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setLeftPanel(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-fade-in"
        />
      )}
      <aside
        style={isDesktop ? { width: leftPanelWidth } : undefined}
        className={`fixed md:relative z-40 top-0 left-0 h-full w-[85vw] max-w-xs border-r border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:shadow-none shadow-2xl md:translate-x-0 ${
          leftPanelOpen ? "translate-x-0" : "-translate-x-full"
        } overflow-y-auto`}
      >
      <ResizeHandle side="left" width={leftPanelWidth} onChange={setLeftPanelWidth} min={220} max={560} />
      <div className="p-6 border-b border-obsidian-border">
        <div className="flex items-center gap-2 mb-8">
          <div className="size-3 rounded-full bg-neon-primary shadow-[0_0_10px_#3DED97]" />
          <span className="font-semibold tracking-tight text-lg">INFINITE-ISM v1</span>
        </div>

        <nav className="space-y-6">
          <div className="p-3 bg-white/5 border border-obsidian-border rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold flex items-center gap-2">
                  {hideCode ? "Clean View" : "Raw View"}
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${hideCode ? "border-neon-primary/40 text-neon-primary bg-neon-primary/10" : "border-white/20 text-white/70 bg-white/10"}`}>
                    {hideCode ? `${filterStats.hiddenNodes} hidden` : `${filterStats.visibleNodes} visible`}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-muted-text mt-0.5 leading-relaxed">
                  {hideCode ? (
                    <>hides {filterStats.codeNodes} nodes · <LinkCount tip="Links are hidden when either endpoint is a code-category node.">{filterStats.codeLinks} links</LinkCount></>
                  ) : (
                    <>{filterStats.codeNodes} code nodes · <LinkCount tip="Links are hidden when either endpoint is a code-category node.">{filterStats.codeLinks} links shown</LinkCount></>
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
                <div className="text-xs font-semibold flex items-center gap-2">
                  {includeTsFiles ? "TS Files Shown" : "TS Files Hidden"}
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${includeTsFiles ? "border-neon-primary/40 text-neon-primary bg-neon-primary/10" : "border-white/20 text-white/70 bg-white/10"}`}>
                    {includeTsFiles ? `${filterStats.tsNodes} shown` : `${filterStats.tsNodes} hidden`}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-muted-text mt-0.5 leading-relaxed">
                  {includeTsFiles ? (
                    <>{filterStats.tsNodes} nodes · <LinkCount tip="Links are hidden when either endpoint is a .ts/.tsx source node.">{filterStats.tsLinks} links shown</LinkCount></>
                  ) : (
                    <>hides {filterStats.tsNodes} nodes · <LinkCount tip="Links are hidden when either endpoint is a .ts/.tsx source node.">{filterStats.tsLinks} links</LinkCount></>
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
                <LinkCount tip="A link counts as visible only when both its source and target nodes are currently shown.">
                  <span className="text-neon-primary">{filterStats.visibleLinks}</span>
                </LinkCount>
                <span className="text-muted-text">
                  {" "}/ {filterStats.totalLinks} · <LinkCount tip="A link is hidden if either of its endpoints is filtered out.">{filterStats.hiddenLinks} hidden</LinkCount>
                </span>
              </span>
            </div>
          </div>

          {hubStats && (
            <div className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] font-mono text-[10px] leading-relaxed">
              <div className="flex items-center justify-between mb-1.5">
                <span className="uppercase tracking-widest text-amber-400/80">Hub · {hubStats.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full border text-[9px] ${
                    hubStats.hubHidden
                      ? "border-white/20 text-muted-text bg-white/5"
                      : "border-amber-500/40 text-amber-300 bg-amber-500/10"
                  }`}
                >
                  {hubStats.hubHidden ? "hidden" : "live"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-text">Spawned nodes</span>
                <span>
                  <span className="text-amber-300">{hubStats.neighborsVisible}</span>
                  <span className="text-muted-text">
                    {" "}/ {hubStats.neighborsTotal} · {hubStats.neighborsHidden} hidden
                  </span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-text">Spawn-links</span>
                <span>
                  <LinkCount tip="Spawn-links are edges attached to the mrcap1.com hub. A spawn-link is active only when both endpoints (the hub and its neighbor) pass the current filters.">
                    <span className="text-amber-300">{hubStats.spawnActive}</span>
                  </LinkCount>
                  <span className="text-muted-text">
                    {" "}/ {hubStats.spawnTotal} · <LinkCount tip="A spawn-link is hidden when its neighbor endpoint (or the hub itself) is filtered out.">{hubStats.spawnHidden} hidden</LinkCount>
                  </span>
                </span>
              </div>
            </div>
          )}

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
                      <span className="text-sm truncate text-left" title={c.name}>{c.name}</span>
                      <span className="font-mono text-[10px] text-muted-text bg-white/5 px-1.5 py-0.5 rounded shrink-0 ml-2">
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

          <div>
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-4">
              Spawn Orbits
            </h3>
            <div className="space-y-3">
              <label className="block">
                <div className="flex justify-between text-[10px] font-mono text-muted-text mb-1">
                  <span>Orbit radius</span>
                  <span>{spawnOrbitRadius.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={3}
                  step={0.1}
                  value={spawnOrbitRadius}
                  onChange={(e) => setSpawnOrbitRadius(Number(e.target.value))}
                  className="w-full accent-neon-primary cursor-pointer"
                />
              </label>
              <label className="block">
                <div className="flex justify-between text-[10px] font-mono text-muted-text mb-1">
                  <span>Rotation speed</span>
                  <span>{spawnOrbitSpeed.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={spawnOrbitSpeed}
                  onChange={(e) => setSpawnOrbitSpeed(Number(e.target.value))}
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
    </TooltipProvider>
  );
}