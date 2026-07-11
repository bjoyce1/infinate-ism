import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";

const HUB_ID = "site_mrcap1_com";

// ── Poster taxonomy ───────────────────────────────────────────────────────
// The reference poster reads bottom-up:  LUCA → DOMAIN row → KINGDOM pills →
// CLASS pills → circular photo specimens. We mirror that structure with
// three kingdoms and split the graph's real communities into "Class"
// branches distributed across them.

type KingdomSpec = {
  key: "plantae" | "fungi" | "animalia";
  name: string;
  color: string;   // branch + pill fill
  ink: string;     // text on pill
};

const KINGDOMS: KingdomSpec[] = [
  { key: "plantae",  name: "PLANTAE KINGDOM",  color: "#7BC96F", ink: "#0d2828" },
  { key: "fungi",    name: "FUNGI KINGDOM",    color: "#D4B074", ink: "#0d2828" },
  { key: "animalia", name: "ANIMALIA KINGDOM", color: "#6E97D8", ink: "#0d2828" },
];

// Distinct hues for individual CLASS branches within a kingdom, in the
// spirit of the poster (mammals=gold, reptiles=coral, birds=peach, fish=violet,
// inverts=blue, plants=greens, fungi=tans).
const CLASS_PALETTE = [
  "#F5D33F", "#F0836A", "#F5A76A", "#B08BD8",
  "#8FB4E8", "#7BC96F", "#D4B074", "#9BD98E",
  "#E6C88A", "#C8A2E0", "#6E97D8", "#EFA0A0",
];

type TreeDatum = {
  id: string;
  label: string;
  node?: GraphNode;
  kingdomIdx?: number;
  classIdx?: number;
  color?: string;
  kind: "root" | "domain" | "kingdom" | "class" | "specimen" | "spacer";
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

    // Order communities by size (biggest first) then round-robin them across
    // the three kingdoms so each kingdom gets a set of "Class" branches.
    const orderedCommunities = [...graph.communities].sort(
      (a, b) => b.count - a.count,
    );

    const kingdomBuckets: Array<Array<{
      commId: number;
      commName: string;
      members: GraphNode[];
    }>> = [[], [], []];

    orderedCommunities.forEach((c, i) => {
      const members = (membersByCommunity.get(c.id) ?? [])
        .filter((n) => n.id !== hub.id)
        .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
        .slice(0, 22); // cap so the poster stays legible
      if (!members.length) return;
      kingdomBuckets[i % 3].push({ commId: c.id, commName: c.name, members });
    });

    let classCounter = 0;
    const kingdomNodes: TreeDatum[] = KINGDOMS.map((k, kIdx) => {
      const classes = kingdomBuckets[kIdx].map((bucket) => {
        const classIdx = classCounter++;
        const color = CLASS_PALETTE[classIdx % CLASS_PALETTE.length];
        // Split each class into 2 sub-branches so the fan looks organic
        // rather than one straight comb.
        const half = Math.ceil(bucket.members.length / 2);
        const branchA = bucket.members.slice(0, half);
        const branchB = bucket.members.slice(half);
        const mkSpec = (m: GraphNode): TreeDatum => ({
          id: m.id,
          label: m.label,
          node: m,
          kingdomIdx: kIdx,
          classIdx,
          color,
          kind: "specimen",
        });
        const subBranches: TreeDatum[] = [
          {
            id: `class-${classIdx}-a`,
            label: "",
            kingdomIdx: kIdx,
            classIdx,
            color,
            kind: "spacer",
            children: branchA.map(mkSpec),
          },
        ];
        if (branchB.length) {
          subBranches.push({
            id: `class-${classIdx}-b`,
            label: "",
            kingdomIdx: kIdx,
            classIdx,
            color,
            kind: "spacer",
            children: branchB.map(mkSpec),
          });
        }
        return {
          id: `class-${classIdx}`,
          label: `${bucket.commName} CLASS`.toUpperCase(),
          kingdomIdx: kIdx,
          classIdx,
          color,
          kind: "class" as const,
          children: subBranches,
        };
      });

      return {
        id: `kingdom-${k.key}`,
        label: k.name,
        kingdomIdx: kIdx,
        color: k.color,
        kind: "kingdom" as const,
        children: classes.length ? classes : undefined,
      };
    }).filter((k) => k.children && k.children.length);

    // EUKARYOTES domain node — parent of all kingdoms.
    const eukaryotes: TreeDatum = {
      id: "domain-eukaryotes",
      label: "EUKARYOTES",
      kind: "domain",
      children: kingdomNodes,
    };

    return {
      id: "LUCA",
      label: hub.label,
      node: hub,
      kind: "root",
      children: [eukaryotes],
    };
  }, [graph]);

  // Vertical bottom-up layout — matches the poster silhouette. d3.tree
  // gives us (x = horizontal slot, y = depth). We invert y so depth grows
  // upward from LUCA at the bottom.
  const layout = useMemo(() => {
    const root = hierarchy<TreeDatum>(rootData);
    const usableW = Math.max(900, size.w - 120);
    const usableH = Math.max(560, size.h - 220);
    const t = tree<TreeDatum>()
      .size([usableW, usableH])
      .separation((a, b) => {
        if (a.data.kind === "kingdom" || b.data.kind === "kingdom") return 3;
        if (a.data.kind === "class" || b.data.kind === "class")
          return a.parent === b.parent ? 1.4 : 2.2;
        return a.parent === b.parent ? 1 : 1.5;
      });
    return t(root);
  }, [rootData, size.w, size.h]);

  const rootPoint = layout;
  const baseY = size.h - 90;               // LUCA sits here
  const topPad = 90;                        // canvas top pad
  const totalDepthPx = Math.max(560, size.h - 220);
  const project = (n: HierarchyPointNode<TreeDatum>) => {
    // Center the tree horizontally around the root's x.
    const dx = n.x - rootPoint.x;
    return {
      x: size.w / 2 + dx,
      y: baseY - (n.y * (baseY - topPad - 30)) / Math.max(1, totalDepthPx),
    };
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

  // Fixed "domain row" siblings that don't have real children in our data:
  // BACTERIA (left), ARCHAEA (right of Eukaryotes), VIRUSES (far right).
  // The real EUKARYOTES node lives in the tree and is drawn at its own
  // computed position.
  const eukaryotesNode = nodes.find((n) => n.data.id === "domain-eukaryotes");
  const eukPos = eukaryotesNode ? project(eukaryotesNode) : { x: size.w / 2, y: baseY - 120 };
  const rootPos = project(rootPoint);
  const decoyDomains = [
    { label: "BACTERIA DOMAIN", x: eukPos.x - 240, y: eukPos.y + 20 },
    { label: "ARCHAEA DOMAIN",  x: eukPos.x + 240, y: eukPos.y + 20 },
    { label: "VIRUSES",         x: eukPos.x + 420, y: eukPos.y + 20 },
  ];

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden select-none touch-none"
      style={{
        background:
          "radial-gradient(ellipse at 50% 100%, #1b3d3a 0%, #0e2726 45%, #061618 100%)",
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
              <circle cx={0} cy={0} r={16} />
            </clipPath>
          ))}
          <radialGradient id="tree-root-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d8d2b8" stopOpacity={1} />
            <stop offset="100%" stopColor="#5a7a76" stopOpacity={1} />
          </radialGradient>
        </defs>

        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
          {/* Decorative side-domain branches emerging from LUCA */}
          {decoyDomains.map((d) => (
            <path
              key={`decoy-spine-${d.label}`}
              d={`M ${rootPos.x} ${rootPos.y} C ${rootPos.x} ${(rootPos.y + d.y) / 2}, ${d.x} ${(rootPos.y + d.y) / 2}, ${d.x} ${d.y}`}
              stroke="#4a6b6a"
              strokeWidth={2.2}
              strokeOpacity={0.8}
              strokeLinecap="round"
              fill="none"
            />
          ))}

          {/* All real tree links, drawn as smooth vertical bezier branches
              coloured by kingdom (for the trunk & kingdom edges) or by
              class (for edges below a class node). */}
          {links.map((l, i) => {
            const src = project(l.source);
            const tgt = project(l.target);
            // Pick a color: class → its palette color; kingdom edge → kingdom color;
            // trunk (root→domain, domain→kingdom) → neutral teal.
            let color = "#4a6b6a";
            if (l.target.data.color) color = l.target.data.color;
            else if (l.source.data.color) color = l.source.data.color;

            const depth = l.target.depth;
            const width = Math.max(1.1, 7 - depth * 1.1);
            // Vertical bezier — bulge along y so branches feel organic.
            const midY = (src.y + tgt.y) / 2;
            const d = `M ${src.x} ${src.y} C ${src.x} ${midY}, ${tgt.x} ${midY}, ${tgt.x} ${tgt.y}`;
            const opacity =
              l.target.data.kind === "specimen" ? 0.55 :
              l.target.data.kind === "class" ? 0.9 :
              l.target.data.kind === "kingdom" ? 0.9 : 0.85;
            return (
              <path
                key={i}
                d={d}
                stroke={color}
                strokeOpacity={opacity}
                strokeWidth={width}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}

          {/* Decoy DOMAIN nodes on the sides */}
          {decoyDomains.map((d) => (
            <g key={`decoy-${d.label}`} transform={`translate(${d.x} ${d.y})`}>
              <circle r={22} fill="#0e2726" stroke="#6f8f8c" strokeOpacity={0.55} strokeWidth={1.2} />
              <text
                textAnchor="middle" dy={3}
                fill="#e5eae2" fontSize={6.5} fontWeight={700}
                style={{ letterSpacing: "0.14em", pointerEvents: "none" }}
              >
                {d.label}
              </text>
            </g>
          ))}

          {nodes.map((n) => {
            if (n.data.kind === "spacer") return null;
            const { x, y } = project(n);
            const kind = n.data.kind;
            const color = n.data.color ?? "#d8d2b8";
            const nodeId = n.data.node?.id ?? n.data.id;
            const isSelected = selectedId === nodeId;
            const isHovered = hoveredId === nodeId;

            if (kind === "root") {
              return (
                <g key={n.data.id} transform={`translate(${x} ${y})`}>
                  <circle r={44} fill="#0e2726" stroke="#8fa8a2" strokeWidth={2} />
                  <circle r={38} fill="url(#tree-root-glow)" />
                  <text
                    textAnchor="middle" dy={4}
                    fill="#0d2828" fontSize={13} fontWeight={800}
                    style={{ letterSpacing: "0.2em" }}
                  >
                    "LUCA"
                  </text>
                  <text
                    y={62} textAnchor="middle"
                    fill="#e5eae2" fontSize={8} fontWeight={600}
                    style={{ letterSpacing: "0.2em" }}
                  >
                    MRCAP1.COM
                  </text>
                </g>
              );
            }

            if (kind === "domain") {
              return (
                <g key={n.data.id} transform={`translate(${x} ${y})`}>
                  <circle r={28} fill="#0e2726" stroke="#8fa8a2" strokeOpacity={0.7} strokeWidth={1.4} />
                  <text
                    textAnchor="middle" dy={3}
                    fill="#f4f0dc" fontSize={7.5} fontWeight={800}
                    style={{ letterSpacing: "0.16em", pointerEvents: "none" }}
                  >
                    EUKARYOTES
                  </text>
                </g>
              );
            }

            if (kind === "kingdom") {
              const pillW = 150;
              const pillH = 32;
              return (
                <g key={n.data.id} transform={`translate(${x} ${y})`}>
                  <rect
                    x={-pillW / 2} y={-pillH / 2}
                    width={pillW} height={pillH} rx={pillH / 2}
                    fill={color} stroke="#06181a" strokeWidth={1.5}
                  />
                  <text
                    textAnchor="middle" dy={4}
                    fill="#0d2828" fontSize={11} fontWeight={800}
                    style={{ letterSpacing: "0.16em", pointerEvents: "none" }}
                  >
                    {n.data.label}
                  </text>
                </g>
              );
            }

            if (kind === "class") {
              const label = n.data.label;
              const pillW = Math.max(80, label.length * 5.4 + 22);
              const pillH = 22;
              return (
                <g key={n.data.id} transform={`translate(${x} ${y})`}>
                  <rect
                    x={-pillW / 2} y={-pillH / 2}
                    width={pillW} height={pillH} rx={pillH / 2}
                    fill={color} stroke="#06181a" strokeWidth={1.2}
                  />
                  <text
                    textAnchor="middle" dy={3.5}
                    fill="#0d2828" fontSize={8.5} fontWeight={800}
                    style={{ letterSpacing: "0.12em", pointerEvents: "none" }}
                  >
                    {truncate(label, 22)}
                  </text>
                </g>
              );
            }

            // specimen
            const r = 16;
            const hasImg = !!n.data.node?.image;
            const showLabel = isSelected || isHovered || showLabels;
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
                  <circle r={r + 6} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={2} />
                )}
                <circle r={r + 2} fill="#0e2726" />
                <circle r={r + 2} fill="none" stroke={color} strokeWidth={1.75} opacity={0.95} />
                {hasImg ? (
                  <image
                    href={n.data.node!.image}
                    x={-r} y={-r} width={r * 2} height={r * 2}
                    clipPath={`url(#tree-clip-${n.data.id})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <circle r={r} fill={color} fillOpacity={0.35} />
                )}
                {showLabel && (
                  <text
                    y={r + 11} textAnchor="middle"
                    fill="#d4dcd2" fontSize={7.5} fontWeight={500}
                    style={{
                      letterSpacing: "0.03em", pointerEvents: "none",
                      paintOrder: "stroke", stroke: "#06181a",
                      strokeWidth: 2.5, strokeLinejoin: "round",
                    }}
                  >
                    {truncate(n.data.label || "", 22)}
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
