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
    image: screwHouseImg,
    gallery: [screwHouseImg, southParkImg],
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
    image: screwedUpRecordsAsset.url,
    gallery: [screwedUpRecordsAsset.url, surtInteriorImg, screwTapeAsset.url],
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
    image: southParkImg,
    gallery: [southParkImg, macgregorImg],
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
    image: smithvilleImg,
    gallery: [smithvilleImg],
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
    image: macgregorImg,
    gallery: [macgregorImg],
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
    image: almedaImg,
    gallery: [almedaImg],
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
    image: timmyChanImg,
    gallery: [timmyChanImg],
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
    image: wreckshopImg,
    gallery: [wreckshopImg],
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
    image: kbxxImg,
    gallery: [kbxxImg],
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
    image: astroworldImg,
    gallery: [astroworldImg],
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
      ...(lm.image ? { image: lm.image, artwork: lm.image } : {}),
      ...(lm.gallery && lm.gallery.length ? { gallery: lm.gallery } : {}),
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

  // Walkable routes from Screwed Up Records & Tapes (8806 Cullen Blvd) to
  // nearby SUC landmarks. Distances/durations are documented walking estimates.
  const walkRoutes: Array<{
    to: string;
    distance: string;
    duration: string;
    directions: string;
    weight: number;
    days?: Array<{ label: string; distance: string; duration: string; directions: string }>;
  }> = [
    {
      to: "suc_landmark_screw_house",
      distance: "1.4 mi",
      duration: "28 min",
      directions:
        "North on Cullen Blvd, right on Reed Rd, left on Scott St, right on Greenstone St to 7717.",
      weight: 2,
    },
    {
      to: "suc_landmark_south_park",
      distance: "0.2 mi",
      duration: "5 min",
      directions: "Step outside — the shop sits on the north edge of the South Park district.",
      weight: 2.2,
    },
    {
      to: "suc_landmark_macgregor_park",
      distance: "2.6 mi",
      duration: "52 min",
      directions:
        "North on Cullen Blvd past MLK Blvd, left on N MacGregor Way to Calhoun Rd park entrance.",
      weight: 1.4,
    },
    {
      to: "suc_landmark_almeda_mall",
      distance: "4.9 mi",
      duration: "1 hr 40 min",
      directions:
        "South on Cullen Blvd, east on Airport Blvd, south on I-45 Gulf Fwy frontage to Almeda Mall.",
      weight: 1,
    },
    {
      to: "suc_landmark_timmy_chan",
      distance: "1.1 mi",
      duration: "22 min",
      directions:
        "South on Cullen Blvd to the nearest Southside Timmy Chan's on the corner strip.",
      weight: 1.3,
    },
    {
      to: "suc_landmark_wreckshop",
      distance: "3.2 mi",
      duration: "1 hr 5 min",
      directions:
        "North on Cullen Blvd, west on Old Spanish Trail, north on Almeda Rd to the Wreckshop storefront.",
      weight: 1.2,
    },
    {
      to: "suc_landmark_kbxx",
      distance: "6.4 mi",
      duration: "2 hr 10 min",
      directions:
        "North on Cullen Blvd, west on Bissonnet St, north on Kirby Dr to Greenway Plaza (24 Greenway Plaza).",
      weight: 0.9,
    },
    {
      to: "suc_landmark_astroworld",
      distance: "5.1 mi",
      duration: "1 hr 45 min",
      directions:
        "North on Cullen Blvd, west on Old Spanish Trail, south on Fannin St, west on Loop 610 frontage to the former AstroWorld site at 9001 Kirby Dr.",
      weight: 0.9,
    },
    {
      to: "suc_landmark_smithville",
      distance: "155 mi",
      duration: "3 days on foot (multi-day pilgrimage)",
      directions:
        "West on US-90 Alt through Rosenberg, Columbus and La Grange, then SH-71 south into Smithville — a documented multi-day Grey Tape pilgrimage, not a same-day walk.",
      weight: 0.6,
      days: [
        {
          label: "Day 1 — Houston → Rosenberg",
          distance: "34 mi",
          duration: "≈ 11 hr walking",
          directions:
            "Leave Screwed Up Records & Tapes on Cullen Blvd, head west on Old Spanish Trail, then southwest on US-90 Alt through Stafford and Sugar Land. Overnight in Rosenberg.",
        },
        {
          label: "Day 2 — Rosenberg → Columbus",
          distance: "45 mi",
          duration: "≈ 15 hr walking",
          directions:
            "Continue west on US-90 Alt through Beasley, Kendleton and Eagle Lake, crossing into Colorado County. Overnight in Columbus on the Colorado River.",
        },
        {
          label: "Day 3 — Columbus → La Grange → Smithville",
          distance: "76 mi",
          duration: "≈ 25 hr walking (split across two overnights)",
          directions:
            "North on TX-71 through Weimar and La Grange, then west on TX-71 into Bastrop County. Arrive at DJ Screw's birthplace in downtown Smithville.",
        },
      ],
    },
  ];
  const SURT = "suc_landmark_screwed_up_records";
  for (const w of walkRoutes) {
    if (!byId.has(SURT) || !byId.has(w.to)) continue;
    const existing = links.findIndex(
      (l) =>
        (l.source === SURT && l.target === w.to) ||
        (l.source === w.to && l.target === SURT),
    );
    const linkPayload = {
      source: SURT,
      target: w.to,
      relation: `walk · ${w.duration} (${w.distance})`,
      weight: w.weight,
      walk_distance: w.distance,
      walk_duration: w.duration,
      walk_directions: w.directions,
      ...(w.days ? { walk_days: w.days } : {}),
    } as (typeof links)[number];
    if (existing >= 0) links[existing] = { ...links[existing], ...linkPayload };
    else {
      links.push(linkPayload);
      if (!neighbors.has(SURT)) neighbors.set(SURT, new Set());
      if (!neighbors.has(w.to)) neighbors.set(w.to, new Set());
      neighbors.get(SURT)!.add(w.to);
      neighbors.get(w.to)!.add(SURT);
    }
  }

  // Sync final nodes array with byId's degree updates.
  const finalNodes = nodes.map((n) => byId.get(n.id) ?? n);

  return { nodes: finalNodes, links, byId, neighbors, categoryCounts, communities: base.communities };
}