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

  // Pre-compute an initial orbit layout for every node the moment the graph
  // loads, so the organization is visible immediately instead of settling in.
  // Mutates x/y on the node objects — d3-force uses these as initial positions.
  useEffect(() => {
    type Pos = GraphNode & { x?: number; y?: number; vx?: number; vy?: number };
    // Parent map for spawn links (same logic as the orbital force).
    const parentOf = new Map<string, string>();
    const childrenOf = new Map<string, string[]>();
    for (const l of graph.links) {
      if (l.relation !== "spawn") continue;
      const s = typeof l.source === "string" ? l.source : (l.source as { id: string }).id;
      const t = typeof l.target === "string" ? l.target : (l.target as { id: string }).id;
      const sn = graph.byId.get(s);
      const tn = graph.byId.get(t);
      if (!sn || !tn) continue;
      const sMain = Boolean(sn.is_hub || sn.image);
      const tMain = Boolean(tn.is_hub || tn.image);
      const parent = sMain && !tMain ? s : !sMain && tMain ? t : s;
      const child = parent === s ? t : s;
      if (parent === child) continue;
      if (!parentOf.has(child)) parentOf.set(child, parent);
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(child);
    }
    // Community slot ring (mirrors recomputeSlots in the orbital force).
    const communitySizes = new Map<number | string, number>();
    for (const n of graph.nodes) {
      const k = n.community ?? "__none";
      communitySizes.set(k, (communitySizes.get(k) ?? 0) + 1);
    }
    const commKeys = [...communitySizes.keys()].sort(
      (a, b) => (communitySizes.get(b) ?? 0) - (communitySizes.get(a) ?? 0),
    );
    const N = Math.max(commKeys.length, 1);
    const ringR = 180 + Math.sqrt(N) * 90;
    const commAnchor = new Map<number | string, { cx: number; cy: number; size: number }>();
    commKeys.forEach((k, i) => {
      const angle = (i / N) * Math.PI * 2;
      commAnchor.set(k, {
        cx: Math.cos(angle) * ringR,
        cy: Math.sin(angle) * ringR,
        size: communitySizes.get(k) ?? 1,
      });
    });
    // Deterministic angle per node id — same graph = same layout every load.
    const hash = (s: string) => {
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
      return (h >>> 0) / 0xffffffff;
    };
    // First pass: place hubs + non-spawn nodes on their community ring.
    for (const raw of graph.nodes) {
      const n = raw as Pos;
      if (parentOf.has(n.id)) continue; // spawn children handled below
      const a = commAnchor.get(n.community ?? "__none");
      if (!a) continue;
      if (n.is_hub || n.image) {
        // Main node sits at the community anchor.
        n.x = a.cx;
        n.y = a.cy;
      } else {
        const orbitR = 22 + Math.sqrt(a.size) * 8;
        const theta = hash(n.id) * Math.PI * 2;
        n.x = a.cx + Math.cos(theta) * orbitR;
        n.y = a.cy + Math.sin(theta) * orbitR;
      }
      n.vx = 0;
      n.vy = 0;
    }
    // Second pass: spawn children get evenly-spaced slots around their parent.
    for (const [parentId, kids] of childrenOf) {
      const p = graph.byId.get(parentId) as Pos | undefined;
      if (!p || p.x == null || p.y == null) continue;
      const siblings = kids.length;
      const orbitR = 26 + Math.sqrt(siblings) * 6;
      kids.forEach((cid, i) => {
        const n = graph.byId.get(cid) as Pos | undefined;
        if (!n) return;
        // Evenly spaced + a per-parent phase so different parents don't align.
        const theta = (i / siblings) * Math.PI * 2 + hash(parentId) * Math.PI * 2;
        n.x = (p.x ?? 0) + Math.cos(theta) * orbitR;
        n.y = (p.y ?? 0) + Math.sin(theta) * orbitR;
        n.vx = 0;
        n.vy = 0;
      });
    }
    // If the sim is already running, kick it so it picks up the new positions.
    fgRef.current?.d3ReheatSimulation();
  }, [graph]);

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

  // Orbital motion — inject a custom tangential force around each community's
  // centroid, and keep the simulation permanently warm so orbits never freeze.
  useEffect(() => {
    if (!ForceGraph || !fgRef.current) return;
    type OrbitNode = GraphNode & {
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
    };
    // Build a parent map for spawn children so they orbit their originating
    // main node instead of drifting around the community centroid.
    const parentOf = new Map<string, string>();
    const childrenOf = new Map<string, string[]>();
    for (const l of graph.links) {
      if (l.relation !== "spawn") continue;
      const s = typeof l.source === "string" ? l.source : (l.source as { id: string }).id;
      const t = typeof l.target === "string" ? l.target : (l.target as { id: string }).id;
      // parent = the "main" endpoint (hub/image); child = the other.
      const sn = graph.byId.get(s);
      const tn = graph.byId.get(t);
      if (!sn || !tn) continue;
      const sMain = Boolean(sn.is_hub || sn.image);
      const tMain = Boolean(tn.is_hub || tn.image);
      const parent = sMain && !tMain ? s : !sMain && tMain ? t : s;
      const child = parent === s ? t : s;
      if (parent === child) continue;
      if (!parentOf.has(child)) parentOf.set(child, parent);
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(child);
    }
    let nodes: OrbitNode[] = [];
    let byIdSim = new Map<string, OrbitNode>();
    // Assign each community an evenly-spaced angular slot on a master ring
    // centered at the origin. This keeps clusters from piling into each other
    // and gives the whole graph a uniform, organized layout.
    let slots = new Map<number | string, { angle: number; targetR: number; size: number }>();
    const recomputeSlots = () => {
      const sizes = new Map<number | string, number>();
      for (const n of nodes) {
        const key = n.community ?? "__none";
        sizes.set(key, (sizes.get(key) ?? 0) + 1);
      }
      const keys = Array.from(sizes.keys()).sort((a, b) =>
        (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0),
      );
      const N = Math.max(keys.length, 1);
      // Master ring radius scales with number of communities.
      const ringR = 180 + Math.sqrt(N) * 90;
      slots = new Map();
      keys.forEach((k, i) => {
        const size = sizes.get(k) ?? 1;
        slots.set(k, {
          angle: (i / N) * Math.PI * 2,
          targetR: ringR,
          size,
        });
      });
    };
    const force = (alpha: number) => {
      if (!nodes.length) return;
      if (slots.size === 0) recomputeSlots();
      // 1. Compute live centroids per community.
      const centers = new Map<number | string, { cx: number; cy: number; n: number }>();
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        const key = n.community ?? "__none";
        const c = centers.get(key) ?? { cx: 0, cy: 0, n: 0 };
        c.cx += n.x;
        c.cy += n.y;
        c.n += 1;
        centers.set(key, c);
      }
      for (const c of centers.values()) {
        c.cx /= c.n;
        c.cy /= c.n;
      }
      // 2. Anchor each centroid toward its slot on the master ring.
      const anchorPull = 0.04 * Math.max(alpha, 0.2);
      const anchors = new Map<number | string, { ax: number; ay: number }>();
      for (const [key, slot] of slots) {
        const ax = Math.cos(slot.angle) * slot.targetR;
        const ay = Math.sin(slot.angle) * slot.targetR;
        anchors.set(key, { ax, ay });
      }
      // 3. Per-node: gentle tangential orbit + strong radial spring toward
      //    a uniform per-cluster orbit radius, plus a pull toward the slot.
      const speed = 0.28 * Math.max(alpha, 0.15);
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        // 3a. Spawn children orbit their PARENT node instead of the community.
        const parentId = parentOf.get(n.id);
        if (parentId) {
          const p = byIdSim.get(parentId);
          if (p && p.x != null && p.y != null) {
            const siblings = childrenOf.get(parentId)?.length ?? 1;
            // Tight orbit around the parent — radius grows with sibling count.
            const targetR = (26 + Math.sqrt(siblings) * 6) * spawnRadiusRef.current;
            const dx = n.x - p.x;
            const dy = n.y - p.y;
            const r = Math.hypot(dx, dy) || 1;
            // Tangential orbit (counter-clockwise), slightly faster than cluster orbit.
            const s = 0.4 * Math.max(alpha, 0.15) * spawnSpeedRef.current;
            n.vx = (n.vx ?? 0) + (-dy / r) * s;
            n.vy = (n.vy ?? 0) + (dx / r) * s;
            // Strong radial spring to keep it on the ring around the parent.
            const pull = (targetR - r) * 0.05;
            n.vx += (dx / r) * pull;
            n.vy += (dy / r) * pull;
            continue;
          }
        }
        const key = n.community ?? "__none";
        const c = centers.get(key);
        const a = anchors.get(key);
        const slot = slots.get(key);
        if (!c || !a || !slot) continue;
        // Pull the whole cluster toward its anchor slot.
        n.vx = (n.vx ?? 0) + (a.ax - c.cx) * anchorPull;
        n.vy = (n.vy ?? 0) + (a.ay - c.cy) * anchorPull;
        if (n.is_hub) continue;
        // Uniform per-cluster orbit radius — scales with cluster size, not
        // per-node degree, so every satellite sits on a clean ring.
        const targetR = 22 + Math.sqrt(slot.size) * 8;
        const dx = n.x - c.cx;
        const dy = n.y - c.cy;
        const r = Math.hypot(dx, dy) || 1;
        // Tangential (counter-clockwise) — calm, uniform speed.
        n.vx += (-dy / r) * speed;
        n.vy += (dx / r) * speed;
        // Strong radial spring toward the target ring.
        const pull = (targetR - r) * 0.02;
        n.vx += (dx / r) * pull;
        n.vy += (dy / r) * pull;
      }
    };
    (force as unknown as { initialize: (n: OrbitNode[]) => void }).initialize = (n) => {
      nodes = n;
      byIdSim = new Map(n.map((x) => [x.id, x]));
      slots = new Map();
      recomputeSlots();
    };
    fgRef.current.d3Force("orbital", force);
    // Uniform repulsion so nothing clumps into a blob.
    fgRef.current.d3Force(
      "charge",
      forceManyBody<OrbitNode>()
        .strength((n) => (n.is_hub || n.image ? -120 : -18))
        .distanceMax(220),
    );
    // Prevent nodes (and hub/image nodes) from overlapping inside their cluster.
    const collide = forceCollide<OrbitNode>()
      .radius((n) => {
        const isHub = Boolean(n.is_hub || n.image);
        const r = isHub
          ? Math.max(14, Math.min(28, 10 + Math.sqrt(n.degree ?? 0) * 1.2))
          : Math.max(1.5, Math.min(6, 1.5 + Math.sqrt(n.degree ?? 0)));
        return r + 4;
      })
      .strength(1)
      .iterations(3);
    fgRef.current.d3Force("collide", collide);
    // Loosen links between main (hub / image) nodes so highly-connected
    // hubs don't pull each other into a tight ball, but keep them loosely grouped.
    type LinkEndpoint = string | OrbitNode;
    type SimLink = { source: LinkEndpoint; target: LinkEndpoint };
    const isMain = (n: LinkEndpoint) =>
      typeof n === "object" && n !== null && Boolean(n.is_hub || n.image);
    const linkForce = (fgRef.current.d3Force("link") as unknown) as
      | (ForceLink<OrbitNode, SimLink> & { distance: (fn: (l: SimLink) => number) => unknown; strength: (fn: (l: SimLink) => number) => unknown })
      | null;
    if (linkForce) {
      linkForce
        .distance((l) => (isMain(l.source) && isMain(l.target) ? 200 : 36))
        .strength((l) => (isMain(l.source) && isMain(l.target) ? 0.02 : 0.55));
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
          nodePointerAreaPaint={(node: GraphNode & { x?: number; y?: number }, color: string, ctx: CanvasRenderingContext2D) => {
            if (node.x == null || node.y == null) return;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
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