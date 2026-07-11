// Pure logic: normalized graph → geographic city model in lon/lat.
//
// Preserves the property-instance concept: one canonical node may appear
// in multiple districts (primary + secondary when the node has >=2
// neighbours in another district), so "same-owner" gold routes can span
// the real map.

import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import {
  DISTRICT_BY_COMMUNITY,
  DISTRICT_BY_ID,
  DOWNTOWN_BUILDINGS,
  DOWNTOWN_ID,
  GEO_DISTRICTS,
  type DistrictId,
  type GeoDistrict,
  type LngLat,
} from "./houstonGeoConfig";

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
  id: string;
  canonicalId: string;
  districtId: DistrictId;
  coord: LngLat;
  kind: BuildingKind;
  label: string;
  color: string;
  node: GraphNode;
  isLandmark?: boolean;
};

export type RoadTier = "main" | "residential" | "bridge" | "sameOwner";

export type CityRoad = {
  id: string;
  from: string;
  to: string;
  fromCoord: LngLat;
  toCoord: LngLat;
  tier: RoadTier;
  relation?: string;
};

export type GeoCityModel = {
  districts: GeoDistrict[];
  properties: PropertyInstance[];
  propertiesById: Map<string, PropertyInstance>;
  propertiesByCanonical: Map<string, PropertyInstance[]>;
  roads: CityRoad[];
};

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

function inferKind(n: GraphNode): BuildingKind {
  const label = (n.label || "").toLowerCase();
  const type = (n.file_type || "").toLowerCase();
  if (n.is_hub) return "landmark";
  if (type === "artist" || label.includes("dj ") || label.includes("mc ")) return "studio";
  if (type === "album") return "record_store";
  if (type === "song") return "venue";
  if (n.category === "music") return "studio";
  if (n.category === "image") return "commercial";
  if (n.category === "blog" || n.category === "code") return "office";
  if (label.includes("film") || label.includes("cinema")) return "cinema";
  if (label.includes("book") || label.includes("library")) return "library";
  if (label.includes("school") || label.includes("yates")) return "school";
  if (label.includes("crypto") || label.includes("coin")) return "finance";
  if (label.includes("company") || label.includes("hq")) return "office";
  return "house";
}

// Deterministic scatter inside a district's bounding rectangle.
function scatterCoord(dist: GeoDistrict, seed: string, ring: number, indexInRing: number, capacity: number): LngLat {
  const [cx, cy] = dist.center;
  const halfW = Math.abs(dist.polygon[1][0] - dist.polygon[0][0]) / 2;
  const halfH = Math.abs(dist.polygon[2][1] - dist.polygon[0][1]) / 2;
  // Radial-ish placement so hubs stay near centre.
  const r = 0.15 + ring * 0.28;
  const angBase = (indexInRing / Math.max(1, capacity)) * Math.PI * 2;
  const jitter = (hash01(seed + dist.id, ring) - 0.5) * 0.5;
  const ang = angBase + jitter;
  const rr = r + (hash01(seed + dist.id, ring + 7) - 0.5) * 0.20;
  return [
    cx + Math.cos(ang) * rr * halfW,
    cy + Math.sin(ang) * rr * halfH,
  ];
}

function addProperty(
  inst: PropertyInstance,
  out: PropertyInstance[],
  byId: Map<string, PropertyInstance>,
  byCanonical: Map<string, PropertyInstance[]>,
) {
  out.push(inst);
  byId.set(inst.id, inst);
  if (!byCanonical.has(inst.canonicalId)) byCanonical.set(inst.canonicalId, []);
  byCanonical.get(inst.canonicalId)!.push(inst);
}

export function buildGeoCityModel(graph: NormalizedGraph): GeoCityModel {
  const properties: PropertyInstance[] = [];
  const propertiesById = new Map<string, PropertyInstance>();
  const propertiesByCanonical = new Map<string, PropertyInstance[]>();

  // Bucket by primary district (community).
  const buckets = new Map<DistrictId, GraphNode[]>();
  for (const d of GEO_DISTRICTS) buckets.set(d.id, []);

  for (const n of graph.nodes) {
    const dist = n.community != null ? DISTRICT_BY_COMMUNITY.get(n.community) : null;
    if (!dist) continue;
    buckets.get(dist.id)!.push(n);
  }

  // Secondary properties: >=2 neighbours in another district.
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
      if (count >= 2) buckets.get(did)!.push(n);
    }
  }

  // Emit downtown skyline (real coords) first.
  for (const b of DOWNTOWN_BUILDINGS) {
    addProperty(
      {
        id: `dt:${b.id}`,
        canonicalId: b.id,
        districtId: DOWNTOWN_ID,
        coord: b.coord,
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
      },
      properties,
      propertiesById,
      propertiesByCanonical,
    );
  }

  // Scatter graph nodes into their districts.
  for (const dist of GEO_DISTRICTS) {
    const nodes = [...(buckets.get(dist.id) ?? [])];
    nodes.sort((a, b) => {
      const ah = a.is_hub ? 1 : 0;
      const bh = b.is_hub ? 1 : 0;
      if (bh !== ah) return bh - ah;
      if ((b.degree ?? 0) !== (a.degree ?? 0)) return (b.degree ?? 0) - (a.degree ?? 0);
      return a.id < b.id ? -1 : 1;
    });

    let ring = 0;
    let indexInRing = 0;
    let capacity = 6;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const isPrimary =
        n.community != null && DISTRICT_BY_COMMUNITY.get(n.community)?.id === dist.id;
      let coord: LngLat;
      if (isPrimary && n.is_hub && i < 1) {
        coord = [dist.center[0], dist.center[1]];
      } else {
        if (indexInRing >= capacity) {
          ring += 1;
          indexInRing = 0;
          capacity = 6 * (ring + 1);
        }
        coord = scatterCoord(dist, n.id, ring, indexInRing, capacity);
        indexInRing += 1;
      }
      addProperty(
        {
          id: `${dist.id}:${n.id}`,
          canonicalId: n.id,
          districtId: dist.id,
          coord,
          kind: inferKind(n),
          label: n.label || n.id,
          color: n.color || dist.color,
          node: n,
          isLandmark: n.is_hub && isPrimary,
        },
        properties,
        propertiesById,
        propertiesByCanonical,
      );
    }
  }

  // Roads.
  const roads: CityRoad[] = [];
  const primaryOf = new Map<string, PropertyInstance>();
  for (const p of properties) {
    if (!primaryOf.has(p.canonicalId)) primaryOf.set(p.canonicalId, p);
  }
  for (const l of graph.links) {
    const a = primaryOf.get(l.source);
    const b = primaryOf.get(l.target);
    if (!a || !b || a.id === b.id) continue;
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
      fromCoord: a.coord,
      toCoord: b.coord,
      tier,
      relation: l.relation,
    });
  }
  // Same-owner gold routes.
  for (const [canonicalId, insts] of propertiesByCanonical) {
    if (insts.length < 2) continue;
    for (let i = 0; i < insts.length; i++) {
      for (let j = i + 1; j < insts.length; j++) {
        roads.push({
          id: `own:${canonicalId}:${i}-${j}`,
          from: insts[i].id,
          to: insts[j].id,
          fromCoord: insts[i].coord,
          toCoord: insts[j].coord,
          tier: "sameOwner",
          relation: "same-owner",
        });
      }
    }
  }

  return { districts: GEO_DISTRICTS, properties, propertiesById, propertiesByCanonical, roads };
}

export { DISTRICT_BY_ID };