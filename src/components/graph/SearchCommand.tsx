import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";

export function SearchCommand({ graph }: { graph: NormalizedGraph }) {
  const open = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const select = useGraphStore((s) => s.select);
  const [q, setQ] = useState("");
  const [includeCode, setIncludeCode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isTsNode = (n: GraphNode) => {
    const l = (n.label ?? "").toLowerCase();
    const s = (n.source_file ?? "").toLowerCase();
    return /\.(ts|tsx)(?:$|[:?#])/.test(l) || /\.(ts|tsx)(?:$|[:?#])/.test(s);
  };

  const searchPool = useMemo(
    () => (includeCode ? graph.nodes : graph.nodes.filter((n) => !isTsNode(n))),
    [graph.nodes, includeCode],
  );

  const fuse = useMemo(
    () => new Fuse(searchPool, { keys: ["label", "source_file"], threshold: 0.4, ignoreLocation: true }),
    [searchPool],
  );

  const excludedCount = graph.nodes.length - searchPool.length;

  const results = useMemo<GraphNode[]>(() => {
    if (!q.trim()) return searchPool.slice().sort((a, b) => b.degree - a.degree).slice(0, 20);
    return fuse.search(q, { limit: 30 }).map((r) => r.item);
  }, [q, fuse, searchPool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
    else setQ("");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-obsidian-bg/70 backdrop-blur-sm grid place-items-start pt-32"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[560px] max-w-[92vw] bg-obsidian-surface border border-obsidian-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-obsidian-border flex items-center gap-3">
          <div className="size-4 border-2 border-muted-text/30 rounded-full" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your mind..."
            className="flex-1 bg-transparent outline-none text-sm font-mono placeholder:text-muted-text/60"
          />
          <span className="text-[10px] font-mono text-muted-text">ESC</span>
        </div>
        <div className="px-4 py-2 border-b border-obsidian-border flex items-center justify-between gap-3 bg-white/[0.02]">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeCode}
              onChange={(e) => setIncludeCode(e.target.checked)}
              className="accent-neon-primary cursor-pointer"
            />
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-text">
              Include .ts / .tsx nodes
            </span>
          </label>
          <span className="text-[10px] font-mono text-muted-text">
            {includeCode
              ? `${searchPool.length} indexed`
              : `${searchPool.length} indexed · ${excludedCount} hidden`}
          </span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {results.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                select(n.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-left cursor-pointer border-b border-obsidian-border/50"
            >
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[n.category] }}
              />
              <span className="text-sm truncate flex-1">{n.label}</span>
              <span className="text-[10px] font-mono text-muted-text">deg {n.degree}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="p-6 text-center text-xs font-mono text-muted-text">no matches</div>
          )}
        </div>
      </div>
    </div>
  );
}