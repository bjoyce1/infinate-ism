import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAuth, unauth } from "./_brain-helpers";

export default defineTool({
  name: "brain_capture",
  title: "Capture into Second Brain",
  description: "Create a new capture (raw note or URL) in the user's Second Brain inbox. Returns the capture id so it can be enriched later.",
  inputSchema: {
    title: z.string().optional().describe("Optional title. If omitted, derived from body or URL."),
    body: z.string().optional().describe("Text content of the capture."),
    source_url: z.string().url().optional().describe("Optional source URL — will be fetched and summarized if body is empty."),
    tags: z.array(z.string()).optional().describe("Optional tags."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (args, ctx) => {
    const auth = requireAuth(ctx);
    if (!auth) return unauth();
    let { title, body } = args;
    body = body ?? "";
    if (args.source_url && !body) {
      try {
        const res = await fetch(args.source_url, { headers: { "user-agent": "CAPISM-Brain/1.0" } });
        const html = await res.text();
        body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
        if (!title) title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
      } catch { /* ignore */ }
    }
    if (!title) title = (body.slice(0, 80) || "Untitled capture");
    const { data, error } = await auth.sb.from("captures").insert({
      user_id: auth.userId,
      title, body,
      source_url: args.source_url ?? null,
      tags: args.tags ?? [],
      status: "inbox",
      type: "note",
      priority: "medium",
    }).select("id,title,status").single();
    if (error) return { content: [{ type: "text", text: `Capture failed: ${error.message}` }], isError: true };
    return {
      content: [{ type: "text", text: `Captured "${data.title}" (id ${data.id}). Status: ${data.status}. Enrich it from Second Brain or via the app.` }],
      structuredContent: { capture: data },
    };
  },
});