import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadGraph } from "@/lib/graph/loadGraph";
import type { NormalizedGraph, GraphNode } from "@/lib/graph/types";
import { embedNodesBatch, embeddingStats } from "@/lib/ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Mnemosyne" },
      { name: "description", content: "Admin tools for Mnemosyne: rebuild the semantic AI index across every node in your knowledge graph." },
      { property: "og:title", content: "Admin — Mnemosyne" },
      { property: "og:description", content: "Rebuild the semantic AI index across every node in your Mnemosyne knowledge graph." },
      { property: "og:url", content: "https://infinate-ism.lovable.app/admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://infinate-ism.lovable.app/admin" }],
  }),
  component: AdminPage,
});

function nodeText(n: GraphNode): string {
  const rec = n as Record<string, unknown>;
  const parts = [n.label];
  for (const [k, v] of Object.entries(rec)) {
    if (["id", "label", "category"].includes(k)) continue;
    if (typeof v === "string" && v.length < 500) parts.push(`${k}: ${v}`);
  }
  return parts.join("\n").slice(0, 6000);
}

function AdminPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [graph, setGraph] = useState<NormalizedGraph | null>(null);
  const [stats, setStats] = useState<{ count: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, embedded: 0, skipped: 0 });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  useEffect(() => {
    loadGraph().then(setGraph).catch((e) => toast.error(String(e)));
    embeddingStats().then(setStats).catch(() => setStats(null));
  }, []);

  const run = async () => {
    if (!graph) return;
    setRunning(true);
    const nodes = graph.nodes;
    const BATCH = 32;
    setProgress({ done: 0, total: nodes.length, embedded: 0, skipped: 0 });
    try {
      for (let i = 0; i < nodes.length; i += BATCH) {
        const batch = nodes.slice(i, i + BATCH).map((n) => ({
          node_id: n.id,
          label: (n.label ?? "").slice(0, 2000),
          text: nodeText(n),
        }));
        const res = await embedNodesBatch({ data: { items: batch } });
        setProgress((p) => ({
          done: Math.min(nodes.length, i + BATCH),
          total: nodes.length,
          embedded: p.embedded + res.embedded,
          skipped: p.skipped + res.skipped,
        }));
      }
      toast.success("Embeddings rebuilt");
      embeddingStats().then(setStats).catch(() => undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-bg text-white font-sora p-8 max-w-2xl mx-auto">
      <Link to="/" className="text-[10px] font-mono uppercase tracking-widest text-muted-text hover:text-white">
        ← Back
      </Link>
      <h1 className="text-2xl font-light mt-6 mb-2">Admin · AI index</h1>
      <p className="text-sm text-muted-text mb-8">
        Rebuild the semantic search index for every node in your graph. Only users granted the{" "}
        <code className="font-mono">admin</code> role can run this.
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
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Graph nodes" value={graph?.nodes.length ?? "…"} />
            <Stat label="Indexed" value={stats?.count ?? "…"} />
            <Stat label="Model" value="text-embedding-3-small" mono />
          </div>

          <button
            type="button"
            onClick={run}
            disabled={running || !graph}
            className="w-full py-3 bg-neon-primary text-obsidian-bg font-semibold text-xs uppercase tracking-widest rounded disabled:opacity-50"
          >
            {running ? `Embedding ${progress.done}/${progress.total}…` : "Rebuild embeddings"}
          </button>

          {running || progress.done > 0 ? (
            <div className="text-xs font-mono text-muted-text space-y-1">
              <div>done: {progress.done}/{progress.total}</div>
              <div>embedded (new/changed): {progress.embedded}</div>
              <div>skipped (unchanged): {progress.skipped}</div>
            </div>
          ) : null}

          <p className="text-[11px] text-muted-text leading-relaxed">
            Not an admin yet? Grant yourself the role once by inserting a row in <code className="font-mono">user_roles</code> with your user id and role <code className="font-mono">admin</code>.
          </p>

          <div className="pt-4 border-t border-obsidian-border">
            <Link
              to="/admin/images"
              className="inline-block px-3 py-2 border border-obsidian-border text-xs font-mono uppercase tracking-widest rounded hover:bg-white/5"
            >
              → Bulk image upload
            </Link>
            <Link
              to="/admin/scrape"
              className="ml-2 inline-block px-3 py-2 border border-obsidian-border text-xs font-mono uppercase tracking-widest rounded hover:bg-white/5"
            >
              → Logo scraper
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="p-4 bg-obsidian-surface border border-obsidian-border rounded">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text">{label}</div>
      <div className={`text-lg mt-1 ${mono ? "font-mono text-sm" : ""}`}>{value}</div>
    </div>
  );
}