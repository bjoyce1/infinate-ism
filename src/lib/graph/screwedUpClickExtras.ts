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

export function withScrewedUpClick(base: NormalizedGraph): NormalizedGraph {
  if (!base.byId.has(HUB_ID) || !base.byId.has(SUC_HUB)) return base;

  // Skip if the downtown ↔ SUC neighborhood edge is already present.
  const already = base.links.some(
    (l) =>
      (l.source === HUB_ID && l.target === SUC_HUB) ||
      (l.source === SUC_HUB && l.target === HUB_ID),
  );
  if (already) return base;

  const links = base.links.slice();
  links.push({ source: HUB_ID, target: SUC_HUB, relation: "neighborhood", weight: 2 });

  const neighbors = new Map<string, Set<string>>();
  for (const [k, v] of base.neighbors) neighbors.set(k, new Set(v));
  if (!neighbors.has(HUB_ID)) neighbors.set(HUB_ID, new Set());
  if (!neighbors.has(SUC_HUB)) neighbors.set(SUC_HUB, new Set());
  neighbors.get(HUB_ID)!.add(SUC_HUB);
  neighbors.get(SUC_HUB)!.add(HUB_ID);

  const byId = new Map(base.byId);
  const downtown = byId.get(HUB_ID)!;
  const suc = byId.get(SUC_HUB)!;
  byId.set(HUB_ID, { ...downtown, degree: (downtown.degree ?? 0) + 1 });
  byId.set(SUC_HUB, { ...suc, degree: (suc.degree ?? 0) + 1, is_hub: true });

  const nodes = base.nodes.map((n) =>
    n.id === HUB_ID
      ? { ...n, degree: (n.degree ?? 0) + 1 }
      : n.id === SUC_HUB
        ? { ...n, degree: (n.degree ?? 0) + 1, is_hub: true }
        : n,
  );

  return { ...base, nodes, links, byId, neighbors };
}