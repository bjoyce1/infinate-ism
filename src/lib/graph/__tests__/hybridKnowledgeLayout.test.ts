import { describe, it, expect } from "vitest";
import {
  planHybridKnowledgeLayout,
  applyHybridSeed,
  HUB_ID,
  directedParentChild,
} from "../hybridKnowledgeLayout";
import { filterGraph } from "../filterGraph";
import type { NormalizedGraph, GraphNode, GraphLink, Category } from "../types";

function build(nodes: GraphNode[], links: GraphLink[]): NormalizedGraph {
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

function baseGraph(): NormalizedGraph {
  const nodes: GraphNode[] = [
    { id: HUB_ID, label: "Infinite ISM", category: "other", degree: 4, community: 200, is_hub: true },
    { id: "A", label: "Branch A", category: "image", degree: 4, community: 201, image: "/a.png" },
    { id: "A1", label: "A1", category: "blog", degree: 2, community: 201 },
    { id: "A2", label: "A2", category: "blog", degree: 2, community: 201 },
    { id: "A1a", label: "A1a", category: "blog", degree: 1, community: 201 },
    { id: "B", label: "Branch B", category: "image", degree: 3, community: 202, image: "/b.png" },
    { id: "B1", label: "B1", category: "music", degree: 2, community: 202 },
    { id: "C", label: "Branch C", category: "image", degree: 2, community: 203, image: "/c.png" },
    { id: "C1", label: "C1", category: "code", degree: 1, community: 203 },
  ];
  const links: GraphLink[] = [
    { source: HUB_ID, target: "A" },
    { source: HUB_ID, target: "B" },
    { source: HUB_ID, target: "C" },
    // Direction: source-is-parent
    { source: "A", target: "A1", relation: "contains" },
    { source: "A", target: "A2", relation: "has_child" },
    // Direction: target-is-parent
    { source: "A1a", target: "A1", relation: "child_of" },
    { source: "B1", target: "B", relation: "member_of" },
    { source: "C1", target: "C", relation: "part_of" },
    // Cross-links — must NOT drive family assignment
    { source: "A1", target: "B1" },
    { source: "A2", target: "C1" },
  ];
  return build(nodes, links);
}

describe("directedParentChild", () => {
  it("recognises SOURCE_IS_PARENT relations", () => {
    expect(directedParentChild({ source: "P", target: "K", relation: "contains" })).toEqual({ parent: "P", child: "K" });
    expect(directedParentChild({ source: "P", target: "K", relation: "has_child" })).toEqual({ parent: "P", child: "K" });
    expect(directedParentChild({ source: "P", target: "K", relation: "owns" })).toEqual({ parent: "P", child: "K" });
  });
  it("recognises TARGET_IS_PARENT relations", () => {
    expect(directedParentChild({ source: "K", target: "P", relation: "child_of" })).toEqual({ parent: "P", child: "K" });
    expect(directedParentChild({ source: "K", target: "P", relation: "belongs_to" })).toEqual({ parent: "P", child: "K" });
    expect(directedParentChild({ source: "K", target: "P", relation: "spawned_from" })).toEqual({ parent: "P", child: "K" });
  });
  it("returns null for non-structural relations", () => {
    expect(directedParentChild({ source: "A", target: "B", relation: "linked" })).toBeNull();
    expect(directedParentChild({ source: "A", target: "B" })).toBeNull();
  });
});

describe("planHybridKnowledgeLayout — parenting", () => {
  const g = baseGraph();
  const plan = planHybridKnowledgeLayout(g, 42);

  it("assigns exactly one primary parent to every non-hub node", () => {
    for (const n of g.nodes) {
      if (n.id === HUB_ID) continue;
      expect(plan.parentOf.has(n.id)).toBe(true);
      expect(plan.parentOf.get(n.id)).not.toBe(n.id);
      expect(plan.parentOf.get(n.id)).not.toBeNull();
    }
  });

  it("resolves every node back to HUB with no cycles", () => {
    for (const n of g.nodes) {
      if (n.id === HUB_ID) continue;
      const seen = new Set<string>([n.id]);
      let cur = plan.parentOf.get(n.id) ?? HUB_ID;
      let steps = 0;
      while (cur !== HUB_ID && steps++ < 100) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        cur = plan.parentOf.get(cur) ?? HUB_ID;
      }
      expect(cur).toBe(HUB_ID);
    }
  });

  it("respects direction for source-is-parent relations (contains, has_child)", () => {
    expect(plan.parentOf.get("A1")).toBe("A");
    expect(plan.parentOf.get("A2")).toBe("A");
  });

  it("respects direction for target-is-parent relations (child_of, member_of, part_of)", () => {
    expect(plan.parentOf.get("A1a")).toBe("A1");
    expect(plan.parentOf.get("B1")).toBe("B");
    expect(plan.parentOf.get("C1")).toBe("C");
  });

  it("keeps top-level branches attached to HUB despite competing cross-links", () => {
    expect(plan.parentOf.get("A")).toBe(HUB_ID);
    expect(plan.parentOf.get("B")).toBe(HUB_ID);
    expect(plan.parentOf.get("C")).toBe(HUB_ID);
  });
});

describe("planHybridKnowledgeLayout — geometry", () => {
  const g = baseGraph();
  const plan = planHybridKnowledgeLayout(g, 42);

  it("major branch roots are clearly separated in world space", () => {
    const a = plan.targets.get("A")!;
    const b = plan.targets.get("B")!;
    const c = plan.targets.get("C")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(300);
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(300);
    expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeGreaterThan(300);
  });

  it("siblings stay closer to each other than to unrelated branches", () => {
    const a1 = plan.targets.get("A1")!;
    const a2 = plan.targets.get("A2")!;
    const b1 = plan.targets.get("B1")!;
    const siblingDist = Math.hypot(a1.x - a2.x, a1.y - a2.y);
    const crossDist = Math.hypot(a1.x - b1.x, a1.y - b1.y);
    expect(siblingDist).toBeLessThan(crossDist);
  });

  it("grandchildren stay inside their direct parent's family region", () => {
    const a1 = plan.targets.get("A1")!;
    const a1a = plan.targets.get("A1a")!;
    const r = plan.radius.get("A1")!;
    expect(Math.hypot(a1a.x - a1.x, a1a.y - a1.y)).toBeLessThan(r * 2);
    // Grandchild must still sit inside A's overall branch region.
    const a = plan.targets.get("A")!;
    const rA = plan.radius.get("A")!;
    expect(Math.hypot(a1a.x - a.x, a1a.y - a.y)).toBeLessThan(rA * 4);
  });

  it("is deterministic for identical (graph, seed)", () => {
    const p2 = planHybridKnowledgeLayout(g, 42);
    for (const n of g.nodes) {
      expect(plan.targets.get(n.id)).toEqual(p2.targets.get(n.id));
      expect(plan.parentOf.get(n.id)).toBe(p2.parentOf.get(n.id));
    }
  });
});

describe("planHybridKnowledgeLayout — helpers", () => {
  const g = baseGraph();
  const plan = planHybridKnowledgeLayout(g, 42);

  it("branchOf returns the correct top-level branch for every descendant", () => {
    expect(plan.branchOf.get("A")).toBe("A");
    expect(plan.branchOf.get("A1")).toBe("A");
    expect(plan.branchOf.get("A1a")).toBe("A");
    expect(plan.branchOf.get("B1")).toBe("B");
    expect(plan.branchOf.get("C1")).toBe("C");
  });

  it("descendantsOf reports full subtree membership (used for parent-drag)", () => {
    const desc = plan.descendantsOf("A");
    expect(desc.has("A1")).toBe(true);
    expect(desc.has("A2")).toBe(true);
    expect(desc.has("A1a")).toBe(true);
    expect(desc.has("A")).toBe(false);
    expect(desc.has("B")).toBe(false);
  });

  it("ancestorsOf walks up to HUB inclusive", () => {
    const anc = plan.ancestorsOf("A1a");
    expect(anc).toEqual(["A1", "A", HUB_ID]);
  });

  it("classifies structural vs cross-family links", () => {
    expect(plan.isStructural("A", "A1")).toBe(true);
    expect(plan.isStructural("A1", "A1a")).toBe(true);
    expect(plan.isStructural("B1", "B")).toBe(true);
    expect(plan.isStructural("A1", "B1")).toBe(false);
  });
});

describe("planHybridKnowledgeLayout — cross-link isolation & filtering", () => {
  it("cross-links do not change family assignment when added or removed", () => {
    const g = baseGraph();
    const withCross = planHybridKnowledgeLayout(g, 42);
    // Rebuild without the two cross-links.
    const strippedLinks = g.links.filter(
      (l) => !((l.source === "A1" && l.target === "B1") || (l.source === "A2" && l.target === "C1")),
    );
    const g2 = build(g.nodes, strippedLinks);
    const noCross = planHybridKnowledgeLayout(g2, 42);
    for (const n of g.nodes) {
      expect(noCross.parentOf.get(n.id)).toBe(withCross.parentOf.get(n.id));
    }
  });

  it("filtered subsets receive the same base coordinates via applyHybridSeed", () => {
    const g = baseGraph();
    const plan = planHybridKnowledgeLayout(g, 42);
    const filtered = filterGraph(g, {
      activeCategories: new Set(),
      hideCode: false,
      includeTsFiles: true,
      activeCommunity: null,
      focusMode: false,
      selectedId: null,
    });
    applyHybridSeed(filtered.nodes, plan);
    for (const n of filtered.nodes) {
      const t = plan.targets.get(n.id)!;
      expect((n as { x?: number }).x).toBe(t.x);
      expect((n as { y?: number }).y).toBe(t.y);
    }
    // Original graph nodes untouched.
    for (const raw of g.nodes) expect((raw as { x?: number }).x).toBeUndefined();
  });
});
