import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

type GraphNode = {
  id: string;
  label?: string;
  type?: string;
  snippet?: string;
  description?: string;
  url?: string;
  [k: string]: unknown;
};
type GraphLink = { source: string; target: string; label?: string; type?: string };
type Graph = { nodes: GraphNode[]; links: GraphLink[] };

let cache: Graph | null = null;
async function loadGraph(): Promise<Graph> {
  if (cache) return cache;
  const res = await fetch("https://infinate-ism.lovable.app/graph.json");
  if (!res.ok) throw new Error(`graph.json fetch failed: ${res.status}`);
  cache = (await res.json()) as Graph;
  return cache;
}

export default defineTool({
  name: "get_node",
  title: "Get node details",
  description:
    "Fetch a single node from the knowledge graph by id, including its immediate neighbors and connecting links.",
  inputSchema: {
    node_id: z.string().min(1).describe("The exact node id, e.g. 'site_mrcap1_com'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ node_id }) => {
    const graph = await loadGraph();
    const node = graph.nodes.find((n) => n.id === node_id);
    if (!node) {
      return { content: [{ type: "text", text: `Node not found: ${node_id}` }], isError: true };
    }
    const neighbors = graph.links
      .filter((l) => l.source === node_id || l.target === node_id)
      .map((l) => {
        const otherId = l.source === node_id ? l.target : l.source;
        const other = graph.nodes.find((n) => n.id === otherId);
        return { id: otherId, label: other?.label ?? otherId, via: l.label ?? l.type ?? "link" };
      });
    const text = [
      `# ${node.label ?? node.id} (${node.id})`,
      node.type ? `Type: ${node.type}` : "",
      node.url ? `URL: ${node.url}` : "",
      node.snippet ?? node.description ?? "",
      "",
      `Neighbors (${neighbors.length}):`,
      ...neighbors.slice(0, 40).map((n) => `- ${n.label} [${n.id}] via ${n.via}`),
    ]
      .filter(Boolean)
      .join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { node, neighbors },
    };
  },
});