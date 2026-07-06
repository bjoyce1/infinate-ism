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

  // Radial hierarchy layout — central hub at origin, community leaders fan
  // out on a ring, satellites orbit each leader. Simulation settles then
  // freezes (see cooldownTicks + onEngineStop below).
  useEffect(() => {
    if (!ForceGraph || !fgRef.current) return;
    type SimNode = GraphNode & {
      x?: number;
      y?: number;
      vx?: number;
      vy?: number;
      fx?: number | null;
      fy?: number | null;
    };
    let nodes: SimNode[] = [];
    // Per-node target anchor computed once from community membership.
    let anchors = new Map<string, { ax: number; ay: number; strong: boolean }>();

    const computeAnchors = () => {
      anchors = new Map();
      // Group by community.
      const byComm = new Map<number | string, SimNode[]>();
      for (const n of nodes) {
        const key = n.community ?? "__none";
        if (!byComm.has(key)) byComm.set(key, []);
        byComm.get(key)!.push(n);
      }
      // Order communities largest-first for stable slot assignment.
      const commKeys = Array.from(byComm.keys()).sort(
        (a, b) => (byComm.get(b)!.length - byComm.get(a)!.length),
      );
      const N = Math.max(commKeys.length, 1);
      const RING1 = 260 + Math.sqrt(N) * 40; // community-leader ring
      commKeys.forEach((key, i) => {
        const members = byComm.get(key)!;
        // Pick a leader: hub/image node with highest degree, else highest degree.
        const leader = [...members].sort((a, b) => {
          const ah = a.is_hub || a.image ? 1 : 0;
          const bh = b.is_hub || b.image ? 1 : 0;
          if (ah !== bh) return bh - ah;
          return (b.degree ?? 0) - (a.degree ?? 0);
        })[0];
        const angle = (i / N) * Math.PI * 2;
        const lx = Math.cos(angle) * RING1;
        const ly = Math.sin(angle) * RING1;
        // Satellite ring radius scales with cluster size; overlap tolerance ~4/10.
        const RING2 = 40 + Math.sqrt(members.length) * 14;
        // Satellites: evenly distribute on RING2 around the leader.
        const satellites = members.filter((m) => m.id !== leader.id);
        // Sort satellites by id for deterministic placement.
        satellites.sort((a, b) => a.id.localeCompare(b.id));
        satellites.forEach((m, j) => {
          const sa = (j / Math.max(satellites.length, 1)) * Math.PI * 2;
          anchors.set(m.id, {
            ax: lx + Math.cos(sa) * RING2,
            ay: ly + Math.sin(sa) * RING2,
            strong: false,
          });
        });
        anchors.set(leader.id, { ax: lx, ay: ly, strong: true });
      });
      // Pin the master hub at the origin if present.
      const hub = nodes.find((n) => n.id === HUB_ID);
      if (hub) anchors.set(hub.id, { ax: 0, ay: 0, strong: true });
    };

    const anchorForce = (alpha: number) => {
      if (!nodes.length) return;
      if (anchors.size === 0) computeAnchors();
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        const a = anchors.get(n.id);
        if (!a) continue;
        const k = (a.strong ? 0.35 : 0.18) * alpha;
        n.vx = (n.vx ?? 0) + (a.ax - n.x) * k;
        n.vy = (n.vy ?? 0) + (a.ay - n.y) * k;
      }
    };
    (anchorForce as unknown as { initialize: (n: SimNode[]) => void }).initialize = (n) => {
      nodes = n;
      // Seed positions near their anchor so the first few ticks are already
      // roughly organized — avoids the initial "big bang" chaos.
      computeAnchors();
      for (const node of nodes) {
        const a = anchors.get(node.id);
        if (!a) continue;
        node.x = a.ax + (Math.random() - 0.5) * 6;
        node.y = a.ay + (Math.random() - 0.5) * 6;
        node.vx = 0;
        node.vy = 0;
      }
    };
    fgRef.current.d3Force("anchor", anchorForce);
    // Mild repulsion, only within a small radius, so overlapping labels
    // separate without breaking the radial structure.
    fgRef.current.d3Force(
      "charge",
      forceManyBody<SimNode>()
        .strength((n) => (n.is_hub || n.image ? -80 : -12))
        .distanceMax(90),
    );
    // Prevent visual overlap of nodes and images (overlap tolerance ~4/10).
    const collide = forceCollide<SimNode>()
      .radius((n) => {
        const isHub = Boolean(n.is_hub || n.image);
        const r = isHub
          ? Math.max(14, Math.min(28, 10 + Math.sqrt(n.degree ?? 0) * 1.2))
          : Math.max(1.5, Math.min(6, 1.5 + Math.sqrt(n.degree ?? 0)));
        return r + 3;
      })
      .strength(0.9)
      .iterations(2);
    fgRef.current.d3Force("collide", collide);
    // Kill link + center forces — anchors define the layout, links would
    // otherwise pull everything back toward a blob.
    type LinkEndpoint = string | SimNode;
    type SimLink = { source: LinkEndpoint; target: LinkEndpoint };
    const linkForce = (fgRef.current.d3Force("link") as unknown) as
      | (ForceLink<SimNode, SimLink> & {
          distance: (fn: (l: SimLink) => number) => unknown;
          strength: (fn: (l: SimLink) => number) => unknown;
        })
      | null;
    if (linkForce) {
      linkForce.distance(() => 40).strength(() => 0);
    }
    fgRef.current.d3Force("center", null as unknown);
    fgRef.current.d3ReheatSimulation();
  }, [ForceGraph]);
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
          cooldownTicks={400}
          d3AlphaDecay={0.02}
          d3AlphaMin={0.001}
          d3VelocityDecay={0.55}
          onEngineStop={() => {
            // Freeze every node in place once the radial layout has settled.
            type SimNode = GraphNode & { x?: number; y?: number; fx?: number | null; fy?: number | null };
            const gd = data as { nodes: SimNode[] };
            for (const n of gd.nodes) {
              if (n.x != null) n.fx = n.x;
              if (n.y != null) n.fy = n.y;
            }
          }}
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