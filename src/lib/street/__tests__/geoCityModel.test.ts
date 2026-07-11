import { describe, expect, it } from "vitest";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { buildGeoCityModel } from "../geoCityModel";
import { DOWNTOWN_BUILDINGS, GEO_DISTRICTS } from "../houstonGeoConfig";

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
    categoryCounts: {},
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
});