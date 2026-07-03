import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadGraph } from "@/lib/graph/loadGraph";
import type { NormalizedGraph, GraphNode } from "@/lib/graph/types";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/images")({
  head: () => ({
    meta: [
      { title: "Admin — Bulk image upload" },
      { name: "description", content: "Upload multiple artist and single cover images at once and map them to graph nodes." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BulkImagesPage,
});

type Assignment = {
  file: File;
  previewUrl: string;
  nodeId: string | ""; // "" = skip
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "");
}

function autoMatch(fileName: string, nodes: GraphNode[]): string {
  const key = normalize(fileName);
  if (!key) return "";
  // 1. exact id match
  let hit = nodes.find((n) => normalize(n.id) === key);
  if (hit) return hit.id;
  // 2. exact label match
  hit = nodes.find((n) => normalize(n.label ?? "") === key);
  if (hit) return hit.id;
  // 3. contains
  hit = nodes.find((n) => key.includes(normalize(n.id)) || normalize(n.id).includes(key));
  if (hit) return hit.id;
  hit = nodes.find((n) => {
    const l = normalize(n.label ?? "");
    return l && (key.includes(l) || l.includes(key));
  });
  return hit?.id ?? "";
}

function BulkImagesPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [graph, setGraph] = useState<NormalizedGraph | null>(null);
  const [items, setItems] = useState<Assignment[]>([]);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  useEffect(() => {
    loadGraph().then(setGraph).catch((e) => toast.error(String(e)));
    return () => {
      items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodeOptions = useMemo(() => {
    if (!graph) return [] as GraphNode[];
    const f = filter.trim().toLowerCase();
    const sorted = [...graph.nodes].sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
    if (!f) return sorted;
    return sorted.filter((n) =>
      (n.label ?? "").toLowerCase().includes(f) || n.id.toLowerCase().includes(f),
    );
  }, [graph, filter]);

  const addFiles = (files: FileList | File[]) => {
    if (!graph) return;
    const nodes = graph.nodes;
    const next: Assignment[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      next.push({
        file: f,
        previewUrl: URL.createObjectURL(f),
        nodeId: autoMatch(f.name, nodes),
        status: "pending",
      });
    }
    setItems((prev) => [...prev, ...next]);
  };

  const setNodeFor = (idx: number, id: string) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, nodeId: id } : it)));

  const removeAt = (idx: number) =>
    setItems((prev) => {
      URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });

  const uploadAll = async () => {
    if (!items.length) return;
    setRunning(true);
    let ok = 0;
    let fail = 0;
    let skipped = 0;
    const updated: Assignment[] = [...items];
    for (let i = 0; i < updated.length; i++) {
      const it = updated[i];
      if (!it.nodeId) {
        skipped += 1;
        continue;
      }
      if (it.status === "done") continue;
      updated[i] = { ...it, status: "uploading" };
      setItems([...updated]);
      try {
        const ext = it.file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${it.nodeId}/${Date.now()}.${ext}`;
        const up = await supabase.storage
          .from("node-images")
          .upload(path, it.file, { upsert: true, contentType: it.file.type });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("node-images").getPublicUrl(path);
        const url = pub.publicUrl;
        const { data: userRes } = await supabase.auth.getUser();
        const upsert = await supabase
          .from("node_image_overrides")
          .upsert({ node_id: it.nodeId, image_url: url, updated_by: userRes.user?.id ?? null });
        if (upsert.error) throw upsert.error;
        updated[i] = { ...it, status: "done", message: url };
        ok += 1;
      } catch (err) {
        updated[i] = {
          ...it,
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
        fail += 1;
      }
      setItems([...updated]);
    }
    setRunning(false);
    toast[fail ? "warning" : "success"](
      `Uploaded ${ok} · ${fail} failed · ${skipped} skipped (no node assigned)`,
    );
  };

  const clearDone = () =>
    setItems((prev) => {
      prev.filter((i) => i.status === "done").forEach((i) => URL.revokeObjectURL(i.previewUrl));
      return prev.filter((i) => i.status !== "done");
    });

  return (
    <div className="min-h-screen bg-obsidian-bg text-white font-sora p-6 md:p-8 max-w-5xl mx-auto">
      <Link to="/admin" className="text-[10px] font-mono uppercase tracking-widest text-muted-text hover:text-white">
        ← Admin
      </Link>
      <h1 className="text-2xl font-light mt-6 mb-2">Bulk image upload</h1>
      <p className="text-sm text-muted-text mb-6">
        Drop multiple images to update artist portraits, single covers, or any node artwork in one pass.
        Filenames are auto-matched to node ids/labels — review each row before uploading.
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
        <>
          <label
            htmlFor="bulk-files"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="block border-2 border-dashed border-obsidian-border rounded p-8 text-center text-sm text-muted-text cursor-pointer hover:border-neon-primary/60 transition"
          >
            <div className="text-xs font-mono uppercase tracking-widest mb-2">Drop images here</div>
            <div>or click to browse — PNG, JPG, WEBP, GIF, SVG</div>
            <input
              id="bulk-files"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {items.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter node dropdown…"
                className="flex-1 min-w-[200px] bg-obsidian-surface border border-obsidian-border rounded px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={uploadAll}
                disabled={running}
                className="px-4 py-2 bg-neon-primary text-obsidian-bg text-xs font-semibold uppercase tracking-widest rounded disabled:opacity-50"
              >
                {running ? "Uploading…" : `Upload ${items.filter((i) => i.status !== "done" && i.nodeId).length}`}
              </button>
              <button
                type="button"
                onClick={clearDone}
                disabled={running}
                className="px-3 py-2 border border-obsidian-border text-xs font-mono uppercase tracking-widest rounded"
              >
                Clear done
              </button>
            </div>
          )}

          <div className="mt-6 space-y-2">
            {items.map((it, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-2 bg-obsidian-surface border border-obsidian-border rounded"
              >
                <img
                  src={it.previewUrl}
                  alt=""
                  className="w-14 h-14 object-cover rounded bg-black/40"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono truncate">{it.file.name}</div>
                  <select
                    value={it.nodeId}
                    onChange={(e) => setNodeFor(idx, e.target.value)}
                    disabled={running || it.status === "done"}
                    className="mt-1 w-full bg-obsidian-bg border border-obsidian-border rounded px-2 py-1 text-xs"
                  >
                    <option value="">— skip —</option>
                    {nodeOptions.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label} · {n.id}
                      </option>
                    ))}
                  </select>
                  {it.message && (
                    <div
                      className={`mt-1 text-[10px] font-mono truncate ${
                        it.status === "error" ? "text-red-400" : "text-muted-text"
                      }`}
                      title={it.message}
                    >
                      {it.message}
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text w-20 text-right">
                  {it.status}
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  disabled={running}
                  className="text-muted-text hover:text-white text-lg px-2"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <p className="mt-8 text-[11px] text-muted-text leading-relaxed">
            Uploads are stored in the <code className="font-mono">node-images</code> bucket and mapped in{" "}
            <code className="font-mono">node_image_overrides</code>. The graph merges these overrides on load, so
            new images appear on the next refresh without redeploying <code className="font-mono">graph.json</code>.
          </p>
        </>
      )}
    </div>
  );
}