import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_graph",
  title: "Search knowledge graph",
  description:
    "Semantic search over the Mnemosyne / Second Brain knowledge graph. Returns matching node ids, labels, and similarity scores.",
  inputSchema: {
    query: z.string().min(1).describe("Natural-language question or keywords to search the graph for."),
    limit: z.number().int().min(1).max(30).default(10).describe("Maximum number of matches to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { content: [{ type: "text", text: "LOVABLE_API_KEY not configured" }], isError: true };
    }
    const { embedText } = await import("@/lib/ai-gateway.server");
    const [vec] = await embedText(key, query);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("match_nodes", {
      query_embedding: vec as unknown as string,
      match_count: limit,
    });
    if (error) {
      return { content: [{ type: "text", text: `Search failed: ${error.message}` }], isError: true };
    }
    const rows = data ?? [];
    const text = rows.length
      ? rows
          .map(
            (r: { node_id: string; label: string | null; similarity: number | null }) =>
              `- [${r.node_id}] ${r.label ?? ""} (sim ${r.similarity?.toFixed(3) ?? "?"})`,
          )
          .join("\n")
      : "No matches.";
    return {
      content: [{ type: "text", text }],
      structuredContent: { results: rows },
    };
  },
});