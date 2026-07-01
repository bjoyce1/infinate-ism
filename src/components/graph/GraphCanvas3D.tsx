import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import SpriteText from "three-spritetext";

type LabelSprite = SpriteText & {
  visible: boolean;
  material: { opacity: number; transparent: boolean; depthWrite: boolean };
  center: { set: (x: number, y: number) => void };
  __node?: NodeWithCoords;
  __label?: string;
};
type NodeWithCoords = GraphNode & { x?: number; y?: number; z?: number };
type ScreenPos = { x: number; y: number };
type FgHandle = {
  zoomToFit: (ms?: number, padding?: number) => void;
  cameraPosition: (
    pos: { x: number; y: number; z: number },
    lookAt?: { x: number; y: number; z: number },
    ms?: number,
  ) => void;
  camera: () => { position: { x: number; y: number; z: number } };
  renderer: () => { domElement: HTMLCanvasElement };
  graph2ScreenCoords: (x: number, y: number, z: number) => ScreenPos;
};

export function GraphCanvas3D({ graph }: { graph: NormalizedGraph }) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FgHandle | null>(null);
  const [ForceGraph3D, setForceGraph3D] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const spritesRef = useRef<Map<string, LabelSprite>>(new Map());
  const rafRef = useRef<number | null>(null);

  const selectedId = useGraphStore((s) => s.selectedId);
  const hoveredId = useGraphStore((s) => s.hoveredId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const select = useGraphStore((s) => s.select);
  const hover = useGraphStore((s) => s.hover);
  const particleIntensity = useGraphStore((s) => s.particleIntensity);
  const linkIntensity = useGraphStore((s) => s.linkIntensity);
  const cameraResetToken = useGraphStore((s) => s.cameraResetToken);
  const showLabels = useGraphStore((s) => s.showLabels);
  const labelSize = useGraphStore((s) => s.labelSize);
  const labelDensity = useGraphStore((s) => s.labelDensity);
  const showLabelsRef = useRef(showLabels);
  const labelSizeRef = useRef(labelSize);
  const labelDensityRef = useRef(labelDensity);
  useEffect(() => {
    showLabelsRef.current = showLabels;
    labelSizeRef.current = labelSize;
    labelDensityRef.current = labelDensity;
    // Live-update text height on existing sprites without rebuilding graph.
    spritesRef.current.forEach((sprite) => {
      const deg = sprite.__node?.degree ?? 0;
      sprite.textHeight = Math.max(2, (3 + Math.min(4, deg / 6)) * labelSize);
    });
  }, [showLabels, labelSize, labelDensity]);

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

  // Drop cached sprites for nodes no longer in the filtered set so the
  // collision loop doesn't try to place stale labels.
  useEffect(() => {
    const ids = new Set(data.nodes.map((n) => n.id));
    for (const key of Array.from(spritesRef.current.keys())) {
      if (!ids.has(key)) spritesRef.current.delete(key);
    }
  }, [data]);

  const highlightSet = useMemo(() => {
    const anchor = hoveredId ?? selectedId;
    if (!anchor) return null;
    const set = new Set<string>([anchor]);
    for (const nb of graph.neighbors.get(anchor) ?? []) set.add(nb);
    return set;
  }, [hoveredId, selectedId, graph.neighbors]);
  const highlightRef = useRef(highlightSet);
  const selectedRef = useRef(selectedId);
  const focusRef = useRef(focusMode);
  const focusNeighborhoodRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    highlightRef.current = highlightSet;
    selectedRef.current = selectedId;
    focusRef.current = focusMode;
    if (focusMode && selectedId) {
      const set = new Set<string>([selectedId]);
      for (const nb of graph.neighbors.get(selectedId) ?? []) set.add(nb);
      focusNeighborhoodRef.current = set;
    } else {
      focusNeighborhoodRef.current = null;
    }
  }, [highlightSet, selectedId, focusMode, graph.neighbors]);

  // Hover tooltip: track hovered node's screen position each frame.
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(hoveredId);
  useEffect(() => {
    hoveredRef.current = hoveredId;
    const el = tooltipRef.current;
    if (el && !hoveredId) el.style.display = "none";
  }, [hoveredId]);

  useEffect(() => {
    if (!fgRef.current) return;
    fgRef.current.cameraPosition({ x: 0, y: 0, z: 400 }, { x: 0, y: 0, z: 0 }, 800);
    setTimeout(() => fgRef.current?.zoomToFit(600, 60), 850);
  }, [cameraResetToken]);

  // Collision-aware label loop: project every labeled node to screen space,
  // sort by importance, and hide labels whose bounding box overlaps a
  // higher-priority one already placed.
  useEffect(() => {
    if (!ForceGraph3D) return;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const fg = fgRef.current;
      const sprites = spritesRef.current;
      if (fg && sprites.size > 0) {
        try {
          // Global label toggle: hide every sprite and skip placement work.
          if (!showLabelsRef.current) {
            sprites.forEach((s) => {
              s.visible = false;
            });
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          const cam = fg.camera();
          const canvas = fg.renderer().domElement;
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;

          type Entry = {
            sprite: LabelSprite;
            node: NodeWithCoords;
            sx: number;
            sy: number;
            halfW: number;
            halfH: number;
            priority: number;
            visibleOnScreen: boolean;
          };
          const entries: Entry[] = [];

          sprites.forEach((sprite) => {
            const node = sprite.__node;
            if (!node || node.x == null) return;
            const nx = node.x;
            const ny = node.y ?? 0;
            const nz = node.z ?? 0;
            const p = fg.graph2ScreenCoords(nx, ny, nz);
            const sx = p.x;
            const sy = p.y;
            const visibleOnScreen =
              sx >= -100 && sx <= w + 100 && sy >= -100 && sy <= h + 100;
            const dx = cam.position.x - nx;
            const dy = cam.position.y - ny;
            const dz = cam.position.z - nz;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const label = sprite.__label ?? "";
            // Bigger labels demand more space; higher density shrinks the
            // reserved bbox so more labels fit before overlap culling kicks in.
            const sizeMul = labelSizeRef.current;
            const densityMul = 1 / Math.max(0.2, labelDensityRef.current);
            const halfH = 8 * sizeMul * densityMul;
            const halfW = Math.max(20, label.length * 3.6) * sizeMul * densityMul;
            const hi = highlightRef.current;
            const sel = selectedRef.current;
            const focusSet = focusNeighborhoodRef.current;
            let priority = node.degree || 0;
            if (hi && hi.has(node.id)) priority += 10000;
            if (sel === node.id) priority += 100000;
            // In Focus Mode, the selected node's neighborhood is the entire
            // visible graph — promote those labels above every other signal
            // so they're placed first and win any overlap contest.
            if (focusSet && focusSet.has(node.id)) priority += 1_000_000;
            // fade with distance so far-away labels dim before overlap-culling
            const fade = Math.max(0, Math.min(1, 1 - (dist - 150) / 700));
            sprite.material.opacity = fade;
            entries.push({
              sprite,
              node,
              sx,
              sy,
              halfW,
              halfH,
              priority,
              visibleOnScreen,
            });
          });

          entries.sort((a, b) => b.priority - a.priority);
          const placed: Entry[] = [];
          for (const e of entries) {
            if (!e.visibleOnScreen || e.sprite.material.opacity <= 0.05) {
              e.sprite.visible = false;
              continue;
            }
            let overlap = false;
            for (const p of placed) {
              if (
                Math.abs(e.sx - p.sx) < e.halfW + p.halfW &&
                Math.abs(e.sy - p.sy) < e.halfH + p.halfH
              ) {
                overlap = true;
                break;
              }
            }
            if (overlap) {
              e.sprite.visible = false;
            } else {
              e.sprite.visible = true;
              placed.push(e);
            }
          }

          // Update hover tooltip position imperatively — avoid React re-renders
          // per frame, which would rebuild ForceGraph3D scene props and freeze.
          const hid = hoveredRef.current;
          const tipEl = tooltipRef.current;
          if (tipEl) {
            const hoveredNode = hid ? sprites.get(hid)?.__node : null;
            if (hoveredNode && hoveredNode.x != null) {
              const p = fg.graph2ScreenCoords(
                hoveredNode.x,
                hoveredNode.y ?? 0,
                hoveredNode.z ?? 0,
              );
              if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
                const text = hoveredNode.label ?? hoveredNode.id;
                if (tipEl.textContent !== text) tipEl.textContent = text;
                tipEl.style.transform = `translate(${Math.round(p.x) + 12}px, ${Math.round(p.y)}px) translateY(-50%)`;
                tipEl.style.display = "block";
              } else {
                tipEl.style.display = "none";
              }
            } else {
              tipEl.style.display = "none";
            }
          }
        } catch {
          // ignore transient frame errors
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [ForceGraph3D]);

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
          ref={fgRef as unknown as React.Ref<unknown>}
          graphData={data}
          width={size.w}
          height={size.h}
          backgroundColor="#0A0A0B"
          nodeVal={nodeVal}
          nodeColor={nodeColor}
          nodeOpacity={0.95}
          nodeResolution={12}
          nodeLabel={() => ""}
          linkColor={linkColor}
          linkOpacity={Math.min(1, 0.6 * linkIntensity)}
          linkWidth={0.4 * linkIntensity}
          linkDirectionalParticles={(link: { source: GraphNode | string; target: GraphNode | string }) => {
            const base = highlightSet ? 0 : 1;
            const s = typeof link.source === "string" ? link.source : link.source.id;
            const t = typeof link.target === "string" ? link.target : link.target.id;
            const hi = highlightSet && highlightSet.has(s) && highlightSet.has(t) ? 4 : base;
            return Math.round(hi * particleIntensity);
          }}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={1.4 * particleIntensity}
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
          enableNavigationControls={true}
          controlType="orbit"
          showNavInfo={false}
          nodeThreeObjectExtend={true}
          nodeThreeObject={(node: NodeWithCoords) => {
            const label = node.label ?? node.id;
            const sprite = new SpriteText(label) as LabelSprite;
            sprite.color = "#E4E4E7";
            sprite.backgroundColor = "rgba(10,10,11,0.55)";
            sprite.padding = 1.5;
            sprite.borderRadius = 2;
            sprite.textHeight = Math.max(2, (3 + Math.min(4, (node.degree || 0) / 6)) * labelSizeRef.current);
            sprite.material.depthWrite = false;
            sprite.material.transparent = true;
            sprite.material.opacity = 1;
            sprite.center.set(0.5, -0.6);
            sprite.__node = node;
            sprite.__label = label;
            spritesRef.current.set(node.id, sprite);
            return sprite;
          }}
        />
      )}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-20 rounded border border-white/10 bg-black/85 px-2 py-1 font-mono text-[11px] text-zinc-100 shadow-lg backdrop-blur-sm"
        style={{
          display: "none",
          maxWidth: 320,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          willChange: "transform",
        }}
      />
      {!ForceGraph3D && (
        <div className="absolute inset-0 grid place-items-center text-muted-text font-mono text-xs">
          Initializing 3D engine…
        </div>
      )}
    </div>
  );
}