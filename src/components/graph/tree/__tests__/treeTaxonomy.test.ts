import { describe, expect, it } from "vitest";
import { ancestorsOf, buildTaxonomy, classifyNode, leafIdForGraphNode } from "../treeTaxonomy";
import { DEPARTMENTS, ZONES } from "../treeTypes";
import { layoutTree, pagesToReveal, visibleCount, type DiscloseState } from "../treeLayout";
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

function emptyDisclose(): DiscloseState {
  return { pages: new Map(), expanded: new Set() };
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

  it("keeps every graph node as an addressable leaf (no data slicing)", () => {
    const nodes = Array.from({ length: 60 }, (_, i) => ({
      id: `n${i}`, label: `File${i}.tsx`, category: "code" as const, community: i % 4,
    }));
    const t = buildTaxonomy(makeGraph(nodes));
    for (const n of nodes) {
      const id = leafIdForGraphNode(t, n.id);
      expect(id).not.toBeNull();
      expect(t.index.has(id!)).toBe(true);
    }
  });

  it("computes ancestor chain root→leaf", () => {
    const t = buildTaxonomy(makeGraph([{ id: "n1", label: "x.tsx", category: "code" }]));
    const leafId = leafIdForGraphNode(t, "n1")!;
    const chain = ancestorsOf(t, leafId);
    expect(chain[0]).toBe(t.root.id);
    expect(chain[chain.length - 1]).toBe(leafId);
  });
});

describe("layout / disclosure", () => {
  const bigGraph = () => makeGraph(
    Array.from({ length: 200 }, (_, i) => ({
      id: `n${i}`, label: `File${i}.tsx`, category: "code" as const, community: i % 8,
    })),
  );

  it("progressive reveal eventually exposes every child", () => {
    const g = bigGraph();
    const t = buildTaxonomy(g);
    // Pick the largest subhub and simulate paging until fully revealed.
    const dept = t.root.children!.find((d) => d.dept === "PRODUCT")!;
    const comm = dept.children![0];
    const sub = comm.children![0];
    const total = sub.children!.length;
    let pages = 1;
    while (true) {
      const d: DiscloseState = { pages: new Map([[sub.id, pages]]), expanded: new Set([sub.id, comm.id, dept.id]) };
      if (visibleCount(sub, d, "standard") >= total) break;
      pages++;
      if (pages > 200) throw new Error("did not converge");
    }
    expect(pages).toBeGreaterThan(0);
  });

  it("pagesToReveal expands enough pages to make a deep leaf visible", () => {
    const g = bigGraph();
    const t = buildTaxonomy(g);
    // Find a leaf that is past the first page of both community and subhub.
    const dept = t.root.children!.find((d) => d.dept === "PRODUCT")!;
    const comm = dept.children![0];
    const sub = comm.children![Math.min(1, comm.children!.length - 1)];
    const leaf = sub.children![Math.min(sub.children!.length - 1, 15)];
    const need = pagesToReveal(t, leaf.id);
    // Force reveal via the returned page counts.
    const disclose: DiscloseState = {
      pages: new Map([...need]),
      expanded: new Set(need.keys()),
    };
    const laid = layoutTree({ taxonomy: t, disclose, density: "standard" });
    expect(laid.byId.has(leaf.id)).toBe(true);
  });

  it("layout is deterministic for identical inputs", () => {
    const g = bigGraph();
    const t = buildTaxonomy(g);
    const d = emptyDisclose();
    const a = layoutTree({ taxonomy: t, disclose: d, density: "standard" });
    const b = layoutTree({ taxonomy: t, disclose: d, density: "standard" });
    expect(a.laid.length).toBe(b.laid.length);
    for (let i = 0; i < a.laid.length; i++) {
      expect(a.laid[i].data.id).toBe(b.laid[i].data.id);
      expect(a.laid[i].x).toBeCloseTo(b.laid[i].x, 5);
      expect(a.laid[i].y).toBeCloseTo(b.laid[i].y, 5);
    }
  });

  it("all laid-out ids are unique", () => {
    const g = bigGraph();
    const t = buildTaxonomy(g);
    const laid = layoutTree({ taxonomy: t, disclose: emptyDisclose(), density: "expanded" });
    const ids = laid.laid.map((l) => l.data.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses fixed department anchor zones", () => {
    const g = bigGraph();
    const t = buildTaxonomy(g);
    const laid = layoutTree({ taxonomy: t, disclose: emptyDisclose(), density: "standard" });
    for (const spec of DEPARTMENTS) {
      const deptLaid = laid.byId.get(`dept:${spec.key}`)!;
      expect(deptLaid.x).toBeCloseTo(ZONES[spec.key].anchor.x, 5);
      expect(deptLaid.y).toBeCloseTo(ZONES[spec.key].anchor.y, 5);
    }
  });
});
});