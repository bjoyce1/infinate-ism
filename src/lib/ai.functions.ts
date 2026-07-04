import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider, embedText } from "./ai-gateway.server";

function supabasePublic() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

function getKey() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY not configured");
  return k;
}

// ---------- Semantic search ----------

export const semanticSearch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ query: z.string().min(1).max(500), limit: z.number().int().min(1).max(30).default(15) }).parse(d),
  )
  .handler(async ({ data }) => {
    const [vec] = await embedText(getKey(), data.query);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin;
    const { data: rows, error } = await sb.rpc("match_nodes", {
      query_embedding: vec as unknown as string,
      match_count: data.limit,
    });
    if (error) throw new Error(error.message);
    return { results: rows ?? [] };
  });

// ---------- Embedding rebuild (batched from client) ----------

const RebuildBatch = z.object({
  items: z
    .array(
      z.object({
        node_id: z.string().min(1).max(512),
        label: z.string().max(2048),
        text: z.string().max(8000),
      }),
    )
    .min(1)
    .max(64),
});

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export const embedNodesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RebuildBatch.parse(d))
  .handler(async ({ data, context }) => {
    // Only admins may write.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden — admin role required");

    // Skip items whose hash matches existing rows.
    const ids = data.items.map((i) => i.node_id);
    const { data: existing } = await context.supabase
      .from("node_embeddings")
      .select("node_id, text_hash")
      .in("node_id", ids);
    const existingHashes = new Map((existing ?? []).map((r) => [r.node_id, r.text_hash]));
    const todo = data.items.filter(
      (i) => existingHashes.get(i.node_id) !== hashString(i.text),
    );
    if (todo.length === 0) return { embedded: 0, skipped: data.items.length };

    const vectors = await embedText(getKey(), todo.map((i) => i.text));
    const rows = todo.map((i, idx) => ({
      node_id: i.node_id,
      label: i.label,
      text_hash: hashString(i.text),
      embedding: vectors[idx] as unknown as string,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin.from("node_embeddings").upsert(rows);
    if (error) throw new Error(error.message);
    return { embedded: todo.length, skipped: data.items.length - todo.length };
  });

export const embeddingStats = createServerFn({ method: "GET" }).handler(async () => {
  const sb = supabasePublic();
  const { count } = await sb
    .from("node_embeddings")
    .select("*", { count: "exact", head: true });
  return { count: count ?? 0 };
});

// ---------- Summarize a node ----------

export const summarizeNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        node_id: z.string().min(1).max(512),
        label: z.string().max(2048),
        context: z.string().max(4000).default(""),
        neighbors: z.array(z.string().max(512)).max(30).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const gateway = createLovableAiGatewayProvider(getKey());
    const model = gateway("google/gemini-3-flash-preview");
    const prompt = [
      `You are annotating a node from a personal knowledge graph.`,
      `Node label: ${data.label}`,
      `Node id: ${data.node_id}`,
      data.context ? `Context/metadata:\n${data.context}` : "",
      data.neighbors.length
        ? `Connected to: ${data.neighbors.slice(0, 20).join(", ")}`
        : "",
      ``,
      `Return a JSON object with exactly these fields:`,
      `{"summary": "1-2 sentence plain-English description", "tags": ["3-6 lowercase kebab-case tags"]}`,
      `Reply with ONLY the JSON.`,
    ]
      .filter(Boolean)
      .join("\n");

    const { text } = await generateText({ model, prompt });
    const match = text.match(/\{[\s\S]*\}/);
    let parsed: { summary: string; tags: string[] } = { summary: "", tags: [] };
    if (match) {
      try {
        const j = JSON.parse(match[0]) as { summary?: unknown; tags?: unknown };
        parsed = {
          summary: typeof j.summary === "string" ? j.summary : "",
          tags: Array.isArray(j.tags) ? j.tags.filter((t): t is string => typeof t === "string").slice(0, 8) : [],
        };
      } catch {
        /* fall through */
      }
    }

    // Persist to node_notes for this user.
    const { data: row, error } = await context.supabase
      .from("node_notes")
      .upsert(
        {
          user_id: context.userId,
          node_id: data.node_id,
          summary: parsed.summary,
          tags: parsed.tags,
        },
        { onConflict: "user_id,node_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { summary: parsed.summary, tags: parsed.tags, note: row?.note ?? null };
  });

// ---------- Notes ----------

export const getNodeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ node_id: z.string().min(1).max(512) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("node_notes")
      .select("summary, tags, note, updated_at")
      .eq("user_id", context.userId)
      .eq("node_id", data.node_id)
      .maybeSingle();
    return { note: row ?? null };
  });

export const upsertNodeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        node_id: z.string().min(1).max(512),
        note: z.string().max(8000).nullable().default(null),
        summary: z.string().max(2000).nullable().default(null),
        tags: z.array(z.string().max(64)).max(20).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("node_notes")
      .upsert(
        {
          user_id: context.userId,
          node_id: data.node_id,
          note: data.note,
          summary: data.summary,
          tags: data.tags,
        },
        { onConflict: "user_id,node_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, updated_at: row?.updated_at };
  });

// ---------- Capture ("Total Recall") ----------

function makeCaptureTitle(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ");
  const first = words.slice(0, 8).join(" ");
  const title = first.length > 60 ? first.slice(0, 57).trimEnd() + "…" : first;
  // Capitalize first letter, no trailing period.
  return title.replace(/^./, (c) => c.toUpperCase()).replace(/[.,;:!?]$/, "");
}

function randomUuid(): string {
  // crypto.randomUUID is available in the worker runtime.
  return (globalThis.crypto as Crypto).randomUUID();
}

export const captureNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = getKey();
    const uid = context.userId;
    const nodeId = `capture:${uid}:${randomUuid()}`;
    const title = makeCaptureTitle(data.text);
    const embedText_ = `${title}\n\n${data.text}`;

    // Embed the note first so we can find the nearest existing star.
    const [vec] = await embedText(key, embedText_);

    // Find nearest non-capture, non-self node from existing embeddings.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: matches } = await supabaseAdmin.rpc("match_nodes", {
      query_embedding: vec as unknown as string,
      match_count: 8,
    });
    const nearest = (matches ?? []).find(
      (m: { node_id: string; user_id: string | null }) =>
        !m.node_id.startsWith("capture:") && m.node_id !== nodeId,
    );
    const relatedId = (nearest?.node_id as string | undefined) ?? null;

    // Persist the note (auth-scoped RLS via context.supabase).
    const { error: noteErr } = await context.supabase.from("node_notes").insert({
      user_id: uid,
      node_id: nodeId,
      summary: title,
      note: data.text,
      tags: ["capture"],
      related_node_id: relatedId,
    });
    if (noteErr) throw new Error(noteErr.message);

    // Persist the embedding under the user's own row.
    const { error: embErr } = await supabaseAdmin.from("node_embeddings").upsert(
      {
        node_id: nodeId,
        label: title,
        text_hash: `capture-${Date.now()}`,
        embedding: vec as unknown as string,
        updated_at: new Date().toISOString(),
        user_id: uid,
      },
      { onConflict: "node_id" },
    );
    if (embErr) throw new Error(embErr.message);

    return {
      id: nodeId,
      label: title,
      note: data.text,
      related_node_id: relatedId,
      updated_at: new Date().toISOString(),
    };
  });

export const listMyCaptures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("node_notes")
      .select("node_id, summary, note, related_node_id, updated_at, tags")
      .eq("user_id", context.userId)
      .contains("tags", ["capture"])
      .order("updated_at", { ascending: true });
    if (error) throw new Error(error.message);
    const captures = (data ?? []).map((r) => ({
      id: r.node_id,
      label: r.summary ?? "Capture",
      note: r.note ?? "",
      related_node_id: (r as { related_node_id?: string | null }).related_node_id ?? null,
      updated_at: r.updated_at ?? null,
    }));
    return { captures };
  });