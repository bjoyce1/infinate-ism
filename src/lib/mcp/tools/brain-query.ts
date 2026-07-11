import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, unauth } from "./_brain-helpers";

export default defineTool({
  name: "brain_query",
  title: "Ask the Second Brain",
  description: "Query the user's Second Brain with 3-layer retrieval (keyword hits → link neighborhood → AI synthesis). Returns an answer with inline [slug] citations.",
  inputSchema: {
    question: z.string().min(2).describe("Natural language question to answer from the brain."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ question }, ctx) => {
    const auth = requireAuth(ctx);
    if (!auth) return unauth();
    const term = `%${question.replace(/[%_]/g, "").slice(0, 60)}%`;
    const { data: hits } = await auth.sb.from("brain_pages")
      .select("id,slug,title,type,department,body,citations")
      .eq("user_id", auth.userId)
      .or(`title.ilike.${term},body.ilike.${term}`)
      .limit(8);
    const hitIds = (hits ?? []).map((h: { id: string }) => h.id);
    let neighbors: Array<{ slug: string; title: string; body: string }> = [];
    if (hitIds.length) {
      const { data: rel } = await auth.sb.from("page_links")
        .select("source_page_id,target_page_id")
        .or(hitIds.map((id) => `source_page_id.eq.${id},target_page_id.eq.${id}`).join(","));
      const other = new Set<string>();
      for (const r of (rel ?? []) as Array<{ source_page_id: string; target_page_id: string }>) {
        if (!hitIds.includes(r.source_page_id)) other.add(r.source_page_id);
        if (!hitIds.includes(r.target_page_id)) other.add(r.target_page_id);
      }
      if (other.size) {
        const { data: extra } = await auth.sb.from("brain_pages").select("slug,title,body").in("id", Array.from(other)).limit(8);
        neighbors = (extra ?? []) as typeof neighbors;
      }
    }
    const docs = [
      ...((hits ?? []) as Array<{ slug: string; title: string; body: string | null }>).map((h) => ({ slug: h.slug, title: h.title, body: (h.body ?? "").slice(0, 1200) })),
      ...neighbors.map((n) => ({ slug: n.slug, title: n.title, body: (n.body ?? "").slice(0, 600) })),
    ];
    if (docs.length === 0) {
      return { content: [{ type: "text", text: "No relevant brain pages yet. Capture and enrich some notes first." }], structuredContent: { answer: "", citations: [] } };
    }
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { content: [{ type: "text", text: "LOVABLE_API_KEY not configured." }], isError: true };
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const provider = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: provider("google/gemini-3-flash-preview"),
      system: "You are the C.A.P.I.S.M. Chief of Staff. Ground every claim in the provided pages and cite with [slug].",
      prompt: `Answer using ONLY these brain pages. Cite inline with [slug].\n\n${docs.map((d) => `### ${d.title} [${d.slug}]\n${d.body}`).join("\n\n")}\n\nQUESTION: ${question}`,
    });
    return {
      content: [{ type: "text", text }],
      structuredContent: { answer: text, citations: docs.map((d) => ({ slug: d.slug, title: d.title })) },
    };
  },
});