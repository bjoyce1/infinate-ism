import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";

export function GraphCanvas3D({ graph }: { graph: NormalizedGraph }) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ForceGraph3D, setForceGraph3D] = useState<React.ComponentType<Record<string, unknown>> | null>(null);

  const selectedId = useGraphStore((s) => s.selectedId);
  const hoveredId = useGraphStore((s) => s.hoveredId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const select = useGraphStore((s) => s.select);
  const hover = useGraphStore((s) => s.hover);

  useEffect(() => {
    let cancelled = false;
    import("react-force-graph-3d").then((m) => {
      if (!cancelled) setForceGraph3D(() => m.default as React.ComponentType<Record<string, unknown>>);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const nodeSet = new Set<string>();
    for (const n of graph.nodes) {
      if (activeCategories.size > 0 && !activeCategories.has(n.category)) continue;
      if (activeCommunity != null && n.community !== activeCommunity) continue;
      nodeSet.add(n.id);
    }
    if (focusMode && selectedId && nodeSet.has(selectedId)) {
      const keep = new Set<string>([selectedId]);
      for (const nb of graph.neighbors.get(selectedId) ?? []) keep.add(nb);
      for (const id of nodeSet) if (!keep.has(id)) nodeSet.delete(id);
    }
    const nodes = graph.nodes.filter((n) => nodeSet.has(n.id)).map((n) => ({ ...n }));
    const links = graph.links
      .filter((l) => nodeSet.has(l.source) && nodeSet.has(l.target))
      .map((l) => ({ ...l }));
    return { nodes, links };
  }, [graph, activeCategories, activeCommunity, focusMode, selectedId]);

  const highlightSet = useMemo(() => {
    const anchor = hoveredId ?? selectedId;
    if (!anchor) return null;
    const set = new Set<string>([anchor]);
    for (const nb of graph.neighbors.get(anchor) ?? []) set.add(nb);
    return set;
  }, [hoveredId, selectedId, graph.neighbors]);

  const nodeVal = (n: GraphNode) => Math.max(1, 1 + Math.sqrt(n.degree));
  const nodeColor = (n: GraphNode) => {
    if (highlightSet && !highlightSet.has(n.id)) return "rgba(80,80,90,0.25)";
    return CATEGORY_COLORS[n.category];
  };
  const linkColor = (link: { source: GraphNode | string; target: GraphNode | string }) => {
    const s = typeof link.source === "string" ? link.source : link.source.id;
    const t = typeof link.target === "string" ? link.target : link.target.id;
    if (highlightSet && highlightSet.has(s) && highlightSet.has(t)) return "rgba(61,237,151,0.6)";
    if (highlightSet) return "rgba(255,255,255,0.02)";
    return "rgba(255,255,255,0.12)";
  };

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {ForceGraph3D && size.w > 0 && (
        <ForceGraph3D
          graphData={data}
          width={size.w}
          height={size.h}
          backgroundColor="#0A0A0B"
          nodeVal={nodeVal}
          nodeColor={nodeColor}
          nodeOpacity={0.95}
          nodeResolution={12}
          nodeLabel={(n: GraphNode) => n.label ?? n.id}
          linkColor={linkColor}
          linkOpacity={0.6}
          linkWidth={0.4}
          linkDirectionalParticles={(link: { source: GraphNode | string; target: GraphNode | string }) => {
            if (!highlightSet) return 1;
            const s = typeof link.source === "string" ? link.source : link.source.id;
            const t = typeof link.target === "string" ? link.target : link.target.id;
            return highlightSet.has(s) && highlightSet.has(t) ? 4 : 0;
          }}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={1.4}
          linkDirectionalParticleColor={(link: { source: GraphNode | string; target: GraphNode | string }) => {
            if (!highlightSet) return "rgba(228,228,231,0.7)";
            const s = typeof link.source === "string" ? link.source : link.source.id;
            const t = typeof link.target === "string" ? link.target : link.target.id;
            return highlightSet.has(s) && highlightSet.has(t) ? "#3DED97" : "rgba(228,228,231,0)";
          }}
          onNodeClick={(node: GraphNode) => select(node.id)}
          onNodeHover={(node: GraphNode | null) => hover(node ? node.id : null)}
          onBackgroundClick={() => select(null)}
          enableNodeDrag={true}
        />
      )}
      {!ForceGraph3D && (
        <div className="absolute inset-0 grid place-items-center text-muted-text font-mono text-xs">
          Initializing 3D engine…
        </div>
      )}
    </div>
  );
}