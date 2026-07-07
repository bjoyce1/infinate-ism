import type { NormalizedGraph } from "./types";

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

export function withScrewedUpClick(base: NormalizedGraph): NormalizedGraph {
  if (!base.byId.has(HUB_ID) || !base.byId.has(SUC_HUB)) return base;

  // Skip re-wiring if the downtown ↔ SUC neighborhood edge is already present,
  // but always ensure the profile fields are layered onto the hub node.
  const alreadyLinked = base.links.some(
    (l) =>
      (l.source === HUB_ID && l.target === SUC_HUB) ||
      (l.source === SUC_HUB && l.target === HUB_ID),
  );

  const links = base.links.slice();
  if (!alreadyLinked) {
    links.push({ source: HUB_ID, target: SUC_HUB, relation: "neighborhood", weight: 2 });
  }

  const neighbors = new Map<string, Set<string>>();
  for (const [k, v] of base.neighbors) neighbors.set(k, new Set(v));
  if (!neighbors.has(HUB_ID)) neighbors.set(HUB_ID, new Set());
  if (!neighbors.has(SUC_HUB)) neighbors.set(SUC_HUB, new Set());
  if (!alreadyLinked) {
    neighbors.get(HUB_ID)!.add(SUC_HUB);
    neighbors.get(SUC_HUB)!.add(HUB_ID);
  }

  const byId = new Map(base.byId);
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

  const nodes = base.nodes.map((n) =>
    n.id === HUB_ID
      ? { ...n, degree: (n.degree ?? 0) + degreeBump }
      : n.id === SUC_HUB
        ? { ...n, ...SUC_PROFILE, degree: (n.degree ?? 0) + degreeBump, is_hub: true }
        : n,
  );

  return { ...base, nodes, links, byId, neighbors };
}