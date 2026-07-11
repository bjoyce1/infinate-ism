import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, unauth } from "./_brain-helpers";

export default defineTool({
  name: "brain_update_page",
  title: "Update brain page",
  description: "Update a Second Brain page identified by slug. Provide any of title, body, frontmatter, or citations. Citations replace the existing list.",
  inputSchema: {
    slug: z.string().min(1).describe("Slug of the page to update."),
    title: z.string().optional(),
    body: z.string().optional().describe("Markdown body. Replaces existing body."),
    frontmatter: z.record(z.string(), z.unknown()).optional().describe("Structured metadata object. Replaces existing frontmatter."),
    citations: z.array(z.object({ url: z.string(), title: z.string().optional() })).optional().describe("Full replacement citation list."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (args, ctx) => {
    const auth = requireAuth(ctx);
    if (!auth) return unauth();
    const { data: existing } = await auth.sb.from("brain_pages")
      .select("id").eq("user_id", auth.userId).eq("slug", args.slug).maybeSingle();
    if (!existing) return { content: [{ type: "text", text: `No brain page with slug "${args.slug}".` }], isError: true };
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.body !== undefined) patch.body = args.body;
    if (args.frontmatter !== undefined) patch.frontmatter = args.frontmatter;
    if (args.citations !== undefined) {
      patch.citations = args.citations.map((c) => ({ ...c, accessed_at: new Date().toISOString() }));
    }
    if (Object.keys(patch).length === 0) {
      return { content: [{ type: "text", text: "Nothing to update — pass title, body, frontmatter, or citations." }], isError: true };
    }
    const { error } = await auth.sb.from("brain_pages").update(patch).eq("id", (existing as { id: string }).id);
    if (error) return { content: [{ type: "text", text: `Update failed: ${error.message}` }], isError: true };
    return {
      content: [{ type: "text", text: `Updated brain page "${args.slug}" (${Object.keys(patch).join(", ")}).` }],
      structuredContent: { slug: args.slug, updated: Object.keys(patch) },
    };
  },
});