import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider, embedText } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { messages, selectedNodeId } = (await request.json()) as {
          messages?: UIMessage[];
          selectedNodeId?: string | null;
        };
        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("messages required", { status: 400 });
        }

        // Retrieve the latest user question text to build RAG context.
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const queryText =
          lastUser?.parts?.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim() ?? "";

        let contextBlock = "";
        if (queryText) {
          try {
            const [vec] = await embedText(key, queryText);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: rows } = await supabaseAdmin.rpc("match_nodes", {
              query_embedding: vec as unknown as string,
              match_count: 12,
            });
            if (rows && rows.length) {
              contextBlock =
                "Relevant graph nodes (id · label · similarity):\n" +
                rows
                  .map((r) => `- [[${r.node_id}]] ${r.label ?? ""} (${r.similarity?.toFixed(3)})`)
                  .join("\n");
            }
          } catch (err) {
            console.warn("[chat] semantic retrieval failed", err);
          }
        }

        const gateway = createLovableAiGatewayProvider(key);
        const model = gateway("google/gemini-3-flash-preview");

        const system = [
          "You are Mnemosyne, an assistant embedded inside a personal knowledge graph called \"Second Brain\".",
          "The user is exploring nodes that represent websites, songs, artworks, chapters, and people they created.",
          "The central hub is mrcap1.com (Cornelius A. Pratt / Mr. CAP).",
          "When you reference a node from the graph, wrap its id in double brackets like [[node_id]] so the UI can turn it into a clickable chip.",
          "Keep answers concise, cite specific nodes, and never invent node ids that were not provided in the context.",
          selectedNodeId ? `The user currently has node [[${selectedNodeId}]] selected.` : "",
          contextBlock ? `\n${contextBlock}` : "\nNo graph context matched — answer from what the user said.",
        ]
          .filter(Boolean)
          .join("\n");

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});