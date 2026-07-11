import { describe, expect, it } from "vitest";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { buildGeoCityModel, pointInPolygon } from "../geoCityModel";
import {
  DOWNTOWN_BUILDINGS,
  GEO_DISTRICTS,
  MRCAP_PERSONAL_POLYGON,
} from "../houstonGeoConfig";

function makeGraph(nodes: GraphNode[], links: { source: string; target: string; relation?: string }[] = []): NormalizedGraph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map<string, Set<string>>();
  for (const n of nodes) neighbors.set(n.id, new Set());
  for (const l of links) {
    neighbors.get(l.source)?.add(l.target);
    neighbors.get(l.target)?.add(l.source);
  }
  return {
    nodes,
    links: links.map((l) => ({ ...l, weight: 1 })),
    neighbors,
    byId,
    communities: [],
    categoryCounts: { code: 0, blog: 0, music: 0, image: 0, capture: 0, other: 0 },
  };
}

describe("buildGeoCityModel", () => {
  it("always emits the downtown skyline in real lon/lat", () => {
    const m = buildGeoCityModel(makeGraph([]));
    for (const b of DOWNTOWN_BUILDINGS) {
      const p = m.propertiesById.get(`dt:${b.id}`);
      expect(p).toBeDefined();
      expect(p!.coord[0]).toBeLessThan(-95);
      expect(p!.coord[1]).toBeGreaterThan(29);
    }
  });

  it("scatters nodes inside their community's district polygon", () => {
    const sh = GEO_DISTRICTS.find((d) => d.id === "swishahouse")!;
    const nodes: GraphNode[] = Array.from({ length: 5 }, (_, i) => ({
      id: `sh_${i}`,
      label: `sh_${i}`,
      category: "music",
      degree: 1,
      community: sh.communityId!,
    } as GraphNode));
    const m = buildGeoCityModel(makeGraph(nodes));
    for (const n of nodes) {
      const p = m.propertiesById.get(`swishahouse:${n.id}`);
      expect(p).toBeDefined();
      const [lon, lat] = p!.coord;
      expect(lon).toBeGreaterThan(sh.polygon[0][0] - 0.05);
      expect(lon).toBeLessThan(sh.polygon[1][0] + 0.05);
      expect(lat).toBeGreaterThan(sh.polygon[0][1] - 0.05);
      expect(lat).toBeLessThan(sh.polygon[2][1] + 0.05);
    }
  });

  it("creates secondary properties + gold same-owner routes", () => {
    const nodes: GraphNode[] = [
      { id: "person", label: "Person", category: "music", degree: 3, community: 208 } as GraphNode,
      { id: "a", label: "a", category: "music", degree: 1, community: 207 } as GraphNode,
      { id: "b", label: "b", category: "music", degree: 1, community: 207 } as GraphNode,
    ];
    const links = [
      { source: "person", target: "a" },
      { source: "person", target: "b" },
    ];
    const m = buildGeoCityModel(makeGraph(nodes, links));
    const insts = m.propertiesByCanonical.get("person") ?? [];
    expect(insts.length).toBe(2);
    const owner = m.roads.filter((r) => r.tier === "sameOwner");
    expect(owner.length).toBeGreaterThan(0);
  });

  it("keeps every Mr. CAP Personal District property inside the real street polygon", () => {
    const mrcap = GEO_DISTRICTS.find((d) => d.id === "mrcap_personal")!;
    const nodes: GraphNode[] = Array.from({ length: 40 }, (_, i) => ({
      id: `mc_${i}`,
      label: `mc_${i}`,
      category: "other",
      degree: 1,
      community: mrcap.communityId!,
      is_hub: i === 0,
    } as GraphNode));
    const m = buildGeoCityModel(makeGraph(nodes));
    const props = m.properties.filter((p) => p.districtId === "mrcap_personal");
    expect(props.length).toBeGreaterThanOrEqual(nodes.length);
    for (const p of props) {
      expect(pointInPolygon(p.coord, MRCAP_PERSONAL_POLYGON)).toBe(true);
    }
  });

  it("MRCAP_PERSONAL_POLYGON is a closed ring reaching every boundary road", () => {
    const ring = MRCAP_PERSONAL_POLYGON;
    // Closed
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // Sufficient detail
    expect(ring.length).toBeGreaterThan(40);
    // North edge must reach Old Spanish Trail — OST ∩ MLK sits at ~29.7088.
    const maxLat = Math.max(...ring.map((p) => p[1]));
    expect(maxLat).toBeGreaterThanOrEqual(29.7087);
    // South edge reaches Griggs
    const minLat = Math.min(...ring.map((p) => p[1]));
    expect(minLat).toBeLessThanOrEqual(29.6981);
    // West edge reaches Calhoun (~-95.346), east reaches MLK (~-95.334)
    const minLon = Math.min(...ring.map((p) => p[0]));
    const maxLon = Math.max(...ring.map((p) => p[0]));
    expect(minLon).toBeLessThanOrEqual(-95.3455);
    expect(maxLon).toBeGreaterThanOrEqual(-95.3345);
    // Representative points just inside each side must be inside the polygon.
    const cx = -95.33937;
    const cy = 29.70335;
    // Centroid always inside
    expect(pointInPolygon([cx, cy], MRCAP_PERSONAL_POLYGON)).toBe(true);
    // Interior probe near the NE (below OST diagonal) — OST runs NE, so
    // near the NE corner high latitudes are inside; at cx (midway west) OST
    // sits around 29.7075, so use 29.7085 near the NE corner longitude.
    expect(pointInPolygon([-95.3372, 29.7085], MRCAP_PERSONAL_POLYGON)).toBe(true);
    // Just above Griggs, near SE corner
    expect(pointInPolygon([-95.3370, 29.6985], MRCAP_PERSONAL_POLYGON)).toBe(true);
    // Just east of Calhoun (mid column)
    expect(pointInPolygon([-95.3445, cy], MRCAP_PERSONAL_POLYGON)).toBe(true);
    // Just west of MLK (mid column) — MLK curves, so pick a safely-inside lon
    expect(pointInPolygon([-95.3355, cy], MRCAP_PERSONAL_POLYGON)).toBe(true);
  });
});