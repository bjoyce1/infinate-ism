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

export type BuildOpts = {
  /** Cap of children shown at each level before creating a "+N more" cluster. */
  maxCommunitiesPerDept?: number;
  maxSubhubsPerCommunity?: number;
  maxLeavesPerSubhub?: number;
};

const DEFAULT_OPTS: Required<BuildOpts> = {
  maxCommunitiesPerDept: 6,
  maxSubhubsPerCommunity: 5,
  maxLeavesPerSubhub: 12,
};

export type Taxonomy = {
  root: TreeDatum;
  assignments: Map<string, DeptKey>;   // nodeId -> dept
  totalByDept: Record<DeptKey, number>;
};

export function buildTaxonomy(graph: NormalizedGraph, opts: BuildOpts = {}): Taxonomy {
  const o = { ...DEFAULT_OPTS, ...opts };
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

    // Rank communities by member count.
    const ranked = [...dbuck.entries()]
      .map(([cid, members]) => ({ cid, members: [...members].sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0)) }))
      .sort((a, b) => b.members.length - a.members.length);

    const shown = ranked.slice(0, o.maxCommunitiesPerDept);
    const overflow = ranked.slice(o.maxCommunitiesPerDept);

    const communityNodes: TreeDatum[] = shown.map(({ cid, members }) => {
      // Sub-branches by source group.
      const groups = new Map<string, GraphNode[]>();
      for (const m of members) {
        const g = sourceGroupOf(m);
        const list = groups.get(g) ?? [];
        list.push(m);
        groups.set(g, list);
      }
      const rankedGroups = [...groups.entries()]
        .map(([g, ms]) => ({ g, ms }))
        .sort((a, b) => b.ms.length - a.ms.length);
      const shownGroups = rankedGroups.slice(0, o.maxSubhubsPerCommunity);
      const overflowGroups = rankedGroups.slice(o.maxSubhubsPerCommunity);

      const subhubs: TreeDatum[] = shownGroups.map(({ g, ms }) => {
        const kept = ms.slice(0, o.maxLeavesPerSubhub);
        const overflowLeaves = ms.length - kept.length;
        const leaves: TreeDatum[] = kept.map((m) => ({
          id: `leaf:${m.id}`,
          label: m.label,
          kind: "leaf",
          dept: spec.key,
          color: spec.color,
          weight: (m.degree ?? 0) + (m.is_hub ? 20 : 0),
          node: m,
          meta: { community: cid, source: g, category: m.category },
        }));
        if (overflowLeaves > 0) {
          leaves.push({
            id: `cluster:${spec.key}:${cid}:${g}`,
            label: `+${overflowLeaves} more`,
            kind: "cluster",
            dept: spec.key,
            color: spec.color,
            count: overflowLeaves,
          });
        }
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

      if (overflowGroups.length) {
        const total = overflowGroups.reduce((s, g) => s + g.ms.length, 0);
        subhubs.push({
          id: `subhub-overflow:${spec.key}:${cid}`,
          label: `+${overflowGroups.length} groups · ${total} items`,
          kind: "cluster",
          dept: spec.key,
          color: spec.color,
          count: total,
        });
      }

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

    if (overflow.length) {
      const total = overflow.reduce((s, x) => s + x.members.length, 0);
      communityNodes.push({
        id: `community-overflow:${spec.key}`,
        label: `+${overflow.length} clusters · ${total} items`,
        kind: "cluster",
        dept: spec.key,
        color: spec.color,
        count: total,
      });
    }

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

  return { root, assignments, totalByDept };
}

export const TREE_ROOT_ID = ROOT_ID;
export const TREE_ROOT_SUB = ROOT_SUB;
export const deptColorFor = (k: DeptKey) => DEPT_COLOR[k];