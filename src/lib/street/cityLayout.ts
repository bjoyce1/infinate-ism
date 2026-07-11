// Deterministic city layout for the Street View proof of concept.
//
// Consumes a NormalizedGraph (already filtered) and emits a city model:
//   - districts (with in-district property parcels)
//   - property instances (one canonical node may appear in multiple
//     districts — see `propertiesByCanonical`)
//   - roads at four semantic tiers (interstate, highway, main, residential)
//
// Pure: no DOM, no imports from React or canvas code, so it is trivial to
// unit-test.

import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import {
  DISTRICTS,
  DISTRICT_BY_COMMUNITY,
  DISTRICT_BY_ID,
  DOWNTOWN_BUILDINGS,
  DOWNTOWN_ID,
  type District,
  type DistrictId,
  type Point,
} from "./houstonCityConfig";

export type BuildingKind =
  | "landmark"
  | "skyscraper"
  | "office"
  | "studio"
  | "venue"
  | "record_store"
  | "cinema"
  | "library"
  | "school"
  | "finance"
  | "commercial"
  | "house";

export type PropertyInstance = {
  id: string; // instance id, unique per (canonicalId, districtId)
  canonicalId: string; // graph node id — the "person"
  districtId: DistrictId;
  x: number;
  y: number;
  parcelW: number;
  parcelH: number;
  kind: BuildingKind;
  label: string;
  color: string;
  node: GraphNode;
  isLandmark?: boolean;
};

export type RoadTier =
  | "interstate" // cross-district connector along/near highway skeleton
  | "highway" // downtown ↔ district landmark
  | "main" // parent ↔ child category inside district
  | "residential" // district ↔ member
  | "bridge"; // cross-community relationship

export type CityRoad = {
  id: string;
  from: string; // property instance id (or "downtown")
  to: string;
  fromPoint: Point;
  toPoint: Point;
  tier: RoadTier;
  relation?: string;
  weight?: number;
};

export type CityModel = {
  districts: District[];
  properties: PropertyInstance[];
  propertiesById: Map<string, PropertyInstance>; // by instance id
  propertiesByCanonical: Map<string, PropertyInstance[]>; // by graph node id
  roads: CityRoad[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

// ---------------------------------------------------------------------------
// Utilities

// Deterministic 32-bit hash → [0,1). Used to jitter parcel positions so
// neighborhoods don't look grid-perfect but stay stable across renders.
function hash01(str: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function inferBuildingKind(n: GraphNode): BuildingKind {
  const label = (n.label || "").toLowerCase();
  const type = (n.file_type || "").toLowerCase();
  if (n.is_hub) return "landmark";
  if (type === "artist" || label.includes("dj ") || label.includes("mc "))
    return "studio";
  if (type === "album") return "record_store";
  if (type === "song") return "venue";
  if (type === "hub") return "landmark";
  if (n.category === "music") return "studio";
  if (n.category === "image") return "commercial";
  if (n.category === "blog") return "office";
  if (n.category === "code") return "office";
  if (label.includes("film") || label.includes("cinema")) return "cinema";
  if (label.includes("book") || label.includes("library")) return "library";
  if (label.includes("school") || label.includes("yates")) return "school";
  if (label.includes("crypto") || label.includes("coin")) return "finance";
  if (label.includes("company") || label.includes("hq")) return "office";
  return "house";
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Build the city model from a normalized graph.
 *
 * Rules:
 *  - Every node is assigned to its primary district via `community`.
 *  - A node also gets a *secondary* property in another district when it has
 *    at least two neighbors in that other community. This models "a person
 *    lives here but works there" — the exact user requirement.
 *  - The downtown district always exists and always contains the six
 *    fixed skyline buildings from houstonCityConfig, whether or not the
 *    graph has matching nodes.
 */
export function buildCityModel(graph: NormalizedGraph): CityModel {
  const properties: PropertyInstance[] = [];
  const propertiesById = new Map<string, PropertyInstance>();
  const propertiesByCanonical = new Map<string, PropertyInstance[]>();

  // 1. Bucket real graph nodes by district (via community id).
  const buckets = new Map<DistrictId, GraphNode[]>();
  for (const d of DISTRICTS) buckets.set(d.id, []);

  for (const n of graph.nodes) {
    const dist = n.community != null ? DISTRICT_BY_COMMUNITY.get(n.community) : null;
    if (!dist) continue;
    buckets.get(dist.id)!.push(n);
  }

  // 2. Secondary properties: node has ≥2 neighbors in a *different* district.
  //    Skip landmarks and skyline entries (they're pinned).
  const secondaryTargets = new Map<string, Set<DistrictId>>();
  for (const n of graph.nodes) {
    const primary = n.community != null ? DISTRICT_BY_COMMUNITY.get(n.community) : null;
    if (!primary) continue;
    const counts = new Map<DistrictId, number>();
    for (const nid of graph.neighbors.get(n.id) ?? []) {
      const nn = graph.byId.get(nid);
      if (!nn || nn.community == null) continue;
      const d = DISTRICT_BY_COMMUNITY.get(nn.community);
      if (!d || d.id === primary.id) continue;
      counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
    }
    for (const [did, count] of counts) {
      if (count >= 2) {
        if (!secondaryTargets.has(n.id)) secondaryTargets.set(n.id, new Set());
        secondaryTargets.get(n.id)!.add(did);
        buckets.get(did)!.push(n);
      }
    }
  }

  // 3. Lay out each district's parcels on a deterministic radial grid.
  //    Landmark = pinned at district centre; other properties spiral out.
  for (const dist of DISTRICTS) {
    const nodes = [...(buckets.get(dist.id) ?? [])];
    // Sort: hubs first, then by degree desc, then id for determinism.
    nodes.sort((a, b) => {
      const ah = a.is_hub ? 1 : 0;
      const bh = b.is_hub ? 1 : 0;
      if (bh !== ah) return bh - ah;
      if ((b.degree ?? 0) !== (a.degree ?? 0)) return (b.degree ?? 0) - (a.degree ?? 0);
      return a.id < b.id ? -1 : 1;
    });

    // Downtown skyline: add synthetic buildings first.
    if (dist.id === DOWNTOWN_ID) {
      for (const b of DOWNTOWN_BUILDINGS) {
        const inst: PropertyInstance = {
          id: `dt:${b.id}`,
          canonicalId: b.id,
          districtId: dist.id,
          x: dist.center.x + b.offset.x,
          y: dist.center.y + b.offset.y,
          parcelW: b.width,
          parcelH: b.width,
          kind: b.landmark ? "landmark" : "skyscraper",
          label: b.label,
          color: b.color,
          node: {
            id: b.id,
            label: b.label,
            category: "other",
            degree: 0,
            is_hub: b.landmark,
            color: b.color,
          } as GraphNode,
          isLandmark: b.landmark,
        };
        addProperty(inst, properties, propertiesById, propertiesByCanonical);
      }
    }

    // Place real nodes on a soft hex spiral.
    let ring = 0;
    let indexInRing = 0;
    let capacity = 6;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const isPrimary =
        n.community != null && DISTRICT_BY_COMMUNITY.get(n.community)?.id === dist.id;

      // Landmark gets pinned near centre (only in its primary district).
      let x: number, y: number;
      if (isPrimary && n.is_hub && i < 2) {
        // Slight offset from centre so downtown skyline stays visible.
        const off = dist.id === DOWNTOWN_ID ? 0 : 0;
        x = dist.center.x + off;
        y = dist.center.y + off;
      } else {
        if (indexInRing >= capacity) {
          ring += 1;
          indexInRing = 0;
          capacity = 6 * (ring + 1);
        }
        const r = 220 + ring * 220;
        const angBase = (indexInRing / capacity) * Math.PI * 2;
        const jitter = (hash01(n.id + dist.id, ring) - 0.5) * 0.35;
        const ang = angBase + jitter;
        const rr = r + (hash01(n.id + dist.id, ring + 7) - 0.5) * 120;
        x = dist.center.x + Math.cos(ang) * rr;
        y = dist.center.y + Math.sin(ang) * rr;
        indexInRing += 1;
      }

      const kind = inferBuildingKind(n);
      const parcel = kind === "landmark" ? 180 : kind === "skyscraper" ? 130 : kind === "studio" ? 90 : 70;
      const inst: PropertyInstance = {
        id: `${dist.id}:${n.id}`,
        canonicalId: n.id,
        districtId: dist.id,
        x,
        y,
        parcelW: parcel,
        parcelH: parcel,
        kind,
        label: n.label || n.id,
        color: n.color || dist.color,
        node: n,
        isLandmark: n.is_hub && isPrimary,
      };
      addProperty(inst, properties, propertiesById, propertiesByCanonical);
    }
  }

  // 4. Roads.
  const roads: CityRoad[] = [];

  // 4a. Downtown → each district landmark (highway tier).
  const downtown = DISTRICT_BY_ID[DOWNTOWN_ID];
  for (const d of DISTRICTS) {
    if (d.id === DOWNTOWN_ID) continue;
    roads.push({
      id: `hw:${d.id}`,
      from: `downtown`,
      to: d.id,
      fromPoint: downtown.center,
      toPoint: d.center,
      tier: "highway",
    });
  }

  // 4b. Real graph links → main/residential/bridge roads between property
  //     instances. We connect the *primary* property of each endpoint;
  //     if they share a district, that's residential; different districts
  //     become bridges.
  const primaryOf = new Map<string, PropertyInstance>();
  for (const p of properties) {
    // First-seen instance per canonical id becomes its "primary" for road
    // wiring purposes — buckets guarantee primary community is added first.
    if (!primaryOf.has(p.canonicalId)) primaryOf.set(p.canonicalId, p);
  }

  for (const l of graph.links) {
    const a = primaryOf.get(l.source);
    const b = primaryOf.get(l.target);
    if (!a || !b) continue;
    const sameDistrict = a.districtId === b.districtId;
    const tier: RoadTier = sameDistrict
      ? l.relation === "parent" || l.relation === "roster"
        ? "main"
        : "residential"
      : "bridge";
    roads.push({
      id: `rd:${a.id}::${b.id}`,
      from: a.id,
      to: b.id,
      fromPoint: { x: a.x, y: a.y },
      toPoint: { x: b.x, y: b.y },
      tier,
      relation: l.relation,
      weight: l.weight,
    });
  }

  // 4c. Property-instance glue: gold routes between all instances of the
  //     same canonical node. Rendered by the canvas as glowing "same-owner"
  //     routes when that person is selected.
  for (const [canonicalId, insts] of propertiesByCanonical) {
    if (insts.length < 2) continue;
    for (let i = 0; i < insts.length; i++) {
      for (let j = i + 1; j < insts.length; j++) {
        roads.push({
          id: `own:${canonicalId}:${i}-${j}`,
          from: insts[i].id,
          to: insts[j].id,
          fromPoint: { x: insts[i].x, y: insts[i].y },
          toPoint: { x: insts[j].x, y: insts[j].y },
          tier: "bridge",
          relation: "same-owner",
        });
      }
    }
  }

  // 5. Bounds — union of district discs.
  let minX = -1000, minY = -1000, maxX = 1000, maxY = 1000;
  for (const d of DISTRICTS) {
    minX = Math.min(minX, d.center.x - d.radius);
    minY = Math.min(minY, d.center.y - d.radius);
    maxX = Math.max(maxX, d.center.x + d.radius);
    maxY = Math.max(maxY, d.center.y + d.radius);
  }

  return {
    districts: DISTRICTS,
    properties,
    propertiesById,
    propertiesByCanonical,
    roads,
    bounds: { minX, minY, maxX, maxY },
  };
}

function addProperty(
  inst: PropertyInstance,
  properties: PropertyInstance[],
  byId: Map<string, PropertyInstance>,
  byCanonical: Map<string, PropertyInstance[]>,
): void {
  properties.push(inst);
  byId.set(inst.id, inst);
  if (!byCanonical.has(inst.canonicalId)) byCanonical.set(inst.canonicalId, []);
  byCanonical.get(inst.canonicalId)!.push(inst);
}

export { DISTRICTS as CITY_DISTRICTS };