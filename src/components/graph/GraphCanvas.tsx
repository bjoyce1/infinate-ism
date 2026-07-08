import { useEffect, useMemo, useRef, useState } from "react";
import { forceCollide, forceManyBody, type ForceLink } from "d3-force";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { filterGraph } from "@/lib/graph/filterGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { useServerFn } from "@tanstack/react-start";
import { setNodeImage } from "@/lib/setNodeImage.functions";
import { toast } from "sonner";

type ForceGraphHandle = {
  centerAt: (x: number, y: number, ms?: number) => void;
  zoom: (v: number, ms?: number) => void;
  zoomToFit: (ms?: number, padding?: number) => void;
  d3Force: ((name: string, force: unknown) => ForceGraphHandle) & ((name: string) => unknown);
  d3ReheatSimulation: () => void;
};

const HUB_ID = "site_mrcap1_com";

// Solar-system layout constants (world units).
const RING_BASE = 220;
const RING_GAP = 150;
const HUB_OFFSET = 0; // Sun at origin; planets in upper-right arc naturally place Sun at bottom-left of the fitted view

type SolarPlan = {
  ringOf: Map<string, { ring: number; angle: number }>;
  parentOf: Map<string, string>; // child id -> parent main id
  ringCount: number;
  arc: number;
};

export function GraphCanvas({ graph }: { graph: NormalizedGraph }) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphHandle | null>(null);
  const [ForceGraph, setForceGraph] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
  const [imageTick, setImageTick] = useState(0);
  const [, setPulseTick] = useState(0);

  const selectedId = useGraphStore((s) => s.selectedId);
  const hoveredId = useGraphStore((s) => s.hoveredId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const hideCode = useGraphStore((s) => s.hideCode);
  const includeTsFiles = useGraphStore((s) => s.includeTsFiles);
  const select = useGraphStore((s) => s.select);
  const hover = useGraphStore((s) => s.hover);
  const particleIntensity = useGraphStore((s) => s.particleIntensity);
  const linkIntensity = useGraphStore((s) => s.linkIntensity);
  const recenterToken = useGraphStore((s) => s.recenterToken);
  const autoRotate = useGraphStore((s) => s.autoRotate);
  const pulseNodeId = useGraphStore((s) => s.pulseNodeId);
  const spawnOrbitRadius = useGraphStore((s) => s.spawnOrbitRadius);
  const spawnOrbitSpeed = useGraphStore((s) => s.spawnOrbitSpeed);
  const orbitLayout = useGraphStore((s) => s.orbitLayout);
  const linkStrength = useGraphStore((s) => s.linkStrength);
  const chargeStrength = useGraphStore((s) => s.chargeStrength);
  const collideRadius = useGraphStore((s) => s.collideRadius);
  const centroidPull = useGraphStore((s) => s.centroidPull);
  const ringSpacing = useGraphStore((s) => s.ringSpacing);
  const ringCount = useGraphStore((s) => s.ringCount);
  const sunArcSpread = useGraphStore((s) => s.sunArcSpread);
  const childHaloRadius = useGraphStore((s) => s.childHaloRadius);
  const showOrbitArcs = useGraphStore((s) => s.showOrbitArcs);
  const showSunGlow = useGraphStore((s) => s.showSunGlow);
  const layoutSeed = useGraphStore((s) => s.layoutSeed);
  const layoutResetToken = useGraphStore((s) => s.layoutResetToken);
  // Refs so the injected forces read live values without needing to re-register
  // (re-registering resets particle motion and jitters the layout).
  const linkStrengthRef = useRef(linkStrength);
  const chargeStrengthRef = useRef(chargeStrength);
  const collideRadiusRef = useRef(collideRadius);
  const centroidPullRef = useRef(centroidPull);
  const ringSpacingRef = useRef(ringSpacing);
  const ringCountRef = useRef(ringCount);
  const sunArcSpreadRef = useRef(sunArcSpread);
  const childHaloRadiusRef = useRef(childHaloRadius);
  useEffect(() => { linkStrengthRef.current = linkStrength; }, [linkStrength]);
  useEffect(() => { chargeStrengthRef.current = chargeStrength; }, [chargeStrength]);
  useEffect(() => { collideRadiusRef.current = collideRadius; }, [collideRadius]);
  useEffect(() => { centroidPullRef.current = centroidPull; }, [centroidPull]);
  useEffect(() => { ringSpacingRef.current = ringSpacing; }, [ringSpacing]);
  useEffect(() => { ringCountRef.current = ringCount; }, [ringCount]);
  useEffect(() => { sunArcSpreadRef.current = sunArcSpread; }, [sunArcSpread]);
  useEffect(() => { childHaloRadiusRef.current = childHaloRadius; }, [childHaloRadius]);
  useEffect(() => {
    fgRef.current?.d3ReheatSimulation();
  }, [linkStrength, chargeStrength, collideRadius, centroidPull, ringSpacing, ringCount, sunArcSpread, childHaloRadius]);

  // Build the solar-system plan: rank main nodes by degree, spread them across
  // concentric rings arcing up-and-to-the-right of the Sun (hub). Each non-main
  // node is attached to its most-connected main-node neighbor.
  const solarPlan = useMemo<SolarPlan>(() => {
    const arc = (Math.PI / 2) * sunArcSpread;
    const mains = graph.nodes
      .filter((n) => n.id !== HUB_ID && (n.is_hub || n.image))
      .slice()
      .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0));
    const ringCount = Math.max(1, Math.min(mains.length, ringCountRef.current));
    const perRing = Math.ceil(mains.length / ringCount);
    const ringOf = new Map<string, { ring: number; angle: number }>();
    for (let i = 0; i < mains.length; i++) {
      const ring = Math.floor(i / perRing);
      const idxInRing = i % perRing;
      const countInRing = Math.min(perRing, mains.length - ring * perRing);
      const spacing = arc / Math.max(countInRing, 1);
      const angle = -arc + spacing * (idxInRing + 0.5);
      ringOf.set(mains[i].id, { ring, angle });
    }
    // Anchor Paul Wall next to Swishahouse on the same ring so they consistently
    // start close without overlapping. Angular offset ≈ 90 world units at ring r.
    const swisha = ringOf.get("site_swishahouse");
    if (swisha && ringOf.has("artist_paul_wall")) {
      const rr = RING_BASE + swisha.ring * RING_GAP;
      const delta = Math.min(0.6, 90 / Math.max(rr, 1));
      ringOf.set("artist_paul_wall", { ring: swisha.ring, angle: swisha.angle + delta });
    }
    const mainIds = new Set(mains.map((m) => m.id));
    const parentOf = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.id === HUB_ID) continue;
      if (mainIds.has(n.id)) continue;
      const nbrs = graph.neighbors.get(n.id);
      if (!nbrs) continue;
      let best: string | null = null;
      let bestDeg = -1;
      for (const nb of nbrs) {
        if (!mainIds.has(nb)) continue;
        const d = graph.byId.get(nb)?.degree ?? 0;
        if (d > bestDeg) { bestDeg = d; best = nb; }
      }
      if (best) parentOf.set(n.id, best);
    }
    return { ringOf, parentOf, ringCount, arc };
  }, [graph, sunArcSpread, ringCount]);
  const solarPlanRef = useRef(solarPlan);
  useEffect(() => { solarPlanRef.current = solarPlan; }, [solarPlan]);
  const orbitLayoutRef = useRef(orbitLayout);
  useEffect(() => { orbitLayoutRef.current = orbitLayout; }, [orbitLayout]);
  useEffect(() => {
    // Reheat + relax link distances when toggling so nodes spread out in free-drift
    // mode and re-organize in orbit mode.
    fgRef.current?.d3ReheatSimulation();
  }, [orbitLayout]);

  // Organic force-directed layout, Obsidian-style. No orbits, no fixed rings —
  // d3-force does the work. We just give it good starting positions (spread on
  // a ring, seeded by community) so it settles into readable clusters instead
  // of a chaotic hairball.
  useEffect(() => {
    if (!orbitLayout) return;
    type Pos = GraphNode & { x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number };
    // Seed positions using the solar plan: hub near "bottom-left", planets on
    // rings arcing up-and-right, children in a small halo around their parent.
    const seedStr = String(layoutSeed);
    const hash = (s: string) => {
      let h = 2166136261 ^ (layoutSeed | 0);
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
      return (h >>> 0) / 0xffffffff;
    };
    const plan = solarPlan;
    const halo = 60 * childHaloRadius;
    const spacing = RING_GAP * ringSpacing;

    for (const raw of graph.nodes) {
      const n = raw as Pos;
      n.fx = undefined; n.fy = undefined;
      if (n.id === HUB_ID) {
        n.x = -HUB_OFFSET; n.y = HUB_OFFSET; n.vx = 0; n.vy = 0;
        continue;
      }
      const ring = plan.ringOf.get(n.id);
      if (ring) {
        const rr = RING_BASE + ring.ring * spacing;
        const jitter = (hash(n.id) - 0.5) * 0.08;
        const a = ring.angle + jitter;
        n.x = Math.cos(a) * rr;
        n.y = Math.sin(a) * rr;
      } else {
        const parent = plan.parentOf.get(n.id);
        const p = parent ? plan.ringOf.get(parent) : null;
        if (p) {
          const rr = RING_BASE + p.ring * spacing;
          const px = Math.cos(p.angle) * rr;
          const py = Math.sin(p.angle) * rr;
          const localA = hash(n.id + "|a") * Math.PI * 2;
          const localR = halo * (0.4 + hash(n.id + "|r") * 0.8);
          n.x = px + Math.cos(localA) * localR;
          n.y = py + Math.sin(localA) * localR;
        } else {
          // Untethered nodes: park near the hub in a loose cloud.
          const a = hash(n.id) * Math.PI * 2;
          const rr = 80 + hash(n.id + "|r") * 120;
          n.x = -HUB_OFFSET + Math.cos(a) * rr;
          n.y = HUB_OFFSET + Math.sin(a) * rr;
        }
      }
      n.vx = 0; n.vy = 0;
    }
    fgRef.current?.d3ReheatSimulation();
  }, [graph, orbitLayout, layoutSeed, layoutResetToken, solarPlan, ringSpacing, childHaloRadius]);


  // Refs so the force closure always reads the latest values without re-registering.
  const spawnRadiusRef = useRef(spawnOrbitRadius);
  const spawnSpeedRef = useRef(spawnOrbitSpeed);
  useEffect(() => { spawnRadiusRef.current = spawnOrbitRadius; }, [spawnOrbitRadius]);
  useEffect(() => { spawnSpeedRef.current = spawnOrbitSpeed; }, [spawnOrbitSpeed]);
  // Keep the sim warm when knobs move so changes are visible immediately.
  useEffect(() => {
    fgRef.current?.d3ReheatSimulation();
  }, [spawnOrbitRadius, spawnOrbitSpeed]);

  const setNodeImageFn = useServerFn(setNodeImage);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    label: string;
    image: string | null;
  } | null>(null);
  const closeCtx = () => setCtxMenu(null);

  useEffect(() => {
    if (!ctxMenu) return;
    // Right-click also fires a mousedown (button 2) which would immediately
    // close the menu we just opened — only close on primary/middle clicks.
    const onDown = (e: MouseEvent) => {
      if (e.button === 2) return;
      closeCtx();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCtx();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  // Suppress the browser's native context menu anywhere inside the graph wrapper.
  // React's synthetic onContextMenu can be shadowed by the canvas element in
  // some browsers (Chrome shows "Save image as…" for <canvas>). A capture-phase
  // native listener on the wrapper guarantees preventDefault runs first.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const block = (e: Event) => e.preventDefault();
    el.addEventListener("contextmenu", block, { capture: true });
    return () => el.removeEventListener("contextmenu", block, { capture: true } as EventListenerOptions);
  }, []);

  const mirrorImageToNode = async (nodeId: string, sourceUrl: string | null) => {
    const url = window.prompt(
      "Mirror image to node — paste an image URL:",
      sourceUrl ?? "",
    );
    if (!url) return;
    try {
      new URL(url);
    } catch {
      toast.error("Invalid URL");
      return;
    }
    try {
      await setNodeImageFn({ data: { node_id: nodeId, image_url: url } });
      toast.success("Image mirrored — reloading graph…");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set image");
    }
  };

  // Solar-system force: pull main nodes toward their (ring, angle) polar
  // target, and pull each child node toward its parent planet within a small
  // halo. Hub is soft-pinned at the "Sun" position.
  useEffect(() => {
    if (!ForceGraph || !fgRef.current) return;
    type ClusterNode = GraphNode & { x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number };
    let nodes: ClusterNode[] = [];

    const clusterForce = (alpha: number) => {
      if (!nodes.length || !orbitLayoutRef.current) return;
      const plan = solarPlanRef.current;
      const spacing = RING_GAP * ringSpacingRef.current;
      const halo = 60 * childHaloRadiusRef.current;
      const ringPull = 0.18 * alpha * centroidPullRef.current;
      const childPull = 0.10 * alpha * centroidPullRef.current;
      const sunPull = 0.25 * alpha;
      // Precompute planet positions for children.
      const planetPos = new Map<string, { x: number; y: number }>();
      for (const [id, r] of plan.ringOf) {
        const rr = RING_BASE + r.ring * spacing;
        planetPos.set(id, { x: Math.cos(r.angle) * rr, y: Math.sin(r.angle) * rr });
      }
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        if (n.id === HUB_ID) {
          n.vx = (n.vx ?? 0) + (-HUB_OFFSET - n.x) * sunPull;
          n.vy = (n.vy ?? 0) + (HUB_OFFSET - n.y) * sunPull;
          continue;
        }
        const ring = plan.ringOf.get(n.id);
        if (ring) {
          const rr = RING_BASE + ring.ring * spacing;
          const tx = Math.cos(ring.angle) * rr;
          const ty = Math.sin(ring.angle) * rr;
          n.vx = (n.vx ?? 0) + (tx - n.x) * ringPull;
          n.vy = (n.vy ?? 0) + (ty - n.y) * ringPull;
          continue;
        }
        const parentId = plan.parentOf.get(n.id);
        const p = parentId ? planetPos.get(parentId) : undefined;
        if (p) {
          // Pull child into a halo around parent (keep some slack via halo dist).
          const dx = p.x - n.x; const dy = p.y - n.y;
          const d = Math.hypot(dx, dy) || 1;
          const overshoot = Math.max(0, d - halo);
          n.vx = (n.vx ?? 0) + (dx / d) * overshoot * childPull;
          n.vy = (n.vy ?? 0) + (dy / d) * overshoot * childPull;
        }
      }
    };
    (clusterForce as unknown as { initialize: (n: ClusterNode[]) => void }).initialize = (n) => { nodes = n; };
    fgRef.current.d3Force("orbital", clusterForce);
    // Uniform repulsion so nothing clumps into a blob.
    fgRef.current.d3Force(
      "charge",
      forceManyBody<ClusterNode>()
        .strength((n) => (n.is_hub || n.image ? -120 : -18) * chargeStrengthRef.current)
        .distanceMax(220),
    );
    // Prevent small satellite nodes from overlapping. Image / hub nodes are
    // allowed to overlap freely so main-node art can stack visually.
    const collide = forceCollide<ClusterNode>()
      .radius((n) => {
        const isHub = Boolean(n.is_hub || n.image);
        if (isHub) return 0;
        const base = Math.max(1.5, Math.min(6, 1.5 + Math.sqrt(n.degree ?? 0))) + 4;
        return base * collideRadiusRef.current;
      })
      .strength(1)
      .iterations(3);
    fgRef.current.d3Force("collide", collide);
    // Loosen links between main (hub / image) nodes so highly-connected
    // hubs don't pull each other into a tight ball, but keep them loosely grouped.
    type LinkEndpoint = string | ClusterNode;
    type SimLink = { source: LinkEndpoint; target: LinkEndpoint; weight?: number };
    const isMain = (n: LinkEndpoint) =>
      typeof n === "object" && n !== null && Boolean(n.is_hub || n.image);
    const linkForce = (fgRef.current.d3Force("link") as unknown) as
      | (ForceLink<ClusterNode, SimLink> & { distance: (fn: (l: SimLink) => number) => unknown; strength: (fn: (l: SimLink) => number) => unknown })
      | null;
    if (linkForce) {
      linkForce
        .distance((l) => {
          if (isMain(l.source) && isMain(l.target)) {
            // Heavier weight pulls two main nodes closer together.
            const w = Math.max(1, l.weight ?? 1);
            return Math.max(60, 220 / Math.sqrt(w));
          }
          return 36;
        })
        .strength((l) => {
          const scale = linkStrengthRef.current;
          if (isMain(l.source) && isMain(l.target)) {
            const w = Math.max(1, l.weight ?? 1);
            return Math.min(0.5, 0.02 * w) * scale;
          }
          return 0.55 * scale;
        });
    }
    fgRef.current.d3ReheatSimulation();
  }, [ForceGraph, graph]);
  useEffect(() => {
    if (!pulseNodeId) return;
    let raf = 0;
    const loop = () => {
      setPulseTick((t) => t + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pulseNodeId]);

  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const getImage = (url: string): HTMLImageElement | null => {
    const cache = imageCache.current;
    const existing = cache.get(url);
    if (existing) return existing.complete && existing.naturalWidth > 0 ? existing : null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImageTick((t) => t + 1);
    img.src = url;
    cache.set(url, img);
    return null;
  };

  useEffect(() => {
    let cancelled = false;
    import("react-force-graph-2d").then((m) => {
      if (!cancelled) setForceGraph(() => m.default as React.ComponentType<Record<string, unknown>>);
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

  const data = useMemo(
    () =>
      filterGraph(graph, {
        activeCategories,
        hideCode,
        includeTsFiles,
        activeCommunity,
        focusMode,
        selectedId,
      }),
    [graph, activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId],
  );

  useEffect(() => {
    if (!recenterToken || !fgRef.current) return;
    const hub = data.nodes.find((n) => n.id === HUB_ID) as
      | (GraphNode & { x?: number; y?: number })
      | undefined;
    if (!hub || hub.x == null || hub.y == null) {
      fgRef.current.zoomToFit(600, 60);
      return;
    }
    fgRef.current.centerAt(hub.x, hub.y, 800);
    fgRef.current.zoom(3, 800);
  }, [recenterToken, data]);

  const highlightSet = useMemo(() => {
    const anchor = hoveredId ?? selectedId;
    if (!anchor) return null;
    const set = new Set<string>([anchor]);
    for (const nb of graph.neighbors.get(anchor) ?? []) set.add(nb);
    return set;
  }, [hoveredId, selectedId, graph.neighbors]);

  const nodeCanvasObject = (
    node: GraphNode & { x?: number; y?: number },
    ctx: CanvasRenderingContext2D,
    globalScale: number,
  ) => {
    if (node.x == null || node.y == null) return;
    const isHub = Boolean(node.is_hub || node.image);
    const base = isHub
      ? Math.max(14, Math.min(28, 10 + Math.sqrt(node.degree) * 1.2))
      : Math.max(1.5, Math.min(6, 1.5 + Math.sqrt(node.degree)));
    const isAnchor = node.id === selectedId || node.id === hoveredId;
    const isPulsing = node.id === pulseNodeId;
    const dim = highlightSet != null && !highlightSet.has(node.id);
    const color = node.color ?? CATEGORY_COLORS[node.category];
    ctx.globalAlpha = dim ? 0.15 : 1;
    const img = node.image ? getImage(node.image) : null;
    if (img) {
      ctx.shadowColor = "#F59E0B";
      ctx.shadowBlur = isAnchor ? 30 : 18;
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, base, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, node.x - base, node.y - base, base * 2, base * 2);
      ctx.restore();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(node.x, node.y, base, 0, Math.PI * 2);
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(node.x, node.y, base, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isAnchor ? 18 : 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (isPulsing) {
      const t = (Date.now() % 1600) / 1600;
      const ring = base + 4 + t * 14;
      ctx.beginPath();
      ctx.arc(node.x, node.y, ring, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(252, 211, 77, ${0.85 * (1 - t)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (isAnchor || (globalScale > 2.5 && !dim)) {
      const label = node.label ?? node.id;
      const fontSize = Math.min(10 / globalScale + 2, 6);
      ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#E4E4E7";
      ctx.fillText(label.slice(0, 40), node.x, node.y + base + 2);
    }
    ctx.globalAlpha = 1;
  };

  const linkColor = (link: { source: GraphNode | string; target: GraphNode | string }) => {
    const s = typeof link.source === "string" ? link.source : link.source.id;
    const t = typeof link.target === "string" ? link.target : link.target.id;
    if (highlightSet && (highlightSet.has(s) && highlightSet.has(t))) return "rgba(61,237,151,0.5)";
    if (highlightSet) return "rgba(255,255,255,0.03)";
    return "rgba(255,255,255,0.08)";
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Static starfield background — never rotates or orbits with the nodes */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: "#0A0A0B",
          backgroundImage: [
            "radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.55), transparent 60%)",
            "radial-gradient(1px 1px at 78% 32%, rgba(255,255,255,0.45), transparent 60%)",
            "radial-gradient(1.2px 1.2px at 44% 74%, rgba(255,255,255,0.5), transparent 60%)",
            "radial-gradient(1px 1px at 88% 82%, rgba(255,255,255,0.35), transparent 60%)",
            "radial-gradient(1px 1px at 26% 58%, rgba(255,255,255,0.4), transparent 60%)",
            "radial-gradient(1.5px 1.5px at 62% 12%, rgba(255,255,255,0.35), transparent 60%)",
            "radial-gradient(1px 1px at 8% 88%, rgba(255,255,255,0.3), transparent 60%)",
            "radial-gradient(1px 1px at 96% 54%, rgba(255,255,255,0.35), transparent 60%)",
            "radial-gradient(circle at 50% 50%, rgba(61,237,151,0.05), transparent 70%)",
          ].join(", "),
          backgroundSize: "600px 600px, 720px 720px, 540px 540px, 800px 800px, 660px 660px, 700px 700px, 620px 620px, 580px 580px, 100% 100%",
        }}
      />
      <div
        className="absolute inset-0"
        style={
          autoRotate
            ? { animation: "graph-spin 60s linear infinite", transformOrigin: "50% 50%" }
            : undefined
        }
      >
      {ForceGraph && size.w > 0 && (
        <ForceGraph
          ref={fgRef as unknown as React.Ref<unknown>}
          graphData={data}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          nodeCanvasObject={nodeCanvasObject}
          onRenderFramePre={(ctx: CanvasRenderingContext2D, globalScale: number) => {
            if (!orbitLayout) return;
            const plan = solarPlan;
            const spacing = RING_GAP * ringSpacing;
            const arc = plan.arc;
            ctx.save();
            ctx.lineWidth = 0.6 / globalScale;
            if (showOrbitArcs) {
              for (let r = 0; r < plan.ringCount; r++) {
                const rr = RING_BASE + r * spacing;
                ctx.strokeStyle = `rgba(180,200,255,${0.08 + (r % 2 === 0 ? 0.02 : 0)})`;
                ctx.beginPath();
                ctx.arc(-HUB_OFFSET, HUB_OFFSET, rr, -arc - 0.15, 0.15);
                ctx.stroke();
              }
            }
            if (showSunGlow) {
              // Sun glow
              const grad = ctx.createRadialGradient(-HUB_OFFSET, HUB_OFFSET, 0, -HUB_OFFSET, HUB_OFFSET, 90);
              grad.addColorStop(0, "rgba(255,170,60,0.35)");
              grad.addColorStop(1, "rgba(255,170,60,0)");
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(-HUB_OFFSET, HUB_OFFSET, 90, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }}
          nodePointerAreaPaint={(node: GraphNode & { x?: number; y?: number }, color: string, ctx: CanvasRenderingContext2D) => {
            if (node.x == null || node.y == null) return;
            const isHub = Boolean(node.is_hub || node.image);
            const base = isHub
              ? Math.max(14, Math.min(28, 10 + Math.sqrt(node.degree) * 1.2))
              : Math.max(1.5, Math.min(6, 1.5 + Math.sqrt(node.degree)));
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, Math.max(base, 8), 0, Math.PI * 2);
            ctx.fill();
          }}
          linkColor={linkColor}
          linkWidth={0.6 * linkIntensity}
          linkDirectionalParticles={(link: { source: GraphNode | string; target: GraphNode | string }) => {
            const base = highlightSet ? 0 : 1;
            const s = typeof link.source === "string" ? link.source : link.source.id;
            const t = typeof link.target === "string" ? link.target : link.target.id;
            const hi = highlightSet && highlightSet.has(s) && highlightSet.has(t) ? 4 : base;
            return Math.round(hi * particleIntensity);
          }}
          linkDirectionalParticleSpeed={(link: { source: GraphNode | string; target: GraphNode | string }) => {
            if (!highlightSet) return 0.004;
            const s = typeof link.source === "string" ? link.source : link.source.id;
            const t = typeof link.target === "string" ? link.target : link.target.id;
            return highlightSet.has(s) && highlightSet.has(t) ? 0.008 : 0.004;
          }}
          linkDirectionalParticleWidth={(link: { source: GraphNode | string; target: GraphNode | string }) => {
            if (!highlightSet) return 1.4 * particleIntensity;
            const s = typeof link.source === "string" ? link.source : link.source.id;
            const t = typeof link.target === "string" ? link.target : link.target.id;
            return highlightSet.has(s) && highlightSet.has(t) ? 2.4 * particleIntensity : 0;
          }}
          linkDirectionalParticleColor={(link: { source: GraphNode | string; target: GraphNode | string }) => {
            if (!highlightSet) return "rgba(228,228,231,0.55)";
            const s = typeof link.source === "string" ? link.source : link.source.id;
            const t = typeof link.target === "string" ? link.target : link.target.id;
            return highlightSet.has(s) && highlightSet.has(t) ? "#3DED97" : "rgba(228,228,231,0)";
          }}
          cooldownTicks={Infinity}
          d3AlphaDecay={0}
          d3AlphaMin={0}
          d3VelocityDecay={0.65}
          onNodeClick={(node: GraphNode) => select(node.id)}
          onNodeHover={(node: GraphNode | null) => hover(node ? node.id : null)}
          onBackgroundClick={() => select(null)}
          onNodeRightClick={(
            node: GraphNode,
            event: MouseEvent,
          ) => {
            event.preventDefault();
            setCtxMenu({
              x: event.clientX,
              y: event.clientY,
              nodeId: node.id,
              label: node.label ?? node.id,
              image: node.image ?? null,
            });
          }}
          enableNodeDrag={true}
        />
      )}
      {!ForceGraph && (
        <div className="absolute inset-0 grid place-items-center text-muted-text font-mono text-xs">
          Initializing graph engine…
        </div>
      )}
      </div>
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[220px] rounded-md border border-white/10 bg-[#0f0f11]/95 shadow-xl backdrop-blur-sm py-1 font-mono text-xs text-zinc-200"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 truncate">
            {ctxMenu.label}
          </div>
          <div className="h-px bg-white/10" />
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
            disabled={!ctxMenu.image}
            onClick={() => {
              const src = ctxMenu.image;
              closeCtx();
              if (src) mirrorImageToNode(ctxMenu.nodeId, src);
            }}
          >
            Mirror image to node
            {!ctxMenu.image && (
              <span className="block text-[10px] text-zinc-500">no image available</span>
            )}
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-white/5"
            onClick={() => {
              const id = ctxMenu.nodeId;
              const cur = ctxMenu.image;
              closeCtx();
              mirrorImageToNode(id, cur);
            }}
          >
            Set image from URL…
          </button>
        </div>
      )}
    </div>
  );
}