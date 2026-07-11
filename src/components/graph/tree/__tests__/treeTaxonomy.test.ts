import { describe, expect, it } from "vitest";
import { buildTaxonomy, classifyNode } from "../treeTaxonomy";
import { DEPARTMENTS } from "../treeTypes";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";

function makeGraph(nodes: Partial<GraphNode>[]): NormalizedGraph {
  const full: GraphNode[] = nodes.map((n, i) => ({
    id: n.id ?? `n${i}`,
    label: n.label ?? `Node ${i}`,
    category: n.category ?? "other",
    degree: n.degree ?? 0,
    community: n.community ?? 0,
    ...n,
  })) as GraphNode[];
  const byId = new Map(full.map((n) => [n.id, n]));
  const neighbors = new Map<string, Set<string>>();
  full.forEach((n) => neighbors.set(n.id, new Set()));
  const commMap = new Map<number, number>();
  for (const n of full) commMap.set(n.community!, (commMap.get(n.community!) ?? 0) + 1);
  const communities = [...commMap.entries()].map(([id, count]) => ({ id, count, name: `C${id}` }));
  return {
    nodes: full, links: [], neighbors, byId, communities,
    categoryCounts: { code: 0, blog: 0, music: 0, image: 0, capture: 0, other: 0 },
  };
}

describe("classifyNode", () => {
  it("routes code files into PRODUCT", () => {
    expect(classifyNode({ id: "a", label: "app.tsx", category: "code", degree: 0 } as GraphNode)).toBe("PRODUCT");
  });
  it("routes music into CONTENT", () => {
    expect(classifyNode({ id: "a", label: "song", category: "music", degree: 0, file_type: "music" } as GraphNode)).toBe("CONTENT");
  });
  it("routes screwed up click into COMMUNITY", () => {
    expect(classifyNode({ id: "a", label: "Screwed Up Click", category: "other", degree: 0 } as GraphNode)).toBe("COMMUNITY");
  });
  it("routes yates into PERSONAL", () => {
    expect(classifyNode({ id: "a", label: "Yates HS Class of 1992", category: "other", degree: 0 } as GraphNode)).toBe("PERSONAL");
  });
});

describe("buildTaxonomy", () => {
  it("assigns every node to exactly one branch", () => {
    const g = makeGraph([
      { id: "1", label: "app.tsx", category: "code" },
      { id: "2", label: "song", category: "music", file_type: "music" },
      { id: "3", label: "Screwed Up Click", category: "other" },
      { id: "4", label: "Yates HS", category: "other" },
      { id: "5", label: "Mortuary LLC", category: "other" },
    ]);
    const t = buildTaxonomy(g);
    expect(t.assignments.size).toBe(g.nodes.length);
    const total = Object.values(t.totalByDept).reduce((a, b) => a + b, 0);
    expect(total).toBe(g.nodes.length);
  });

  it("produces unique node ids across the tree", () => {
    const g = makeGraph(Array.from({ length: 25 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}.tsx`, category: "code", community: i % 3 })));
    const t = buildTaxonomy(g);
    const ids = new Set<string>();
    const walk = (d: typeof t.root) => {
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
      d.children?.forEach(walk);
    };
    walk(t.root);
  });

  it("is deterministic across builds", () => {
    const g = makeGraph([
      { id: "1", label: "app.tsx", category: "code" },
      { id: "2", label: "song", category: "music", file_type: "music" },
    ]);
    const a = buildTaxonomy(g);
    const b = buildTaxonomy(g);
    expect(JSON.stringify(a.root)).toBe(JSON.stringify(b.root));
  });

  it("emits the five departments in canonical order", () => {
    const g = makeGraph([{ id: "1", label: "app.tsx", category: "code" }]);
    const t = buildTaxonomy(g);
    expect(t.root.children?.map((c) => c.dept)).toEqual(DEPARTMENTS.map((d) => d.key));
  });
});