import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";

// ---------- Helpers ----------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || `page-${Date.now()}`;
}

async function callGemini(prompt: string, system?: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
  const provider = createLovableAiGatewayProvider(key);
  const { text } = await generateText({
    model: provider("google/gemini-3-flash-preview"),
    system,
    prompt,
  });
  return text;
}

// ---------- Capture ----------

export const createCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    source_url: z.string().url().optional().or(z.literal("").transform(() => undefined)),
    tags: z.array(z.string()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let title = data.title?.trim();
    let body = data.body ?? "";

    // If URL given, fetch and stash a raw excerpt for enrichment later.
    if (data.source_url && !body) {
      try {
        const res = await fetch(data.source_url, { headers: { "user-agent": "CAPISM-Brain/1.0" } });
        const html = await res.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 4000);
        body = text;
        if (!title) {
          const m = html.match(/<title>([^<]+)<\/title>/i);
          title = m?.[1]?.trim();
        }
      } catch {
        // ignore fetch failure
      }
    }

    if (!title) title = body.slice(0, 80) || "Untitled capture";

    const { data: row, error } = await supabase
      .from("captures")
      .insert({
        user_id: userId,
        title,
        body,
        source_url: data.source_url,
        tags: data.tags ?? [],
        status: "inbox" as never,
        type: "note" as never,
        priority: "medium" as never,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const listCaptures = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const q = context.supabase
      .from("captures")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status) q.eq("status", data.status as never);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---------- Enrich ----------

const EnrichSchema = z.object({
  title: z.string(),
  type: z.enum(["person","company","concept","content","project","personal","skill","routine","application"]),
  department: z.enum(["Community","Product","Content","Personal","Business"]),
  summary: z.string(),
  entities: z.array(z.object({
    name: z.string(),
    type: z.enum(["person","company","concept","content","project"]),
    relation: z.string().optional(),
  })).default([]),
  citations: z.array(z.object({ url: z.string(), title: z.string().optional() })).default([]),
});

export type EnrichmentProposal = z.infer<typeof EnrichSchema>;

export const enrichCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ captureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<EnrichmentProposal> => {
    const { supabase, userId } = context;
    const { data: cap, error } = await supabase
      .from("captures")
      .select("*")
      .eq("id", data.captureId)
      .eq("user_id", userId)
      .single();
    if (error || !cap) throw new Error("Capture not found");

    const prompt = `You are the enrichment step of a Second Brain. Classify and structure this capture. Return STRICT JSON only, no prose, matching this shape:
{
  "title": string,
  "type": "person"|"company"|"concept"|"content"|"project"|"personal"|"skill"|"routine"|"application",
  "department": "Community"|"Product"|"Content"|"Personal"|"Business",
  "summary": string (2-4 sentences, markdown),
  "entities": [{ "name": string, "type": "person"|"company"|"concept"|"content"|"project", "relation": string }],
  "citations": [{ "url": string, "title": string }]
}

Filing rule: file by PRIMARY SUBJECT (MECE — one home per page), never by format.

CAPTURE TITLE: ${cap.title}
CAPTURE BODY:
${(cap.body ?? "").slice(0, 6000)}

SOURCE URL: ${cap.source_url ?? "(none)"}`;

    const raw = await callGemini(prompt, "You output only valid JSON.");
    const jsonStr = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let parsed: EnrichmentProposal;
    try {
      parsed = EnrichSchema.parse(JSON.parse(jsonStr));
    } catch {
      throw new Error(`Enrichment returned invalid JSON:\n${raw.slice(0, 400)}`);
    }

    // Ensure the source URL is captured as a citation.
    if (cap.source_url && !parsed.citations.some((c) => c.url === cap.source_url)) {
      parsed.citations.unshift({ url: cap.source_url, title: cap.title });
    }

    // Mark capture as enriched (idempotent).
    await supabase.from("captures").update({ status: "enriched" as never }).eq("id", cap.id);

    return parsed;
  });

// ---------- File (commit enrichment to brain_pages) ----------

export const fileCapture = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    captureId: z.string().uuid(),
    proposal: EnrichSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { proposal } = data;

    // Create or update primary page.
    const slug = slugify(proposal.title);
    const citations = proposal.citations.map((c) => ({ ...c, accessed_at: new Date().toISOString() }));
    const body = `${proposal.summary}\n\n${citations.length ? "## Sources\n" + citations.map((c) => `- [${c.title ?? c.url}](${c.url})`).join("\n") : ""}`;

    const { data: existing } = await supabase
      .from("brain_pages").select("id,body,citations").eq("user_id", userId).eq("slug", slug).maybeSingle();

    let pageId: string;
    if (existing) {
      const mergedCitations = [
        ...(Array.isArray(existing.citations) ? existing.citations as unknown[] : []),
        ...citations,
      ] as never;
      const { data: upd, error } = await supabase.from("brain_pages")
        .update({
          title: proposal.title,
          type: proposal.type,
          department: proposal.department,
          body: `${existing.body}\n\n---\n\n${body}`,
          citations: mergedCitations,
        })
        .eq("id", existing.id).select("id").single();
      if (error) throw error;
      pageId = upd.id;
    } else {
      const { data: ins, error } = await supabase.from("brain_pages").insert({
        user_id: userId,
        slug, title: proposal.title,
        type: proposal.type, department: proposal.department,
        body, citations: citations as never,
      }).select("id").single();
      if (error) throw error;
      pageId = ins.id;
    }

    // Ensure related entity pages exist and link them.
    for (const ent of proposal.entities) {
      const eSlug = slugify(ent.name);
      const { data: exE } = await supabase.from("brain_pages").select("id").eq("user_id", userId).eq("slug", eSlug).maybeSingle();
      let entityId: string;
      if (exE) entityId = exE.id;
      else {
        const { data: created, error } = await supabase.from("brain_pages").insert({
          user_id: userId, slug: eSlug, title: ent.name, type: ent.type, department: proposal.department,
          body: `Stub page for **${ent.name}** — extracted from "${proposal.title}".`, citations: [],
        }).select("id").single();
        if (error) throw error;
        entityId = created.id;
      }
      await supabase.from("page_links").upsert({
        user_id: userId, source_page_id: pageId, target_page_id: entityId,
        relation: ent.relation ?? "mentions",
      }, { onConflict: "source_page_id,target_page_id,relation" });
    }

    await supabase.from("captures").update({ status: "filed" as never, page_id: pageId }).eq("id", data.captureId);
    return { pageId, slug };
  });

// ---------- Pages CRUD ----------

export const listPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("brain_pages")
      .select("id,slug,title,type,department,updated_at,citations")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data ?? [];
  });

export const getPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: page, error } = await supabase.from("brain_pages")
      .select("*").eq("user_id", userId).eq("slug", data.slug).maybeSingle();
    if (error) throw error;
    if (!page) return null;
    const [{ data: outLinks }, { data: inLinks }] = await Promise.all([
      supabase.from("page_links").select("relation, target:brain_pages!page_links_target_page_id_fkey(id,slug,title,type)").eq("source_page_id", page.id),
      supabase.from("page_links").select("relation, source:brain_pages!page_links_source_page_id_fkey(id,slug,title,type)").eq("target_page_id", page.id),
    ]);
    return { page, outLinks: outLinks ?? [], inLinks: inLinks ?? [] };
  });

export const updatePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    title: z.string().optional(),
    body: z.string().optional(),
    type: z.enum(["person","company","concept","content","project","personal","skill","routine","application"]).optional(),
    department: z.enum(["Community","Product","Content","Personal","Business"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["title","body","type","department"] as const) if (data[k] !== undefined) patch[k] = data[k];
    const { error } = await context.supabase.from("brain_pages")
      .update(patch as never).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Ask the Brain (3-layer retrieval) ----------

export const askBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ question: z.string().min(2) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = data.question;
    const term = `%${q.replace(/[%_]/g, "").slice(0, 60)}%`;

    // Layer 1: keyword hits in brain pages.
    const { data: hits } = await supabase.from("brain_pages")
      .select("id,slug,title,type,department,body,citations")
      .eq("user_id", userId)
      .or(`title.ilike.${term},body.ilike.${term}`)
      .limit(8);

    const hitIds = (hits ?? []).map((h) => h.id);
    // Layer 2: 1-hop neighborhood.
    let neighbors: Array<{ id: string; slug: string; title: string; body: string }> = [];
    if (hitIds.length) {
      const { data: rel } = await supabase.from("page_links")
        .select("source_page_id,target_page_id")
        .or(hitIds.map((id) => `source_page_id.eq.${id},target_page_id.eq.${id}`).join(","));
      const otherIds = new Set<string>();
      for (const r of rel ?? []) {
        if (!hitIds.includes(r.source_page_id)) otherIds.add(r.source_page_id);
        if (!hitIds.includes(r.target_page_id)) otherIds.add(r.target_page_id);
      }
      if (otherIds.size) {
        const { data: extra } = await supabase.from("brain_pages")
          .select("id,slug,title,body").in("id", Array.from(otherIds)).limit(8);
        neighbors = extra ?? [];
      }
    }

    const context_docs = [
      ...(hits ?? []).map((h) => ({ slug: h.slug, title: h.title, body: (h.body ?? "").slice(0, 1200) })),
      ...neighbors.map((n) => ({ slug: n.slug, title: n.title, body: (n.body ?? "").slice(0, 600) })),
    ];

    if (context_docs.length === 0) {
      return { answer: "Your brain doesn't have any pages related to this question yet. Capture some notes or URLs and enrich them, then ask again.", citations: [] };
    }

    const prompt = `Answer the user's question using ONLY the provided brain pages. Cite pages inline using [slug] notation.

PAGES:
${context_docs.map((d) => `### ${d.title} [${d.slug}]\n${d.body}`).join("\n\n")}

QUESTION: ${q}`;

    const answer = await callGemini(prompt, "You are the C.A.P.I.S.M. Chief of Staff. Ground every claim in the provided pages and cite with [slug].");
    return {
      answer,
      citations: context_docs.map((d) => ({ slug: d.slug, title: d.title })),
    };
  });

// ---------- Brain Health ----------

export const brainHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [pagesRes, linksRes, capturesRes] = await Promise.all([
      supabase.from("brain_pages").select("id,slug,title,type,department,citations,updated_at").eq("user_id", userId),
      supabase.from("page_links").select("source_page_id,target_page_id").eq("user_id", userId),
      supabase.from("captures").select("id,status,created_at").eq("user_id", userId),
    ]);
    const pages = pagesRes.data ?? [];
    const links = linksRes.data ?? [];
    const captures = capturesRes.data ?? [];

    const linkedIds = new Set<string>();
    links.forEach((l) => { linkedIds.add(l.source_page_id); linkedIds.add(l.target_page_id); });

    const now = Date.now();
    const staleCutoff = now - 90 * 24 * 60 * 60 * 1000;

    const orphans = pages.filter((p) => !linkedIds.has(p.id));
    const missingCitations = pages.filter((p) => !Array.isArray(p.citations) || (p.citations as unknown[]).length === 0);
    const stale = pages.filter((p) => new Date(p.updated_at).getTime() < staleCutoff);
    const inboxStuck = captures.filter((c) => c.status === "inbox").length;

    const byType: Record<string, number> = {};
    const byDept: Record<string, number> = {};
    for (const p of pages) {
      byType[p.type] = (byType[p.type] ?? 0) + 1;
      if (p.department) byDept[p.department] = (byDept[p.department] ?? 0) + 1;
    }

    // 0–100 score.
    const total = Math.max(1, pages.length);
    const orphanPenalty = (orphans.length / total) * 25;
    const citationPenalty = (missingCitations.length / total) * 30;
    const stalePenalty = (stale.length / total) * 20;
    const inboxPenalty = Math.min(15, inboxStuck * 1.5);
    const linkCoverage = 1 - orphans.length / total;
    const score = Math.round(Math.max(0, 100 - orphanPenalty - citationPenalty - stalePenalty - inboxPenalty));

    return {
      score,
      counts: { pages: pages.length, links: links.length, captures: captures.length, inboxStuck },
      byType, byDept,
      linkCoverage: Math.round(linkCoverage * 100),
      checks: {
        orphans: orphans.slice(0, 20).map((p) => ({ slug: p.slug, title: p.title })),
        missingCitations: missingCitations.slice(0, 20).map((p) => ({ slug: p.slug, title: p.title })),
        stale: stale.slice(0, 20).map((p) => ({ slug: p.slug, title: p.title, updated_at: p.updated_at })),
      },
    };
  });

// ---------- Seed skills / routines / applications ----------

const SEED_SKILLS = [
  "graphify","qmd","last30days","brain-ops","query","ingest","enrich","capture",
  "daily-briefing","media-ingest","voice-note-ingest","academic-verify","concept-synthesis","signal-detector","maintain",
];
const SEED_ROUTINES = [
  { name: "Daily Briefing", when: "07:00 daily" },
  { name: "Brain Maintenance", when: "weekly" },
  { name: "Content Radar", when: "daily" },
  { name: "Inbox Sweep", when: "hourly" },
];
const SEED_APPS = ["GitHub","Slack","Google Drive","Telegram","PayPal","Gmail","Notion","Calendar"];

export const seedBrainRings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let created = 0;
    const rows: Array<{
      user_id: string; slug: string; title: string; type: "skill"|"routine"|"application";
      department: "Personal"|"Product"|"Business"; body: string; citations: unknown[]
    }> = [];
    for (const s of SEED_SKILLS) rows.push({ user_id: userId, slug: `skill-${slugify(s)}`, title: s, type: "skill", department: "Product", body: `Agent skill: **${s}**.`, citations: [] });
    for (const r of SEED_ROUTINES) rows.push({ user_id: userId, slug: `routine-${slugify(r.name)}`, title: r.name, type: "routine", department: "Personal", body: `Runs ${r.when}.`, citations: [] });
    for (const a of SEED_APPS) rows.push({ user_id: userId, slug: `app-${slugify(a)}`, title: a, type: "application", department: "Business", body: `Connected application: ${a}.`, citations: [] });

    for (const row of rows) {
      const { error } = await supabase.from("brain_pages").upsert(row as never, { onConflict: "user_id,slug" });
      if (!error) created++;
    }
    return { created };
  });