import { describe, expect, it } from "vitest";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { buildCityModel } from "../cityLayout";
import { DISTRICTS, DOWNTOWN_BUILDINGS } from "../houstonCityConfig";

function mkNode(id: string, community: number, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    label: id,
    category: "other",
    degree: 0,
    community,
    ...extra,
  } as GraphNode;
}

function mkGraph(nodes: GraphNode[], links: Array<{ source: string; target: string; relation?: string }> = []): NormalizedGraph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map<string, Set<string>>();
  for (const n of nodes) neighbors.set(n.id, new Set());
  for (const l of links) {
    if (!byId.has(l.source) || !byId.has(l.target)) continue;
    neighbors.get(l.source)!.add(l.target);
    neighbors.get(l.target)!.add(l.source);
  }
  return {
    nodes,
    links: links.map((l) => ({ ...l })),
    byId,
    neighbors,
    communities: [],
    categoryCounts: { code: 0, blog: 0, music: 0, image: 0, capture: 0, other: nodes.length },
  };
}

describe("cityLayout", () => {
  it("always renders the six downtown skyline buildings even without matching graph nodes", () => {
    const model = buildCityModel(mkGraph([]));
    const dt = model.properties.filter((p) => p.districtId === "downtown");
    expect(dt.length).toBeGreaterThanOrEqual(DOWNTOWN_BUILDINGS.length);
    for (const b of DOWNTOWN_BUILDINGS) {
      expect(dt.some((p) => p.label === b.label)).toBe(true);
    }
  });

  it("assigns nodes to their community's district", () => {
    // SPC = 207, SUC = 208
    const graph = mkGraph([mkNode("spc_a", 207), mkNode("suc_a", 208)]);
    const model = buildCityModel(graph);
    const spc = model.properties.find((p) => p.canonicalId === "spc_a")!;
    const suc = model.properties.find((p) => p.canonicalId === "suc_a")!;
    expect(spc.districtId).toBe("spc");
    expect(suc.districtId).toBe("suc");
  });

  it("creates a secondary property instance when a node has ≥2 neighbors in another district", () => {
    // A lives in SPC (207) but has 2 SUC (208) neighbors.
    const graph = mkGraph(
      [
        mkNode("a", 207),
        mkNode("suc1", 208),
        mkNode("suc2", 208),
      ],
      [
        { source: "a", target: "suc1" },
        { source: "a", target: "suc2" },
      ],
    );
    const model = buildCityModel(graph);
    const insts = model.propertiesByCanonical.get("a") ?? [];
    expect(insts.length).toBe(2);
    const districts = insts.map((i) => i.districtId).sort();
    expect(districts).toEqual(["spc", "suc"]);
  });

  it("emits a same-owner road connecting duplicate properties", () => {
    const graph = mkGraph(
      [mkNode("a", 207), mkNode("s1", 208), mkNode("s2", 208)],
      [
        { source: "a", target: "s1" },
        { source: "a", target: "s2" },
      ],
    );
    const model = buildCityModel(graph);
    const owner = model.roads.filter((r) => r.relation === "same-owner");
    expect(owner.length).toBe(1);
  });

  it("classifies roads: same-district → residential, cross-district → bridge, downtown links → highway", () => {
    const graph = mkGraph(
      [mkNode("s1", 208), mkNode("s2", 208), mkNode("spc", 207)],
      [
        { source: "s1", target: "s2" }, // same district → residential
        { source: "s1", target: "spc" }, // cross district → bridge
      ],
    );
    const model = buildCityModel(graph);
    const tiers = model.roads.map((r) => r.tier).sort();
    // 5 highway spokes downtown → 5 non-downtown districts + residential + bridge.
    expect(tiers.filter((t) => t === "highway").length).toBe(DISTRICTS.length - 1);
    expect(tiers).toContain("residential");
    expect(tiers).toContain("bridge");
  });

  it("layout is deterministic across runs", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => mkNode(`n${i}`, 207));
    const a = buildCityModel(mkGraph(nodes));
    const b = buildCityModel(mkGraph(nodes));
    for (const p of a.properties) {
      const q = b.propertiesById.get(p.id)!;
      expect(q).toBeDefined();
      expect(q.x).toBeCloseTo(p.x, 6);
      expect(q.y).toBeCloseTo(p.y, 6);
    }
  });

  it("propertiesByCanonical maps every canonical id to at least one instance", () => {
    const graph = mkGraph([mkNode("x", 207), mkNode("y", 208)]);
    const model = buildCityModel(graph);
    expect(model.propertiesByCanonical.get("x")!.length).toBeGreaterThanOrEqual(1);
    expect(model.propertiesByCanonical.get("y")!.length).toBeGreaterThanOrEqual(1);
  });
});