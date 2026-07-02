import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS, isTsSourceNode } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { semanticSearch } from "@/lib/ai.functions";

export function SearchCommand({ graph }: { graph: NormalizedGraph }) {
  const open = useGraphStore((s) => s.searchOpen);
  const setOpen = useGraphStore((s) => s.setSearchOpen);
  const select = useGraphStore((s) => s.select);
  const [q, setQ] = useState("");
  const includeCode = useGraphStore((s) => s.includeTsFiles);
  const setIncludeCode = useGraphStore((s) => s.setIncludeTsFiles);
  const hideCode = useGraphStore((s) => s.hideCode);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [semantic, setSemantic] = useState(false);
  const [semResults, setSemResults] = useState<GraphNode[]>([]);
  const [semBusy, setSemBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isTsNode = (n: GraphNode) => isTsSourceNode(n);

  const getType = (n: GraphNode): string => {
    const ft = (n as GraphNode & { file_type?: string }).file_type;
    return (ft && String(ft).toLowerCase()) || n.category || "other";
  };

  const typeCounts = useMemo(() => {
    let base = includeCode ? graph.nodes : graph.nodes.filter((n) => !isTsNode(n));
    if (hideCode) base = base.filter((n) => n.category !== "code");
    const c: Record<string, number> = {};
    for (const n of base) {
      const t = getType(n);
      c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [graph.nodes, includeCode, hideCode]);

  const CHIPS = ["code", "music", "blog", "other"] as const;

  const searchPool = useMemo(() => {
    let pool = includeCode ? graph.nodes : graph.nodes.filter((n) => !isTsNode(n));
    if (hideCode) pool = pool.filter((n) => n.category !== "code");
    if (activeTypes.size > 0) {
      pool = pool.filter((n) => activeTypes.has(getType(n)));
    }
    return pool;
  }, [graph.nodes, includeCode, hideCode, activeTypes]);

  const fuse = useMemo(
    () => new Fuse(searchPool, { keys: ["label", "source_file"], threshold: 0.4, ignoreLocation: true }),
    [searchPool],
  );

  const excludedCount = graph.nodes.length - searchPool.length;

  const results = useMemo<GraphNode[]>(() => {
    if (semantic && q.trim()) return semResults;
    if (!q.trim()) return searchPool.slice().sort((a, b) => b.degree - a.degree).slice(0, 20);
    return fuse.search(q, { limit: 30 }).map((r) => r.item);
  }, [q, fuse, searchPool, semantic, semResults]);

  // Debounced semantic search.
  useEffect(() => {
    if (!semantic || !q.trim()) {
      setSemResults([]);
      return;
    }
    setSemBusy(true);
    const handle = setTimeout(() => {
      semanticSearch({ data: { query: q, limit: 20 } })
        .then((res) => {
          const mapped = res.results
            .map((r) => graph.byId.get(r.node_id))
            .filter((n): n is GraphNode => Boolean(n));
          setSemResults(mapped);
        })
        .catch((err) => console.warn("[semanticSearch]", err))
        .finally(() => setSemBusy(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [q, semantic, graph.byId]);

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

  const toggleType = (t: string) =>
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

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
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={semantic}
              onChange={(e) => setSemantic(e.target.checked)}
              className="accent-neon-primary cursor-pointer"
            />
            <span className="text-[10px] font-mono uppercase tracking-widest text-neon-primary">
              ✨ Semantic
            </span>
          </label>
          <span className="text-[10px] font-mono text-muted-text">
            {includeCode
              ? `${searchPool.length} indexed`
              : `${searchPool.length} indexed · ${excludedCount} hidden`}
          </span>
        </div>
        <div className="px-4 py-2 border-b border-obsidian-border flex items-center gap-2 flex-wrap bg-white/[0.01]">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-text mr-1">
            Type
          </span>
          {CHIPS.map((t) => {
            const active = activeTypes.has(t);
            const count = typeCounts[t] ?? 0;
            const color = CATEGORY_COLORS[t as keyof typeof CATEGORY_COLORS] ?? "#8E9196";
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                disabled={count === 0}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  active
                    ? "bg-white/10 border-white/30 text-white"
                    : "border-obsidian-border text-muted-text hover:bg-white/5"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {t}
                <span className="opacity-60">{count}</span>
              </button>
            );
          })}
          {activeTypes.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveTypes(new Set())}
              className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-text hover:text-white"
            >
              clear
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {semantic && semBusy && (
            <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-text">
              ✨ embedding query…
            </div>
          )}
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