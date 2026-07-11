import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, unauth } from "./_brain-helpers";

export default defineTool({
  name: "brain_get_page",
  title: "Get brain page",
  description: "Fetch a Second Brain page by slug, including citations and inbound/outbound page links.",
  inputSchema: {
    slug: z.string().min(1).describe("The page slug (e.g. 'paul-wall')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ slug }, ctx) => {
    const auth = requireAuth(ctx);
    if (!auth) return unauth();
    const { data: page, error } = await auth.sb.from("brain_pages")
      .select("*").eq("user_id", auth.userId).eq("slug", slug).maybeSingle();
    if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    if (!page) return { content: [{ type: "text", text: `No brain page with slug "${slug}".` }], isError: true };
    const [{ data: outLinks }, { data: inLinks }] = await Promise.all([
      auth.sb.from("page_links").select("relation, target:brain_pages!page_links_target_page_id_fkey(slug,title,type)").eq("source_page_id", (page as { id: string }).id),
      auth.sb.from("page_links").select("relation, source:brain_pages!page_links_source_page_id_fkey(slug,title,type)").eq("target_page_id", (page as { id: string }).id),
    ]);
    const p = page as { title: string; type: string; department: string | null; body: string | null; citations: unknown; updated_at: string };
    const text = [
      `# ${p.title}`,
      `Type: ${p.type} · Department: ${p.department ?? "—"} · Updated: ${p.updated_at}`,
      "",
      p.body ?? "",
      "",
      Array.isArray(p.citations) && p.citations.length ? `## Citations\n${(p.citations as { url: string; title?: string }[]).map((c) => `- [${c.title ?? c.url}](${c.url})`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { page, outLinks: outLinks ?? [], inLinks: inLinks ?? [] },
    };
  },
});