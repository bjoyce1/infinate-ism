import { useEffect, useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { getNodeNote, upsertNodeNote, summarizeNode } from "@/lib/ai.functions";
import { toast } from "sonner";

export function NotesPanel({ graph }: { graph: NormalizedGraph }) {
  const selectedId = useGraphStore((s) => s.selectedId);
  const node = selectedId ? graph.byId.get(selectedId) : null;
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [note, setNote] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn || !node) return;
    setLoading(true);
    getNodeNote({ data: { node_id: node.id } })
      .then((res) => {
        setNote(res.note?.note ?? "");
        setSummary(res.note?.summary ?? "");
        setTags(res.note?.tags ?? []);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [signedIn, node]);

  if (!node) {
    return (
      <div className="p-8 text-xs text-muted-text font-mono">
        Select a node to add notes and tags.
      </div>
    );
  }

  if (signedIn === false) {
    return (
      <div className="p-8 flex flex-col gap-4 items-start">
        <p className="text-sm text-white/80">Sign in to save AI summaries, tags, and personal notes on any node.</p>
        <Link
          to="/auth"
          className="px-4 py-2 bg-neon-primary text-obsidian-bg text-xs font-semibold uppercase tracking-widest rounded hover:brightness-110"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const save = async (next?: { note?: string; summary?: string; tags?: string[] }) => {
    setSaving(true);
    try {
      await upsertNodeNote({
        data: {
          node_id: node.id,
          note: next?.note ?? note,
          summary: next?.summary ?? summary,
          tags: next?.tags ?? tags,
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const runSummarize = async () => {
    setSummarizing(true);
    try {
      const record = node as Record<string, unknown>;
      const ctx = Object.entries(record)
        .filter(([k, v]) => !["id", "label", "category"].includes(k) && typeof v === "string")
        .slice(0, 12)
        .map(([k, v]) => `${k}: ${String(v).slice(0, 400)}`)
        .join("\n");
      const neighbors = Array.from(graph.neighbors.get(node.id) ?? [])
        .slice(0, 15)
        .map((id) => graph.byId.get(id)?.label ?? id);
      const res = await summarizeNode({
        data: { node_id: node.id, label: node.label, context: ctx, neighbors },
      });
      setSummary(res.summary);
      setTags(res.tags);
      toast.success("AI summary saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarizing(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (!t || tags.includes(t)) return;
    const next = [...tags, t].slice(0, 20);
    setTags(next);
    setTagInput("");
    void save({ tags: next });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-2">Node</div>
        <div className="text-sm break-words">{node.label}</div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text">AI Summary</div>
          <button
            type="button"
            onClick={runSummarize}
            disabled={summarizing || loading}
            className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border border-neon-primary/40 text-neon-primary hover:bg-neon-primary/10 disabled:opacity-50"
          >
            {summarizing ? "thinking…" : "✨ Generate"}
          </button>
        </div>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={() => save({ summary })}
          placeholder="AI-generated 1-2 sentence description"
          rows={3}
          className="w-full bg-obsidian-bg border border-obsidian-border rounded p-2 text-xs outline-none focus:border-white/30"
        />
      </div>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-2">Tags</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((t) => (
            <span
              key={t}
              className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono"
            >
              {t}
              <button
                type="button"
                onClick={() => {
                  const next = tags.filter((x) => x !== t);
                  setTags(next);
                  void save({ tags: next });
                }}
                className="opacity-40 group-hover:opacity-100 hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
            placeholder="add tag…"
            className="flex-1 bg-obsidian-bg border border-obsidian-border rounded px-2 py-1 text-xs font-mono outline-none focus:border-white/30"
          />
          <button
            type="button"
            onClick={addTag}
            className="px-3 py-1 rounded border border-obsidian-border text-[10px] font-mono uppercase tracking-widest hover:bg-white/5"
          >
            add
          </button>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-2">Personal Note</div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => save({ note })}
          placeholder="What do you want to remember about this node?"
          rows={6}
          className="w-full bg-obsidian-bg border border-obsidian-border rounded p-2 text-sm outline-none focus:border-white/30 leading-relaxed"
        />
        <div className="mt-1 text-[10px] font-mono text-muted-text">
          {saving ? "saving…" : "auto-saves on blur"}
        </div>
      </div>
    </div>
  );
}