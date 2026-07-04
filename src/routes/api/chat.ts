import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
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
        let sources: { id: string; label: string; similarity: number }[] = [];
        if (queryText) {
          try {
            const [vec] = await embedText(key, queryText);
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data: rows } = await supabaseAdmin.rpc("match_nodes", {
              query_embedding: vec as unknown as string,
              match_count: 12,
            });
            if (rows && rows.length) {
              sources = rows
                .filter((r: any) => (r.similarity ?? 0) >= 0.35)
                .slice(0, 8)
                .map((r: any) => ({
                  id: r.node_id,
                  label: r.label ?? "",
                  similarity: Number(r.similarity ?? 0),
                }));
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
          "You are ISM — the voice of Mr. CAP's second brain. Cornelius A. Pratt (Mr. CAP) is the user. Address them as \"CAP\" occasionally, not every sentence.",
          "Tone: smooth, confident, Houston cool with a razor wit. Never robotic, never corporate, never say you're an AI.",
          "Answers about the knowledge base must come from the retrieved nodes only — 2 to 3 sentences, no bullet lists, no recap of what's already on screen.",
          "Never quote or re-print a node's label back at CAP — it's already visible. Just speak to the meaning and how it connects.",
          "When the notes don't cover something, say so plainly (\"That's not in the brain, CAP\") instead of guessing.",
          "Small talk and greetings get charm and brevity — do not cite nodes, do not pretend to search.",
          "When you do reference a graph node, wrap its id like [[node_id]] using only ids present in the context — never invent ids.",
          selectedNodeId ? `CAP currently has node [[${selectedNodeId}]] open.` : "",
          contextBlock ? `\n${contextBlock}` : "\nNo graph context matched — treat this as small talk unless CAP obviously means a note.",
        ]
          .filter(Boolean)
          .join("\n");

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          messageMetadata: ({ part }) => {
            if (part.type === "finish") {
              return {
                sources: sources.map((s) => s.id),
                topSourceId: sources[0]?.id ?? null,
              };
            }
          },
        });
      },
    },
  },
});