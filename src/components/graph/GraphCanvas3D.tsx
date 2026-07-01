import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import SpriteText from "three-spritetext";

type Vec3 = { x: number; y: number; z: number };
type ThreeCamera = {
  position: Vec3;
  projectionMatrix: unknown;
  matrixWorldInverse: unknown;
};
type ThreeSprite = {
  position: { set: (x: number, y: number, z: number) => void };
  visible: boolean;
  scale: { set: (x: number, y: number, z: number) => void };
  material: { opacity: number; transparent: boolean; depthWrite: boolean };
  center: { set: (x: number, y: number) => void };
  __label?: string;
  __node?: GraphNode;
};
type NodeWithCoords = GraphNode & { x?: number; y?: number; z?: number };

export function GraphCanvas3D({ graph }: { graph: NormalizedGraph }) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<{
    zoomToFit: (ms?: number, padding?: number) => void;
    cameraPosition: (pos: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }, ms?: number) => void;
    camera: () => ThreeCamera;
    scene: () => unknown;
    renderer: () => { domElement: HTMLCanvasElement };
  } | null>(null);
  const [ForceGraph3D, setForceGraph3D] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const spritesRef = useRef<Map<string, ThreeSprite>>(new Map());
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
  const highlightRef = useRef(highlightSet);
  const selectedRef = useRef(selectedId);
  useEffect(() => {
    highlightRef.current = highlightSet;
    selectedRef.current = selectedId;
  }, [highlightSet, selectedId]);

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

    const tick = async () => {
      if (stopped) return;
      const fg = fgRef.current;
      const sprites = spritesRef.current;
      if (fg && sprites.size > 0) {
        try {
          const THREE = await import("three");
          const camera = fg.camera() as unknown as {
            position: { distanceTo: (v: unknown) => number };
          };
          const renderer = fg.renderer();
          const canvas = renderer.domElement;
          const w = canvas.clientWidth;
          const h = canvas.clientHeight;

          type Entry = {
            sprite: ThreeSprite;
            node: NodeWithCoords;
            sx: number;
            sy: number;
            halfW: number;
            halfH: number;
            priority: number;
            inFront: boolean;
          };
          const entries: Entry[] = [];
          const vec = new (THREE as unknown as { Vector3: new (x?: number, y?: number, z?: number) => { x: number; y: number; z: number; project: (c: unknown) => { x: number; y: number; z: number } } }).Vector3();

          sprites.forEach((sprite) => {
            const node = sprite.__node as NodeWithCoords | undefined;
            if (!node || node.x == null) return;
            vec.x = node.x;
            vec.y = node.y ?? 0;
            vec.z = node.z ?? 0;
            const worldX = vec.x;
            const worldY = vec.y;
            const worldZ = vec.z;
            vec.project(camera);
            const inFront = vec.z < 1 && vec.z > -1;
            const sx = (vec.x * 0.5 + 0.5) * w;
            const sy = (-vec.y * 0.5 + 0.5) * h;
            const dist = camera.position.distanceTo({ x: worldX, y: worldY, z: worldZ } as unknown);
            // approximate label footprint in pixels
            const label = sprite.__label ?? "";
            const halfH = 8;
            const halfW = Math.max(20, label.length * 3.6);
            const hi = highlightRef.current;
            const sel = selectedRef.current;
            let priority = node.degree || 0;
            if (hi && hi.has(node.id)) priority += 10000;
            if (sel === node.id) priority += 100000;
            // fade with distance
            const fade = Math.max(0, Math.min(1, 1 - (dist - 120) / 600));
            sprite.material.opacity = fade;
            entries.push({ sprite, node, sx, sy, halfW, halfH, priority, inFront });
          });

          entries.sort((a, b) => b.priority - a.priority);
          const placed: Entry[] = [];
          for (const e of entries) {
            if (!e.inFront || e.material_opacity_zero()) {
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
              e.sprite.visible = e.sprite.material.opacity > 0.05;
              if (e.sprite.visible) placed.push(e);
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
          nodeLabel={(n: GraphNode) => n.label ?? n.id}
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