import type { NormalizedGraph } from "./types";
import { isTsSourceNode } from "./loadGraph";

export interface FilterOptions {
  activeCategories: Set<string>;
  hideCode: boolean;
  includeTsFiles: boolean;
  activeCommunity: number | null;
  focusMode: boolean;
  selectedId: string | null;
}

/**
 * Shared filter used by both GraphCanvas (2D) and GraphCanvas3D so their
 * visible/hidden node & link counts are guaranteed to stay in sync.
 */
export function filterGraph(graph: NormalizedGraph, opts: FilterOptions) {
  const { activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId } = opts;
  const nodeSet = new Set<string>();
  for (const n of graph.nodes) {
    if (activeCategories.size > 0 && !activeCategories.has(n.category)) continue;
    if (hideCode && n.category === "code") continue;
    if (!includeTsFiles && isTsSourceNode(n)) continue;
    if (activeCommunity != null && n.community !== activeCommunity) continue;
    nodeSet.add(n.id);
  }
  if (focusMode && selectedId && nodeSet.has(selectedId)) {
    const keep = new Set<string>([selectedId]);
    for (const nb of graph.neighbors.get(selectedId) ?? []) keep.add(nb);
    for (const id of nodeSet) if (!keep.has(id)) nodeSet.delete(id);
  }
  const nodes = graph.nodes.filter((n) => nodeSet.has(n.id)).map((n) => ({ ...n }));
  const links = graph.links
    .filter((l) => nodeSet.has(l.source) && nodeSet.has(l.target))
    .map((l) => ({ ...l }));
  return { nodes, links };
}