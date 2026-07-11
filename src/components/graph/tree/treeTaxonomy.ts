import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { DEPARTMENTS, DEPT_COLOR, type DeptKey, type TreeDatum } from "./treeTypes";

const ROOT_ID = "infinite-ism-root";
const ROOT_LABEL = "INFINITE ISM";
const ROOT_SUB = "MR. CAP · SECOND BRAIN";

// ── Classifier ─────────────────────────────────────────────────────────────

const PERSONAL_RE = /yates|school|class of|family|personal|selflove|self[-_ ]love|birthday|home|diary|journal/i;
const BUSINESS_RE = /mortuary|venture|paypal|invoice|client|business|llc|inc\.?|records|studio|book(?:ing)?|shop|store|finance|revenue|brand/i;
const CONTENT_RE  = /blog|press|epk|newsletter|nft|gallery|art|music|album|song|track|remix|mix|video|cover|poster|thumb|artwork|photo|image/i;
const COMMUNITY_RE = /screwed[-_ ]?up|swishahouse|s\.?u\.?c\.?|coalition|spc|hip[-_ ]?hop|artist|houston|community|member|crew|maasa|witness/i;
const PRODUCT_RE  = /\.tsx?$|\.jsx?$|\.json$|\.md$|\.css$|\.scss$|\.html?$|\.ya?ml$|route|component|config|module|hook|api|schema|migration|package|tsconfig|eslint|vite|tailwind|deno|manifest/i;

export function classifyNode(n: GraphNode): DeptKey {
  const ft = (n.file_type ?? "").toLowerCase();
  const label = (n.label ?? "").toLowerCase();
  const src = (n.source_file ?? "").toLowerCase();
  const url = (n.url ?? "").toLowerCase();
  const cat = n.category;
  const hay = `${label} ${src} ${url}`;

  if (PERSONAL_RE.test(hay)) return "PERSONAL";
  if (BUSINESS_RE.test(hay)) return "BUSINESS";
  if (ft === "music" || cat === "music" || ft === "blog" || cat === "blog" || cat === "image" || CONTENT_RE.test(hay))
    return "CONTENT";
  if (COMMUNITY_RE.test(hay)) return "COMMUNITY";
  if (ft === "code" || cat === "code" || PRODUCT_RE.test(hay)) return "PRODUCT";
  return "COMMUNITY";
}

/** Neighbor-vote reclassify weak assignments. Deterministic. */
function neighborVote(
  graph: NormalizedGraph,
  first: Map<string, DeptKey>,
): Map<string, DeptKey> {
  const out = new Map(first);
  for (const n of graph.nodes) {
    const ft = (n.file_type ?? "").toLowerCase();
    const label = (n.label ?? "").toLowerCase();
    // Only re-vote generic short labels that fell through to defaults.
    const isWeak = !ft && label.length < 12 && !/\W/.test(label);
    if (!isWeak) continue;
    const votes: Record<string, number> = {};
    const nb = graph.neighbors.get(n.id);
    if (!nb || !nb.size) continue;
    for (const nid of nb) {
      const d = first.get(nid);
      if (!d) continue;
      votes[d] = (votes[d] ?? 0) + 1;
    }
    const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    if (winner) out.set(n.id, winner[0] as DeptKey);
  }
  return out;
}

// ── Source-group inference (for sub-branches) ──────────────────────────────

function sourceGroupOf(n: GraphNode): string {
  const src = n.source_file ?? "";
  if (src) {
    const top = src.split(/[\\/]/).slice(0, 2).join("/");
    if (top) return top;
  }
  if (n.url) {
    try {
      const u = new URL(n.url);
      return u.hostname.replace(/^www\./, "");
    } catch { /* ignore */ }
  }
  if (n.file_type) return n.file_type;
  return n.category ?? "misc";
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function humanize(s: string): string {
  const cleaned = s.replace(/^mrcap1com-main\//, "").replace(/[-_/]+/g, " ").trim();
  return truncate(cleaned || "misc", 26).toUpperCase();
}

// ── Build hierarchical taxonomy ────────────────────────────────────────────

export type Taxonomy = {
  root: TreeDatum;
  assignments: Map<string, DeptKey>;
  totalByDept: Record<DeptKey, number>;
  /** Every taxonomy node in-order, addressable by id. */
  index: Map<string, TreeDatum>;
  /** Child → parent map for ancestry expansion. */
  parentOf: Map<string, string>;
  /** Ordered ids of the direct children of every hub. */
  childrenOf: Map<string, string[]>;
};

export function buildTaxonomy(graph: NormalizedGraph): Taxonomy {
  const first = new Map<string, DeptKey>();
  for (const n of graph.nodes) first.set(n.id, classifyNode(n));
  const assignments = neighborVote(graph, first);

  // Bucket nodes by dept then by community.
  const buckets = new Map<DeptKey, Map<number, GraphNode[]>>();
  const totalByDept = Object.fromEntries(DEPARTMENTS.map((d) => [d.key, 0])) as Record<DeptKey, number>;
  for (const n of graph.nodes) {
    const d = assignments.get(n.id)!;
    totalByDept[d]++;
    const dbuck = buckets.get(d) ?? new Map<number, GraphNode[]>();
    const cid = n.community ?? -1;
    const list = dbuck.get(cid) ?? [];
    list.push(n);
    dbuck.set(cid, list);
    buckets.set(d, dbuck);
  }

  const commName = (id: number) =>
    graph.communities.find((c) => c.id === id)?.name ?? (id < 0 ? "Uncategorised" : `Cluster ${id}`);

  const depts: TreeDatum[] = DEPARTMENTS.map((spec) => {
    const dbuck = buckets.get(spec.key) ?? new Map<number, GraphNode[]>();
    const ranked = [...dbuck.entries()]
      .map(([cid, members]) => ({ cid, members: [...members].sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0)) }))
      .sort((a, b) => b.members.length - a.members.length || a.cid - b.cid);

    const communityNodes: TreeDatum[] = ranked.map(({ cid, members }) => {
      const groups = new Map<string, GraphNode[]>();
      for (const m of members) {
        const g = sourceGroupOf(m);
        const list = groups.get(g) ?? [];
        list.push(m);
        groups.set(g, list);
      }
      const rankedGroups = [...groups.entries()]
        .map(([g, ms]) => ({ g, ms: [...ms].sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0) || a.id.localeCompare(b.id)) }))
        .sort((a, b) => b.ms.length - a.ms.length || a.g.localeCompare(b.g));

      const subhubs: TreeDatum[] = rankedGroups.map(({ g, ms }) => {
        const leaves: TreeDatum[] = ms.map((m) => ({
          id: `leaf:${m.id}`,
          label: m.label,
          kind: "leaf",
          dept: spec.key,
          color: spec.color,
          weight: (m.degree ?? 0) + (m.is_hub ? 20 : 0),
          node: m,
          meta: { community: cid, source: g, category: m.category },
        }));
        return {
          id: `subhub:${spec.key}:${cid}:${g}`,
          label: humanize(g),
          kind: "subhub",
          dept: spec.key,
          color: spec.color,
          count: ms.length,
          children: leaves,
        };
      });

      return {
        id: `community:${spec.key}:${cid}`,
        label: commName(cid),
        kind: "community",
        dept: spec.key,
        color: spec.color,
        count: members.length,
        meta: { community: cid },
        children: subhubs,
      };
    });

    return {
      id: `dept:${spec.key}`,
      label: spec.name,
      kind: "department",
      dept: spec.key,
      color: spec.color,
      count: totalByDept[spec.key],
      children: communityNodes,
    };
  });

  const root: TreeDatum = {
    id: ROOT_ID,
    label: ROOT_LABEL,
    kind: "root",
    dept: "PRODUCT",
    color: "#e8e2c8",
    children: depts,
  };

  const index = new Map<string, TreeDatum>();
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  const walk = (d: TreeDatum, parent?: TreeDatum) => {
    index.set(d.id, d);
    if (parent) parentOf.set(d.id, parent.id);
    const kids = d.children ?? [];
    childrenOf.set(d.id, kids.map((k) => k.id));
    for (const c of kids) walk(c, d);
  };
  walk(root);

  return { root, assignments, totalByDept, index, parentOf, childrenOf };
}

export const TREE_ROOT_ID = ROOT_ID;
export const TREE_ROOT_SUB = ROOT_SUB;
export const deptColorFor = (k: DeptKey) => DEPT_COLOR[k];

/** Return the ancestor chain from root → node (inclusive). */
export function ancestorsOf(t: Taxonomy, id: string): string[] {
  const chain: string[] = [];
  let cur: string | undefined = id;
  while (cur) {
    chain.unshift(cur);
    cur = t.parentOf.get(cur);
  }
  return chain;
}

/** Find the taxonomy id of the leaf backing a real graph node id. */
export function leafIdForGraphNode(t: Taxonomy, graphNodeId: string): string | null {
  const id = `leaf:${graphNodeId}`;
  return t.index.has(id) ? id : null;
}