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

// Radial-tree layout constants (world units). Hub at origin, mains on
// concentric full-circle rings, children branch outward from their parent.
const RING_BASE = 260;
const RING_GAP = 190;
const HUB_OFFSET = 0;

// Obsidian palette
const COLOR_BG = "#0a0a0f";
const COLOR_LINK = "rgba(124,156,255,0.14)";
const COLOR_LINK_HI = "rgba(61,237,208,0.75)";
const COLOR_LINK_DIM = "rgba(255,255,255,0.025)";
const COLOR_NODE = "#7c9cff";
const COLOR_NODE_HI = "#3dedd0";
const COLOR_LABEL = "#c9d1e0";
const COLOR_IMG_BORDER = "#3dedd0";
const COLOR_IMG_GLOW = "#7c9cff";

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
  const parentAttract = useGraphStore((s) => s.parentAttract);
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
  const sunArcSpreadRef = useRef(sunArcSpread);
  const childHaloRadiusRef = useRef(childHaloRadius);
  const parentAttractRef = useRef(parentAttract);
  useEffect(() => { linkStrengthRef.current = linkStrength; }, [linkStrength]);
  useEffect(() => { chargeStrengthRef.current = chargeStrength; }, [chargeStrength]);
  useEffect(() => { collideRadiusRef.current = collideRadius; }, [collideRadius]);
  useEffect(() => { centroidPullRef.current = centroidPull; }, [centroidPull]);
  useEffect(() => { ringSpacingRef.current = ringSpacing; }, [ringSpacing]);
  useEffect(() => { sunArcSpreadRef.current = sunArcSpread; }, [sunArcSpread]);
  useEffect(() => { childHaloRadiusRef.current = childHaloRadius; }, [childHaloRadius]);
  useEffect(() => { parentAttractRef.current = parentAttract; }, [parentAttract]);
  useEffect(() => {
    fgRef.current?.d3ReheatSimulation();
  }, [linkStrength, chargeStrength, collideRadius, centroidPull, ringSpacing, ringCount, sunArcSpread, childHaloRadius, parentAttract]);

  // Build the solar-system plan: rank main nodes by degree, spread them across
  // concentric rings arcing up-and-to-the-right of the Sun (hub). Each non-main
  // node is attached to its most-connected main-node neighbor.
  const solarPlan = useMemo<SolarPlan>(() => {
    // Radial-tree layout: hub at center, main nodes distributed on
    // concentric FULL-CIRCLE rings, grouped by community for angular
    // coherence. Children branch outward from their parent's angle.
    const arc = Math.PI * 2; // full circle
    const mains = graph.nodes
      .filter((n) => n.id !== HUB_ID && (n.is_hub || n.image))
      .slice()
      .sort((a, b) => {
        const ca = a.community ?? 999;
        const cb = b.community ?? 999;
        if (ca !== cb) return ca - cb;
        return (b.degree ?? 0) - (a.degree ?? 0);
      });
    const effectiveRingCount = Math.max(1, Math.min(mains.length, ringCount));
    const perRing = Math.ceil(mains.length / effectiveRingCount);
    const ringOf = new Map<string, { ring: number; angle: number }>();
    for (let i = 0; i < mains.length; i++) {
      const ring = Math.floor(i / perRing);
      const idxInRing = i % perRing;
      const countInRing = Math.min(perRing, mains.length - ring * perRing);
      const spacing = arc / Math.max(countInRing, 1);
      // Offset alternate rings so nodes don't align radially and links don't overlap.
      const ringOffset = (ring % 2) * spacing * 0.5;
      const angle = spacing * idxInRing + ringOffset;
      ringOf.set(mains[i].id, { ring, angle });
    }
    // Keep Paul Wall adjacent to Swishahouse.
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
    return { ringOf, parentOf, ringCount: effectiveRingCount, arc };
  }, [graph, ringCount]);
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
          // Branch radially OUTWARD from the parent along its ring angle,
          // with a small angular spread — gives a clean tree silhouette.
          const rr = RING_BASE + p.ring * spacing;
          const angularSpread = 0.35; // radians
          const branchAngle = p.angle + (hash(n.id + "|a") - 0.5) * angularSpread;
          const branchDist = rr + halo * (0.5 + hash(n.id + "|r") * 1.6);
          n.x = Math.cos(branchAngle) * branchDist;
          n.y = Math.sin(branchAngle) * branchDist;
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
      // Stronger, always-on child→parent pull so spawns stay tight to their
      // parent planet instead of drifting across the canvas.
      const childPull = 0.35 * alpha * centroidPullRef.current * parentAttractRef.current;
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
          // Pull child toward a target point that sits OUTWARD along the
          // parent's radial direction — this keeps the tree branching outward
          // from the hub instead of collapsing on top of the parent.
          const pr = Math.hypot(p.x, p.y) || 1;
          const outX = p.x + (p.x / pr) * halo * 1.2;
          const outY = p.y + (p.y / pr) * halo * 1.2;
          const dx = outX - n.x; const dy = outY - n.y;
          const d = Math.hypot(dx, dy) || 1;
          const inside = Math.min(d, halo);
          const overshoot = Math.max(0, d - halo);
          const magnitude = inside * 0.35 + overshoot * 1.5;
          n.vx = (n.vx ?? 0) + (dx / d) * magnitude * childPull;
          n.vy = (n.vy ?? 0) + (dy / d) * magnitude * childPull;
        }
      }
    };
    (clusterForce as unknown as { initialize: (n: ClusterNode[]) => void }).initialize = (n) => { nodes = n; };
    fgRef.current.d3Force("orbital", clusterForce);
    // Uniform repulsion so nothing clumps into a blob.
    fgRef.current.d3Force(
      "charge",
      forceManyBody<ClusterNode>()
        // Weaker repulsion on satellites so they stay clustered around their
        // parent planet instead of pushing each other outward.
        .strength((n) => (n.is_hub || n.image ? -120 : -8) * chargeStrengthRef.current)
        .distanceMax(160),
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
          // Short, stiff link between a child and its parent keeps spawn
          // clusters glued to the planet they belong to.
          return 28;
        })
        .strength((l) => {
          const scale = linkStrengthRef.current;
          if (isMain(l.source) && isMain(l.target)) {
            const w = Math.max(1, l.weight ?? 1);
            return Math.min(0.5, 0.02 * w) * scale;
          }
          return 0.9 * scale;
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
      ctx.shadowColor = isAnchor ? COLOR_IMG_BORDER : COLOR_IMG_GLOW;
      ctx.shadowBlur = isAnchor ? 26 : 14;
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
      ctx.strokeStyle = isAnchor ? COLOR_IMG_BORDER : "rgba(124,156,255,0.55)";
      ctx.lineWidth = isAnchor ? 1.75 : 1;
      ctx.stroke();
    } else {
      const fill = isAnchor ? COLOR_NODE_HI : (isHub ? COLOR_NODE : color);
      ctx.beginPath();
      ctx.arc(node.x, node.y, base, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.shadowColor = fill;
      ctx.shadowBlur = isAnchor ? 16 : 4;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (isPulsing) {
      const t = (Date.now() % 1600) / 1600;
      const ring = base + 4 + t * 14;
      ctx.beginPath();
      ctx.arc(node.x, node.y, ring, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(61, 237, 208, ${0.85 * (1 - t)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (isAnchor || (globalScale > 2.5 && !dim)) {
      const label = node.label ?? node.id;
      const fontSize = Math.min(10 / globalScale + 2, 6);
      ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isAnchor ? COLOR_NODE_HI : COLOR_LABEL;
      ctx.fillText(label.slice(0, 40), node.x, node.y + base + 2);
    }
    ctx.globalAlpha = 1;
  };

  const linkColor = (link: { source: GraphNode | string; target: GraphNode | string }) => {
    const s = typeof link.source === "string" ? link.source : link.source.id;
    const t = typeof link.target === "string" ? link.target : link.target.id;
    if (highlightSet && (highlightSet.has(s) && highlightSet.has(t))) return COLOR_LINK_HI;
    if (highlightSet) return COLOR_LINK_DIM;
    return COLOR_LINK;
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Obsidian backdrop — near-black with a subtle dot grid + cool radial haze */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: COLOR_BG,
          backgroundImage: [
            "radial-gradient(rgba(124,156,255,0.06) 1px, transparent 1px)",
            "radial-gradient(circle at 50% 50%, rgba(61,237,208,0.06), transparent 65%)",
            "radial-gradient(circle at 50% 50%, rgba(124,156,255,0.08), transparent 80%)",
          ].join(", "),
          backgroundSize: "22px 22px, 100% 100%, 100% 100%",
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
                ctx.strokeStyle = `rgba(201,154,86,${0.10 + (r % 2 === 0 ? 0.03 : 0)})`;
                ctx.setLineDash([2 / globalScale, 4 / globalScale]);
                ctx.beginPath();
                ctx.arc(-HUB_OFFSET, HUB_OFFSET, rr, -arc - 0.15, 0.15);
                ctx.stroke();
                ctx.setLineDash([]);
              }
            }
            if (showSunGlow) {
              // Sun glow
              const grad = ctx.createRadialGradient(-HUB_OFFSET, HUB_OFFSET, 0, -HUB_OFFSET, HUB_OFFSET, 110);
              grad.addColorStop(0, "rgba(245,211,63,0.42)");
              grad.addColorStop(0.5, "rgba(209,138,58,0.18)");
              grad.addColorStop(1, "rgba(209,138,58,0)");
              ctx.fillStyle = grad;
              ctx.beginPath();
                ctx.arc(-HUB_OFFSET, HUB_OFFSET, 110, 0, Math.PI * 2);
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
            if (!highlightSet) return "rgba(232,192,138,0.55)";
            const s = typeof link.source === "string" ? link.source : link.source.id;
            const t = typeof link.target === "string" ? link.target : link.target.id;
            return highlightSet.has(s) && highlightSet.has(t) ? "#F5D33F" : "rgba(232,192,138,0)";
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