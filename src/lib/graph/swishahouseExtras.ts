import type { GraphNode, NormalizedGraph } from "./types";
import swishaLogo from "@/assets/swishahouse-logo.webp.asset.json";
import { CATEGORY_COLORS } from "./loadGraph";

// Swishahouse neighborhood — Michael "5000" Watts + OG Ron C (Houston, 1993).
// Adds a new hub connected into mrcap1 downtown and the existing SPC / SUC
// Houston-rap ecosystem, plus its roster as private neighborhood members.
// Source: https://en.wikipedia.org/wiki/Swishahouse

const HUB_ID = "site_mrcap1_com";
const SWISHA_HUB = "site_swishahouse";
const SWISHA_COMMUNITY = 209;
const SWISHA_COLOR = "#F4A300"; // amber/gold — Swishahouse candy-paint vibe.

type Member = {
  id: string;
  label: string;
  role: string;
  description: string;
  tags?: string[];
};

const members: Member[] = [
  { id: "swisha_michael_5000_watts", label: 'Michael "5000" Watts', role: "Founder / DJ", description: "Co-founder of Swishahouse. Mixtape legend behind the chopped-and-screwed Northside sound.", tags: ["Swishahouse", "Founder", "DJ"] },
  { id: "swisha_og_ron_c", label: "OG Ron C", role: "Co-founder / DJ", description: "Co-founder of Swishahouse. Architect of the 'Chopped Not Slopped' brand.", tags: ["Swishahouse", "Founder", "DJ"] },
  { id: "swisha_mike_jones", label: "Mike Jones", role: "Artist", description: "Who? Mike Jones. Signed to Swishahouse via Asylum; 'Still Tippin', 'Back Then'.", tags: ["Swishahouse", "Northside"] },
  { id: "swisha_chamillionaire", label: "Chamillionaire", role: "Artist", description: "Hakeem Seriki. Early Swishahouse mixtape run, later Grammy for 'Ridin'.", tags: ["Swishahouse", "Color Changin' Click"] },
  { id: "swisha_slim_thug", label: "Slim Thug", role: "Artist", description: "Boss of All Bosses. Cornerstone Swishahouse voice.", tags: ["Swishahouse", "Boss Hogg Outlawz"] },
  { id: "swisha_magno", label: "Magnificent", role: "Artist", description: "Magno — Swishahouse core roster, freestyle powerhouse.", tags: ["Swishahouse"] },
  { id: "swisha_yung_redd", label: "Yung Redd", role: "Artist", description: "Swishahouse rapper, tight in the mixtape era.", tags: ["Swishahouse"] },
  { id: "swisha_kiotti", label: "Kiotti", role: "Artist", description: "Swishahouse artist, Northside representer.", tags: ["Swishahouse"] },
  { id: "swisha_archie_lee", label: "Archie Lee", role: "Artist", description: "Swishahouse artist, part of the classic mixtape roster.", tags: ["Swishahouse"] },
  { id: "swisha_coota_bang", label: "Coota Bang", role: "Artist", description: "Swishahouse artist.", tags: ["Swishahouse"] },
  { id: "swisha_paul_wall_hoodrock", label: "Paul Wall (Swishahouse era)", role: "Artist", description: "People's Champ — broke out through Swishahouse alongside Chamillionaire.", tags: ["Swishahouse", "The People's Champ"] },
];

/** Merge the Swishahouse neighborhood into a normalized graph. */
export function withSwishahouse(base: NormalizedGraph): NormalizedGraph {
  if (base.byId.has(SWISHA_HUB)) return base;

  const nodes: GraphNode[] = base.nodes.slice();
  const links = base.links.slice();
  const byId = new Map(base.byId);
  const neighbors = new Map<string, Set<string>>();
  for (const [k, v] of base.neighbors) neighbors.set(k, new Set(v));
  const categoryCounts = { ...base.categoryCounts };

  const addNode = (n: GraphNode) => {
    nodes.push(n);
    byId.set(n.id, n);
    if (!neighbors.has(n.id)) neighbors.set(n.id, new Set());
    categoryCounts[n.category] = (categoryCounts[n.category] ?? 0) + 1;
  };

  const addLink = (source: string, target: string, relation: string, weight = 1.2) => {
    if (!byId.has(source) || !byId.has(target)) return;
    links.push({ source, target, relation, weight });
    if (!neighbors.has(source)) neighbors.set(source, new Set());
    if (!neighbors.has(target)) neighbors.set(target, new Set());
    neighbors.get(source)!.add(target);
    neighbors.get(target)!.add(source);
    const s = byId.get(source)!;
    const t = byId.get(target)!;
    byId.set(source, { ...s, degree: (s.degree ?? 0) + 1 });
    byId.set(target, { ...t, degree: (t.degree ?? 0) + 1 });
  };

  // 1. The Swishahouse HQ hub itself.
  addNode({
    id: SWISHA_HUB,
    label: "Swishahouse",
    category: "music",
    degree: 0,
    is_hub: true,
    color: SWISHA_COLOR,
    weight: 3,
    community: SWISHA_COMMUNITY,
    file_type: "hub",
    url: "https://en.wikipedia.org/wiki/Swishahouse",
    image: swishaLogo.url,
    _origin: "extras:swishahouse",
  } as GraphNode);

  // 2. Roster.
  for (const m of members) {
    addNode({
      id: m.id,
      label: m.label,
      category: "music",
      degree: 0,
      color: SWISHA_COLOR,
      weight: 1.5,
      community: SWISHA_COMMUNITY,
      file_type: "artist",
      _origin: "extras:swishahouse",
    } as GraphNode);
  }

  // 3. Wire connections.
  addLink(HUB_ID, SWISHA_HUB, "neighborhood", 2);
  for (const m of members) addLink(SWISHA_HUB, m.id, "roster");

  // Cross-links into existing Houston rap graph.
  // Strong pull: Paul Wall broke out of Swishahouse — keep him close to the hub.
  addLink(SWISHA_HUB, "artist_paul_wall", "roster-alumnus", 8);
  addLink(SWISHA_HUB, "suc_member_lil_keke", "houston-scene", 1);
  addLink(SWISHA_HUB, "site_spc_houston", "houston-scene", 1.5);
  addLink(SWISHA_HUB, "spc_artist_dj_screw", "chopped-and-screwed-lineage", 1.5);

  // Add Swishahouse community label.
  const communities = base.communities.some((c) => c.id === SWISHA_COMMUNITY)
    ? base.communities
    : [
        ...base.communities,
        { id: SWISHA_COMMUNITY, count: members.length + 1, name: "Swishahouse · Northside Houston" },
      ];

  return { nodes, links, byId, neighbors, categoryCounts, communities };
}