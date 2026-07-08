import type { NormalizedGraph, GraphNode } from "./types";

export type StreetNode = {
  id: string;
  node: GraphNode;
  x: number;
  y: number;
  kind: "downtown" | "hub" | "building";
  hubId: string; // id of the HQ node of this neighborhood
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

// Deterministic Manhattan grid layout, adapted from the standalone
// build-map.mjs "Street View" builder. Downtown = mrcap1 pinned at origin.
// Every community becomes a neighborhood block: HQ (most-connected member)
// sits at the block's center cell, remaining members fill a grid around it.
// Any non-HQ, non-site-hub node with degree ≥ 10 is exiled to its own
// private satellite neighborhood orbiting the parent block, connected by
// an arterial road. Neighborhoods ring-pack outward from downtown.
export function buildStreetLayout(
  graph: NormalizedGraph,
  hubColorFor: (n: GraphNode) => string,
): StreetLayout {
  const nodes = new Map<string, StreetNode>();
  const roads: StreetRoad[] = [];

  const mainHub = graph.byId.get(HUB_ID);
  if (!mainHub) {
    return { nodes, roads, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, hubOrder: [], districts: [] };
  }

  // ---- constants (scaled ~5× from build-map.mjs for readable canvas units)
  const GG = 230;        // arterial grid spacing
  const CELL = 130;      // house cell size
  const snapG = (v: number) => Math.round(v / GG) * GG;
  const round1 = (v: number) => Math.round(v * 10) / 10;

  // deterministic PRNG
  const mulberry32 = (a: number) => () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ---- group nodes by community
  type Sat = {
    hqNode: GraphNode;
    ids: string[];
    label: string;
    cols: number;
    rows: number;
    gw: number;
    gh: number;
    rb: number;
    ox: number;
    oy: number;
    bx: number;
    by: number;
    count: number;
  };
  type Comm = {
    cid: number;
    members: GraphNode[];
    order: GraphNode[];
    hq: GraphNode;
    layoutIds: string[];
    sats: Sat[];
    cols: number;
    rows: number;
    gw: number;
    gh: number;
    rb: number;
    rbEff: number;
    bx: number;
    by: number;
    count: number;
  };

  const commMap = new Map<number, Comm>();
  for (const n of graph.nodes) {
    const cid = n.community ?? -1;
    let c = commMap.get(cid);
    if (!c) {
      c = {
        cid,
        members: [],
        order: [],
        hq: n,
        layoutIds: [],
        sats: [],
        cols: 1, rows: 1, gw: CELL, gh: CELL, rb: CELL, rbEff: CELL,
        bx: 0, by: 0, count: 0,
      };
      commMap.set(cid, c);
    }
    c.members.push(n);
  }

  const isSiteHub = (n: GraphNode) => Boolean(n.is_hub);
  const commArr = Array.from(commMap.values());

  for (const c of commArr) {
    c.order = [...c.members].sort((a, b) => {
      const ha = isSiteHub(a) ? 1 : 0;
      const hb = isSiteHub(b) ? 1 : 0;
      if (hb !== ha) return hb - ha;
      if (b.degree !== a.degree) return b.degree - a.degree;
      return a.id < b.id ? -1 : 1;
    });
    c.hq = c.order[0];
  }

  const downtownCid = mainHub.community ?? -1;
  const downtownComm = commMap.get(downtownCid);
  if (downtownComm) {
    downtownComm.order = [mainHub, ...downtownComm.order.filter((m) => m.id !== mainHub.id)];
    downtownComm.hq = mainHub;
  }

  // ---- carve out satellites: non-HQ, non-site-hub nodes with degree ≥ 10
  const claimed = new Set<string>();
  for (const c of commArr) {
    const satNodes = c.order.filter(
      (m) => m !== c.hq && !isSiteHub(m) && (m.degree || 0) >= 10,
    );
    const satIds = new Set(satNodes.map((s) => s.id));
    for (const s of satNodes) {
      const kids = Array.from(graph.neighbors.get(s.id) ?? [])
        .filter(
          (nid) =>
            nid !== s.id &&
            nid !== c.hq.id &&
            !claimed.has(nid) &&
            !satIds.has(nid) &&
            !isSiteHub(graph.byId.get(nid)!) &&
            (graph.byId.get(nid)?.community ?? -1) === c.cid,
        )
        .sort((a, b) => {
          const da = graph.byId.get(a)?.degree ?? 0;
          const db = graph.byId.get(b)?.degree ?? 0;
          if (db !== da) return db - da;
          return a < b ? -1 : 1;
        });
      claimed.add(s.id);
      kids.forEach((k) => claimed.add(k));
      c.sats.push({
        hqNode: s,
        ids: [s.id, ...kids],
        label: s.label || s.id,
        cols: 1, rows: 1, gw: CELL, gh: CELL, rb: CELL,
        ox: 0, oy: 0, bx: 0, by: 0, count: 0,
      });
    }
    c.layoutIds = c.order.filter((m) => !claimed.has(m.id)).map((m) => m.id);
  }

  const gridify = (b: { cols: number; rows: number; gw: number; gh: number; rb: number; count: number }, n: number) => {
    b.count = n;
    b.cols = Math.ceil(Math.sqrt(n * 1.15));
    b.rows = Math.ceil(n / b.cols);
    b.gw = b.cols * CELL;
    b.gh = b.rows * CELL;
    b.rb = Math.max(b.gw, b.gh) / 2 + CELL;
  };

  // ---- orbit satellites around each parent block
  for (const c of commArr) {
    gridify(c, Math.max(1, c.layoutIds.length));
    for (const s of c.sats) gridify(s, s.ids.length);
    const rng = mulberry32(500 + c.cid);
    const sats = [...c.sats].sort((a, b) => {
      if (b.rb !== a.rb) return b.rb - a.rb;
      return a.hqNode.id < b.hqNode.id ? -1 : 1;
    });
    let i = 0;
    let baseR = c.rb;
    let extent = c.rb;
    while (i < sats.length) {
      const maxRb = sats[i].rb;
      const orbR = baseR + GG * 1.6 + maxRb;
      const phase = rng() * Math.PI * 2;
      const group: Sat[] = [];
      let used = 0;
      while (i + group.length < sats.length) {
        const s = sats[i + group.length];
        const w = 2 * Math.asin(Math.min(0.95, (s.rb + GG * 0.8) / orbR));
        if (used + w > 2 * Math.PI && group.length > 0) break;
        used += w;
        group.push(s);
      }
      let acc = 0;
      for (const s of group) {
        const w = 2 * Math.asin(Math.min(0.95, (s.rb + GG * 0.8) / orbR));
        const ang = phase + ((acc + w / 2) / Math.max(used, 1e-9)) * Math.min(used, 2 * Math.PI);
        acc += w;
        s.ox = Math.cos(ang) * orbR;
        s.oy = Math.sin(ang) * orbR;
      }
      extent = orbR + maxRb;
      baseR = extent;
      i += group.length;
    }
    c.rbEff = extent + (c.sats.length ? GG : 0);
  }

  // ---- ring-pack neighborhoods around downtown
  if (downtownComm) {
    downtownComm.bx = 0;
    downtownComm.by = 0;
  }
  const rest = commArr
    .filter((c) => c !== downtownComm)
    .sort((a, b) => {
      const ah = a.members.some(isSiteHub) ? 1 : 0;
      const bh = b.members.some(isSiteHub) ? 1 : 0;
      if (bh !== ah) return bh - ah;
      return b.members.length - a.members.length;
    });

  let R = (downtownComm?.rbEff ?? CELL) + GG * 4 + (rest[0]?.rbEff ?? 0);
  let ri = 0;
  let ringN = 0;
  while (ri < rest.length) {
    const rng = mulberry32(700 + ringN);
    let used = 0;
    const group: Comm[] = [];
    let maxRb = 0;
    while (ri + group.length < rest.length) {
      const b = rest[ri + group.length];
      const w = (2 * b.rbEff + GG * 2) / R;
      if (used + w > 2 * Math.PI && group.length > 0) break;
      used += w;
      group.push(b);
      maxRb = Math.max(maxRb, b.rbEff);
    }
    const total = group.reduce((s, b) => s + (2 * b.rbEff + GG * 2) / R, 0);
    const phase = rng() * Math.PI * 2;
    let acc = 0;
    for (const b of group) {
      const w = (2 * b.rbEff + GG * 2) / R;
      const ang = phase + ((acc + w / 2) / total) * 2 * Math.PI;
      acc += w;
      b.bx = Math.cos(ang) * R;
      b.by = Math.sin(ang) * R;
    }
    ri += group.length;
    ringN++;
    R += maxRb + GG * 4 + (rest[ri]?.rbEff ?? 0);
  }

  // ---- relax block overlaps (downtown pinned)
  for (let iter = 0; iter < 24; iter++) {
    for (let a = 0; a < commArr.length; a++) {
      for (let b = a + 1; b < commArr.length; b++) {
        const A = commArr[a];
        const B = commArr[b];
        const dx = B.bx - A.bx;
        const dy = B.by - A.by;
        const dist = Math.hypot(dx, dy) || 1e-3;
        const min = A.rbEff + B.rbEff + GG;
        if (dist < min) {
          const overlap = min - dist;
          const ux = dx / dist;
          const uy = dy / dist;
          const aFix = A === downtownComm;
          const bFix = B === downtownComm;
          if (aFix && bFix) continue;
          const aMove = aFix ? 0 : bFix ? overlap : overlap / 2;
          const bMove = bFix ? 0 : aFix ? overlap : overlap / 2;
          A.bx -= ux * aMove;
          A.by -= uy * aMove;
          B.bx += ux * bMove;
          B.by += uy * bMove;
        }
      }
    }
  }
  for (const c of commArr) for (const s of c.sats) {
    s.bx = c.bx + s.ox;
    s.by = c.by + s.oy;
  }

  // ---- assign house cells (HQ takes the centre cell)
  const spos = new Map<string, [number, number]>();
  const placeBlock = (
    b: { bx: number; by: number; cols: number; rows: number; gw: number; gh: number },
    ids: string[],
    hqId: string,
  ) => {
    const cells: [number, number][] = [];
    for (let r = 0; r < b.rows; r++) {
      for (let col = 0; col < b.cols; col++) {
        cells.push([
          b.bx - b.gw / 2 + CELL / 2 + col * CELL,
          b.by - b.gh / 2 + CELL / 2 + r * CELL,
        ]);
      }
    }
    let ci = 0;
    let best = Infinity;
    cells.forEach((p, idx) => {
      const d = (p[0] - b.bx) ** 2 + (p[1] - b.by) ** 2;
      if (d < best) { best = d; ci = idx; }
    });
    const ordered = [hqId, ...ids.filter((id) => id !== hqId)];
    spos.set(ordered[0], cells[ci]);
    let k = 0;
    for (let j = 1; j < ordered.length; j++) {
      if (k === ci) k++;
      spos.set(ordered[j], cells[Math.min(k, cells.length - 1)]);
      k++;
    }
  };
  for (const c of commArr) {
    placeBlock(c, c.layoutIds, c.hq.id);
    for (const s of c.sats) placeBlock(s, s.ids, s.hqNode.id);
  }
  spos.set(mainHub.id, [0, 0]);

  // ---- emit StreetNodes
  const hqSet = new Set(commArr.map((c) => c.hq.id));
  const satHqSet = new Set<string>();
  for (const c of commArr) for (const s of c.sats) satHqSet.add(s.hqNode.id);

  for (const n of graph.nodes) {
    const p = spos.get(n.id);
    if (!p) continue;
    let kind: StreetNode["kind"] = "building";
    let size = 6;
    if (n.id === mainHub.id) {
      kind = "downtown";
      size = 22;
    } else if (hqSet.has(n.id) || satHqSet.has(n.id) || isSiteHub(n)) {
      kind = "hub";
      size = 16;
    }
    // which neighborhood this node belongs to (for hubId back-reference)
    const cid = n.community ?? -1;
    const c = commMap.get(cid);
    const hqId = c?.hq.id ?? n.id;
    nodes.set(n.id, { id: n.id, node: n, x: round1(p[0]), y: round1(p[1]), kind, hubId: hqId, size });
  }

  // ---- districts (halos): one per community block + one per satellite
  const districts: StreetLayout["districts"] = [];
  const hubOrder: string[] = [];
  for (const c of commArr) {
    hubOrder.push(c.hq.id);
    districts.push({
      hubId: c.hq.id,
      cx: c.bx,
      cy: c.by,
      radius: Math.max(c.gw, c.gh) * 0.7 + CELL,
      color: hubColorFor(c.hq),
    });
    for (const s of c.sats) {
      districts.push({
        hubId: s.hqNode.id,
        cx: s.bx,
        cy: s.by,
        radius: Math.max(s.gw, s.gh) * 0.7 + CELL,
        color: hubColorFor(s.hqNode),
      });
    }
  }

  // ---- Manhattan router: single L/Z bend snapped to the arterial grid
  const routePolyline = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    seed: number,
  ): { x: number; y: number }[] => {
    const rand = mulberry32(seed >>> 0);
    const dx = bx - ax;
    const dy = by - ay;
    if (Math.abs(dx) < GG * 0.5 || Math.abs(dy) < GG * 0.5) {
      return [
        { x: round1(ax), y: round1(ay) },
        { x: round1(bx), y: round1(by) },
      ];
    }
    const f = 0.28 + rand() * 0.44;
    const pts: [number, number][] = [[ax, ay]];
    if (rand() < 0.5) {
      const mx = snapG(ax + dx * f);
      pts.push([mx, ay], [mx, by], [bx, by]);
    } else {
      const my = snapG(ay + dy * f);
      pts.push([ax, my], [bx, my], [bx, by]);
    }
    // collapse collinear duplicates
    const cleaned: { x: number; y: number }[] = [];
    for (const [x, y] of pts) {
      const rx = round1(x);
      const ry = round1(y);
      const last = cleaned[cleaned.length - 1];
      if (!last || last.x !== rx || last.y !== ry) cleaned.push({ x: rx, y: ry });
    }
    return cleaned;
  };

  for (let i = 0; i < graph.links.length; i++) {
    const l = graph.links[i];
    const a = nodes.get(l.source);
    const b = nodes.get(l.target);
    if (!a || !b) continue;
    const points = routePolyline(a.x, a.y, b.x, b.y, i * 2 + 1);
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

  // ---- arterial roads from downtown → each community HQ (highway tier)
  const dtNode = nodes.get(mainHub.id);
  if (dtNode) {
    for (const c of commArr) {
      if (c === downtownComm) continue;
      const hq = nodes.get(c.hq.id);
      if (!hq) continue;
      const pts = routePolyline(0, 0, hq.x, hq.y, 90000 + c.cid);
      let length = 0;
      for (let p = 1; p < pts.length; p++) {
        length += Math.hypot(pts[p].x - pts[p - 1].x, pts[p].y - pts[p - 1].y);
      }
      roads.push({
        id: `arterial__${mainHub.id}__${c.hq.id}`,
        from: mainHub.id,
        to: c.hq.id,
        points: pts,
        length,
        kind: "highway",
      });
    }
  }
  // ---- satellite connector roads (parent HQ → satellite HQ)
  let ai = 0;
  for (const c of commArr) {
    for (const s of c.sats) {
      const parentHq = nodes.get(c.hq.id);
      const satHq = nodes.get(s.hqNode.id);
      if (!parentHq || !satHq) continue;
      const pts = routePolyline(parentHq.x, parentHq.y, satHq.x, satHq.y, 95000 + ai++);
      let length = 0;
      for (let p = 1; p < pts.length; p++) {
        length += Math.hypot(pts[p].x - pts[p - 1].x, pts[p].y - pts[p - 1].y);
      }
      roads.push({
        id: `satlink__${c.hq.id}__${s.hqNode.id}`,
        from: c.hq.id,
        to: s.hqNode.id,
        points: pts,
        length,
        kind: "street",
      });
    }
  }

  // ---- bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((n) => {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  });
  if (!isFinite(minX)) { minX = -CELL; minY = -CELL; maxX = CELL; maxY = CELL; }
  const pad = GG * 2;
  return {
    nodes,
    roads,
    bounds: { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad },
    hubOrder,
    districts,
  };
}