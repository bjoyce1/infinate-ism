import type { Category, GraphNode, NormalizedGraph, RawGraph } from "./types";

/** True if a node's label or source_file points at a TypeScript file. */
export function isTsSourceNode(n: { label?: string | null; source_file?: string | null }): boolean {
  const re = /\.(ts|tsx)(?:$|[:?#])/;
  const l = (n.label ?? "").toLowerCase();
  const s = (n.source_file ?? "").toLowerCase();
  return re.test(l) || re.test(s);
}

function deriveCommunityLabel(id: number, members: GraphNode[]): string {
  if (id === 200) return "mrcap1.com · Artist Site";
  if (id === 201) return "Self Love Project · NFT Gallery";
  if (id === 202) return "MAASA Project · Witness Archive";
  if (id === 203) return "Cornelius A. Pratt · Identity & Ventures";
  if (id === 204) return "PIMPINTUITIONISM™ · CAP-ism #1";
  if (id === 205) return "AbSoulutely CAPtivating · Creative System";
  if (members.length === 0) return `Cluster ${String(id).padStart(3, "0")}`;

  const labels = members.map((m) => m.label.toLowerCase());
  const text = labels.join(" ");
  const catCounts: Record<Category, number> = { code: 0, blog: 0, music: 0, image: 0, other: 0 };
  for (const m of members) catCounts[m.category] += 1;

  const groups = [
    { name: "NPM Dependencies", score: 0, terms: ["dependencies", "@radix-ui", "@fontsource", "@hookform", "@vitejs", "typescript-eslint", "@tailwindcss"] },
    { name: "UI Components", score: 0, terms: ["button", "card", "input", "dialog", "sheet", "dropdown", "select", "accordion", "toast", "alert", "menubar", "contextmenu", "table", "pagination", "carousel", "checkbox", "radio", "toggle", "calendar", "command", "popover", "tooltip", "breadcrumb", "tabs", "drawer", "separator"] },
    { name: "Layout & Navigation", score: 0, terms: ["sidebar", "navigation", "nav", "footer", "header", "hero", "section", "landing", "page", "layout", "container", "menu", "rail", "inset", "viewport"] },
    { name: "Music & Audio", score: 0, terms: ["track", "album", "song", "discography", "release", "audio", "music", "lyrics", "playlist", "player", "duration", "dsp"] },
    { name: "NFT & Web3", score: 0, terms: ["nft", "collection", "mint", "gallery", "contract", "wallet", "blockchain", "crypto"] },
    { name: "Booking & Forms", score: 0, terms: ["booking", "form", "schema", "contact", "subscribe", "checkout", "shipping", "reservation"] },
    { name: "Marketing & Press", score: 0, terms: ["blog", "press", "epk", "newsletter", "merch", "shop", "store", "city", "tour", "announcement", "feature"] },
    { name: "Analytics & Tracking", score: 0, terms: ["analytics", "track", "report", "event", "conversion", "qualified"] },
    { name: "Email Templates", score: 0, terms: ["email", "magiclink", "signup", "invite", "recovery", "reauthentication", "changeemail"] },
    { name: "Config & Tooling", score: 0, terms: ["tsconfig", "eslint", "vite", "tailwind", "package.json", "manifest.json", "components.json", "deno.json", "compileroptions"] },
    { name: "CMS & Content", score: 0, terms: ["sanity", "timeline", "upcomingshows", "event", "pressentry", "blogpost"] },
    { name: "Data & Charts", score: 0, terms: ["chart", "graph", "data", "legend", "tooltip", "axis"] },
  ];

  for (const g of groups) {
    for (const term of g.terms) {
      const re = new RegExp(term.replace(/\./g, "\\.").replace(/\*/g, ".*"), "g");
      const matches = (text.match(re) || []).length;
      g.score += matches;
    }
  }

  // Boost by category concentration
  if (catCounts.music > members.length * 0.4) groups.find((g) => g.name === "Music & Audio")!.score += 5;
  if (catCounts.blog > members.length * 0.4) groups.find((g) => g.name === "Marketing & Press")!.score += 4;
  if (catCounts.image > members.length * 0.4) groups.find((g) => g.name === "NFT & Web3")!.score += 2;

  groups.sort((a, b) => b.score - a.score);
  const winner = groups[0];
  if (winner.score > 0) return `${winner.name}`;

  // Fallback: use the most common file_type or a generic name
  const dominant = (Object.entries(catCounts) as [Category, number][])
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (dominant) {
    const map: Record<Category, string> = {
      code: "Code Modules",
      blog: "Blog & Press",
      music: "Music Content",
      image: "Visual Assets",
      other: "Mixed Content",
    };
    return map[dominant[0]];
  }
  return `Cluster ${String(id).padStart(3, "0")}`;
}

function inferCategory(label: string, fileType?: string): Category {
  if (fileType === "music") return "music";
  if (fileType === "blog") return "blog";
  if (fileType === "image") return "image";
  if (fileType === "code") return "code";
  const l = (label || "").toLowerCase();
  if (/\.(png|jpg|jpeg|svg|webp|gif)$/.test(l) || l.includes("thumb") || l.includes("cover") || l.includes("poster") || l.includes("art"))
    return "image";
  if (/\.(mp3|wav|flac|m4a)$/.test(l) || l.includes("album") || l.includes("song") || l.includes("track") || l.includes("remix"))
    return "music";
  if (l.includes("blog") || l.endsWith(".md") || l.endsWith(".mdx")) return "blog";
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

  const commMembers = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    if (n.community == null) continue;
    if (!commMembers.has(n.community)) commMembers.set(n.community, []);
    commMembers.get(n.community)!.push(n);
  }
  const communities = Array.from(commMembers.entries())
    .map(([id, members]) => ({ id, count: members.length, name: deriveCommunityLabel(id, members) }))
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