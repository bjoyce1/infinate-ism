import type { NormalizedGraph, GraphNode, GraphLink } from "./types";

export const HUB_ID = "site_mrcap1_com";

/** Link relations we treat as an explicit parent→child structural edge. */
const STRUCTURAL_RELATIONS = new Set([
  "contains", "child_of", "child-of", "part_of", "part-of",
  "member_of", "member-of", "spawned_from", "spawned-from",
  "captured_near", "captured-near", "belongs_to", "belongs-to",
  "section_of", "section-of", "page_of", "page-of",
  "file_of", "file-of", "parent_of", "parent-of",
  "has_child", "has-child", "includes", "hosts", "owns",
]);

export type NodeTarget = { x: number; y: number; angle: number };

export type NeighborhoodPlan = {
  parentOf: Map<string, string | null>;
  childrenOf: Map<string, string[]>;
  depth: Map<string, number>;
  targets: Map<string, NodeTarget>;
  radius: Map<string, number>;
  /** true when the (a,b) pair is a primary layout parent-child edge or an explicit structural relation. */
  isStructural: (a: string, b: string) => boolean;
  roots: string[];
};

function seededRand(seed: number) {
  let s = (seed | 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function normalizeRelation(r: string | undefined | null): string {
  return (r ?? "").toLowerCase().trim().replace(/\s+/g, "_");
}

function scoreCandidate(
  node: GraphNode,
  candidate: GraphNode,
  link: GraphLink,
  mainSet: Set<string>,
): number {
  const rel = normalizeRelation(link.relation);
  let score = 0;
  if (STRUCTURAL_RELATIONS.has(rel)) score += 1000;
  // source_file hierarchy: candidate looks like an ancestor of node.
  if (node.source_file && candidate.source_file && node.source_file !== candidate.source_file) {
    const nf = node.source_file.toLowerCase();
    const cf = candidate.source_file.toLowerCase().replace(/\.[^./]+$/, "");
    if (cf.length > 0 && nf.startsWith(cf)) score += 400;
  }
  if (candidate.community != null && candidate.community === node.community) score += 120;
  if (mainSet.has(candidate.id)) score += 240;
  if (candidate.is_hub) score += 80;
  if (candidate.image) score += 40;
  score += Math.log2(((candidate.degree ?? 0) + 1)) * 6;
  score += Math.max(0, (link.weight ?? 1)) * 3;
  // Tiny deterministic tiebreak by id for stability.
  score += (candidate.id.charCodeAt(0) % 7) * 0.001;
  return score;
}

/**
 * Pure neighborhood planner. Returns deterministic-for-(graph, seed):
 * - a cycle-safe primary parent for every non-hub node,
 * - a layout target position for every node,
 * - a family radius for every parent,
 * - a structural-edge classifier.
 */
export function planNeighborhoods(graph: NormalizedGraph, seed = 1337): NeighborhoodPlan {
  const rand = seededRand(seed);

  const mainSet = new Set<string>();
  for (const n of graph.nodes) {
    if (n.id === HUB_ID) continue;
    if (n.is_hub || n.image) mainSet.add(n.id);
  }

  const linkBetween = new Map<string, GraphLink>();
  const structuralPairs = new Set<string>();
  for (const l of graph.links) {
    linkBetween.set(pairKey(l.source, l.target), l);
    if (STRUCTURAL_RELATIONS.has(normalizeRelation(l.relation))) {
      structuralPairs.add(pairKey(l.source, l.target));
    }
  }

  const parentOf = new Map<string, string | null>();
  parentOf.set(HUB_ID, null);

  for (const n of graph.nodes) {
    if (n.id === HUB_ID) continue;
    const nbrs = graph.neighbors.get(n.id);
    let best: string | null = null;
    let bestScore = -Infinity;
    if (nbrs) {
      for (const nb of nbrs) {
        if (nb === n.id) continue;
        const cand = graph.byId.get(nb);
        if (!cand) continue;
        const link = linkBetween.get(pairKey(n.id, nb));
        if (!link) continue;
        const s = scoreCandidate(n, cand, link, mainSet);
        if (s > bestScore) { bestScore = s; best = nb; }
      }
    }
    parentOf.set(n.id, best ?? HUB_ID);
  }

  // Cycle-break: any node whose ancestor chain doesn't terminate at HUB_ID
  // within a bounded walk is reparented directly to HUB_ID.
  for (const n of graph.nodes) {
    if (n.id === HUB_ID) continue;
    const seen = new Set<string>([n.id]);
    let cur = parentOf.get(n.id) ?? HUB_ID;
    let steps = 0;
    let ok = false;
    while (steps++ < 128) {
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

  const targets = new Map<string, NodeTarget>();
  const radius = new Map<string, number>();
  targets.set(HUB_ID, { x: 0, y: 0, angle: 0 });

  const BASE_R = 520;
  const CHILD_R_BASE = 95;

  // Roots: direct children of HUB, grouped by community so families cluster
  // in coherent sectors around the sun.
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

  const weightOf = (id: string) => Math.max(4, sizeOf(id));
  const totalWeight = orderedRoots.reduce((s, id) => s + weightOf(id), 0) || 1;

  type Frame = { id: string; outAngle: number; parentR: number };
  const stack: Frame[] = [];

  let cursor = 0;
  for (const id of orderedRoots) {
    const w = weightOf(id);
    const arc = (w / totalWeight) * Math.PI * 2;
    const angle = cursor + arc / 2;
    cursor += arc;
    const R = BASE_R;
    targets.set(id, { x: Math.cos(angle) * R, y: Math.sin(angle) * R, angle });
    const rr = CHILD_R_BASE + Math.sqrt(Math.max(0, w - 1)) * 26;
    radius.set(id, rr);
    stack.push({ id, outAngle: angle, parentR: rr });
  }

  while (stack.length) {
    const frame = stack.pop()!;
    const kids = childrenOf.get(frame.id) ?? [];
    if (!kids.length) continue;
    const parent = targets.get(frame.id)!;
    const pr = Math.hypot(parent.x, parent.y) || 1;
    const outAngle = Math.atan2(parent.y, parent.x);
    const parentR = frame.parentR;
    // Cone half-angle scales inversely with distance-from-hub so deep
    // sub-families don't overlap sibling sectors.
    const halfCone = Math.min(Math.PI * 0.65, Math.max(0.55, Math.atan2(parentR * 1.6, pr)));
    const kidCount = kids.length;
    const perRing = Math.max(8, Math.ceil(Math.sqrt(kidCount) * 2.4));
    let k = 0;
    for (const kid of kids) {
      const ringIdx = Math.floor(k / perRing);
      const idxInRing = k % perRing;
      const countInRing = Math.min(perRing, kidCount - ringIdx * perRing);
      const step = (halfCone * 2) / Math.max(1, countInRing);
      const jitter = (rand() - 0.5) * step * 0.06;
      const localAngle = outAngle - halfCone + step * (idxInRing + 0.5) + jitter;
      const dist = parentR * (0.55 + ringIdx * 0.5);
      const x = parent.x + Math.cos(localAngle) * dist;
      const y = parent.y + Math.sin(localAngle) * dist;
      targets.set(kid, { x, y, angle: localAngle });
      const kSize = sizeOf(kid);
      const kr = Math.max(28, CHILD_R_BASE * 0.55 + Math.sqrt(Math.max(0, kSize - 1)) * 14);
      radius.set(kid, kr);
      stack.push({ id: kid, outAngle: localAngle, parentR: kr });
      k++;
    }
  }

  const isStructural = (a: string, b: string): boolean => {
    if (parentOf.get(a) === b || parentOf.get(b) === a) return true;
    return structuralPairs.has(pairKey(a, b));
  };

  return { parentOf, childrenOf, depth, targets, radius, isStructural, roots: orderedRoots };
}

/** Copy plan targets onto the exact node objects the renderer receives. */
export function applyNeighborhoodSeed<
  T extends { id: string; x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number },
>(nodes: T[], plan: NeighborhoodPlan): void {
  for (const n of nodes) {
    const t = plan.targets.get(n.id);
    if (t) { n.x = t.x; n.y = t.y; }
    else { n.x = 0; n.y = 0; }
    n.vx = 0; n.vy = 0;
    n.fx = undefined; n.fy = undefined;
  }
}

export function isStructuralRelation(rel: string | undefined | null): boolean {
  return STRUCTURAL_RELATIONS.has(normalizeRelation(rel));
}
