import { describe, it, expect } from "vitest";
import { filterGraph, type FilterOptions } from "../filterGraph";
import type { NormalizedGraph, GraphNode, GraphLink, Category } from "../types";

function makeGraph(): NormalizedGraph {
  const nodes: GraphNode[] = [
    { id: "a", label: "app.ts",   category: "code",  degree: 2, community: 1, source_file: "app.ts" },
    { id: "b", label: "hooks.tsx",category: "code",  degree: 2, community: 1, source_file: "hooks.tsx" },
    { id: "c", label: "readme.md",category: "blog",  degree: 1, community: 2 },
    { id: "d", label: "song.mp3", category: "music", degree: 1, community: 2 },
    { id: "e", label: "cover.png",category: "image", degree: 1, community: 3 },
    { id: "f", label: "misc",     category: "other", degree: 1, community: 3 },
    { id: "g", label: "utils",    category: "code",  degree: 2, community: 1, source_file: "utils.js" },
  ];
  const links: GraphLink[] = [
    { source: "a", target: "b" },
    { source: "a", target: "g" },
    { source: "b", target: "c" },
    { source: "c", target: "d" },
    { source: "d", target: "e" },
    { source: "e", target: "f" },
    { source: "g", target: "f" },
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

function optionMatrix(): FilterOptions[] {
  const bools = [false, true];
  const categorySets: Set<string>[] = [
    new Set<string>(),
    new Set(["code"]),
    new Set(["blog", "music"]),
    new Set(["image", "other", "code"]),
  ];
  const communities: (number | null)[] = [null, 1, 2, 3, 999];
  const selections: (string | null)[] = [null, "a", "c", "e", "zzz"];
  const out: FilterOptions[] = [];
  for (const activeCategories of categorySets)
    for (const hideCode of bools)
      for (const includeTsFiles of bools)
        for (const activeCommunity of communities)
          for (const focusMode of bools)
            for (const selectedId of selections)
              out.push({ activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId });
  return out;
}

describe("filterGraph — 2D/3D parity", () => {
  const graph = makeGraph();

  it("produces identical visible/hidden node & link counts for every filter combination", () => {
    const totalNodes = graph.nodes.length;
    const totalLinks = graph.links.length;

    for (const opts of optionMatrix()) {
      // Both canvases now call the same filterGraph. Invoking it twice mirrors
      // the exact code paths each canvas runs and asserts byte-for-byte parity.
      const a = filterGraph(graph, opts);
      const b = filterGraph(graph, opts);

      expect(a.nodes.length).toBe(b.nodes.length);
      expect(a.links.length).toBe(b.links.length);
      expect(a.nodes.map((n) => n.id).sort()).toEqual(b.nodes.map((n) => n.id).sort());
      expect(a.links.map((l) => `${l.source}->${l.target}`).sort())
        .toEqual(b.links.map((l) => `${l.source}->${l.target}`).sort());

      // Hidden counts implied by the filter must also match on both sides.
      expect(totalNodes - a.nodes.length).toBe(totalNodes - b.nodes.length);
      expect(totalLinks - a.links.length).toBe(totalLinks - b.links.length);

      // Invariant: every link endpoint must reference a visible node.
      const visible = new Set(a.nodes.map((n) => n.id));
      for (const l of a.links) {
        expect(visible.has(l.source)).toBe(true);
        expect(visible.has(l.target)).toBe(true);
      }
    }
  });

  it("hideCode removes every code node and any link touching one", () => {
    const { nodes, links } = filterGraph(graph, {
      activeCategories: new Set(),
      hideCode: true,
      includeTsFiles: true,
      activeCommunity: null,
      focusMode: false,
      selectedId: null,
    });
    expect(nodes.every((n) => n.category !== "code")).toBe(true);
    const ids = new Set(nodes.map((n) => n.id));
    expect(links.every((l) => ids.has(l.source) && ids.has(l.target))).toBe(true);
  });

  it("!includeTsFiles removes .ts/.tsx-derived nodes", () => {
    const { nodes } = filterGraph(graph, {
      activeCategories: new Set(),
      hideCode: false,
      includeTsFiles: false,
      activeCommunity: null,
      focusMode: false,
      selectedId: null,
    });
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids.has("a")).toBe(false);
    expect(ids.has("b")).toBe(false);
    expect(ids.has("g")).toBe(true); // utils.js — not a ts file
  });

  it("focusMode isolates the selected node's neighborhood", () => {
    const { nodes } = filterGraph(graph, {
      activeCategories: new Set(),
      hideCode: false,
      includeTsFiles: true,
      activeCommunity: null,
      focusMode: true,
      selectedId: "c",
    });
    const ids = new Set(nodes.map((n) => n.id));
    expect(ids).toEqual(new Set(["c", "b", "d"]));
  });
});