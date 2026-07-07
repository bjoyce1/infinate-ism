import type { GraphNode, NormalizedGraph } from "./types";
import screwTapeAsset from "@/assets/dj-screw-tape.png.asset.json";
import screwedUpRecordsAsset from "@/assets/screwed-up-records-and-tapes.png.asset.json";
import screwHouseImg from "@/assets/suc-screw-house.jpg";
import southParkImg from "@/assets/suc-south-park.jpg";
import smithvilleImg from "@/assets/suc-smithville.jpg";
import macgregorImg from "@/assets/suc-macgregor-park.jpg";
import almedaImg from "@/assets/suc-almeda-mall.jpg";
import timmyChanImg from "@/assets/suc-timmy-chan.jpg";
import wreckshopImg from "@/assets/suc-wreckshop.jpg";
import kbxxImg from "@/assets/suc-kbxx.jpg";
import astroworldImg from "@/assets/suc-astroworld.jpg";
import surtInteriorImg from "@/assets/suc-surt-interior.jpg";


// Promote the existing Screwed Up Click (`suc_hub`) node to its own top-level
// neighborhood on the street map. The street layout treats every direct
// neighbor of `site_mrcap1_com` as a district hub, and every one of that
// hub's other neighbors becomes a building inside its block. `suc_hub`
// already links out to all its members (`suc_member_*`) and legacy nodes
// (`suc_legacy_*`), so wiring one `neighborhood` edge from downtown to the
// SUC HQ is all that's needed to spawn the district — every existing route
// and connection (DJ Screw, SPC, Swishahouse, Lil' Keke, etc.) is preserved.

const HUB_ID = "site_mrcap1_com";
const SUC_HUB = "suc_hub";
const SUC_COMMUNITY = 208;
const SUC_COLOR = "#8A2BE2";

// Extra profile fields layered onto the SUC HQ node so the DetailPanel shows
// a proper "neighborhood profile" — short bio + founding context — the moment
// a user clicks the district hub. Values are surfaced via the "All Properties"
// section of DetailPanel (any unknown, non-empty node key renders as a row).
const SUC_PROFILE = {
  profile:
    "The Screwed Up Click (S.U.C.) is Houston's foundational chopped & screwed collective — a loose Southside brotherhood of MCs who came up freestyling over DJ Screw's slowed-down mixtapes. What began as neighborhood cyphers at the Screw House on Greenstone Street grew into the blueprint for modern Houston rap.",
  founded: "1990, Houston, Texas",
  founded_by: "DJ Screw (Robert Earl Davis Jr.)",
  headquarters: "The Screw House · 7717 Greenstone St, South Park, Houston",
  founding_story:
    "In the late 1980s DJ Screw began pitching records down on his turntables in his South Park apartment, inventing the chopped & screwed technique. By 1990 a rotating cast of neighborhood MCs — Al-D, E.S.G., Big Hawk, Fat Pat, Big Moe, Lil' Keke, Big Pokey and more — were gathering nightly to freestyle over his slowed beats. Fans lined up around the block for the resulting Grey Tapes, and the crew that recorded them became known as the Screwed Up Click. After Screw's death in 2000 the Click carried the sound forward, and the shop Screwed Up Records & Tapes on Cullen Blvd keeps the catalog in print.",
  signature_sound: "Chopped & screwed · slowed tempo · double-cup Southside cadence",
  legacy:
    "Direct lineage into Swishahouse, South Park Coalition affiliations, and the entire modern Houston sound (Paul Wall, Slim Thug, Bun B collaborations, Drake's slowed reissues).",
};

type Landmark = {
  id: string;
  label: string;
  file_type: "venue" | "landmark" | "studio" | "shop" | "radio" | "district";
  address?: string;
  description: string;
  tags: string[];
  url?: string;
  relation: string;
  weight?: number;
  image?: string;
  gallery?: string[];
};

// Real Houston places tied to the Screwed Up Click origin story. Each becomes
// a "building" inside the SUC neighborhood — the street layout renders every
// non-hub neighbor of `suc_hub` as a lot on that block.
const LANDMARKS: Landmark[] = [
  {
    id: "suc_landmark_screw_house",
    label: "The Screw House",
    file_type: "landmark",
    address: "7717 Greenstone St, South Park, Houston, TX",
    description:
      "DJ Screw's home studio on Greenstone Street — the birthplace of chopped & screwed. Fans lined up around the block for freshly dubbed Grey Tapes; every foundational SUC freestyle was cut here.",
    tags: ["HQ", "Origin", "South Park", "Grey Tapes"],
    relation: "origin-site",
    weight: 3,
  },
  {
    id: "suc_landmark_screwed_up_records",
    label: "Screwed Up Records & Tapes",
    file_type: "shop",
    address: "8806 Cullen Blvd, Houston, TX",
    description:
      "The brick-and-mortar shop on Cullen Boulevard that kept DJ Screw's catalog, grey tapes and SUC releases in print after his passing — a pilgrimage spot for the Houston sound.",
    tags: ["Shop", "Cullen Blvd", "SUC", "DJ Screw"],
    relation: "landmark",
    weight: 1.8,
  },
  {
    id: "suc_landmark_south_park",
    label: "South Park",

    file_type: "district",
    address: "South Park, Houston, TX",
    description:
      "Southside Houston neighborhood that raised DJ Screw and the earliest SUC members. The Screw House sat inside its blocks; the culture radiated outward from here.",
    tags: ["Neighborhood", "Southside", "Houston"],
    relation: "home-turf",
    weight: 2,
  },
  {
    id: "suc_landmark_smithville",
    label: "Smithville, TX",
    file_type: "landmark",
    address: "Smithville, Bastrop County, TX",
    description:
      "Robert Earl Davis Jr. — DJ Screw — was born here on July 20, 1971 before the family moved to Houston. The pilgrimage point for the origin of the sound.",
    tags: ["Birthplace", "DJ Screw"],
    relation: "birthplace",
    weight: 1.5,
  },
  {
    id: "suc_landmark_macgregor_park",
    label: "MacGregor Park",
    file_type: "landmark",
    address: "5225 Calhoun Rd, Houston, TX",
    description:
      "Southside Houston park where SUC members, SPC and the wider Third Ward scene hung out and cyphered. A recurring shout-out on Grey Tape freestyles.",
    tags: ["Park", "Southside", "Cyphers"],
    relation: "hangout",
    weight: 1.2,
  },
  {
    id: "suc_landmark_almeda_mall",
    label: "Almeda Mall",
    file_type: "landmark",
    address: "12200 Gulf Fwy, Houston, TX",
    description:
      "Southside shopping hub name-checked across SUC verses — a landmark of the everyday Houston that the Grey Tapes documented.",
    tags: ["Southside", "Landmark"],
    relation: "landmark",
    weight: 1,
  },
  {
    id: "suc_landmark_timmy_chan",
    label: "Timmy Chan's",
    file_type: "venue",
    address: "Multiple Southside locations, Houston, TX",
    description:
      "Houston fried-rice-and-wings institution immortalised in SUC and SPC lyrics — post-session food of choice.",
    tags: ["Food", "Southside"],
    relation: "landmark",
    weight: 1,
  },
  {
    id: "suc_landmark_wreckshop",
    label: "Wreckshop Records",
    file_type: "studio",
    address: "Houston, TX",
    description:
      "D-Reck's label and studio that put out early Big Moe, Botany Boyz and E.S.G. records — a critical outlet for SUC affiliates after Screw's passing.",
    tags: ["Label", "Studio", "SUC-affiliated"],
    relation: "affiliated-label",
    weight: 1.5,
  },
  {
    id: "suc_landmark_kbxx",
    label: "97.9 The Box (KBXX)",
    file_type: "radio",
    address: "24 Greenway Plaza, Houston, TX",
    description:
      "Houston's hip-hop and R&B FM home. Broke SUC and Swishahouse records into daytime rotation and kept the Southside sound on the dial.",
    tags: ["Radio", "Houston"],
    url: "https://theboxhouston.com",
    relation: "broadcast-partner",
    weight: 1.2,
  },
  {
    id: "suc_landmark_astroworld",
    label: "AstroWorld",
    file_type: "landmark",
    address: "9001 Kirby Dr, Houston, TX (1968–2005)",
    description:
      "The demolished Houston amusement park referenced across generations of local rap — from SUC-era shout-outs to Travis Scott's tribute album.",
    tags: ["Landmark", "Houston lore"],
    relation: "landmark",
    weight: 1,
  },
];

export function withScrewedUpClick(base: NormalizedGraph): NormalizedGraph {
  if (!base.byId.has(HUB_ID) || !base.byId.has(SUC_HUB)) return base;

  // Skip re-wiring if the downtown ↔ SUC neighborhood edge is already present,
  // but always ensure the profile fields are layered onto the hub node.
  const alreadyLinked = base.links.some(
    (l) =>
      (l.source === HUB_ID && l.target === SUC_HUB) ||
      (l.source === SUC_HUB && l.target === HUB_ID),
  );

  const nodes = base.nodes.slice();
  const links = base.links.slice();
  const byId = new Map(base.byId);
  const neighbors = new Map<string, Set<string>>();
  for (const [k, v] of base.neighbors) neighbors.set(k, new Set(v));
  const categoryCounts = { ...base.categoryCounts };

  if (!alreadyLinked) {
    links.push({ source: HUB_ID, target: SUC_HUB, relation: "neighborhood", weight: 2 });
  }

  if (!neighbors.has(HUB_ID)) neighbors.set(HUB_ID, new Set());
  if (!neighbors.has(SUC_HUB)) neighbors.set(SUC_HUB, new Set());
  if (!alreadyLinked) {
    neighbors.get(HUB_ID)!.add(SUC_HUB);
    neighbors.get(SUC_HUB)!.add(HUB_ID);
  }

  const downtown = byId.get(HUB_ID)!;
  const suc = byId.get(SUC_HUB)!;
  const degreeBump = alreadyLinked ? 0 : 1;
  byId.set(HUB_ID, { ...downtown, degree: (downtown.degree ?? 0) + degreeBump });
  byId.set(SUC_HUB, {
    ...suc,
    ...SUC_PROFILE,
    degree: (suc.degree ?? 0) + degreeBump,
    is_hub: true,
  });

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === HUB_ID) nodes[i] = { ...n, degree: (n.degree ?? 0) + degreeBump };
    else if (n.id === SUC_HUB)
      nodes[i] = { ...n, ...SUC_PROFILE, degree: (n.degree ?? 0) + degreeBump, is_hub: true };
    else if (n.id === "suc_legacy_screw_tapes")
      nodes[i] = { ...n, image: screwTapeAsset.url, artwork: screwTapeAsset.url };
  }
  {
    const tape = byId.get("suc_legacy_screw_tapes");
    if (tape) byId.set(tape.id, { ...tape, image: screwTapeAsset.url, artwork: screwTapeAsset.url });
  }

  // Add landmark nodes + wire them to the SUC HQ (skip if already merged).
  for (const lm of LANDMARKS) {
    if (byId.has(lm.id)) continue;
    const node: GraphNode = {
      id: lm.id,
      label: lm.label,
      category: "other",
      degree: 1,
      color: SUC_COLOR,
      weight: lm.weight ?? 1,
      community: SUC_COMMUNITY,
      file_type: lm.file_type,
      url: lm.url,
      _origin: "extras:suc-landmarks",
      ...(lm.address ? { address: lm.address } : {}),
      description: lm.description,
      tags: lm.tags,
      role: "landmark",
      ...(lm.id === "suc_landmark_screwed_up_records"
        ? { image: screwedUpRecordsAsset.url, artwork: screwedUpRecordsAsset.url }
        : {}),
    } as GraphNode;
    nodes.push(node);
    byId.set(lm.id, node);

    neighbors.set(lm.id, new Set([SUC_HUB]));
    neighbors.get(SUC_HUB)!.add(lm.id);
    links.push({ source: SUC_HUB, target: lm.id, relation: lm.relation, weight: lm.weight ?? 1.2 });
    categoryCounts.other = (categoryCounts.other ?? 0) + 1;

    // Bump SUC HQ degree for each new landmark.
    const cur = byId.get(SUC_HUB)!;
    byId.set(SUC_HUB, { ...cur, degree: (cur.degree ?? 0) + 1 });
  }

  // Extra cross-connections into existing SUC ecosystem nodes.
  const crossLink = (source: string, target: string, relation: string, weight = 1) => {
    if (!byId.has(source) || !byId.has(target)) return;
    const exists = links.some(
      (l) =>
        (l.source === source && l.target === target) ||
        (l.source === target && l.target === source),
    );
    if (exists) return;
    links.push({ source, target, relation, weight });
    neighbors.get(source)!.add(target);
    if (!neighbors.has(target)) neighbors.set(target, new Set());
    neighbors.get(target)!.add(source);
  };
  // Screw House is the physical origin of the Grey Tapes and Chopped & Screwed.
  crossLink("suc_landmark_screw_house", "suc_legacy_surt", "legacy-continues-at", 1.5);
  crossLink("suc_landmark_screw_house", "suc_legacy_chopped_screwed", "birthplace-of", 2);
  crossLink("suc_landmark_south_park", "suc_landmark_screw_house", "contains", 1.5);
  crossLink("suc_landmark_south_park", "site_spc_houston", "houston-scene", 1);

  // Sync final nodes array with byId's degree updates.
  const finalNodes = nodes.map((n) => byId.get(n.id) ?? n);

  return { nodes: finalNodes, links, byId, neighbors, categoryCounts, communities: base.communities };
}