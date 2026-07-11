import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { buildTaxonomy, TREE_ROOT_SUB } from "./treeTaxonomy";
import { layoutTree, type LayoutResult } from "./treeLayout";
import { DEPARTMENTS, type DensityMode, type DeptKey, type LaidOut } from "./treeTypes";

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function branchPath(sx: number, sy: number, tx: number, ty: number): string {
  // Vertical S-curve, bulges through midY. Bottom-up feel.
  const midY = (sy + ty) / 2;
  return `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
}

function useResize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 1200, h: 1800 });
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.max(480, r.width), h: Math.max(480, r.height) });
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

function collectDescendantIds(node: LaidOut, layout: LayoutResult): Set<string> {
  const ids = new Set<string>([node.data.id]);
  const stack: LaidOut[] = [node];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const l of layout.laid) {
      if (l.parent && l.parent.data.id === cur.data.id) {
        ids.add(l.data.id);
        stack.push(l);
      }
    }
  }
  return ids;
}

export function InfiniteIsmTree({ graph }: { graph: NormalizedGraph }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useResize(wrapRef);

  // Store integration — leaves route through existing selection + RightPanel.
  const selectedId = useGraphStore((s) => s.selectedId);
  const select = useGraphStore((s) => s.select);
  const hoveredId = useGraphStore((s) => s.hoveredId);
  const hover = useGraphStore((s) => s.hover);
  const showLabels = useGraphStore((s) => s.showLabels);

  // Local view state.
  const [density, setDensity] = useState<DensityMode>("standard");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeDepts, setActiveDepts] = useState<Set<DeptKey>>(new Set());
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [hoverTreeId, setHoverTreeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const taxonomy = useMemo(() => buildTaxonomy(graph), [graph]);
  const layout = useMemo(
    () => layoutTree({ root: taxonomy.root, width: 1200, height: 1800, expanded, density }),
    [taxonomy, expanded, density],
  );

  // Map a real graph node id back to its tree leaf for selection sync.
  const graphIdToLeaf = useMemo(() => {
    const m = new Map<string, LaidOut>();
    for (const l of layout.laid) if (l.data.node) m.set(l.data.node.id, l);
    return m;
  }, [layout]);

  // Highlight path: selected → root ancestry (in tree space).
  const highlightPath = useMemo(() => {
    const t = selectedId ? graphIdToLeaf.get(selectedId) : null;
    return collectAncestorIds(t ?? undefined);
  }, [selectedId, graphIdToLeaf]);

  const hoverPath = useMemo(() => {
    const l = hoverTreeId ? layout.byId.get(hoverTreeId) : null;
    return collectAncestorIds(l ?? undefined);
  }, [hoverTreeId, layout]);

  // Filter by active departments.
  const filteredIds = useMemo(() => {
    if (activeDepts.size === 0) return null; // show all
    const ids = new Set<string>();
    for (const l of layout.laid) {
      if (l.data.kind === "root") { ids.add(l.data.id); continue; }
      if (activeDepts.has(l.data.dept)) ids.add(l.data.id);
    }
    return ids;
  }, [activeDepts, layout]);

  const searchMatch = useMemo(() => {
    if (!query.trim()) return new Set<string>();
    const q = query.toLowerCase();
    const s = new Set<string>();
    for (const l of layout.laid) {
      if (l.data.label.toLowerCase().includes(q) || l.data.node?.label?.toLowerCase().includes(q)) {
        s.add(l.data.id);
      }
    }
    return s;
  }, [query, layout]);

  // ── Camera controls ────────────────────────────────────────────────
  const setTransformClamped = useCallback((t: { x: number; y: number; k: number }) => {
    setTransform({ x: t.x, y: t.y, k: Math.min(6, Math.max(0.25, t.k)) });
  }, []);

  const fitView = useCallback(() => {
    if (!size.w) return;
    const scale = Math.min(size.w / 1200, size.h / 1800);
    setTransformClamped({
      x: (size.w - 1200 * scale) / 2,
      y: (size.h - 1800 * scale) / 2,
      k: scale,
    });
  }, [size, setTransformClamped]);

  const focusNode = useCallback(
    (id: string, targetK = 1.4) => {
      const l = layout.byId.get(id);
      if (!l) return;
      const k = Math.max(transform.k, targetK);
      setTransformClamped({
        x: size.w / 2 - l.x * k,
        y: size.h * 0.55 - l.y * k,
        k,
      });
    },
    [layout, size, transform.k, setTransformClamped],
  );

  // Initial fit.
  useEffect(() => { fitView(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [size.w, size.h]);

  // Focus when selection changes (from anywhere).
  useEffect(() => {
    if (!selectedId) return;
    const l = graphIdToLeaf.get(selectedId);
    if (l) focusNode(l.data.id, 1.4);
  }, [selectedId, graphIdToLeaf, focusNode]);

  // ── Pointer handlers ─────────────────────────────────────────────
  const onPointerDown = (e: ReactPointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragRef.current.moved = true;
    setTransform((t) => ({ ...t, x: dragRef.current!.tx + dx, y: dragRef.current!.ty + dy }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setTransform((t) => {
      const k = Math.min(6, Math.max(0.25, t.k * (1 + delta)));
      const scale = k / t.k;
      return { k, x: px - (px - t.x) * scale, y: py - (py - t.y) * scale };
    });
  };

  const onBackgroundClick = () => {
    // Deselect only on real background click, not the end of a pan.
    if (dragRef.current?.moved) return;
    select(null);
  };

  // ── Node interaction ────────────────────────────────────────────
  const toggleHub = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleNodeClick = useCallback(
    (l: LaidOut) => {
      if (dragRef.current?.moved) return;
      if (l.data.kind === "leaf" && l.data.node) {
        select(l.data.node.id);
        return;
      }
      if (l.data.kind === "cluster") {
        // Expand parent so cluster resolves.
        if (l.parent) toggleHub(l.parent.data.id);
        return;
      }
      // Hub → toggle expansion + focus.
      toggleHub(l.data.id);
      focusNode(l.data.id, Math.max(transform.k, 1.2));
    },
    [select, toggleHub, focusNode, transform.k],
  );

  const handleNodeDoubleClick = useCallback(
    (l: LaidOut) => focusNode(l.data.id, 2.0),
    [focusNode],
  );

  // ── Keyboard ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "f" || e.key === "F") { fitView(); }
      else if (e.key === "Escape") { select(null); }
      else if (e.key === "Enter" && hoverTreeId) {
        const l = layout.byId.get(hoverTreeId);
        if (l) handleNodeClick(l);
      } else if (e.key === "/") {
        e.preventDefault();
        const inp = document.getElementById("tree-search-input") as HTMLInputElement | null;
        inp?.focus();
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        // Move to nearest node in the direction relative to current selection.
        const current = selectedId
          ? graphIdToLeaf.get(selectedId)
          : hoverTreeId
            ? layout.byId.get(hoverTreeId)
            : layout.byId.get(taxonomy.root.id);
        if (!current) return;
        e.preventDefault();
        const dir = e.key;
        let best: LaidOut | null = null;
        let bestScore = Infinity;
        for (const other of layout.laid) {
          if (other === current) continue;
          const dx = other.x - current.x;
          const dy = other.y - current.y;
          const aligned =
            (dir === "ArrowRight" && dx > 0 && Math.abs(dy) < Math.abs(dx)) ||
            (dir === "ArrowLeft"  && dx < 0 && Math.abs(dy) < Math.abs(dx)) ||
            (dir === "ArrowUp"    && dy < 0 && Math.abs(dx) < Math.abs(dy)) ||
            (dir === "ArrowDown"  && dy > 0 && Math.abs(dx) < Math.abs(dy));
          if (!aligned) continue;
          const d = Math.hypot(dx, dy);
          if (d < bestScore) { bestScore = d; best = other; }
        }
        if (best) {
          setHoverTreeId(best.data.id);
          focusNode(best.data.id);
          if (best.data.node) hover(best.data.node.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fitView, select, hoverTreeId, layout, handleNodeClick, selectedId, graphIdToLeaf, taxonomy.root.id, focusNode, hover]);

  // ── Rendering ───────────────────────────────────────────────────
  const isVisible = useCallback(
    (l: LaidOut) => {
      if (filteredIds && !filteredIds.has(l.data.id)) return false;
      return true;
    },
    [filteredIds],
  );

  const isDimmed = useCallback(
    (l: LaidOut) => {
      if (!selectedId && !hoverTreeId && searchMatch.size === 0 && activeDepts.size === 0) return false;
      if (activeDepts.size > 0 && l.data.kind !== "root" && !activeDepts.has(l.data.dept)) return true;
      if (highlightPath.size > 0 && highlightPath.has(l.data.id)) return false;
      if (hoverPath.size > 0 && hoverPath.has(l.data.id)) return false;
      if (searchMatch.size > 0 && searchMatch.has(l.data.id)) return false;
      if (selectedId || hoverTreeId || searchMatch.size) return true;
      return false;
    },
    [selectedId, hoverTreeId, highlightPath, hoverPath, searchMatch, activeDepts],
  );

  // Zoom-based label gating.
  const zoom = transform.k;
  const showLeafLabels = showLabels && zoom > 1.2;
  const showSubhubLabels = showLabels && zoom > 0.6;

  const selectedTreeNode = selectedId ? graphIdToLeaf.get(selectedId) : null;
  const breadcrumbs: LaidOut[] = [];
  {
    let cur = selectedTreeNode ?? undefined;
    while (cur) { breadcrumbs.unshift(cur); cur = cur.parent; }
  }

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden select-none touch-none"
      style={{
        background:
          "radial-gradient(ellipse at 50% 100%, #12312e 0%, #0b1f21 45%, #050d10 100%)",
      }}
    >
      {/* Star-dust parallax */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.06) 0.5px, transparent 1px), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.05) 0.5px, transparent 1px), radial-gradient(circle at 40% 60%, rgba(255,255,255,0.05) 0.5px, transparent 1px)",
          backgroundSize: "260px 260px, 220px 220px, 340px 340px",
        }}
      />

      <svg
        width={size.w}
        height={size.h}
        className="block cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onClick={onBackgroundClick}
      >
        <defs>
          <radialGradient id="iit-root-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#f5edcf" stopOpacity={1} />
            <stop offset="100%" stopColor="#6a8a86" stopOpacity={1} />
          </radialGradient>
          {layout.laid
            .filter((l) => l.data.node?.image)
            .map((l) => (
              <clipPath id={`iit-clip-${l.data.id}`} key={`clip-${l.data.id}`}>
                <circle cx={0} cy={0} r={16} />
              </clipPath>
            ))}
          <filter id="iit-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {/* Branches */}
          {layout.links.map((ln, i) => {
            const src = ln.source;
            const tgt = ln.target;
            if (!isVisible(tgt)) return null;
            const depth =
              tgt.data.kind === "department" ? 1 :
              tgt.data.kind === "community"  ? 2 :
              tgt.data.kind === "subhub"     ? 3 : 4;
            const width = Math.max(1.2, 7 - depth * 1.35);
            const color = tgt.data.color;
            const active = highlightPath.has(tgt.data.id) || hoverPath.has(tgt.data.id);
            const dim = isDimmed(tgt);
            const opacity = dim ? 0.12 : active ? 1 : tgt.data.kind === "leaf" ? 0.55 : 0.82;
            return (
              <path
                key={i}
                d={branchPath(src.x, src.y, tgt.x, tgt.y)}
                stroke={color}
                strokeOpacity={opacity}
                strokeWidth={active ? width + 1 : width}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}

          {/* Nodes */}
          {layout.laid.map((l) => {
            if (!isVisible(l)) return null;
            const { x, y } = l;
            const kind = l.data.kind;
            const color = l.data.color;
            const isSelected = l.data.node ? selectedId === l.data.node.id : selectedId === l.data.id;
            const isHovered = hoverTreeId === l.data.id;
            const isSearched = searchMatch.has(l.data.id);
            const dim = isDimmed(l);

            const onEnter = () => {
              setHoverTreeId(l.data.id);
              if (l.data.node) hover(l.data.node.id);
            };
            const onLeave = () => {
              setHoverTreeId((prev) => (prev === l.data.id ? null : prev));
              hover(null);
            };
            const onClick = (e: React.MouseEvent) => { e.stopPropagation(); handleNodeClick(l); };
            const onDouble = (e: React.MouseEvent) => { e.stopPropagation(); handleNodeDoubleClick(l); };

            if (kind === "root") {
              return (
                <g key={l.data.id} transform={`translate(${x} ${y})`} onClick={onClick} style={{ cursor: "pointer" }}>
                  <circle r={56} fill="#0b1f21" stroke="#8fa8a2" strokeWidth={2} />
                  <circle r={46} fill="url(#iit-root-glow)" />
                  <text textAnchor="middle" dy={-2} fill="#0b1f21" fontSize={11} fontWeight={800}
                    style={{ letterSpacing: "0.28em" }}>INFINITE</text>
                  <text textAnchor="middle" dy={12} fill="#0b1f21" fontSize={11} fontWeight={800}
                    style={{ letterSpacing: "0.28em" }}>ISM</text>
                  <text y={78} textAnchor="middle" fill="#e5eae2" fontSize={8.5} fontWeight={600}
                    style={{ letterSpacing: "0.28em" }}>{TREE_ROOT_SUB}</text>
                </g>
              );
            }

            if (kind === "department") {
              const pillW = 190, pillH = 40;
              const glowing = isSelected || isHovered || isSearched || activeDepts.has(l.data.dept);
              return (
                <g key={l.data.id} transform={`translate(${x} ${y})`}
                   onClick={onClick} onDoubleClick={onDouble}
                   onMouseEnter={onEnter} onMouseLeave={onLeave}
                   style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}>
                  {glowing && (
                    <rect x={-pillW/2 - 6} y={-pillH/2 - 6} width={pillW + 12} height={pillH + 12}
                          rx={(pillH + 12)/2} fill="none" stroke={color} strokeOpacity={0.65} strokeWidth={2} />
                  )}
                  <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2}
                        fill={color} stroke="#05161a" strokeWidth={2} />
                  <text textAnchor="middle" dy={5} fill="#04211e" fontSize={12} fontWeight={800}
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
                <g key={l.data.id} transform={`translate(${x} ${y})`}
                   onClick={onClick} onDoubleClick={onDouble}
                   onMouseEnter={onEnter} onMouseLeave={onLeave}
                   style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}>
                  <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2}
                        fill={color} stroke="#05161a" strokeWidth={1.5}
                        opacity={0.92} />
                  <text textAnchor="middle" dy={4} fill="#04211e" fontSize={10} fontWeight={800}
                        style={{ letterSpacing: "0.14em", pointerEvents: "none" }}>{label}</text>
                </g>
              );
            }

            if (kind === "subhub" || kind === "cluster") {
              const label = truncate(l.data.label, 22);
              const pillW = Math.max(80, label.length * 5.6 + 22);
              const pillH = 20;
              return (
                <g key={l.data.id} transform={`translate(${x} ${y})`}
                   onClick={onClick} onDoubleClick={onDouble}
                   onMouseEnter={onEnter} onMouseLeave={onLeave}
                   style={{ cursor: "pointer", opacity: dim ? 0.2 : 1 }}>
                  <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2}
                        fill={kind === "cluster" ? "#0b1f21" : color}
                        stroke={kind === "cluster" ? color : "#05161a"} strokeWidth={1.2}
                        opacity={kind === "cluster" ? 0.9 : 0.95} />
                  {showSubhubLabels && (
                    <text textAnchor="middle" dy={3.5}
                          fill={kind === "cluster" ? color : "#04211e"}
                          fontSize={8.5} fontWeight={800}
                          style={{ letterSpacing: "0.1em", pointerEvents: "none" }}>{label}</text>
                  )}
                </g>
              );
            }

            // Leaf.
            const r = Math.min(20, Math.max(9, 9 + Math.log2((l.data.weight ?? 0) + 1) * 2));
            const hasImg = !!l.data.node?.image;
            const showLabel = isSelected || isHovered || isSearched || showLeafLabels;
            return (
              <g key={l.data.id} transform={`translate(${x} ${y})`}
                 onClick={onClick} onDoubleClick={onDouble}
                 onMouseEnter={onEnter} onMouseLeave={onLeave}
                 style={{ cursor: "pointer", opacity: dim ? 0.15 : 1 }}>
                {(isSelected || isHovered || isSearched) && (
                  <circle r={r + 8} fill="none" stroke={color} strokeOpacity={0.7} strokeWidth={2}
                          filter="url(#iit-glow)" />
                )}
                <circle r={r + 2} fill="#0b1f21" />
                <circle r={r + 2} fill="none" stroke={color} strokeWidth={1.75} opacity={0.95} />
                {hasImg ? (
                  <image href={l.data.node!.image} x={-r} y={-r} width={r*2} height={r*2}
                         clipPath={`url(#iit-clip-${l.data.id})`}
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
          })}
        </g>
      </svg>

      {/* Header */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 text-center pointer-events-none">
        <div className="font-sora text-xl sm:text-3xl tracking-[0.4em] text-white/95 font-light">
          INFINITE ISM TREE
        </div>
        <div className="font-mono text-[10px] tracking-[0.35em] text-white/40 mt-1">
          CAPISM · SECOND BRAIN TAXONOMY
        </div>
      </div>

      {/* Corner marks */}
      <div className="absolute top-5 left-5 pointer-events-none">
        <div className="flex gap-1">
          {DEPARTMENTS.map((d) => (
            <div key={d.key} className="w-3 h-3" style={{ background: d.color }} />
          ))}
        </div>
        <div className="font-mono text-[9px] text-white/40 mt-2 tracking-widest">CAPISM<br/>CHARTS</div>
      </div>
      <div className="absolute top-5 right-5 text-right pointer-events-none font-mono text-[9px] text-white/50 tracking-widest leading-relaxed">
        © 2026<br/>MR. CAP<br/>INFINITE-ISM
      </div>

      {/* Legend / dept filter */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-1.5">
        <div className="font-mono text-[9px] text-white/70 tracking-[0.25em] mb-1">DEPARTMENTS</div>
        {DEPARTMENTS.map((d) => {
          const on = activeDepts.size === 0 || activeDepts.has(d.key);
          const count = taxonomy.totalByDept[d.key];
          return (
            <button
              key={d.key}
              onClick={() => setActiveDepts((prev) => {
                const n = new Set(prev);
                if (n.has(d.key)) n.delete(d.key); else n.add(d.key);
                return n;
              })}
              className="flex items-center gap-2 text-left group"
              style={{ opacity: on ? 1 : 0.35 }}
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

      {/* Right-side density + camera controls */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
        <input
          id="tree-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tree… (/)"
          className="w-56 px-3 py-1.5 rounded-md text-[11px] font-mono bg-black/40 border border-white/15 text-white/90 placeholder-white/30 focus:outline-none focus:border-white/40 backdrop-blur"
        />
        <div className="flex gap-1">
          {(["overview","standard","expanded"] as DensityMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setDensity(m)}
              className="px-2.5 py-1 rounded-md text-[10px] font-mono tracking-widest bg-black/40 border backdrop-blur"
              style={{
                borderColor: density === m ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.15)",
                color: density === m ? "#fff" : "rgba(255,255,255,0.6)",
              }}
            >{m.toUpperCase()}</button>
          ))}
        </div>
        <div className="flex gap-1">
          <button onClick={fitView}
            className="px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest bg-black/40 border border-white/15 text-white/70 hover:text-white hover:border-white/40 backdrop-blur">
            FIT VIEW · F
          </button>
          <button onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
            className="px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest bg-black/40 border border-white/15 text-white/70 hover:text-white hover:border-white/40 backdrop-blur">
            RESET
          </button>
        </div>
      </div>

      {/* Breadcrumbs */}
      {breadcrumbs.length > 1 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 border border-white/15 backdrop-blur pointer-events-auto">
          {breadcrumbs.map((b, i) => (
            <div key={b.data.id} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-white/30 text-[10px]">›</span>}
              <button
                onClick={() => focusNode(b.data.id, Math.max(transform.k, 1.2))}
                className="font-mono text-[10px] tracking-widest text-white/70 hover:text-white"
                style={{ color: b.data.kind === "root" ? "#e5eae2" : b.data.color }}
              >
                {truncate(b.data.label, 22)}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default InfiniteIsmTree;