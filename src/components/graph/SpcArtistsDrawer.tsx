import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { GraphNode, NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";

type SpcNode = GraphNode & {
  tags?: string[];
  real_name?: string;
  location?: string;
  role?: string;
  release_count?: number;
  image?: string;
};

type SortMode = "az" | "za" | "degree" | "releases";

export function SpcArtistsDrawer({ graph }: { graph: NormalizedGraph }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("az");

  const select = useGraphStore((s) => s.select);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const setRightPanel = useGraphStore((s) => s.setRightPanel);
  const pulseNode = useGraphStore((s) => s.pulseNode);

  const artists = useMemo<SpcNode[]>(
    () => graph.nodes.filter((n) => n.id.startsWith("spc_artist_")) as SpcNode[],
    [graph.nodes],
  );

  const tagCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of artists) {
      for (const t of a.tags ?? []) c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [artists]);

  const topTags = useMemo(
    () =>
      Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([t]) => t),
    [tagCounts],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = artists.slice();
    if (activeTag) list = list.filter((a) => (a.tags ?? []).includes(activeTag));
    if (needle) {
      list = list.filter((a) => {
        const hay = [
          a.label,
          a.real_name,
          a.location,
          a.role,
          (a.tags ?? []).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
    }
    list.sort((a, b) => {
      if (sort === "az") return a.label.localeCompare(b.label);
      if (sort === "za") return b.label.localeCompare(a.label);
      if (sort === "degree") return b.degree - a.degree;
      if (sort === "releases") return (b.release_count ?? 0) - (a.release_count ?? 0);
      return 0;
    });
    return list;
  }, [artists, q, activeTag, sort]);

  const flyTo = (id: string) => {
    select(id);
    if (!focusMode) toggleFocus();
    setRightPanel(true);
    pulseNode(id);
    setTimeout(() => pulseNode(null), 2500);
    setOpen(false);
  };

  const SORTS: { id: SortMode; label: string }[] = [
    { id: "az", label: "A→Z" },
    { id: "za", label: "Z→A" },
    { id: "degree", label: "Links" },
    { id: "releases", label: "Releases" },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="px-3 sm:px-4 py-2 bg-obsidian-surface border border-fuchsia-400/40 rounded-lg text-[10px] sm:text-xs font-medium text-fuchsia-200 hover:bg-fuchsia-400/10 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
          title="Browse & filter SPC artists"
        >
          <Users className="size-3.5" />
          <span className="hidden sm:inline">SPC ARTISTS</span>
          <span className="font-mono text-[10px] text-fuchsia-300/80">{artists.length}</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="bg-obsidian-surface border-l border-obsidian-border text-white w-[92vw] sm:max-w-md p-0 flex flex-col"
      >
        <SheetHeader className="p-5 border-b border-obsidian-border">
          <SheetTitle className="flex items-center gap-2 text-white">
            <Users className="size-4 text-fuchsia-300" />
            SPC Artists
            <span className="font-mono text-[10px] text-muted-text">
              {rows.length} / {artists.length}
            </span>
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-text">
            South Park Coalition constellation. Search, filter, and jump straight to an artist's star.
          </SheetDescription>

          <div className="mt-3 flex items-center gap-2 bg-white/5 border border-obsidian-border rounded-lg px-2.5 py-1.5">
            <Search className="size-3.5 text-muted-text" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search artists, aliases, tags…"
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

          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-text mr-1">
              Sort
            </span>
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSort(s.id)}
                className={`px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-widest transition-colors ${
                  sort === s.id
                    ? "bg-white/10 border-white/30 text-white"
                    : "border-obsidian-border text-muted-text hover:bg-white/5"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {topTags.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-text mr-1">
                Tag
              </span>
              {topTags.map((t) => {
                const active = activeTag === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTag(active ? null : t)}
                    className={`px-2 py-0.5 rounded-full border text-[10px] font-mono transition-colors ${
                      active
                        ? "bg-fuchsia-400/20 border-fuchsia-300/60 text-fuchsia-100"
                        : "border-obsidian-border text-muted-text hover:bg-white/5"
                    }`}
                  >
                    {t}
                    <span className="opacity-60 ml-1">{tagCounts[t]}</span>
                  </button>
                );
              })}
              {activeTag && (
                <button
                  type="button"
                  onClick={() => setActiveTag(null)}
                  className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-text hover:text-white"
                >
                  clear
                </button>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-text font-mono">
              No SPC artists match that filter.
            </div>
          ) : (
            rows.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => flyTo(a.id)}
                className="w-full text-left group p-3 rounded-lg border border-obsidian-border bg-white/[0.02] hover:border-fuchsia-400/50 hover:bg-fuchsia-400/[0.05] transition-colors cursor-pointer flex items-start gap-3"
              >
                {a.image ? (
                  <img
                    src={a.image}
                    alt=""
                    loading="lazy"
                    className="size-10 rounded-md object-cover shrink-0 border border-obsidian-border"
                  />
                ) : (
                  <div className="size-10 rounded-md shrink-0 border border-obsidian-border bg-fuchsia-500/10 grid place-items-center text-[10px] font-mono text-fuchsia-300">
                    {a.label.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium truncate group-hover:text-fuchsia-200">
                      {a.label}
                    </span>
                    <span className="text-[10px] font-mono text-muted-text shrink-0">
                      deg {a.degree}
                    </span>
                  </div>
                  {(a.real_name || a.location) && (
                    <div className="text-[11px] text-white/60 truncate">
                      {[a.real_name, a.location].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  {a.tags && a.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {a.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] font-mono uppercase tracking-wide text-fuchsia-300/70 border border-fuchsia-400/20 rounded-full px-1.5 py-0.5"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}