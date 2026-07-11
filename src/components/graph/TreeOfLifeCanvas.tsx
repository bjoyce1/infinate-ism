import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";

const HUB_ID = "site_mrcap1_com";
const MAX_KINGDOMS = 6;
const MAX_PER_KINGDOM = 60;

// Poster-accurate palette, ordered LEFT → RIGHT across the fan so branches
// flow: plants (green) → fungi (tan) → invertebrates/animals (blue/violet) →
// reptiles (coral) → birds & mammals (gold).
type KingdomSpec = {
  key: string;
  name: string;
  color: string;
  pill: string;   // solid pill fill
  ink: string;    // text on pill
  domain: "EUKARYOTES" | "BACTERIA" | "ARCHAEA" | "VIRUSES";
};

const KINGDOMS: KingdomSpec[] = [
  { key: "plantae",   name: "PLANTAE KINGDOM",   color: "#7BC96F", pill: "#6BB35C", ink: "#0d2828", domain: "EUKARYOTES" },
  { key: "fungi",     name: "FUNGI KINGDOM",     color: "#D4B074", pill: "#C69C5B", ink: "#0d2828", domain: "EUKARYOTES" },
  { key: "inverts",   name: "INVERTEBRATA",      color: "#8FB4E8", pill: "#6E97D8", ink: "#0d2828", domain: "EUKARYOTES" },
  { key: "fish",      name: "PISCES",            color: "#B08BD8", pill: "#956FC5", ink: "#0d2828", domain: "EUKARYOTES" },
  { key: "reptiles",  name: "REPTILIA",          color: "#F0836A", pill: "#DB6A50", ink: "#0d2828", domain: "EUKARYOTES" },
  { key: "mammals",   name: "MAMMALIA & AVES",   color: "#F5D33F", pill: "#E6C232", ink: "#0d2828", domain: "EUKARYOTES" },
];

type TreeDatum = {
  id: string;
  label: string;
  node?: GraphNode;
  kingdomIdx?: number;
  kingdomName?: string;
  isGrouping?: boolean;
  isDomain?: boolean;
  isKingdomPill?: boolean;
  domain?: KingdomSpec["domain"];
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
    const membersByCommunity = new Map<number, GraphNode[]>();
    for (const n of graph.nodes) {
      if (n.community == null) continue;
      const list = membersByCommunity.get(n.community) ?? [];
      list.push(n);
      membersByCommunity.set(n.community, list);
    }

    // Map real graph communities onto our 6 named kingdoms in order.
    const sourceCommunities = graph.communities.slice(0, MAX_KINGDOMS);

    const kingdomChildren: TreeDatum[] = KINGDOMS.map((k, idx) => {
      const src = sourceCommunities[idx];
      const members = (src ? membersByCommunity.get(src.id) ?? [] : [])
        .filter((n) => n.id !== hub.id)
        .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
        .slice(0, MAX_PER_KINGDOM);

      // Split into "class" branches — 2–5 clusters per kingdom.
      const classCount = Math.max(2, Math.min(5, Math.ceil(members.length / 12)));
      const classes: TreeDatum[] = Array.from({ length: classCount }, (_, c) => ({
        id: `${k.key}-class-${c}`,
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
      const nonEmpty = classes.filter((c) => (c.children?.length ?? 0) > 0);
      return {
        id: `kingdom-${k.key}`,
        label: k.name,
        kingdomIdx: idx,
        kingdomName: k.name,
        isKingdomPill: true,
        children: nonEmpty.length ? nonEmpty : undefined,
      };
    });

    // Wrap all kingdoms under one EUKARYOTES domain node so the mid layer
    // reads like the reference poster.
    const eukaryotes: TreeDatum = {
      id: "domain-eukaryotes",
      label: "EUKARYOTES",
      isDomain: true,
      domain: "EUKARYOTES",
      children: kingdomChildren,
    };

    return {
      id: "LUCA",
      label: hub.label,
      node: hub,
      children: [eukaryotes],
    };
  }, [graph]);

  const layout = useMemo(() => {
    const root = hierarchy<TreeDatum>(rootData);
    const radius = Math.min(size.w * 0.55, size.h * 0.92);
    // Fan across upper ~200°, kept symmetric so it feels like a poster.
    const t = tree<TreeDatum>()
      .size([Math.PI * 1.18, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.35) / Math.max(1, a.depth));
    return t(root);
  }, [rootData, size.w, size.h]);

  const cx = size.w / 2;
  const cy = size.h - 110;

  const polar = (n: HierarchyPointNode<TreeDatum>) => {
    // Fan is centered upward.
    const angle = n.x - Math.PI * 0.59 - Math.PI / 2;
    const r = n.y;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  };

  const nodes = layout.descendants();
  const links = layout.links();
  const imgNodes = nodes.filter((n) => n.data.node?.image);

  const onPointerDown = (e: ReactPointerEvent) => {
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

  // Position helpers for the fixed domain row above LUCA.
  const domainRowY = cy - 90;
  const domainRow: { label: string; x: number; fill: string; small?: boolean }[] = [
    { label: "BACTERIA DOMAIN", x: cx - 260, fill: "#4a6b6a", small: true },
    { label: "EUKARYOTES",      x: cx,       fill: "#6f8f8c" },
    { label: "ARCHAEA DOMAIN",  x: cx + 260, fill: "#4a6b6a", small: true },
    { label: "VIRUSES",         x: cx + 430, fill: "#3d5a58", small: true },
  ];

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
              <circle cx={0} cy={0} r={n.depth <= 2 ? 22 : 15} />
            </clipPath>
          ))}
          <radialGradient id="tree-root-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d8d2b8" stopOpacity={1} />
            <stop offset="100%" stopColor="#5a7a76" stopOpacity={1} />
          </radialGradient>
        </defs>

        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {/* Trunk: LUCA → domain row spine */}
          {domainRow.map((d) => (
            <path
              key={`spine-${d.label}`}
              d={`M ${cx} ${cy} C ${cx} ${(cy + domainRowY) / 2}, ${d.x} ${(cy + domainRowY) / 2}, ${d.x} ${domainRowY}`}
              stroke="#4a6b6a"
              strokeWidth={d.small ? 2.4 : 4}
              strokeOpacity={0.85}
              strokeLinecap="round"
              fill="none"
            />
          ))}

          {/* Kingdom links (poster body) */}
          {links.map((l, i) => {
            // Skip the invisible root→domain link (drawn as trunk above).
            if (l.source.depth === 0) return null;
            const src = polar(l.source);
            const tgt = polar(l.target);
            const idx = (l.target.data.kingdomIdx ?? l.source.data.kingdomIdx ?? 0) % KINGDOMS.length;
            const color = KINGDOMS[idx].color;
            const depth = l.target.depth;
            const width = Math.max(1.2, 10 - depth * 2);
            // Radial cubic — curves along the arc rather than snapping to elbows.
            const dx = tgt.x - src.x;
            const dy = tgt.y - src.y;
            const c1x = src.x + dx * 0.15;
            const c1y = src.y + dy * 0.7;
            const c2x = src.x + dx * 0.85;
            const c2y = src.y + dy * 0.35;
            const d = `M ${src.x} ${src.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tgt.x} ${tgt.y}`;
            return (
              <path
                key={i}
                d={d}
                stroke={color}
                strokeOpacity={l.source.data.isKingdomPill ? 0.85 : 0.55}
                strokeWidth={width}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}

          {/* Fixed domain row (BACTERIA · EUKARYOTES · ARCHAEA · VIRUSES) */}
          {domainRow.map((d) => (
            <g key={`domain-${d.label}`} transform={`translate(${d.x} ${domainRowY})`}>
              <circle r={d.small ? 22 : 30} fill="#06181a" />
              <circle r={d.small ? 22 : 30} fill={d.fill} fillOpacity={0.6} stroke="#8bb0ad" strokeOpacity={0.5} strokeWidth={1.2} />
              <text
                textAnchor="middle"
                dy={4}
                fill="#f4f0dc"
                fontSize={d.small ? 6.5 : 7.5}
                fontWeight={700}
                style={{ letterSpacing: "0.12em", pointerEvents: "none" }}
              >
                {d.label}
              </text>
            </g>
          ))}

          {nodes.map((n) => {
            if (n.data.isGrouping && !n.data.node) return null;
            if (n.data.isDomain) return null; // domain row is drawn separately
            const { x, y } = polar(n);
            const isRoot = n.depth === 0;
            const isKingdom = !!n.data.isKingdomPill;
            const idx = (n.data.kingdomIdx ?? 0) % KINGDOMS.length;
            const spec = KINGDOMS[idx];
            const color = isRoot ? "#d8d2b8" : spec.color;
            const r = isRoot ? 46 : isKingdom ? 0 : 15;
            const nodeId = n.data.node?.id ?? n.data.id;
            const isSelected = selectedId === nodeId;
            const isHovered = hoveredId === nodeId;
            const hasImg = !!n.data.node?.image;
            const showLabel =
              isRoot ||
              isKingdom ||
              isSelected ||
              isHovered ||
              (showLabels && n.depth <= 4);

            // Kingdom row is rendered as a colored pill (rounded rect), matching the poster.
            if (isKingdom) {
              const pillW = 138;
              const pillH = 30;
              return (
                <g
                  key={n.data.id}
                  transform={`translate(${x} ${y})`}
                  onClick={(e) => { e.stopPropagation(); }}
                >
                  <rect
                    x={-pillW / 2}
                    y={-pillH / 2}
                    width={pillW}
                    height={pillH}
                    rx={pillH / 2}
                    fill={spec.pill}
                    stroke="#06181a"
                    strokeWidth={1.5}
                  />
                  <text
                    textAnchor="middle"
                    dy={4}
                    fill={spec.ink}
                    fontSize={10.5}
                    fontWeight={800}
                    style={{ letterSpacing: "0.14em", pointerEvents: "none" }}
                  >
                    {spec.name}
                  </text>
                </g>
              );
            }

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
                  strokeWidth={isRoot ? 3 : 1.75}
                  opacity={0.95}
                />
                {isRoot ? (
                  <>
                    <circle r={r} fill="url(#tree-root-glow)" />
                    <text
                      textAnchor="middle"
                      dy={5}
                      fill="#0d2828"
                      fontSize={13}
                      fontWeight={800}
                      style={{ letterSpacing: "0.18em" }}
                    >
                      "LUCA"
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
                  <circle r={r} fill={color} fillOpacity={0.32} />
                )}
                {showLabel && (
                  <text
                    y={r + 12}
                    textAnchor="middle"
                    fill={isRoot ? "#f4f0dc" : "#d4dcd2"}
                    fontSize={isRoot ? 12 : 7.5}
                    fontWeight={isRoot ? 700 : 500}
                    style={{
                      textTransform: isRoot ? "uppercase" : "none",
                      letterSpacing: isRoot ? "0.18em" : "0.03em",
                      pointerEvents: "none",
                      paintOrder: "stroke",
                      stroke: "#06181a",
                      strokeWidth: 2.5,
                      strokeLinejoin: "round",
                    }}
                  >
                    {truncate(isRoot ? "MRCAP1.COM" : n.data.label || "", 20)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Poster header */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 text-center pointer-events-none">
        <div className="font-sora text-xl sm:text-3xl tracking-[0.4em] text-white/90 font-light">
          EVOLUTIONARY TREE OF THOUGHT
        </div>
      </div>
      <div className="absolute top-5 left-5 pointer-events-none">
        <div className="flex gap-1">
          <div className="w-3 h-3 bg-[#F5D33F]" />
          <div className="w-3 h-3 bg-[#F0836A]" />
          <div className="w-3 h-3 bg-[#8FB4E8]" />
        </div>
        <div className="font-mono text-[9px] text-white/40 mt-2 tracking-widest">MRCAP<br/>CHARTS</div>
      </div>
      <div className="absolute top-5 right-5 text-right pointer-events-none">
        <div className="font-mono text-[9px] text-white/50 tracking-widest leading-relaxed">
          © 2026<br/>MR. CAP<br/>INFINITE-ISM.LOVABLE.APP
        </div>
      </div>

      {/* Taxonomic ranks legend, bottom-left, mimicking the poster */}
      <div className="absolute bottom-6 left-6 pointer-events-none font-mono text-[9px] text-white/50 tracking-widest leading-relaxed">
        <div className="text-white/70 mb-1">Taxonomic Ranks</div>
        <div>DOMAIN</div>
        <div>KINGDOM</div>
        <div>PHYLUM</div>
        <div>CLASS</div>
        <div>ORDER</div>
        <div>GENUS</div>
        <div>SPECIES</div>
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
