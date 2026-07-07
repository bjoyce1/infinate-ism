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

  // Ring geometry. Bigger radius when there are more hubs so the map breathes.
  const N = Math.max(1, hubs.length);
  const ringRadius = 900 + N * 26;
  const cellSize = 90;
  const districts: StreetLayout["districts"] = [];

  hubs.forEach((h, i) => {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    // Snap hub center to the grid.
    const rx = Math.round((Math.cos(angle) * ringRadius) / cellSize) * cellSize;
    const ry = Math.round((Math.sin(angle) * ringRadius) / cellSize) * cellSize;

    nodes.set(h.id, { id: h.id, node: h, x: rx, y: ry, kind: "hub", hubId: h.id, size: 16 });

    // Children of this hub = its neighbors that aren't the downtown hub and
    // aren't themselves top-level hubs (so districts don't overlap).
    const rawChildren = Array.from(graph.neighbors.get(h.id) ?? [])
      .filter((id) => id !== HUB_ID && !hubOrder.includes(id))
      .map((id) => graph.byId.get(id))
      .filter((n): n is GraphNode => Boolean(n))
      .sort((a, b) => b.degree - a.degree);

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
  });

  // Route every graph link as an orthogonal (Manhattan) polyline. The mid
  // corner alternates so parallel roads don't stack on top of each other.
  for (let i = 0; i < graph.links.length; i++) {
    const l = graph.links[i];
    const a = nodes.get(l.source);
    const b = nodes.get(l.target);
    if (!a || !b) continue;

    const mid =
      i % 2 === 0
        ? { x: b.x, y: a.y }
        : { x: a.x, y: b.y };
    const points = [
      { x: a.x, y: a.y },
      mid,
      { x: b.x, y: b.y },
    ];
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