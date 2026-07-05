import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadGraph } from "@/lib/graph/loadGraph";
import type { NormalizedGraph } from "@/lib/graph/types";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/status")({
  head: () => ({
    meta: [
      { title: "Admin — Integration status" },
      { name: "description", content: "Per-node integration status: image overrides, embeddings, and last-updated timestamps across the graph." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StatusPage,
});

type Row = {
  id: string;
  label: string;
  type: string;
  hasImageInGraph: boolean;
  hasImageOverride: boolean;
  imageUpdatedAt: string | null;
  hasEmbedding: boolean;
  embeddingUpdatedAt: string | null;
};

type Filter = "all" | "wired" | "missing-image" | "missing-embedding" | "missing-both";
type SortKey = "label" | "type" | "image" | "embedding" | "updated";

function fmt(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diff < day) return `${Math.max(1, Math.floor(diff / 3_600_000))}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toISOString().slice(0, 10);
}

function StatusPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [graph, setGraph] = useState<NormalizedGraph | null>(null);
  const [overrides, setOverrides] = useState<Map<string, { image_url: string; updated_at: string }>>(new Map());
  const [embeds, setEmbeds] = useState<Map<string, { updated_at: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("updated");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const g = await loadGraph();
        setGraph(g);
        const [ov, em] = await Promise.all([
          supabase.from("node_image_overrides").select("node_id, image_url, updated_at"),
          supabase.from("node_embeddings").select("node_id, updated_at"),
        ]);
        if (ov.error) throw ov.error;
        if (em.error) throw em.error;
        setOverrides(new Map((ov.data ?? []).map((r) => [r.node_id, { image_url: r.image_url, updated_at: r.updated_at }])));
        setEmbeds(new Map((em.data ?? []).map((r) => [r.node_id, { updated_at: r.updated_at }])));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows: Row[] = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.map((n) => {
      const rec = n as Record<string, unknown>;
      const ov = overrides.get(n.id);
      const em = embeds.get(n.id);
      const graphImage = typeof rec.image === "string" && (rec.image as string).length > 0;
      return {
        id: n.id,
        label: n.label ?? n.id,
        type: (rec.type as string) ?? (rec.category as string) ?? "—",
        hasImageInGraph: graphImage,
        hasImageOverride: !!ov,
        imageUpdatedAt: ov?.updated_at ?? null,
        hasEmbedding: !!em,
        embeddingUpdatedAt: em?.updated_at ?? null,
      };
    });
  }, [graph, overrides, embeds]);

  const types = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.type));
    return Array.from(s).sort();
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (typeFilter && r.type !== typeFilter) return false;
      if (needle && !r.label.toLowerCase().includes(needle) && !r.id.toLowerCase().includes(needle)) return false;
      const hasImg = r.hasImageOverride || r.hasImageInGraph;
      switch (filter) {
        case "wired": return hasImg && r.hasEmbedding;
        case "missing-image": return !hasImg;
        case "missing-embedding": return !r.hasEmbedding;
        case "missing-both": return !hasImg && !r.hasEmbedding;
        default: return true;
      }
    });
    const cmp = (a: Row, b: Row): number => {
      switch (sort) {
        case "label": return a.label.localeCompare(b.label);
        case "type": return a.type.localeCompare(b.type) || a.label.localeCompare(b.label);
        case "image": return Number(b.hasImageOverride) - Number(a.hasImageOverride) || a.label.localeCompare(b.label);
        case "embedding": return Number(b.hasEmbedding) - Number(a.hasEmbedding) || a.label.localeCompare(b.label);
        case "updated": {
          const ta = Math.max(
            a.imageUpdatedAt ? Date.parse(a.imageUpdatedAt) : 0,
            a.embeddingUpdatedAt ? Date.parse(a.embeddingUpdatedAt) : 0,
          );
          const tb = Math.max(
            b.imageUpdatedAt ? Date.parse(b.imageUpdatedAt) : 0,
            b.embeddingUpdatedAt ? Date.parse(b.embeddingUpdatedAt) : 0,
          );
          return tb - ta;
        }
      }
    };
    return out.sort(cmp);
  }, [rows, q, filter, typeFilter, sort]);

  const stats = useMemo(() => {
    const total = rows.length;
    const withImg = rows.filter((r) => r.hasImageOverride || r.hasImageInGraph).length;
    const withOverride = rows.filter((r) => r.hasImageOverride).length;
    const withEmbed = rows.filter((r) => r.hasEmbedding).length;
    const fullyWired = rows.filter((r) => (r.hasImageOverride || r.hasImageInGraph) && r.hasEmbedding).length;
    return { total, withImg, withOverride, withEmbed, fullyWired };
  }, [rows]);

  return (
    <div className="min-h-screen bg-obsidian-bg text-white font-sora p-6 md:p-8 max-w-6xl mx-auto">
      <Link to="/admin" className="text-[10px] font-mono uppercase tracking-widest text-muted-text hover:text-white">
        ← Admin
      </Link>
      <h1 className="text-2xl font-light mt-6 mb-2">Integration status</h1>
      <p className="text-sm text-muted-text mb-6">
        Every node in the graph, its integration state (image override, embedding), and when each side was last touched.
      </p>

      {signedIn === false && (
        <div className="p-4 bg-white/5 border border-obsidian-border rounded">
          <p className="text-sm mb-3">You must be signed in.</p>
          <Link to="/auth" className="px-3 py-2 bg-neon-primary text-obsidian-bg text-xs font-semibold uppercase tracking-widest rounded">
            Sign in
          </Link>
        </div>
      )}

      {signedIn && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <Stat label="Nodes" value={stats.total} />
            <Stat label="With image" value={`${stats.withImg}/${stats.total}`} />
            <Stat label="Overrides" value={stats.withOverride} />
            <Stat label="Embeddings" value={`${stats.withEmbed}/${stats.total}`} />
            <Stat label="Fully wired" value={`${stats.fullyWired}/${stats.total}`} accent />
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search label or id…"
              className="flex-1 min-w-[180px] bg-obsidian-surface border border-obsidian-border rounded px-3 py-2 text-sm"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-obsidian-surface border border-obsidian-border rounded px-2 py-2 text-xs font-mono uppercase tracking-widest"
            >
              <option value="">all types</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
              className="bg-obsidian-surface border border-obsidian-border rounded px-2 py-2 text-xs font-mono uppercase tracking-widest"
            >
              <option value="all">all</option>
              <option value="wired">fully wired</option>
              <option value="missing-image">missing image</option>
              <option value="missing-embedding">missing embedding</option>
              <option value="missing-both">missing both</option>
            </select>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="bg-obsidian-surface border border-obsidian-border rounded px-2 py-2 text-xs font-mono uppercase tracking-widest"
            >
              <option value="updated">recently updated</option>
              <option value="label">a → z</option>
              <option value="type">type</option>
              <option value="image">image status</option>
              <option value="embedding">embedding status</option>
            </select>
          </div>

          {loading ? (
            <div className="text-sm text-muted-text">Loading…</div>
          ) : (
            <div className="border border-obsidian-border rounded overflow-hidden">
              <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_90px_90px_140px] items-center gap-2 px-3 py-2 bg-obsidian-surface text-[10px] font-mono uppercase tracking-widest text-muted-text border-b border-obsidian-border">
                <div>Node</div>
                <div>Type</div>
                <div>Image</div>
                <div>Embed</div>
                <div>Last touched</div>
              </div>
              <div className="max-h-[65vh] overflow-y-auto">
                {visible.map((r) => {
                  const lastTs = Math.max(
                    r.imageUpdatedAt ? Date.parse(r.imageUpdatedAt) : 0,
                    r.embeddingUpdatedAt ? Date.parse(r.embeddingUpdatedAt) : 0,
                  );
                  const last = lastTs ? new Date(lastTs).toISOString() : null;
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_90px_90px_140px] items-center gap-2 px-3 py-2 border-b border-obsidian-border/40 text-xs hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <div className="truncate">{r.label}</div>
                        <div className="font-mono text-[10px] text-muted-text truncate">{r.id}</div>
                      </div>
                      <div className="font-mono text-[10px] text-muted-text truncate">{r.type}</div>
                      <Badge
                        state={r.hasImageOverride ? "override" : r.hasImageInGraph ? "graph" : "missing"}
                        title={r.imageUpdatedAt ? `override ${fmt(r.imageUpdatedAt)}` : r.hasImageInGraph ? "graph.json" : "no image"}
                      />
                      <Badge
                        state={r.hasEmbedding ? "override" : "missing"}
                        title={r.embeddingUpdatedAt ? `embedded ${fmt(r.embeddingUpdatedAt)}` : "no embedding"}
                        okLabel="yes"
                      />
                      <div className="font-mono text-[10px] text-muted-text">{fmt(last)}</div>
                    </div>
                  );
                })}
                {visible.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-muted-text">No nodes match.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`p-3 rounded border ${accent ? "border-neon-primary/50 bg-neon-primary/5" : "border-obsidian-border bg-obsidian-surface"}`}>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text">{label}</div>
      <div className="text-lg mt-1">{value}</div>
    </div>
  );
}

function Badge({ state, title, okLabel }: { state: "override" | "graph" | "missing"; title?: string; okLabel?: string }) {
  const map: Record<string, { cls: string; text: string }> = {
    override: { cls: "bg-green-500/15 text-green-300 border-green-500/30", text: okLabel ?? "cdn" },
    graph: { cls: "bg-white/10 text-muted-text border-white/20", text: "graph" },
    missing: { cls: "bg-red-500/10 text-red-300/80 border-red-500/30", text: "—" },
  };
  const m = map[state];
  return (
    <span title={title} className={`inline-block px-2 py-0.5 border rounded text-[10px] font-mono uppercase tracking-widest text-center ${m.cls}`}>
      {m.text}
    </span>
  );
}