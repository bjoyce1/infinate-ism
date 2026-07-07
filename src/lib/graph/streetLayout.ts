import type { NormalizedGraph, GraphNode } from "./types";

export type StreetNode = {
  id: string;
  node: GraphNode;
  x: number;
  y: number;
  kind: "downtown" | "hub" | "building";
  hubId: string; // which district it belongs to (downtown for the hub itself)
  size: number;
};

export type StreetRoad = {
  id: string;
  from: string;
  to: string;
  points: { x: number; y: number }[]; // polyline (orthogonal)
  length: number;
  kind: "highway" | "street" | "alley";
};

export type StreetLayout = {
  nodes: Map<string, StreetNode>;
  roads: StreetRoad[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  hubOrder: string[];
  districts: {
    hubId: string;
    cx: number;
    cy: number;
    radius: number;
    color: string;
  }[];
};

const HUB_ID = "site_mrcap1_com";

// Deterministic Manhattan grid layout: downtown at origin, hubs on a ring,
// each hub's children on a small orthogonal grid inside its district.
export function buildStreetLayout(
  graph: NormalizedGraph,
  hubColorFor: (n: GraphNode) => string,
): StreetLayout {
  const nodes = new Map<string, StreetNode>();
  const roads: StreetRoad[] = [];

  const hub = graph.byId.get(HUB_ID);
  if (!hub) {
    return { nodes, roads, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, hubOrder: [], districts: [] };
  }

  // Place downtown at origin.
  nodes.set(hub.id, { id: hub.id, node: hub, x: 0, y: 0, kind: "downtown", hubId: hub.id, size: 22 });

  // Collect hub neighborhoods = every direct neighbor of the central hub whose
  // sub-graph forms a "district". Sort by degree (busiest → nearest ring index).
  const centerNeighbors = Array.from(graph.neighbors.get(hub.id) ?? []);
  const hubs = centerNeighbors
    .map((id) => graph.byId.get(id))
    .filter((n): n is GraphNode => Boolean(n))
    .sort((a, b) => b.degree - a.degree);

  const hubOrder = hubs.map((h) => h.id);

  const cellSize = 90;
  const districts: StreetLayout["districts"] = [];

  // Count each hub's private children (neighbors that aren't downtown and
  // aren't themselves top-level hubs). Hubs with 10+ private children get
  // exiled to an outer ring with more elbow room so their neighborhoods
  // don't crowd everyone else.
  const privateChildCount = new Map<string, number>();
  const privateChildren = new Map<string, GraphNode[]>();
  for (const h of hubs) {
    const kids = Array.from(graph.neighbors.get(h.id) ?? [])
      .filter((id) => id !== HUB_ID && !hubOrder.includes(id))
      .map((id) => graph.byId.get(id))
      .filter((n): n is GraphNode => Boolean(n))
      .sort((a, b) => b.degree - a.degree);
    privateChildren.set(h.id, kids);
    privateChildCount.set(h.id, kids.length);
  }

  const BIG_THRESHOLD = 10;
  const innerHubs = hubs.filter((h) => (privateChildCount.get(h.id) ?? 0) < BIG_THRESHOLD);
  const outerHubs = hubs.filter((h) => (privateChildCount.get(h.id) ?? 0) >= BIG_THRESHOLD);

  const innerN = Math.max(1, innerHubs.length);
  const outerN = Math.max(1, outerHubs.length);
  const innerRadius = 900 + innerN * 26;
  // Push big hubs way out, and give them more angular spacing per hub.
  const outerRadius = innerRadius + 1500 + outerN * 80;

  const placeHub = (h: GraphNode, angle: number, ringRadius: number) => {
    // Snap hub center to the grid.
    const rx = Math.round((Math.cos(angle) * ringRadius) / cellSize) * cellSize;
    const ry = Math.round((Math.sin(angle) * ringRadius) / cellSize) * cellSize;

    nodes.set(h.id, { id: h.id, node: h, x: rx, y: ry, kind: "hub", hubId: h.id, size: 16 });

    const rawChildren = privateChildren.get(h.id) ?? [];

    const count = rawChildren.length;
    // Square-ish grid; keep it compact so districts don't collide.
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));

    // District orientation: rotate the grid axes so streets radiate away from
    // downtown (grid "up" points outward from the hub back toward its center).
    // We use axis-aligned blocks for a crisp street-map look, then translate
    // so the hub sits at the district's inner edge (closest to downtown).
    const blockW = (cols + 1) * cellSize;
    const blockH = (rows + 1) * cellSize;

    // Outward unit vector (from origin toward hub).
    const len = Math.hypot(rx, ry) || 1;
    const ux = rx / len;
    const uy = ry / len;

    // Grid origin sits one cell "further out" than the hub so the hub anchors
    // the district's inner corner.
    const gx0 = rx + ux * cellSize * 1.4 - blockW / 2;
    const gy0 = ry + uy * cellSize * 1.4 - blockH / 2;

    rawChildren.forEach((c, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = Math.round((gx0 + (col + 0.5) * cellSize) / 10) * 10;
      const cy = Math.round((gy0 + (row + 0.5) * cellSize) / 10) * 10;
      nodes.set(c.id, { id: c.id, node: c, x: cx, y: cy, kind: "building", hubId: h.id, size: 6 });
    });

    districts.push({
      hubId: h.id,
      cx: rx + ux * cellSize * 1.4,
      cy: ry + uy * cellSize * 1.4,
      radius: Math.max(blockW, blockH) * 0.55,
      color: hubColorFor(h),
    });
  };

  innerHubs.forEach((h, i) => {
    const angle = (i / innerN) * Math.PI * 2 - Math.PI / 2;
    placeHub(h, angle, innerRadius);
  });
  outerHubs.forEach((h, i) => {
    // Offset outer ring by half a slot so it doesn't align with inner ring.
    const angle = ((i + 0.5) / outerN) * Math.PI * 2 - Math.PI / 2;
    placeHub(h, angle, outerRadius);
  });

  // Route each link as a multi-segment orthogonal polyline that zig-zags in
  // 2–4 stairs so no two routes are identical and long trips look like real
  // streets, not a single elbow. The staircase pattern is seeded from the
  // link's endpoints so it's deterministic across renders.
  const seeded = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return ((h >>> 0) % 10000) / 10000;
    };
  };

  const routeStaircase = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    rand: () => number,
  ) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    // Number of stairs scales with distance so long roads have more turns.
    const stairs = Math.max(1, Math.min(4, Math.round(dist / 260) + (rand() < 0.5 ? 0 : 1)));
    const pts: { x: number; y: number }[] = [{ x: a.x, y: a.y }];
    let cx = a.x, cy = a.y;
    // Choose which axis to step on first per stair for variety.
    const startHoriz = rand() < 0.5;
    for (let s = 0; s < stairs; s++) {
      const remaining = stairs - s;
      // Advance a fractional chunk of the remaining delta, jittered.
      const jitter = 0.35 + rand() * 0.4;
      const fx = (b.x - cx) * (1 / remaining) * jitter + (b.x - cx) * (1 / remaining) * (1 - jitter) * (remaining === 1 ? 1 : 0.6);
      const fy = (b.y - cy) * (1 / remaining) * jitter + (b.y - cy) * (1 / remaining) * (1 - jitter) * (remaining === 1 ? 1 : 0.6);
      const stepX = remaining === 1 ? b.x - cx : fx;
      const stepY = remaining === 1 ? b.y - cy : fy;
      if ((s % 2 === 0) === startHoriz) {
        cx += stepX;
        pts.push({ x: Math.round(cx / 10) * 10, y: Math.round(cy / 10) * 10 });
        cy += stepY;
        pts.push({ x: Math.round(cx / 10) * 10, y: Math.round(cy / 10) * 10 });
      } else {
        cy += stepY;
        pts.push({ x: Math.round(cx / 10) * 10, y: Math.round(cy / 10) * 10 });
        cx += stepX;
        pts.push({ x: Math.round(cx / 10) * 10, y: Math.round(cy / 10) * 10 });
      }
    }
    // Ensure the endpoint is exact.
    const last = pts[pts.length - 1];
    if (last.x !== b.x || last.y !== b.y) pts.push({ x: b.x, y: b.y });
    // Collapse consecutive collinear duplicates.
    const cleaned: { x: number; y: number }[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const q = cleaned[cleaned.length - 1];
      if (p.x === q.x && p.y === q.y) continue;
      cleaned.push(p);
    }
    return cleaned;
  };

  for (let i = 0; i < graph.links.length; i++) {
    const l = graph.links[i];
    const a = nodes.get(l.source);
    const b = nodes.get(l.target);
    if (!a || !b) continue;

    const rand = seeded(`${l.source}|${l.target}|${i}`);
    const points = routeStaircase({ x: a.x, y: a.y }, { x: b.x, y: b.y }, rand);
    let length = 0;
    for (let p = 1; p < points.length; p++) {
      length += Math.hypot(points[p].x - points[p - 1].x, points[p].y - points[p - 1].y);
    }
    const kind: StreetRoad["kind"] =
      a.kind !== "building" && b.kind !== "building"
        ? "highway"
        : a.kind === "building" && b.kind === "building"
          ? "alley"
          : "street";
    roads.push({
      id: `${l.source}__${l.target}__${i}`,
      from: l.source,
      to: l.target,
      points,
      length,
      kind,
    });
  }

  // Bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((n) => {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  });
  const pad = 200;
  return {
    nodes,
    roads,
    bounds: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad },
    hubOrder,
    districts,
  };
}