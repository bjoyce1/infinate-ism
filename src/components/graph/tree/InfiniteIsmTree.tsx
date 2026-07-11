import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { gsap } from "gsap";
import type { NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import {
  ancestorsOf,
  buildTaxonomy,
  leafIdForGraphNode,
  TREE_ROOT_SUB,
  type Taxonomy,
} from "./treeTaxonomy";
import {
  layoutTree,
  pagesToReveal,
  type DiscloseState,
  type LayoutResult,
} from "./treeLayout";
import { CANVAS_H, CANVAS_W, DEPARTMENTS, type DensityMode, type DeptKey, type LaidOut } from "./treeTypes";
import { useTreeCamera } from "./useTreeCamera";
import { TreeTooltip } from "./TreeTooltip";

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function branchPath(sx: number, sy: number, tx: number, ty: number): string {
  const midY = (sy + ty) / 2;
  return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
}
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function useResize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 1200, h: 1800 });
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.max(360, r.width), h: Math.max(480, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function collectAncestorIds(node: LaidOut | undefined): Set<string> {
  const s = new Set<string>();
  let cur = node;
  while (cur) {
    s.add(cur.data.id);
    cur = cur.parent;
  }
  return s;
}

/** Full-graph search index, walks the entire taxonomy including collapsed nodes. */
function useSearchIndex(taxonomy: Taxonomy) {
  return useMemo(() => {
    const items: Array<{ id: string; label: string; kind: string; dept: DeptKey; sub?: string }> = [];
    for (const [, d] of taxonomy.index) {
      if (d.kind === "root" || d.kind === "cluster") continue;
      items.push({
        id: d.id,
        label: d.label,
        kind: d.kind,
        dept: d.dept,
        sub: d.meta?.source ?? d.meta?.category ?? undefined,
      });
    }
    return items;
  }, [taxonomy]);
}

export function InfiniteIsmTree({ graph }: { graph: NormalizedGraph }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useResize(wrapRef);

  const selectedId = useGraphStore((s) => s.selectedId);
  const select = useGraphStore((s) => s.select);
  const hover = useGraphStore((s) => s.hover);
  const showLabels = useGraphStore((s) => s.showLabels);

  const [density, setDensity] = useState<DensityMode>("standard");
  const [disclose, setDisclose] = useState<DiscloseState>(() => ({
    pages: new Map(),
    expanded: new Set(),
  }));
  const [activeDepts, setActiveDepts] = useState<Set<DeptKey>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState("");
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [hudOpen, setHudOpen] = useState(false); // mobile filters drawer

  // Pan / pinch state
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; centerX: number; centerY: number; camK: number } | null>(null);

  const taxonomy = useMemo(() => buildTaxonomy(graph), [graph]);
  const searchIndex = useSearchIndex(taxonomy);
  const layout: LayoutResult = useMemo(
    () => layoutTree({ taxonomy, disclose, density }),
    [taxonomy, disclose, density],
  );

  const graphIdToLeafId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [, d] of taxonomy.index) if (d.node) m.set(d.node.id, d.id);
    return m;
  }, [taxonomy]);

  const highlightPath = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const leafId = leafIdForGraphNode(taxonomy, selectedId);
    if (!leafId) return new Set<string>();
    return new Set(ancestorsOf(taxonomy, leafId));
  }, [selectedId, taxonomy]);

  const hoverAncestors = useMemo(
    () => collectAncestorIds(hoverId ? layout.byId.get(hoverId) : undefined),
    [hoverId, layout],
  );

  const filteredIds = useMemo(() => {
    if (activeDepts.size === 0) return null;
    const s = new Set<string>();
    for (const l of layout.laid) {
      if (l.data.kind === "root" || l.data.id.startsWith("junction")) { s.add(l.data.id); continue; }
      if (activeDepts.has(l.data.dept)) s.add(l.data.id);
    }
    return s;
  }, [activeDepts, layout]);

  // ── Camera ────────────────────────────────────────────────────────
  const cam = useTreeCamera(size);

  useEffect(() => {
    cam.fit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // ── Progressive-disclosure helpers ────────────────────────────────
  const toggleHubExpansion = useCallback((hubId: string) => {
    setDisclose((prev) => {
      const pages = new Map(prev.pages);
      const expanded = new Set(prev.expanded);
      if (expanded.has(hubId)) {
        expanded.delete(hubId);
        pages.set(hubId, 0);
      } else {
        expanded.add(hubId);
        pages.set(hubId, Math.max(1, pages.get(hubId) ?? 1));
      }
      return { pages, expanded };
    });
  }, []);

  const revealMorePage = useCallback((hubId: string) => {
    setDisclose((prev) => {
      const pages = new Map(prev.pages);
      const expanded = new Set(prev.expanded);
      expanded.add(hubId);
      pages.set(hubId, (pages.get(hubId) ?? 1) + 1);
      return { pages, expanded };
    });
  }, []);

  const revealPathTo = useCallback((targetId: string) => {
    const need = pagesToReveal(taxonomy, targetId);
    setDisclose((prev) => {
      const pages = new Map(prev.pages);
      const expanded = new Set(prev.expanded);
      for (const [hub, p] of need) {
        expanded.add(hub);
        pages.set(hub, Math.max(p, pages.get(hub) ?? 0));
      }
      return { pages, expanded };
    });
  }, [taxonomy]);

  // Auto-reveal + focus when a graph node is selected externally.
  useEffect(() => {
    if (!selectedId) return;
    const leafId = leafIdForGraphNode(taxonomy, selectedId);
    if (!leafId) return;
    revealPathTo(leafId);
    setPulseId(leafId);
  }, [selectedId, taxonomy, revealPathTo]);

  // After layout updates (post-reveal), focus the pulsed node.
  useEffect(() => {
    if (!pulseId) return;
    const l = layout.byId.get(pulseId);
    if (!l) return;
    cam.focus({ x: l.x, y: l.y }, Math.max(cam.camera.k, 1.5));
    const t = setTimeout(() => setPulseId(null), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseId, layout]);

  // ── Pointer handling (pan + pinch) ────────────────────────────────
  const onPointerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, tx: cam.camera.x, ty: cam.camera.y, moved: false };
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        centerX: (a.x + b.x) / 2,
        centerY: (a.y + b.y) / 2,
        camK: cam.camera.k,
      };
      dragRef.current = null;
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (a.x + b.x) / 2 - rect.left;
      const cy = (a.y + b.y) / 2 - rect.top;
      const factor = dist / Math.max(1, pinchRef.current.dist);
      pinchRef.current.dist = dist;
      cam.zoomAt(cx, cy, factor);
      suppressClickRef.current = true;
      return;
    }
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      dragRef.current.moved = true;
      suppressClickRef.current = true;
    }
    cam.setInstant({ ...cam.camera, x: dragRef.current.tx + dx, y: dragRef.current.ty + dy });
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) dragRef.current = null;
    // Reset suppression on next microtask so the click handler sees it first.
    queueMicrotask(() => { setTimeout(() => { suppressClickRef.current = false; }, 0); });
  };

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    cam.zoomAt(px, py, 1 + (-e.deltaY * 0.0015));
  };

  const onBackgroundClick = () => {
    if (suppressClickRef.current) return;
    select(null);
  };

  // ── Node interactions ────────────────────────────────────────────
  const handleNodeClick = useCallback((l: LaidOut) => {
    if (suppressClickRef.current) return;
    if (l.data.kind === "leaf" && l.data.node) {
      select(l.data.node.id);
      return;
    }
    if (l.data.kind === "cluster") {
      if (l.parent) revealMorePage(l.parent.data.id);
      return;
    }
    toggleHubExpansion(l.data.id);
    cam.focus({ x: l.x, y: l.y }, Math.max(cam.camera.k, 1.2));
  }, [select, revealMorePage, toggleHubExpansion, cam]);

  const handleNodeDouble = useCallback((l: LaidOut) => {
    cam.focus({ x: l.x, y: l.y }, 2.0);
  }, [cam]);

  // ── Search ───────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return searchIndex
      .filter((r) => r.label.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, searchIndex]);

  const jumpToSearchResult = useCallback((id: string) => {
    revealPathTo(id);
    const datum = taxonomy.index.get(id);
    if (datum?.node) {
      select(datum.node.id);
    } else {
      setPulseId(id);
    }
    setQuery("");
  }, [revealPathTo, select, taxonomy]);

  // ── Keyboard ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "f" || e.key === "F") { e.preventDefault(); cam.fit(); }
      else if (e.key === "Escape") { select(null); setHudOpen(false); }
      else if (e.key === "/") {
        e.preventDefault();
        (document.getElementById("iit-search") as HTMLInputElement | null)?.focus();
      } else if (e.key === "Enter" && hoverId) {
        const l = layout.byId.get(hoverId);
        if (l) handleNodeClick(l);
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const startId = selectedId ? graphIdToLeafId.get(selectedId) : hoverId ?? taxonomy.root.id;
        const current = startId ? layout.byId.get(startId) : layout.byId.get(taxonomy.root.id);
        if (!current) return;
        e.preventDefault();
        let best: LaidOut | null = null;
        let bestScore = Infinity;
        for (const other of layout.laid) {
          if (other === current) continue;
          const dx = other.x - current.x;
          const dy = other.y - current.y;
          const aligned =
            (e.key === "ArrowRight" && dx > 0 && Math.abs(dy) < Math.abs(dx)) ||
            (e.key === "ArrowLeft"  && dx < 0 && Math.abs(dy) < Math.abs(dx)) ||
            (e.key === "ArrowUp"    && dy < 0 && Math.abs(dx) < Math.abs(dy)) ||
            (e.key === "ArrowDown"  && dy > 0 && Math.abs(dx) < Math.abs(dy));
          if (!aligned) continue;
          const d = Math.hypot(dx, dy);
          if (d < bestScore) { bestScore = d; best = other; }
        }
        if (best) {
          setHoverId(best.data.id);
          cam.focus({ x: best.x, y: best.y });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cam, select, hoverId, layout, handleNodeClick, selectedId, graphIdToLeafId, taxonomy]);

  // ── Entrance animation (GSAP) ────────────────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const entered = useRef(false);
  useEffect(() => {
    if (entered.current) return;
    if (!svgRef.current) return;
    entered.current = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const paths = svgRef.current.querySelectorAll<SVGPathElement>("path.iit-branch");
    paths.forEach((p) => {
      const len = p.getTotalLength?.() ?? 300;
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });
    gsap.to("path.iit-branch", {
      strokeDashoffset: 0,
      duration: 1.2,
      ease: "power2.out",
      stagger: { each: 0.006, from: "start" },
    });
    gsap.from(".iit-node", { opacity: 0, scale: 0.85, transformOrigin: "center center",
      duration: 0.6, delay: 0.35, ease: "power2.out", stagger: 0.004 });
  }, [layout]);

  // ── Rendering helpers ────────────────────────────────────────────
  const isVisible = useCallback((l: LaidOut) => {
    if (!filteredIds) return true;
    return filteredIds.has(l.data.id);
  }, [filteredIds]);

  const isDimmed = useCallback((l: LaidOut) => {
    if (activeDepts.size > 0 && l.data.kind !== "root" && !l.data.id.startsWith("junction") && !activeDepts.has(l.data.dept)) return true;
    const anyHighlight = highlightPath.size > 0 || hoverAncestors.size > 0 || query.trim().length > 0;
    if (!anyHighlight) return false;
    if (highlightPath.has(l.data.id)) return false;
    if (hoverAncestors.has(l.data.id)) return false;
    if (query.trim() && l.data.label.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  }, [highlightPath, hoverAncestors, query, activeDepts]);

  const zoom = cam.camera.k;
  const showLeafLabels = showLabels && zoom > 1.2;
  const showSubhubLabels = showLabels && zoom > 0.55;

  const selectedTreeLeaf = selectedId ? layout.byId.get(graphIdToLeafId.get(selectedId) ?? "") : null;
  const breadcrumbs: LaidOut[] = [];
  {
    let cur = selectedTreeLeaf ?? undefined;
    while (cur) { breadcrumbs.unshift(cur); cur = cur.parent; }
  }

  // Tooltip target
  const tooltipNode = hoverId ? layout.byId.get(hoverId) : null;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden select-none touch-none"
      style={{
        background:
          "radial-gradient(ellipse at 50% 100%, #12312e 0%, #0b1f21 45%, #050d10 100%)",
      }}
      onPointerMove={(e) => setTooltipPos({ x: e.clientX - (wrapRef.current?.getBoundingClientRect().left ?? 0), y: e.clientY - (wrapRef.current?.getBoundingClientRect().top ?? 0) })}
    >
      {/* Star-dust parallax */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.06) 0.5px, transparent 1px), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.05) 0.5px, transparent 1px), radial-gradient(circle at 40% 60%, rgba(255,255,255,0.05) 0.5px, transparent 1px)",
          backgroundSize: "260px 260px, 220px 220px, 340px 340px",
        }}
      />

      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onClick={onBackgroundClick}
        role="application"
        aria-label="Infinite ISM Tree — Second Brain taxonomy"
      >
        <defs>
          <radialGradient id="iit-root-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#f5edcf" stopOpacity={1} />
            <stop offset="100%" stopColor="#6a8a86" stopOpacity={1} />
          </radialGradient>
          {layout.laid
            .filter((l) => l.data.node?.image)
            .map((l) => {
              const r = leafRadius(l);
              return (
                <clipPath id={`iit-clip-${safeId(l.data.id)}`} key={`clip-${safeId(l.data.id)}`}>
                  <circle cx={0} cy={0} r={r} />
                </clipPath>
              );
            })}
          <filter id="iit-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${cam.camera.x} ${cam.camera.y}) scale(${cam.camera.k})`}>
          {/* Branches */}
          {layout.links.map((ln, i) => {
            const src = ln.source;
            const tgt = ln.target;
            if (!isVisible(tgt)) return null;
            const depth =
              tgt.data.kind === "department" ? 1 :
              tgt.data.kind === "community"  ? 2 :
              tgt.data.kind === "subhub"     ? 3 :
              tgt.data.kind === "leaf"       ? 4 : 2;
            const width = Math.max(1.1, 7 - depth * 1.35);
            const color = tgt.data.color;
            const active = highlightPath.has(tgt.data.id) || hoverAncestors.has(tgt.data.id);
            const dim = isDimmed(tgt);
            const opacity = dim ? 0.1 : active ? 1 : tgt.data.kind === "leaf" ? 0.55 : 0.82;
            return (
              <path key={i} className="iit-branch"
                d={branchPath(src.x, src.y, tgt.x, tgt.y)}
                stroke={color} strokeOpacity={opacity}
                strokeWidth={active ? width + 1 : width}
                strokeLinecap="round" fill="none" />
            );
          })}

          {/* Nodes */}
          {layout.laid.map((l) => {
            if (!isVisible(l)) return null;
            return (
              <TreeNode
                key={l.data.id}
                l={l}
                dim={isDimmed(l)}
                selectedGraphId={selectedId}
                isHovered={hoverId === l.data.id}
                isPulsing={pulseId === l.data.id}
                showLeafLabels={showLeafLabels}
                showSubhubLabels={showSubhubLabels}
                onEnter={() => { setHoverId(l.data.id); if (l.data.node) hover(l.data.node.id); }}
                onLeave={() => { setHoverId((p) => (p === l.data.id ? null : p)); hover(null); }}
                onClick={(e) => { e.stopPropagation(); handleNodeClick(l); }}
                onDouble={(e) => { e.stopPropagation(); handleNodeDouble(l); }}
              />
            );
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltipNode && tooltipPos && (
        <TreeTooltip node={tooltipNode} x={tooltipPos.x} y={tooltipPos.y} viewport={size} />
      )}

      {/* Header */}
      <div className="absolute top-3 sm:top-5 left-1/2 -translate-x-1/2 text-center pointer-events-none">
        <div className="font-sora text-base sm:text-2xl md:text-3xl tracking-[0.35em] sm:tracking-[0.4em] text-white/95 font-light whitespace-nowrap">
          INFINITE ISM TREE
        </div>
        <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] sm:tracking-[0.35em] text-white/40 mt-1">
          CAPISM · SECOND BRAIN TAXONOMY
        </div>
      </div>

      {/* Corner marks (hidden on very small screens) */}
      <div className="hidden sm:block absolute top-5 left-5 pointer-events-none">
        <div className="flex gap-1">
          {DEPARTMENTS.map((d) => (
            <div key={d.key} className="w-3 h-3" style={{ background: d.color }} />
          ))}
        </div>
        <div className="font-mono text-[9px] text-white/40 mt-2 tracking-widest">CAPISM<br/>CHARTS</div>
      </div>
      <div className="hidden sm:block absolute top-5 right-5 text-right pointer-events-none font-mono text-[9px] text-white/50 tracking-widest leading-relaxed">
        © 2026<br/>MR. CAP<br/>INFINITE-ISM
      </div>

      {/* Legend / dept filter — desktop */}
      <div className="hidden md:flex flex-col gap-1.5 absolute bottom-6 left-6">
        <div className="font-mono text-[9px] text-white/70 tracking-[0.25em] mb-1">DEPARTMENTS</div>
        {DEPARTMENTS.map((d) => {
          const on = activeDepts.size === 0 || activeDepts.has(d.key);
          const count = taxonomy.totalByDept[d.key];
          return (
            <button key={d.key}
              onClick={() => setActiveDepts((prev) => {
                const n = new Set(prev);
                if (n.has(d.key)) n.delete(d.key); else n.add(d.key);
                return n;
              })}
              className="flex items-center gap-2 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded px-1"
              style={{ opacity: on ? 1 : 0.35 }}
              aria-pressed={activeDepts.has(d.key)}
            >
              <span className="w-3 h-3 rounded-sm" style={{ background: d.color }} />
              <span className="font-mono text-[10px] tracking-[0.18em] text-white/85 group-hover:text-white">
                {d.short} · {d.name}
              </span>
              <span className="font-mono text-[9px] text-white/40 ml-1">{count}</span>
            </button>
          );
        })}
        {activeDepts.size > 0 && (
          <button onClick={() => setActiveDepts(new Set())}
            className="mt-1 font-mono text-[9px] tracking-widest text-white/50 hover:text-white text-left">
            CLEAR FILTER
          </button>
        )}
      </div>

      {/* Search + density + camera controls */}
      <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 flex flex-col items-end gap-2 w-[min(92vw,320px)]">
        <div className="relative w-full">
          <input
            id="iit-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search full tree… (/)"
            className="w-full px-3 py-2 rounded-md text-[12px] font-mono bg-black/50 border border-white/15 text-white/90 placeholder-white/30 focus:outline-none focus:border-white/40 backdrop-blur"
            aria-label="Search the tree"
          />
          {searchResults.length > 0 && (
            <div className="absolute bottom-full mb-2 right-0 w-full max-h-64 overflow-auto rounded-md bg-black/85 border border-white/15 backdrop-blur shadow-2xl">
              {searchResults.map((r) => (
                <button key={r.id}
                  onClick={() => jumpToSearchResult(r.id)}
                  className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2 border-b border-white/5 last:border-b-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DEPARTMENTS.find(d => d.key === r.dept)?.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-white/90 truncate">{r.label || "—"}</div>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-white/40">
                      {r.kind} · {r.dept}{r.sub ? ` · ${truncate(r.sub, 22)}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-wrap justify-end w-full">
          {(["overview","standard","expanded"] as DensityMode[]).map((m) => (
            <button key={m} onClick={() => setDensity(m)}
              className="px-2.5 py-1.5 rounded-md text-[10px] font-mono tracking-widest bg-black/50 border backdrop-blur min-h-[36px]"
              style={{
                borderColor: density === m ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.15)",
                color: density === m ? "#fff" : "rgba(255,255,255,0.6)",
              }}
              aria-pressed={density === m}
            >{m.toUpperCase()}</button>
          ))}
          <button onClick={() => cam.fit()}
            className="px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest bg-black/50 border border-white/15 text-white/70 hover:text-white hover:border-white/40 backdrop-blur min-h-[36px]"
          >FIT · F</button>
          <button onClick={() => setHudOpen((v) => !v)}
            className="md:hidden px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest bg-black/50 border border-white/15 text-white/70 hover:text-white hover:border-white/40 backdrop-blur min-h-[36px]"
          >FILTERS</button>
        </div>
      </div>

      {/* Mobile filters drawer */}
      {hudOpen && (
        <div className="md:hidden absolute inset-x-0 bottom-0 bg-black/90 border-t border-white/10 backdrop-blur p-4 pb-6 z-40" role="dialog" aria-label="Department filters">
          <div className="flex items-center justify-between mb-3">
            <div className="font-mono text-[10px] text-white/70 tracking-[0.25em]">DEPARTMENTS</div>
            <button onClick={() => setHudOpen(false)} className="text-white/50 text-xs px-2 py-1">CLOSE</button>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {DEPARTMENTS.map((d) => {
              const on = activeDepts.size === 0 || activeDepts.has(d.key);
              return (
                <button key={d.key}
                  onClick={() => setActiveDepts((prev) => {
                    const n = new Set(prev);
                    if (n.has(d.key)) n.delete(d.key); else n.add(d.key);
                    return n;
                  })}
                  className="flex items-center gap-3 py-2 px-2 rounded-md border border-white/10 text-left min-h-[44px]"
                  style={{ opacity: on ? 1 : 0.45 }}
                  aria-pressed={activeDepts.has(d.key)}
                >
                  <span className="w-4 h-4 rounded-sm shrink-0" style={{ background: d.color }} />
                  <span className="text-[12px] text-white/90 flex-1">{d.name}</span>
                  <span className="font-mono text-[10px] text-white/40">{taxonomy.totalByDept[d.key]}</span>
                </button>
              );
            })}
          </div>
          {activeDepts.size > 0 && (
            <button onClick={() => setActiveDepts(new Set())}
              className="mt-3 w-full font-mono text-[10px] tracking-widest text-white/60 hover:text-white text-center py-2 border border-white/10 rounded-md">
              CLEAR FILTER
            </button>
          )}
        </div>
      )}

      {/* Breadcrumbs */}
      {breadcrumbs.length > 1 && (
        <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 border border-white/15 backdrop-blur max-w-[92vw] overflow-x-auto">
          {breadcrumbs.map((b, i) => (
            <div key={b.data.id} className="flex items-center gap-1.5 shrink-0">
              {i > 0 && <span className="text-white/30 text-[10px]">›</span>}
              <button
                onClick={() => cam.focus({ x: b.x, y: b.y }, Math.max(cam.camera.k, 1.2))}
                className="font-mono text-[10px] tracking-widest hover:opacity-100 opacity-90"
                style={{ color: b.data.kind === "root" ? "#e5eae2" : b.data.color }}
              >
                {truncate(b.data.label || "ROOT", 22)}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function leafRadius(l: LaidOut): number {
  return Math.min(20, Math.max(9, 9 + Math.log2((l.data.weight ?? 0) + 1) * 2));
}

// ── Node component ─────────────────────────────────────────────────
type TreeNodeProps = {
  l: LaidOut;
  dim: boolean;
  selectedGraphId: string | null;
  isHovered: boolean;
  isPulsing: boolean;
  showLeafLabels: boolean;
  showSubhubLabels: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
  onDouble: (e: React.MouseEvent) => void;
};

function TreeNode(p: TreeNodeProps) {
  const l = p.l;
  const { x, y } = l;
  const kind = l.data.kind;
  const color = l.data.color;
  const isSelected = l.data.node ? p.selectedGraphId === l.data.node.id : false;
  const opacity = p.dim ? 0.15 : 1;
  const commonProps = {
    onMouseEnter: p.onEnter,
    onMouseLeave: p.onLeave,
    onClick: p.onClick,
    onDoubleClick: p.onDouble,
    style: { cursor: "pointer", opacity } as React.CSSProperties,
    className: "iit-node",
    tabIndex: 0,
    role: "button" as const,
    "aria-label": `${kind}: ${l.data.label || "unnamed"}`,
  };

  if (l.data.id === "junction:main") {
    return (
      <g transform={`translate(${x} ${y})`}>
        <circle r={8} fill="#0b1f21" stroke="#5c7b78" strokeWidth={1.5} opacity={0.7} />
      </g>
    );
  }

  if (kind === "root") {
    return (
      <g transform={`translate(${x} ${y})`} {...commonProps}>
        <circle r={62} fill="#0b1f21" stroke="#8fa8a2" strokeWidth={2} />
        <circle r={52} fill="url(#iit-root-glow)" />
        <text textAnchor="middle" dy={-2} fill="#0b1f21" fontSize={12} fontWeight={800} style={{ letterSpacing: "0.28em" }}>INFINITE</text>
        <text textAnchor="middle" dy={14} fill="#0b1f21" fontSize={12} fontWeight={800} style={{ letterSpacing: "0.28em" }}>ISM</text>
        <text y={80} textAnchor="middle" fill="#e5eae2" fontSize={9} fontWeight={600} style={{ letterSpacing: "0.28em" }}>{TREE_ROOT_SUB}</text>
      </g>
    );
  }

  if (kind === "department") {
    const pillW = 210, pillH = 42;
    return (
      <g transform={`translate(${x} ${y})`} {...commonProps}>
        {(isSelected || p.isHovered || p.isPulsing) && (
          <rect x={-pillW/2 - 6} y={-pillH/2 - 6} width={pillW + 12} height={pillH + 12} rx={(pillH + 12)/2}
            fill="none" stroke={color} strokeOpacity={0.7} strokeWidth={2} filter="url(#iit-glow)" />
        )}
        <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2}
          fill={color} stroke="#05161a" strokeWidth={2} />
        <text textAnchor="middle" dy={5} fill={inkFor(l.data.dept)} fontSize={12} fontWeight={800}
          style={{ letterSpacing: "0.22em" }}>{l.data.label}</text>
        {l.data.count != null && (
          <text y={pillH/2 + 14} textAnchor="middle" fill="#c7d3d0" fontSize={9}
            style={{ letterSpacing: "0.2em" }}>{l.data.count} NODES</text>
        )}
      </g>
    );
  }

  if (kind === "community") {
    const label = truncate(l.data.label, 26);
    const pillW = Math.max(110, label.length * 6.4 + 26);
    const pillH = 26;
    return (
      <g transform={`translate(${x} ${y})`} {...commonProps}>
        <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2}
          fill={color} stroke="#05161a" strokeWidth={1.5} opacity={0.94} />
        <text textAnchor="middle" dy={4} fill={inkFor(l.data.dept)} fontSize={10} fontWeight={800}
          style={{ letterSpacing: "0.14em", pointerEvents: "none" }}>{label}</text>
      </g>
    );
  }

  if (kind === "subhub" || kind === "cluster") {
    const label = truncate(l.data.label, 22);
    const pillW = Math.max(80, label.length * 5.6 + 22);
    const pillH = 20;
    const isCluster = kind === "cluster";
    return (
      <g transform={`translate(${x} ${y})`} {...commonProps}>
        <rect x={-pillW/2 - 8} y={-pillH/2 - 8} width={pillW + 16} height={pillH + 16} fill="transparent" />
        <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2}
          fill={isCluster ? "#0b1f21" : color}
          stroke={isCluster ? color : "#05161a"} strokeWidth={1.2}
          opacity={isCluster ? 0.95 : 0.95} />
        {(p.showSubhubLabels || p.isHovered || isCluster) && (
          <text textAnchor="middle" dy={3.5}
            fill={isCluster ? color : inkFor(l.data.dept)}
            fontSize={8.5} fontWeight={800}
            style={{ letterSpacing: "0.1em", pointerEvents: "none" }}>{label}</text>
        )}
      </g>
    );
  }

  // Leaf
  const r = leafRadius(l);
  const hasImg = !!l.data.node?.image;
  const showLabel = isSelected || p.isHovered || p.isPulsing || p.showLeafLabels;
  return (
    <g transform={`translate(${x} ${y})`} {...commonProps}>
      {/* Enlarged transparent hit-target for small leaves */}
      <circle r={Math.max(r + 8, 20)} fill="transparent" />
      {(isSelected || p.isHovered || p.isPulsing) && (
        <>
          <circle r={r + 8} fill="none" stroke={color} strokeOpacity={0.75} strokeWidth={2} filter="url(#iit-glow)" />
          {p.isPulsing && (
            <circle r={r + 14} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={2}>
              <animate attributeName="r" from={r + 8} to={r + 20} dur="1.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.6" to="0" dur="1.2s" repeatCount="indefinite" />
            </circle>
          )}
        </>
      )}
      <circle r={r + 2} fill="#0b1f21" />
      <circle r={r + 2} fill="none" stroke={color} strokeWidth={1.75} opacity={0.95} />
      {hasImg ? (
        <image href={l.data.node!.image} x={-r} y={-r} width={r * 2} height={r * 2}
          clipPath={`url(#iit-clip-${safeId(l.data.id)})`}
          preserveAspectRatio="xMidYMid slice" />
      ) : (
        <>
          <circle r={r} fill={color} fillOpacity={0.32} />
          <text textAnchor="middle" dy={4} fill="#e5eae2" fontSize={r * 0.7} fontWeight={800}
            style={{ pointerEvents: "none" }}>
            {(l.data.label || "?").trim()[0]?.toUpperCase()}
          </text>
        </>
      )}
      {showLabel && (
        <text y={r + 12} textAnchor="middle" fill="#d4dcd2" fontSize={8.5} fontWeight={500}
          style={{ letterSpacing: "0.04em", pointerEvents: "none",
                   paintOrder: "stroke", stroke: "#05161a", strokeWidth: 2.5, strokeLinejoin: "round" }}>
          {truncate(l.data.label || "", 22)}
        </text>
      )}
    </g>
  );
}

function inkFor(k: DeptKey): string {
  return DEPARTMENTS.find((d) => d.key === k)?.ink ?? "#0b1f21";
}

export default InfiniteIsmTree;