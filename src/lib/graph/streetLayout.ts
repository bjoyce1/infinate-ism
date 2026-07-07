import type { NormalizedGraph, GraphNode } from "./types";

export type StreetNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  isDowntown: boolean;
  isHub: boolean;
  hubId: string | null; // which HQ neighborhood this belongs to
  degree: number;
  category: GraphNode["category"];
  color?: string;
  image?: string;
};

export type StreetRoad = {
  source: string;
  target: string;
  path: { x: number; y: number }[]; // orthogonal polyline points
  kind: "highway" | "street" | "alley";
  weight: number;
  length: number; // cumulative length
  arc: number[]; // cumulative arc length per point
};

export type StreetDistrict = {
  hubId: string;
  label: string;
  color: string;
  bounds: { x: number; y: number; w: number; h: number };
};

export type StreetLayout = {
  nodes: Map<string, StreetNode>;
  roads: StreetRoad[];
  districts: StreetDistrict[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

const DOWNTOWN_ID = "site_mrcap1_com";
const GRID = 24; // world units per block

/**
 * Deterministic street-map layout.
 *
 * - mrcap1.com sits at origin (downtown plaza).
 * - Every `is_hub` node becomes a neighborhood HQ, placed on a concentric
 *   ring around downtown. Ring capacity grows so bigger cities fit.
 * - Each hub's non-hub neighbors are laid out as buildings on an orthogonal
 *   grid inside a rectangular block that belongs to that hub.
 * - Non-hub nodes that don't attach to any hub go into an "outskirts" grid.
 * - Links between placed nodes become orthogonal (Manhattan) road paths.
 */
export function buildStreetLayout(graph: NormalizedGraph): StreetLayout {
  const nodes = new Map<string, StreetNode>();
  const districts: StreetDistrict[] = [];

  const hubs = graph.nodes
    .filter((n) => n.is_hub && n.id !== DOWNTOWN_ID)
    .sort((a, b) => b.degree - a.degree);

  // Place downtown.
  const downtown = graph.byId.get(DOWNTOWN_ID) ?? graph.nodes[0];
  if (downtown) {
    nodes.set(downtown.id, {
      id: downtown.id,
      label: downtown.label,
      x: 0,
      y: 0,
      isDowntown: true,
      isHub: true,
      hubId: downtown.id,
      degree: downtown.degree,
      category: downtown.category,
      color: downtown.color,
      image: downtown.image,
    });
  }

  // Compute a rectangular neighborhood size for each hub based on
  // how many non-hub neighbors it will hold.
  const hubChildren = new Map<string, GraphNode[]>();
  const assignedChild = new Set<string>();
  for (const h of hubs) {
    const kids: GraphNode[] = [];
    for (const nid of graph.neighbors.get(h.id) ?? []) {
      const n = graph.byId.get(nid);
      if (!n) continue;
      if (n.is_hub || n.id === DOWNTOWN_ID) continue;
      if (assignedChild.has(n.id)) continue;
      kids.push(n);
      assignedChild.add(n.id);
    }
    kids.sort((a, b) => b.degree - a.degree);
    hubChildren.set(h.id, kids);
  }
  // Downtown children too.
  const downtownKids: GraphNode[] = [];
  if (downtown) {
    for (const nid of graph.neighbors.get(downtown.id) ?? []) {
      const n = graph.byId.get(nid);
      if (!n || n.is_hub || assignedChild.has(n.id)) continue;
      downtownKids.push(n);
      assignedChild.add(n.id);
    }
    downtownKids.sort((a, b) => b.degree - a.degree);
  }

  // Place hubs on concentric rings. Radius grows with ring index.
  // Each hub gets a rectangular "block" oriented toward downtown.
  const perRing = [6, 10, 14, 18, 22];
  let placed = 0;
  let ringIdx = 0;
  for (const h of hubs) {
    while (ringIdx < perRing.length && placed >= perRing.slice(0, ringIdx + 1).reduce((a, b) => a + b, 0)) {
      ringIdx++;
    }
    const cap = ringIdx < perRing.length ? perRing[ringIdx] : perRing[perRing.length - 1];
    const start = ringIdx > 0 ? perRing.slice(0, ringIdx).reduce((a, b) => a + b, 0) : 0;
    const idxInRing = placed - start;
    const ring = ringIdx + 1;
    const radius = 260 + ring * 260;
    const angle = (idxInRing / cap) * Math.PI * 2 + (ring % 2 === 0 ? Math.PI / cap : 0);
    // Snap position to grid.
    const cx = Math.round((Math.cos(angle) * radius) / GRID) * GRID;
    const cy = Math.round((Math.sin(angle) * radius) / GRID) * GRID;

    nodes.set(h.id, {
      id: h.id,
      label: h.label,
      x: cx,
      y: cy,
      isDowntown: false,
      isHub: true,
      hubId: h.id,
      degree: h.degree,
      category: h.category,
      color: h.color,
      image: h.image,
    });

    // Neighborhood grid for this hub's children.
    const kids = hubChildren.get(h.id) ?? [];
    const cols = Math.max(3, Math.ceil(Math.sqrt(kids.length)));
    const rows = Math.max(3, Math.ceil(kids.length / cols));
    const cell = GRID; // one lot per grid cell
    const w = cols * cell;
    const hgt = rows * cell;
    // Neighborhood block sits centered on the HQ, offset outward from downtown.
    const outward = Math.atan2(cy, cx);
    const ox = cx + Math.cos(outward) * (w / 2 + cell * 2);
    const oy = cy + Math.sin(outward) * (hgt / 2 + cell * 2);
    const blockX = Math.round((ox - w / 2) / GRID) * GRID;
    const blockY = Math.round((oy - hgt / 2) / GRID) * GRID;

    districts.push({
      hubId: h.id,
      label: h.label,
      color: h.color ?? "#3DED97",
      bounds: { x: blockX - cell, y: blockY - cell, w: w + cell * 2, h: hgt + cell * 2 },
    });

    kids.forEach((kid, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nodes.set(kid.id, {
        id: kid.id,
        label: kid.label,
        x: blockX + col * cell + cell / 2,
        y: blockY + row * cell + cell / 2,
        isDowntown: false,
        isHub: false,
        hubId: h.id,
        degree: kid.degree,
        category: kid.category,
        color: kid.color,
        image: kid.image,
      });
    });

    placed++;
  }

  // Downtown neighborhood — a small central plaza block for direct children.
  if (downtown && downtownKids.length) {
    const cols = Math.max(3, Math.ceil(Math.sqrt(downtownKids.length)));
    const rows = Math.max(3, Math.ceil(downtownKids.length / cols));
    const cell = GRID;
    const w = cols * cell;
    const hgt = rows * cell;
    const blockX = -Math.round(w / 2 / GRID) * GRID;
    const blockY = -Math.round(hgt / 2 / GRID) * GRID - GRID * 4;
    districts.push({
      hubId: downtown.id,
      label: downtown.label,
      color: downtown.color ?? "#3DED97",
      bounds: { x: blockX - cell, y: blockY - cell, w: w + cell * 2, h: hgt + cell * 2 },
    });
    downtownKids.forEach((kid, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nodes.set(kid.id, {
        id: kid.id,
        label: kid.label,
        x: blockX + col * cell + cell / 2,
        y: blockY + row * cell + cell / 2,
        isDowntown: false,
        isHub: false,
        hubId: downtown.id,
        degree: kid.degree,
        category: kid.category,
        color: kid.color,
        image: kid.image,
      });
    });
  }

  // Outskirts grid: any remaining nodes with no hub attachment.
  const remaining = graph.nodes.filter((n) => !nodes.has(n.id));
  if (remaining.length) {
    const cols = Math.max(6, Math.ceil(Math.sqrt(remaining.length)));
    const cell = GRID;
    // Place far to the southeast of the last ring.
    const startRadius = 260 + (perRing.length + 1) * 260;
    remaining.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nodes.set(n.id, {
        id: n.id,
        label: n.label,
        x: startRadius + col * cell,
        y: startRadius + row * cell,
        isDowntown: false,
        isHub: false,
        hubId: null,
        degree: n.degree,
        category: n.category,
        color: n.color,
        image: n.image,
      });
    });
  }

  // Build roads (orthogonal / Manhattan) for every link between placed nodes.
  const roads: StreetRoad[] = [];
  const seen = new Set<string>();
  for (const link of graph.links) {
    const a = nodes.get(link.source);
    const b = nodes.get(link.target);
    if (!a || !b) continue;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const path = orthogonalPath(a, b);
    const arc: number[] = [0];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
      arc.push(total);
    }
    const bothHub = a.isHub && b.isHub;
    const kind: StreetRoad["kind"] = bothHub ? "highway" : a.isHub || b.isHub ? "street" : "alley";
    roads.push({
      source: a.id,
      target: b.id,
      path,
      kind,
      weight: link.weight ?? 1,
      length: total,
      arc,
    });
  }

  // Bounds.
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  for (const n of nodes.values()) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const pad = GRID * 8;
  return {
    nodes,
    roads,
    districts,
    bounds: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad },
  };
}

/** Manhattan L-shape between two points; picks the corner that keeps the
 *  road inside the map (prefer routing outward from downtown). */
function orthogonalPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
    return [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
  }
  // Two candidate corners; pick the one farther from origin so paths avoid
  // piling on top of each other near downtown.
  const c1 = { x: b.x, y: a.y };
  const c2 = { x: a.x, y: b.y };
  const d1 = Math.hypot(c1.x, c1.y);
  const d2 = Math.hypot(c2.x, c2.y);
  const corner = d1 >= d2 ? c1 : c2;
  return [{ x: a.x, y: a.y }, corner, { x: b.x, y: b.y }];
}

/** Sample a point along a road's polyline at cumulative distance `d`. */
export function sampleRoad(road: StreetRoad, d: number): { x: number; y: number } {
  if (road.length === 0) return { x: road.path[0].x, y: road.path[0].y };
  const t = ((d % road.length) + road.length) % road.length;
  for (let i = 1; i < road.arc.length; i++) {
    if (road.arc[i] >= t) {
      const seg = road.arc[i] - road.arc[i - 1];
      const local = seg === 0 ? 0 : (t - road.arc[i - 1]) / seg;
      const p0 = road.path[i - 1];
      const p1 = road.path[i];
      return { x: p0.x + (p1.x - p0.x) * local, y: p0.y + (p1.y - p0.y) * local };
    }
  }
  const last = road.path[road.path.length - 1];
  return { x: last.x, y: last.y };
}