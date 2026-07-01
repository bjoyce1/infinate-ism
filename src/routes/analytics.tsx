import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Link Analytics · Mnemosyne" },
      {
        name: "description",
        content:
          "Aggregate click counts for every external and mailto link surfaced from the Mnemosyne graph.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnalyticsPage,
});

type ClickRow = {
  url: string;
  link_type: string;
  node_id: string;
  node_label: string | null;
  node_category: string | null;
  clicked_at: string;
};

type Aggregate = {
  url: string;
  link_type: string;
  node_id: string;
  node_label: string | null;
  node_category: string | null;
  count: number;
  lastClickedAt: string;
};

function AnalyticsPage() {
  const [rows, setRows] = useState<ClickRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "external_link" | "mailto">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("link_clicks")
        .select("url, link_type, node_id, node_label, node_category, clicked_at")
        .order("clicked_at", { ascending: false })
        .limit(5000);
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as ClickRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (rows ?? []).filter((r) =>
    filter === "all" ? true : r.link_type === filter,
  );

  const byUrl = new Map<string, Aggregate>();
  for (const r of filtered) {
    const existing = byUrl.get(r.url);
    if (existing) {
      existing.count += 1;
      if (r.clicked_at > existing.lastClickedAt)
        existing.lastClickedAt = r.clicked_at;
    } else {
      byUrl.set(r.url, {
        url: r.url,
        link_type: r.link_type,
        node_id: r.node_id,
        node_label: r.node_label,
        node_category: r.node_category,
        count: 1,
        lastClickedAt: r.clicked_at,
      });
    }
  }
  const aggregates = Array.from(byUrl.values()).sort((a, b) => b.count - a.count);
  const total = filtered.length;
  const uniqueUrls = aggregates.length;

  return (
    <div className="min-h-screen bg-obsidian-bg text-white p-8 font-mono">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-light tracking-wide">Link Analytics</h1>
            <p className="text-muted-text text-xs mt-1">
              Clicks on every external + mailto link that visitors opened from the graph.
            </p>
          </div>
          <Link
            to="/"
            className="text-xs uppercase tracking-widest text-neon-primary hover:underline"
          >
            ← Back to graph
          </Link>
        </div>

        <div className="flex gap-2 mb-6">
          {(["all", "external_link", "mailto"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded border text-[10px] uppercase tracking-widest cursor-pointer ${
                filter === k
                  ? "border-neon-primary text-neon-primary bg-neon-primary/10"
                  : "border-obsidian-border text-muted-text hover:border-white/20"
              }`}
            >
              {k.replace("_", " ")}
            </button>
          ))}
          <div className="ml-auto flex gap-6 text-[10px] uppercase tracking-widest text-muted-text items-center">
            <span>
              Total clicks: <span className="text-white">{total}</span>
            </span>
            <span>
              Unique URLs: <span className="text-white">{uniqueUrls}</span>
            </span>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded border border-red-500/40 bg-red-500/10 text-xs text-red-200 mb-6">
            {error}
          </div>
        )}

        {rows === null && !error && (
          <div className="text-xs text-muted-text">Loading…</div>
        )}

        {rows !== null && aggregates.length === 0 && !error && (
          <div className="text-xs text-muted-text border border-obsidian-border rounded p-6 text-center">
            No clicks recorded yet. Open any external or mailto link from a node's detail panel to start collecting data.
          </div>
        )}

        {aggregates.length > 0 && (
          <div className="border border-obsidian-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-muted-text uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">Node</th>
                  <th className="text-left px-4 py-3">URL</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-right px-4 py-3">Clicks</th>
                  <th className="text-right px-4 py-3">Last</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((a, i) => (
                  <tr
                    key={a.url}
                    className="border-t border-obsidian-border hover:bg-white/5"
                  >
                    <td className="px-4 py-3 text-muted-text">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="text-white truncate max-w-[180px]">
                        {a.node_label ?? a.node_id}
                      </div>
                      <div className="text-muted-text text-[10px] truncate max-w-[180px]">
                        {a.node_category ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={a.url}
                        target={a.link_type === "mailto" ? undefined : "_blank"}
                        rel="noreferrer"
                        className="text-neon-primary hover:underline break-all"
                      >
                        {a.url}
                      </a>
                    </td>
                    <td className="px-4 py-3 uppercase text-[10px] tracking-widest text-muted-text">
                      {a.link_type}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-semibold">
                      {a.count}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-text">
                      {new Date(a.lastClickedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}