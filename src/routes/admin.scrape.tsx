import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { loadGraph } from "@/lib/graph/loadGraph";
import type { NormalizedGraph, GraphNode } from "@/lib/graph/types";
import { scrapeSiteLogo, scrapeAndAssignLogo } from "@/lib/scrape.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/scrape")({
  head: () => ({
    meta: [
      { title: "Admin — Logo scraper" },
      { name: "description", content: "Scrape a website for its logo with retries and fallbacks, then pin it to a graph node." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ScrapePage,
});

type Attempt = { url: string; source: string; ok: boolean; status?: number; reason?: string };
type Result = {
  url: string | null;
  source: string | null;
  title: string | null;
  description: string | null;
  candidates: Attempt[];
  assigned?: boolean;
};

function ScrapePage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [graph, setGraph] = useState<NormalizedGraph | null>(null);
  const [url, setUrl] = useState("");
  const [nodeFilter, setNodeFilter] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [busy, setBusy] = useState<"idle" | "scraping" | "assigning">("idle");
  const [result, setResult] = useState<Result | null>(null);

  const scrapeFn = useServerFn(scrapeSiteLogo);
  const assignFn = useServerFn(scrapeAndAssignLogo);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    loadGraph().then(setGraph).catch((e) => toast.error(String(e)));
  }, []);

  const nodeOptions = useMemo(() => {
    if (!graph) return [] as GraphNode[];
    const f = nodeFilter.trim().toLowerCase();
    const sorted = [...graph.nodes].sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
    if (!f) return sorted.slice(0, 200);
    return sorted.filter((n) =>
      (n.label ?? "").toLowerCase().includes(f) || n.id.toLowerCase().includes(f),
    ).slice(0, 200);
  }, [graph, nodeFilter]);

  const doScrape = async () => {
    if (!url) return;
    setBusy("scraping");
    setResult(null);
    try {
      const res = await scrapeFn({ data: { url } });
      setResult(res);
      if (!res.url) toast.warning("No image resolved — all candidates failed.");
      else toast.success(`Logo found via ${res.source}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("idle");
    }
  };

  const doAssign = async () => {
    if (!url || !nodeId) return;
    setBusy("assigning");
    try {
      const res = await assignFn({ data: { url, node_id: nodeId } });
      setResult(res);
      if (res.assigned) toast.success(`Assigned to ${nodeId}`);
      else toast.warning("No image resolved — nothing assigned.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div className="min-h-screen bg-obsidian-bg text-white font-sora p-6 md:p-8 max-w-4xl mx-auto">
      <Link to="/admin" className="text-[10px] font-mono uppercase tracking-widest text-muted-text hover:text-white">
        ← Admin
      </Link>
      <h1 className="text-2xl font-light mt-6 mb-2">Logo scraper</h1>
      <p className="text-sm text-muted-text mb-6">
        Fetch a site with retries, extract the best logo candidate (JSON-LD → icon links → og:image → &lt;img class=logo&gt; → /favicon.ico → Google / DuckDuckGo icon services), verify each candidate is a real image, and optionally mirror it into <code className="font-mono">node-images</code> and pin it to a node.
      </p>

      {signedIn === false && (
        <div className="p-4 bg-white/5 border border-obsidian-border rounded">
          <p className="text-sm mb-3">You must be signed in as an admin.</p>
          <Link to="/auth" className="px-3 py-2 bg-neon-primary text-obsidian-bg text-xs font-semibold uppercase tracking-widest rounded">
            Sign in
          </Link>
        </div>
      )}

      {signedIn && (
        <div className="space-y-4">
          <label className="block">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-1">Target URL</div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-obsidian-surface border border-obsidian-border rounded px-3 py-2 text-sm"
            />
          </label>

          <div className="grid md:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-1">Filter nodes</div>
              <input
                value={nodeFilter}
                onChange={(e) => setNodeFilter(e.target.value)}
                placeholder="k-rino, spc, artist…"
                className="w-full bg-obsidian-surface border border-obsidian-border rounded px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-1">Assign to node</div>
              <select
                value={nodeId}
                onChange={(e) => setNodeId(e.target.value)}
                className="w-full bg-obsidian-surface border border-obsidian-border rounded px-3 py-2 text-sm"
              >
                <option value="">— none (preview only) —</option>
                {nodeOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.label} · {n.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={doScrape}
              disabled={busy !== "idle" || !url}
              className="px-4 py-2 border border-obsidian-border text-xs font-mono uppercase tracking-widest rounded disabled:opacity-50"
            >
              {busy === "scraping" ? "Scraping…" : "Preview"}
            </button>
            <button
              type="button"
              onClick={doAssign}
              disabled={busy !== "idle" || !url || !nodeId}
              className="px-4 py-2 bg-neon-primary text-obsidian-bg text-xs font-semibold uppercase tracking-widest rounded disabled:opacity-50"
            >
              {busy === "assigning" ? "Assigning…" : "Scrape & assign"}
            </button>
          </div>

          {result && (
            <div className="mt-6 p-4 bg-obsidian-surface border border-obsidian-border rounded space-y-3">
              <div className="flex items-start gap-4">
                {result.url ? (
                  <img
                    src={result.url}
                    alt=""
                    className="w-24 h-24 object-contain rounded bg-black/40 border border-obsidian-border"
                  />
                ) : (
                  <div className="w-24 h-24 flex items-center justify-center bg-black/40 border border-obsidian-border rounded text-[10px] font-mono text-muted-text">
                    none
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{result.title ?? "(no title)"}</div>
                  <div className="text-xs text-muted-text truncate">{result.description ?? ""}</div>
                  {result.url && (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-[11px] font-mono text-neon-primary truncate"
                    >
                      {result.url}
                    </a>
                  )}
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mt-1">
                    source: {result.source ?? "—"}
                    {result.assigned ? " · assigned" : ""}
                  </div>
                </div>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-text">
                  Attempts ({result.candidates.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {result.candidates.map((c, i) => (
                    <li
                      key={i}
                      className={`font-mono text-[11px] truncate ${c.ok ? "text-green-400" : "text-red-400/80"}`}
                      title={c.reason ?? ""}
                    >
                      [{c.ok ? "ok" : c.status ?? "err"}] {c.source} → {c.url}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}