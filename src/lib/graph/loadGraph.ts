import type { Category, GraphNode, NormalizedGraph, RawGraph } from "./types";

function inferCategory(label: string, fileType?: string): Category {
  const l = (label || "").toLowerCase();
  if (/\.(png|jpg|jpeg|svg|webp|gif)$/.test(l) || l.includes("thumb") || l.includes("cover") || l.includes("poster") || l.includes("art"))
    return "image";
  if (/\.(mp3|wav|flac|m4a)$/.test(l) || l.includes("album") || l.includes("song") || l.includes("track") || l.includes("remix"))
    return "music";
  if (l.includes("blog") || l.endsWith(".md") || l.endsWith(".mdx")) return "blog";
  if (fileType === "code") return "code";
  return "other";
}

export async function loadGraph(): Promise<NormalizedGraph> {
  const res = await fetch("/graph.json");
  if (!res.ok) throw new Error(`Failed to load graph.json: ${res.status}`);
  const raw = (await res.json()) as RawGraph;

  const degrees = new Map<string, number>();
  const neighbors = new Map<string, Set<string>>();
  for (const l of raw.links) {
    const s = typeof l.source === "string" ? l.source : (l.source as { id: string }).id;
    const t = typeof l.target === "string" ? l.target : (l.target as { id: string }).id;
    degrees.set(s, (degrees.get(s) ?? 0) + 1);
    degrees.set(t, (degrees.get(t) ?? 0) + 1);
    if (!neighbors.has(s)) neighbors.set(s, new Set());
    if (!neighbors.has(t)) neighbors.set(t, new Set());
    neighbors.get(s)!.add(t);
    neighbors.get(t)!.add(s);
  }

  const categoryCounts: Record<Category, number> = { code: 0, blog: 0, music: 0, image: 0, other: 0 };
  const nodes: GraphNode[] = raw.nodes.map((n) => {
    const category = inferCategory(n.label ?? "", n.file_type);
    categoryCounts[category] += 1;
    return { ...n, category, degree: degrees.get(n.id) ?? 0 };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: NormalizedGraph["links"] = raw.links
    .map((l) => ({
      source: typeof l.source === "string" ? l.source : (l.source as { id: string }).id,
      target: typeof l.target === "string" ? l.target : (l.target as { id: string }).id,
      relation: l.relation,
      weight: l.weight,
    }))
    .filter((l) => byId.has(l.source) && byId.has(l.target));

  const commCounts = new Map<number, number>();
  for (const n of nodes) {
    if (n.community == null) continue;
    commCounts.set(n.community, (commCounts.get(n.community) ?? 0) + 1);
  }
  const communities = Array.from(commCounts.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);

  return { nodes, links, neighbors, byId, communities, categoryCounts };
}

export const CATEGORY_COLORS: Record<Category, string> = {
  code: "#3DED97",
  blog: "#A78BFA",
  music: "#F59E0B",
  image: "#60A5FA",
  other: "#8E9196",
};