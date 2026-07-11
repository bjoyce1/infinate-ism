import type { NormalizedGraph, GraphNode, GraphLink } from "./types";

/** Root of the whole knowledge canvas. Infinite ISM / mrcap1.com. */
export const HUB_ID = "site_mrcap1_com";

/**
 * Relation direction registry.
 *
 * SOURCE_IS_PARENT: `<src>` <rel> `<tgt>` means src OWNS/CONTAINS tgt →
 *   src is the parent, tgt is the child.
 *
 * TARGET_IS_PARENT: `<src>` <rel> `<tgt>` means src belongs to tgt →
 *   tgt is the parent, src is the child.
 *
 * Any other relation is non-structural and never influences parenting
 * (only used later for cross-family link classification).
 */
const SOURCE_IS_PARENT = new Set([
  "parent_of", "has_child", "contains", "includes",
  "owns", "hosts",
  // Book / album / site → chapter/track/section ownership.
  "chapter", "section", "track", "audio", "nft_code", "verse",
]);
const TARGET_IS_PARENT = new Set([
  "child_of", "member_of", "belongs_to", "part_of",
  "section_of", "page_of", "file_of", "spawned_from",
  "captured_near",
]);

const norm = (r: string | undefined | null) =>
  (r ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");

export function isStructuralRelation(rel: string | undefined | null): boolean {
  const r = norm(rel);
  return SOURCE_IS_PARENT.has(r) || TARGET_IS_PARENT.has(r);
}

/** Given a link, return `{parent, child}` if the relation is directed, else null. */
export function directedParentChild(l: GraphLink): { parent: string; child: string } | null {
  const r = norm(l.relation);
  if (SOURCE_IS_PARENT.has(r)) return { parent: l.source, child: l.target };
  if (TARGET_IS_PARENT.has(r)) return { parent: l.target, child: l.source };
  return null;
}

export type NodeTarget = { x: number; y: number; angle: number };

export type HybridPlan = {
  parentOf: Map<string, string | null>;
  childrenOf: Map<string, string[]>;
  depth: Map<string, number>;
  /** Top-level branch ancestor (direct child of HUB_ID) each node belongs to. */
  branchOf: Map<string, string>;
  /** Ordered list of top-level branch roots. */
  roots: string[];
  /** Full subtree size (including self). */
  subtreeSize: Map<string, number>;
  targets: Map<string, NodeTarget>;
  /** Local family radius around a parent hub. */
  radius: Map<string, number>;
  /** Structural-edge classifier (any primary parent-child edge or explicit structural relation). */
  isStructural: (a: string, b: string) => boolean;
  /** Descendants (transitive, exclusive of self). */
  descendantsOf: (id: string) => Set<string>;
  /** Ancestor path from `id` up to HUB (exclusive of id, inclusive of HUB). */
  ancestorsOf: (id: string) => string[];
  /** All nodes in the family led by `parentId` (the parent + descendants). */
  familyOf: (parentId: string) => Set<string>;
};

function seededRand(seed: number) {
  let s = (seed | 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Choose a primary parent for `n` given all incident links.
 * Priority:
 *   1. Directed structural relation naming a parent explicitly.
 *   2. source_file prefix hierarchy.
 *   3. Hub / image / community heuristics with degree tiebreak.
 */
function pickParent(
  n: GraphNode,
  incident: GraphLink[],
  graph: NormalizedGraph,
  mainSet: Set<string>,
): string | null {
  // 1) Explicit directed parent relation. First match wins deterministically.
  const directed = incident
    .map((l) => directedParentChild(l))
    .filter((r): r is { parent: string; child: string } => r != null && r.child === n.id)
    .map((r) => r.parent)
    .filter((p) => graph.byId.has(p) && p !== n.id);
  if (directed.length > 0) {
    directed.sort((a, b) => {
      const da = graph.byId.get(a)!.degree ?? 0;
      const db = graph.byId.get(b)!.degree ?? 0;
      if (da !== db) return db - da;
      return a < b ? -1 : 1;
    });
    return directed[0];
  }

  // 2) source_file prefix (candidate is an ancestor path of node).
  const nf = (n.source_file ?? "").toLowerCase();
  if (nf) {
    let bestPath: string | null = null;
    let bestLen = 0;
    for (const l of incident) {
      const other = l.source === n.id ? l.target : l.source;
      const c = graph.byId.get(other);
      if (!c || !c.source_file) continue;
      const cf = c.source_file.toLowerCase().replace(/\.[^./]+$/, "");
      if (cf && cf.length > bestLen && nf.startsWith(cf) && cf !== nf) {
        bestLen = cf.length;
        bestPath = other;
      }
    }
    if (bestPath) return bestPath;
  }

  // 3) Heuristic score across all neighbors.
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const l of incident) {
    const other = l.source === n.id ? l.target : l.source;
    if (other === n.id) continue;
    const c = graph.byId.get(other);
    if (!c) continue;
    let s = 0;
    // The HUB is the canonical root — if it links to us and nothing more
    // specific claims us as a child, we belong directly under it.
    if (c.id === HUB_ID) s += 1000;
    if (c.community != null && c.community === n.community) s += 120;
    if (mainSet.has(c.id)) s += 240;
    if (c.is_hub) s += 90;
    if (c.image) s += 40;
    s += Math.log2(((c.degree ?? 0) + 1)) * 6;
    s += Math.max(0, (l.weight ?? 1)) * 3;
    s += (c.id.charCodeAt(0) % 7) * 0.001;
    if (s > bestScore) { bestScore = s; best = other; }
  }
  return best;
}

/**
 * Hybrid hierarchical layout planner:
 *   HUB at (0,0) → branch roots in stable angular sectors → each branch is
 *   packed radially so children stay grouped around their parent and
 *   grandchildren stay inside the parent's family region.
 */
export function planHybridKnowledgeLayout(graph: NormalizedGraph, seed = 1337): HybridPlan {
  const rand = seededRand(seed);

  const mainSet = new Set<string>();
  for (const n of graph.nodes) {
    if (n.id === HUB_ID) continue;
    if (n.is_hub || n.image) mainSet.add(n.id);
  }

  // Collect incident links per node in a stable order.
  const incidentByNode = new Map<string, GraphLink[]>();
  const structuralPairs = new Set<string>();
  for (const l of graph.links) {
    if (!incidentByNode.has(l.source)) incidentByNode.set(l.source, []);
    if (!incidentByNode.has(l.target)) incidentByNode.set(l.target, []);
    incidentByNode.get(l.source)!.push(l);
    incidentByNode.get(l.target)!.push(l);
    if (isStructuralRelation(l.relation)) structuralPairs.add(pairKey(l.source, l.target));
  }

  const parentOf = new Map<string, string | null>();
  parentOf.set(HUB_ID, null);

  for (const n of graph.nodes) {
    if (n.id === HUB_ID) continue;
    const incident = incidentByNode.get(n.id) ?? [];
    const best = pickParent(n, incident, graph, mainSet);
    parentOf.set(n.id, best ?? HUB_ID);
  }

  // Cycle break — any chain that doesn't terminate at HUB is reparented.
  for (const n of graph.nodes) {
    if (n.id === HUB_ID) continue;
    const seen = new Set<string>([n.id]);
    let cur = parentOf.get(n.id) ?? HUB_ID;
    let steps = 0;
    let ok = false;
    while (steps++ < 256) {
      if (cur === HUB_ID) { ok = true; break; }
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = parentOf.get(cur) ?? HUB_ID;
    }
    if (!ok) parentOf.set(n.id, HUB_ID);
  }

  const childrenOf = new Map<string, string[]>();
  for (const [id, p] of parentOf) {
    if (p == null) continue;
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p)!.push(id);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => {
      const da = graph.byId.get(a)?.degree ?? 0;
      const db = graph.byId.get(b)?.degree ?? 0;
      if (da !== db) return db - da;
      return a < b ? -1 : 1;
    });
  }

  const depth = new Map<string, number>();
  depth.set(HUB_ID, 0);
  const q: string[] = [HUB_ID];
  while (q.length) {
    const cur = q.shift()!;
    const d = depth.get(cur)!;
    for (const c of childrenOf.get(cur) ?? []) {
      if (!depth.has(c)) { depth.set(c, d + 1); q.push(c); }
    }
  }

  const subtreeSize = new Map<string, number>();
  const sizeOf = (id: string): number => {
    const memo = subtreeSize.get(id);
    if (memo != null) return memo;
    let s = 1;
    for (const c of childrenOf.get(id) ?? []) s += sizeOf(c);
    subtreeSize.set(id, s);
    return s;
  };
  sizeOf(HUB_ID);

  // Branch = top-level ancestor. Compute by walking up until parent is HUB.
  const branchOf = new Map<string, string>();
  const branchFor = (id: string): string => {
    if (id === HUB_ID) return HUB_ID;
    const memo = branchOf.get(id);
    if (memo) return memo;
    let cur = id;
    let steps = 0;
    while (steps++ < 512) {
      const p = parentOf.get(cur) ?? HUB_ID;
      if (p === HUB_ID) { branchOf.set(id, cur); return cur; }
      cur = p;
    }
    branchOf.set(id, id);
    return id;
  };
  for (const n of graph.nodes) branchFor(n.id);

  // ---- Placement ----
  const targets = new Map<string, NodeTarget>();
  const radius = new Map<string, number>();
  targets.set(HUB_ID, { x: 0, y: 0, angle: 0 });

  // Group top-level roots by community so related branches share arcs of the
  // canvas. Sort communities deterministically.
  const rootIds = (childrenOf.get(HUB_ID) ?? []).slice();
  const byComm = new Map<number, string[]>();
  for (const id of rootIds) {
    const c = graph.byId.get(id)?.community ?? 9999;
    if (!byComm.has(c)) byComm.set(c, []);
    byComm.get(c)!.push(id);
  }
  const orderedRoots: string[] = [];
  for (const c of [...byComm.keys()].sort((a, b) => a - b)) {
    orderedRoots.push(...(byComm.get(c) ?? []));
  }

  // Sector arc proportional to sqrt(subtree size).
  const branchWeight = (id: string) => Math.sqrt(Math.max(1, sizeOf(id)));
  const totalW = orderedRoots.reduce((s, id) => s + branchWeight(id), 0) || 1;
  const TAU = Math.PI * 2;
  const MIN_ARC = TAU / Math.max(orderedRoots.length * 3, 12);

  // Ring radius per branch — bigger subtree pushes further from HUB so branches
  // don't overlap the hub while remaining visually distinct.
  const branchRingRadius = (id: string) => 520 + Math.sqrt(sizeOf(id)) * 32;

  // Sub-planner: pack a branch (radial layered by depth within its own sector).
  type Frame = { id: string; center: { x: number; y: number }; sectorMid: number; sectorHalf: number; ring: number };
  const packBranch = (rootId: string, sectorMid: number, sectorHalf: number) => {
    const R = branchRingRadius(rootId);
    const rx = Math.cos(sectorMid) * R;
    const ry = Math.sin(sectorMid) * R;
    targets.set(rootId, { x: rx, y: ry, angle: sectorMid });
    const rr = 90 + Math.sqrt(sizeOf(rootId)) * 22;
    radius.set(rootId, rr);

    const stack: Frame[] = [{ id: rootId, center: { x: rx, y: ry }, sectorMid, sectorHalf, ring: rr }];
    while (stack.length) {
      const frame = stack.pop()!;
      const kids = childrenOf.get(frame.id) ?? [];
      if (!kids.length) continue;

      // Direction: pointing away from HUB so grandchildren spread outward.
      const outAngle = Math.atan2(frame.center.y, frame.center.x) || frame.sectorMid;
      // Local half-cone: bounded by branch sector, but tightened for deep nodes
      // so grandchildren stay inside the parent family.
      const parentR = frame.ring;
      const parentDist = Math.hypot(frame.center.x, frame.center.y) || 1;
      const localHalf = Math.min(
        frame.sectorHalf,
        Math.max(0.35, Math.atan2(parentR * 1.4, parentDist)),
      );
      const kidCount = kids.length;
      const perRing = Math.max(6, Math.ceil(Math.sqrt(kidCount) * 2.2));
      let k = 0;
      for (const kid of kids) {
        const ringIdx = Math.floor(k / perRing);
        const idxInRing = k % perRing;
        const countInRing = Math.min(perRing, kidCount - ringIdx * perRing);
        const step = (localHalf * 2) / Math.max(1, countInRing);
        const jitter = (rand() - 0.5) * step * 0.04;
        const localAngle = outAngle - localHalf + step * (idxInRing + 0.5) + jitter;
        const dist = parentR * (0.60 + ringIdx * 0.55);
        const x = frame.center.x + Math.cos(localAngle) * dist;
        const y = frame.center.y + Math.sin(localAngle) * dist;
        targets.set(kid, { x, y, angle: localAngle });
        const kSize = sizeOf(kid);
        const kr = Math.max(30, parentR * 0.55 + Math.sqrt(Math.max(0, kSize - 1)) * 12);
        radius.set(kid, kr);
        stack.push({
          id: kid,
          center: { x, y },
          sectorMid: localAngle,
          // Grandchildren get a narrower slice so they stay inside their parent's fan.
          sectorHalf: Math.max(0.28, localHalf * 0.65),
          ring: kr,
        });
        k++;
      }
    }
  };

  let cursor = 0;
  for (const id of orderedRoots) {
    const arc = Math.max(MIN_ARC, (branchWeight(id) / totalW) * TAU);
    const mid = cursor + arc / 2;
    packBranch(id, mid, arc / 2);
    cursor += arc;
  }

  // Helpers ------------------------------------------------------------
  const descendantsCache = new Map<string, Set<string>>();
  const descendantsOf = (id: string): Set<string> => {
    const memo = descendantsCache.get(id);
    if (memo) return memo;
    const out = new Set<string>();
    const stk = [id];
    while (stk.length) {
      const cur = stk.pop()!;
      for (const c of childrenOf.get(cur) ?? []) {
        if (!out.has(c)) { out.add(c); stk.push(c); }
      }
    }
    descendantsCache.set(id, out);
    return out;
  };
  const ancestorsOf = (id: string): string[] => {
    const out: string[] = [];
    let cur = parentOf.get(id) ?? null;
    let steps = 0;
    while (cur && steps++ < 512) {
      out.push(cur);
      if (cur === HUB_ID) break;
      cur = parentOf.get(cur) ?? null;
    }
    return out;
  };
  const familyOf = (parentId: string): Set<string> => {
    const s = new Set<string>([parentId]);
    for (const d of descendantsOf(parentId)) s.add(d);
    return s;
  };

  const primaryEdge = (a: string, b: string) =>
    parentOf.get(a) === b || parentOf.get(b) === a;
  const isStructural = (a: string, b: string): boolean =>
    primaryEdge(a, b) || structuralPairs.has(pairKey(a, b));

  return {
    parentOf,
    childrenOf,
    depth,
    branchOf,
    roots: orderedRoots,
    subtreeSize,
    targets,
    radius,
    isStructural,
    descendantsOf,
    ancestorsOf,
    familyOf,
  };
}

/** Copy plan targets onto the exact node objects the renderer receives. */
export function applyHybridSeed<
  T extends { id: string; x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number },
>(nodes: T[], plan: HybridPlan): void {
  for (const n of nodes) {
    const t = plan.targets.get(n.id);
    if (t) { n.x = t.x; n.y = t.y; }
    else { n.x = 0; n.y = 0; }
    n.vx = 0; n.vy = 0;
    n.fx = undefined; n.fy = undefined;
  }
}
