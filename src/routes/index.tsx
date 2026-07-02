import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { loadGraph } from "@/lib/graph/loadGraph";
import type { NormalizedGraph } from "@/lib/graph/types";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { GraphCanvas3D } from "@/components/graph/GraphCanvas3D";
import { LeftSidebar } from "@/components/graph/LeftSidebar";
import { RightPanel } from "@/components/graph/RightPanel";
import { TopBar } from "@/components/graph/TopBar";
import { SearchCommand } from "@/components/graph/SearchCommand";
import { HubHoverCard } from "@/components/graph/HubHoverCard";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { useSwipeGestures } from "@/hooks/useSwipeGestures";

const searchSchema = z.object({
  view: fallback(z.enum(["2d", "3d"]), "2d").default("2d"),
  node: fallback(z.string(), "").default(""),
  focus: fallback(z.coerce.boolean(), false).default(false),
});

export const Route = createFileRoute("/")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Mnemosyne — Second Brain" },
      { name: "description", content: "Explore your knowledge graph as a dark constellation of notes, code, blogs, and art." },
      { property: "og:title", content: "Mnemosyne — Second Brain" },
      { property: "og:description", content: "Explore your knowledge graph as a dark constellation of notes, code, blogs, and art." },
    ],
  }),
  component: Index,
});

function Index() {
  const [graph, setGraph] = useState<NormalizedGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  useSwipeGestures();
  const viewMode = useGraphStore((s) => s.viewMode);
  const selectedId = useGraphStore((s) => s.selectedId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleViewMode = useGraphStore((s) => s.toggleViewMode);
  const select = useGraphStore((s) => s.select);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  useEffect(() => {
    let cancelled = false;
    loadGraph()
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate store from URL once graph is loaded.
  useEffect(() => {
    if (!graph) return;
    if (search.view !== viewMode) toggleViewMode();
    if (search.node && graph.byId.has(search.node) && search.node !== selectedId) {
      select(search.node);
    }
    if (search.focus && !focusMode && search.node && graph.byId.has(search.node)) {
      toggleFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Sync store back to URL.
  useEffect(() => {
    if (!graph) return;
    const next = {
      view: viewMode,
      node: selectedId ?? "",
      focus: focusMode,
    };
    if (next.view === search.view && next.node === search.node && next.focus === search.focus) return;
    navigate({ search: next, replace: true });
  }, [viewMode, selectedId, focusMode, graph, search.view, search.node, search.focus, navigate]);

  if (error) {
    return (
      <div className="h-screen w-full bg-obsidian-bg text-white grid place-items-center font-mono text-xs">
        Failed to load graph: {error}
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="h-screen w-full bg-obsidian-bg text-white grid place-items-center gap-3">
        <div className="flex flex-col items-center gap-3">
          <div className="size-2 rounded-full bg-neon-primary shadow-[0_0_12px_#3DED97] animate-pulse" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-text">
            Loading constellation…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-obsidian-bg text-white font-sora flex overflow-hidden">
      <LeftSidebar graph={graph} />
      <main className="flex-1 relative bg-[radial-gradient(circle_at_center,_#161618_0%,_#0A0A0B_100%)]">
        {viewMode === "2d" ? <GraphCanvas graph={graph} /> : <GraphCanvas3D graph={graph} />}
        <TopBar />
        <HubHoverCard graph={graph} />
      </main>
      <RightPanel graph={graph} />
      <SearchCommand graph={graph} />
    </div>
  );
}
