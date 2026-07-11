import { describe, it, expect } from "vitest";
import { planNeighborhoods, applyNeighborhoodSeed, HUB_ID } from "../neighborhoodLayout";
import { filterGraph } from "../filterGraph";
import type { NormalizedGraph, GraphNode, GraphLink, Category } from "../types";

function makeGraph(): NormalizedGraph {
  const nodes: GraphNode[] = [
    { id: HUB_ID, label: "hub", category: "other", degree: 4, community: 200, is_hub: true },
    // Family A
    { id: "A", label: "A", category: "image", degree: 4, community: 201, image: "/a.png" },
    { id: "A1", label: "A1", category: "blog", degree: 2, community: 201 },
    { id: "A2", label: "A2", category: "blog", degree: 2, community: 201 },
    { id: "A1a", label: "A1a", category: "blog", degree: 1, community: 201 },
    // Family B
    { id: "B", label: "B", category: "image", degree: 3, community: 202, image: "/b.png" },
    { id: "B1", label: "B1", category: "music", degree: 2, community: 202 },
    { id: "B2", label: "B2", category: "music", degree: 2, community: 202 },
    // Family C
    { id: "C", label: "C", category: "image", degree: 2, community: 203, image: "/c.png" },
    { id: "C1", label: "C1", category: "code", degree: 1, community: 203 },
  ];
  const links: GraphLink[] = [
    { source: HUB_ID, target: "A" },
    { source: HUB_ID, target: "B" },
    { source: HUB_ID, target: "C" },
    { source: "A", target: "A1", relation: "contains" },
    { source: "A", target: "A2", relation: "contains" },
    { source: "A1", target: "A1a", relation: "child_of" },
    { source: "B", target: "B1" },
    { source: "B", target: "B2" },
    { source: "C", target: "C1" },
    // Cross-links between families that must NOT dictate parenting
    { source: "A1", target: "B1" },
    { source: "A2", target: "C1" },
  ];
  const neighbors = new Map<string, Set<string>>();
  for (const l of links) {
    if (!neighbors.has(l.source)) neighbors.set(l.source, new Set());
    if (!neighbors.has(l.target)) neighbors.set(l.target, new Set());
    neighbors.get(l.source)!.add(l.target);
    neighbors.get(l.target)!.add(l.source);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return { nodes, links, neighbors, byId, communities: [], categoryCounts: {} as Record<Category, number> };
}

describe("planNeighborhoods", () => {
  const g = makeGraph();

  it("assigns exactly one primary parent to every non-hub node", () => {
    const plan = planNeighborhoods(g, 42);
    for (const n of g.nodes) {
      if (n.id === HUB_ID) continue;
      expect(plan.parentOf.has(n.id)).toBe(true);
      expect(plan.parentOf.get(n.id)).not.toBe(n.id);
    }
  });

  it("produces no parent cycles — every node terminates at HUB", () => {
    const plan = planNeighborhoods(g, 42);
    for (const n of g.nodes) {
      if (n.id === HUB_ID) continue;
      const seen = new Set<string>();
      let cur = plan.parentOf.get(n.id) ?? HUB_ID;
      while (cur !== HUB_ID) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        cur = plan.parentOf.get(cur) ?? HUB_ID;
      }
    }
  });

  it("prefers structural relations over cross-links for parenting", () => {
    const plan = planNeighborhoods(g, 42);
    expect(plan.parentOf.get("A1")).toBe("A");
    expect(plan.parentOf.get("A2")).toBe("A");
    expect(plan.parentOf.get("A1a")).toBe("A1");
    expect(plan.parentOf.get("B1")).toBe("B");
    expect(plan.parentOf.get("B2")).toBe("B");
    expect(plan.parentOf.get("C1")).toBe("C");
  });

  it("places siblings of the same parent inside the parent's neighborhood", () => {
    const plan = planNeighborhoods(g, 42);
    const parent = plan.targets.get("A")!;
    const r = plan.radius.get("A")!;
    for (const kid of ["A1", "A2"]) {
      const t = plan.targets.get(kid)!;
      const d = Math.hypot(t.x - parent.x, t.y - parent.y);
      expect(d).toBeLessThan(r * 2);
    }
  });

  it("separates distinct top-level neighborhoods", () => {
    const plan = planNeighborhoods(g, 42);
    const a = plan.targets.get("A")!;
    const b = plan.targets.get("B")!;
    const c = plan.targets.get("C")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(100);
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(100);
  });

  it("is deterministic for identical (graph, seed) input", () => {
    const p1 = planNeighborhoods(g, 42);
    const p2 = planNeighborhoods(g, 42);
    for (const id of g.nodes.map((n) => n.id)) {
      expect(p1.targets.get(id)).toEqual(p2.targets.get(id));
      expect(p1.parentOf.get(id)).toBe(p2.parentOf.get(id));
    }
  });

  it("classifies primary parent-child edges and explicit structural relations as structural", () => {
    const plan = planNeighborhoods(g, 42);
    expect(plan.isStructural("A", "A1")).toBe(true);
    expect(plan.isStructural("A1", "A1a")).toBe(true);
    expect(plan.isStructural("A1", "B1")).toBe(false); // cross-link
  });

  it("applyNeighborhoodSeed writes onto the actual cloned filtered node objects", () => {
    const plan = planNeighborhoods(g, 42);
    const filtered = filterGraph(g, {
      activeCategories: new Set(),
      hideCode: false,
      includeTsFiles: true,
      activeCommunity: null,
      focusMode: false,
      selectedId: null,
    });
    applyNeighborhoodSeed(filtered.nodes, plan);
    for (const n of filtered.nodes) {
      const t = plan.targets.get(n.id)!;
      expect(n.x).toBe(t.x);
      expect(n.y).toBe(t.y);
    }
    // Original graph.nodes must NOT have been mutated by the planner.
    for (const raw of g.nodes) {
      expect((raw as { x?: number }).x).toBeUndefined();
    }
  });

  it("preserves every original link when combined with filterGraph pass-through", () => {
    const filtered = filterGraph(g, {
      activeCategories: new Set(),
      hideCode: false,
      includeTsFiles: true,
      activeCommunity: null,
      focusMode: false,
      selectedId: null,
    });
    expect(filtered.links.length).toBe(g.links.length);
  });
});
