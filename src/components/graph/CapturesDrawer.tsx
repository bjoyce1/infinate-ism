import { useMemo, useState } from "react";
import { Sparkles, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function CapturesDrawer() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const captures = useGraphStore((s) => s.captures);
  const select = useGraphStore((s) => s.select);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const setRightPanel = useGraphStore((s) => s.setRightPanel);
  const pulseNode = useGraphStore((s) => s.pulseNode);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? captures.filter(
          (c) =>
            c.label.toLowerCase().includes(needle) ||
            (c.note ?? "").toLowerCase().includes(needle),
        )
      : captures.slice();
    // Sort newest first (fallback: last in array = most recent from server order).
    filtered.sort((a, b) => {
      const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
      const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
      return tb - ta;
    });
    return filtered;
  }, [captures, q]);

  const flyTo = (id: string) => {
    select(id);
    if (!focusMode) toggleFocus();
    setRightPanel(true);
    pulseNode(id);
    setTimeout(() => pulseNode(null), 2500);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-amber-400/40 rounded-lg text-[10px] sm:text-xs font-medium text-amber-200 hover:bg-amber-400/10 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
          title="Browse your captured notes"
        >
          <Sparkles className="size-3.5" style={{ color: CATEGORY_COLORS.capture }} />
          <span className="hidden sm:inline">CAPTURES</span>
          <span className="font-mono text-[10px] text-amber-300/80">{captures.length}</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="bg-obsidian-surface border-l border-obsidian-border text-white w-[92vw] sm:max-w-md p-0 flex flex-col"
      >
        <SheetHeader className="p-5 border-b border-obsidian-border">
          <SheetTitle className="flex items-center gap-2 text-white">
            <Sparkles className="size-4" style={{ color: CATEGORY_COLORS.capture }} />
            Captures
            <span className="font-mono text-[10px] text-muted-text">{captures.length} total</span>
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-text">
            Everything you've told ISM to remember. Newest first.
          </SheetDescription>
          <div className="mt-3 flex items-center gap-2 bg-white/5 border border-obsidian-border rounded-lg px-2.5 py-1.5">
            <Search className="size-3.5 text-muted-text" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search captures…"
              className="flex-1 bg-transparent outline-none text-xs placeholder:text-muted-text"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="text-[10px] font-mono text-muted-text hover:text-white cursor-pointer"
              >
                clear
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-text font-mono">
              {captures.length === 0
                ? 'No captures yet. Tell Ask: "remember that…"'
                : "Nothing matches that search."}
            </div>
          ) : (
            rows.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => flyTo(c.id)}
                className="w-full text-left group p-3 rounded-lg border border-obsidian-border bg-white/[0.02] hover:border-amber-400/50 hover:bg-amber-400/[0.05] transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="size-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS.capture }}
                    />
                    <span className="text-sm font-medium truncate group-hover:text-amber-200">
                      {c.label}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-text shrink-0">
                    {timeAgo(c.updated_at)}
                  </span>
                </div>
                {c.note && (
                  <p className="text-[11px] text-white/60 line-clamp-2 pl-3.5">{c.note}</p>
                )}
                <div className="mt-2 pl-3.5 text-[10px] font-mono uppercase tracking-widest text-amber-300/60 opacity-0 group-hover:opacity-100 transition-opacity">
                  → fly to star
                </div>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}