import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";

const HUB_ID = "site_mrcap1_com";
const MAX_KINGDOMS = 8;
const MAX_PER_KINGDOM = 48;
const KINGDOM_COLORS = [
  "#F5D33F", // gold — birds/mammals band
  "#F97B5A", // coral — reptiles
  "#EF476F", // rose — anthropods
  "#8B5CF6", // violet — inverts
  "#5AC8B0", // teal — fish
  "#8DD35F", // green — plantae
  "#D4A574", // tan — fungi
  "#60A5FA", // blue — bacteria
];

type TreeDatum = {
  id: string;
  label: string;
  node?: GraphNode;
  kingdomIdx?: number;
  kingdomName?: string;
  isGrouping?: boolean;
  children?: TreeDatum[];
};

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function TreeOfLifeCanvas({ graph }: { graph: NormalizedGraph }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 900 });
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const selectedId = useGraphStore((s) => s.selectedId);
  const select = useGraphStore((s) => s.select);
  const hoveredId = useGraphStore((s) => s.hoveredId);
  const hover = useGraphStore((s) => s.hover);
  const showLabels = useGraphStore((s) => s.showLabels);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ w: Math.max(320, cr.width), h: Math.max(320, cr.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rootData = useMemo<TreeDatum>(() => {
    const hub = graph.byId.get(HUB_ID) ?? graph.nodes[0];
    const kingdoms = graph.communities.slice(0, MAX_KINGDOMS);
    const membersByCommunity = new Map<number, GraphNode[]>();
    for (const n of graph.nodes) {
      if (n.community == null) continue;
      const list = membersByCommunity.get(n.community) ?? [];
      list.push(n);
      membersByCommunity.set(n.community, list);
    }

    const kingdomChildren: TreeDatum[] = kingdoms.map((k, idx) => {
      const members = (membersByCommunity.get(k.id) ?? [])
        .filter((n) => n.id !== hub.id)
        .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
        .slice(0, MAX_PER_KINGDOM);

      // Split members into "class" buckets so branches read as a real tree.
      const classCount = Math.max(1, Math.min(4, Math.ceil(members.length / 10)));
      const classes: TreeDatum[] = Array.from({ length: classCount }, (_, c) => ({
        id: `${k.id}-class-${c}`,
        label: "",
        isGrouping: true,
        kingdomIdx: idx,
        kingdomName: k.name,
        children: [],
      }));
      members.forEach((m, i) => {
        classes[i % classCount].children!.push({
          id: m.id,
          label: m.label,
          node: m,
          kingdomIdx: idx,
          kingdomName: k.name,
        });
      });
      // Drop empty classes
      const nonEmpty = classes.filter((c) => (c.children?.length ?? 0) > 0);
      return {
        id: `kingdom-${k.id}`,
        label: k.name,
        kingdomIdx: idx,
        kingdomName: k.name,
        children: nonEmpty.length ? nonEmpty : undefined,
      };
    });

    return {
      id: "LUCA",
      label: hub.label,
      node: hub,
      children: kingdomChildren,
    };
  }, [graph]);

  const layout = useMemo(() => {
    const root = hierarchy<TreeDatum>(rootData);
    const radius = Math.min(size.w, size.h) * 0.85;
    // Fan across upper ~260°.
    const t = tree<TreeDatum>().size([Math.PI * 1.55, radius]);
    return t(root);
  }, [rootData, size.w, size.h]);

  const cx = size.w / 2;
  const cy = size.h - 80;

  const polar = (n: HierarchyPointNode<TreeDatum>) => {
    // Center the arc pointing upward.
    const angle = n.x - Math.PI * 0.775 - Math.PI / 2;
    const r = n.y;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  };

  const nodes = layout.descendants();
  const links = layout.links();
  const imgNodes = nodes.filter((n) => n.data.node?.image);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.target !== e.currentTarget && (e.target as Element).tagName !== "svg") {
      // still allow drag from svg background
    }
    dragRef.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setTransform((t) => ({ ...t, x: dragRef.current!.tx + dx, y: dragRef.current!.ty + dy }));
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setTransform((t) => {
      const k = Math.min(4, Math.max(0.3, t.k * (1 + delta)));
      // Zoom toward cursor
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, k };
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const scale = k / t.k;
      return {
        k,
        x: px - (px - t.x) * scale,
        y: py - (py - t.y) * scale,
      };
    });
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden select-none touch-none"
      style={{
        background:
          "radial-gradient(ellipse at 50% 100%, #16403d 0%, #0d2a2a 45%, #06181a 100%)",
      }}
    >
      <svg
        width={size.w}
        height={size.h}
        className="block cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <defs>
          {imgNodes.map((n) => (
            <clipPath id={`tree-clip-${n.data.id}`} key={`clip-${n.data.id}`}>
              <circle cx={0} cy={0} r={n.depth === 1 ? 24 : 16} />
            </clipPath>
          ))}
          <radialGradient id="tree-root-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e9e2c8" stopOpacity={1} />
            <stop offset="100%" stopColor="#3d5a55" stopOpacity={1} />
          </radialGradient>
        </defs>

        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {/* Links first so nodes render on top */}
          {links.map((l, i) => {
            const src = polar(l.source);
            const tgt = polar(l.target);
            const idx = (l.target.data.kingdomIdx ?? l.source.data.kingdomIdx ?? 0) % KINGDOM_COLORS.length;
            const color = KINGDOM_COLORS[idx];
            const depth = l.target.depth;
            const width = Math.max(1.2, 9 - depth * 2.2);
            // Elbow curve — vertical then arc into child, poster-like.
            const midY = src.y + (tgt.y - src.y) * 0.55;
            const d = `M ${src.x} ${src.y} C ${src.x} ${midY}, ${tgt.x} ${midY}, ${tgt.x} ${tgt.y}`;
            return (
              <path
                key={i}
                d={d}
                stroke={color}
                strokeOpacity={l.source.depth === 0 ? 0.75 : 0.55}
                strokeWidth={width}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}

          {nodes.map((n) => {
            if (n.data.isGrouping && !n.data.node) return null;
            const { x, y } = polar(n);
            const isRoot = n.depth === 0;
            const isKingdom = n.depth === 1;
            const idx = (n.data.kingdomIdx ?? 0) % KINGDOM_COLORS.length;
            const color = isRoot ? "#f0e8cf" : KINGDOM_COLORS[idx];
            const r = isRoot ? 42 : isKingdom ? 26 : 16;
            const nodeId = n.data.node?.id ?? n.data.id;
            const isSelected = selectedId === nodeId;
            const isHovered = hoveredId === nodeId;
            const hasImg = !!n.data.node?.image;
            const showLabel =
              isRoot ||
              isKingdom ||
              isSelected ||
              isHovered ||
              (showLabels && n.depth <= 3);
            return (
              <g
                key={n.data.id}
                transform={`translate(${x} ${y})`}
                onMouseEnter={() => n.data.node && hover(n.data.node.id)}
                onMouseLeave={() => hover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (n.data.node) select(n.data.node.id);
                }}
                style={{ cursor: n.data.node ? "pointer" : "default" }}
              >
                {(isSelected || isHovered) && (
                  <circle
                    r={r + 8}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0.5}
                    strokeWidth={2}
                  />
                )}
                <circle r={r + 2} fill="#06181a" />
                <circle
                  r={r + 2}
                  fill="none"
                  stroke={color}
                  strokeWidth={isKingdom ? 2.5 : isRoot ? 3 : 1.75}
                  opacity={0.95}
                />
                {isRoot ? (
                  <>
                    <circle r={r} fill="url(#tree-root-glow)" />
                    <text
                      textAnchor="middle"
                      dy={4}
                      fill="#0d2828"
                      fontSize={11}
                      fontWeight={800}
                      style={{ letterSpacing: "0.12em" }}
                    >
                      LUCA
                    </text>
                  </>
                ) : hasImg ? (
                  <image
                    href={n.data.node!.image}
                    x={-r}
                    y={-r}
                    width={r * 2}
                    height={r * 2}
                    clipPath={`url(#tree-clip-${n.data.id})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <circle r={r} fill={color} fillOpacity={0.28} />
                )}
                {showLabel && (
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fill={isRoot || isKingdom ? "#f4f0dc" : "#c9d1c8"}
                    fontSize={isRoot ? 12 : isKingdom ? 10 : 8.5}
                    fontWeight={isRoot || isKingdom ? 700 : 500}
                    style={{
                      textTransform: isKingdom || isRoot ? "uppercase" : "none",
                      letterSpacing: isKingdom || isRoot ? "0.14em" : "0.02em",
                      pointerEvents: "none",
                      paintOrder: "stroke",
                      stroke: "#06181a",
                      strokeWidth: 3,
                      strokeLinejoin: "round",
                    }}
                  >
                    {truncate(isRoot ? "MRCAP1.COM" : n.data.label || "", isKingdom ? 26 : 22)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center pointer-events-none">
        <div className="font-sora text-lg sm:text-2xl tracking-[0.35em] text-white/80">
          EVOLUTIONARY TREE OF THOUGHT
        </div>
        <div className="font-mono text-[10px] text-white/40 mt-1 tracking-widest">
          KINGDOMS · CLASSES · SPECIMENS · drag to pan · scroll to zoom
        </div>
      </div>

      <button
        type="button"
        onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
        className="absolute bottom-4 right-4 px-3 py-1.5 rounded-md text-[10px] font-mono tracking-widest bg-black/40 border border-white/15 text-white/70 hover:text-white hover:border-white/40 backdrop-blur"
      >
        RESET VIEW
      </button>
    </div>
  );
}
