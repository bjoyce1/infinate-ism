import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { loadGraph, withCaptures } from "@/lib/graph/loadGraph";
import { withSwishahouse } from "@/lib/graph/swishahouseExtras";
import { withScrewedUpClick } from "@/lib/graph/screwedUpClickExtras";
import type { NormalizedGraph } from "@/lib/graph/types";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { GraphCanvas3D } from "@/components/graph/GraphCanvas3D";
import { StreetMapCanvas } from "@/components/graph/StreetMapCanvas";
import { LeftSidebar } from "@/components/graph/LeftSidebar";
import { RightPanel } from "@/components/graph/RightPanel";
import { TopBar } from "@/components/graph/TopBar";
import { InfiniteIsmHud } from "@/components/graph/InfiniteIsmHud";
import { SearchCommand } from "@/components/graph/SearchCommand";
import { HubHoverCard } from "@/components/graph/HubHoverCard";
import { BootGreeting } from "@/components/graph/BootGreeting";
import { listMyCaptures } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { useSwipeGestures } from "@/hooks/useSwipeGestures";

const searchSchema = z.object({
  view: fallback(z.enum(["2d", "3d", "street"]), "2d").default("2d"),
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
      { property: "og:url", content: "https://infinate-ism.lovable.app/" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/554faf89-68c2-49e1-a105-48f2ec3cd563" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/554faf89-68c2-49e1-a105-48f2ec3cd563" },
    ],
    links: [{ rel: "canonical", href: "https://infinate-ism.lovable.app/" }],
  }),
  component: Index,
});

function Index() {
  const [baseGraph, setBaseGraph] = useState<NormalizedGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  useSwipeGestures();
  const viewMode = useGraphStore((s) => s.viewMode);
  const selectedId = useGraphStore((s) => s.selectedId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const setViewMode = useGraphStore((s) => s.setViewMode);
  const select = useGraphStore((s) => s.select);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const captures = useGraphStore((s) => s.captures);
  const setCaptures = useGraphStore((s) => s.setCaptures);

  const graph = useMemo(
    () => (baseGraph ? withScrewedUpClick(withSwishahouse(withCaptures(baseGraph, captures))) : null),
    [baseGraph, captures],
  );

  useEffect(() => {
    let cancelled = false;
    loadGraph()
      .then((g) => {
        if (!cancelled) setBaseGraph(g);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load user's captures whenever signed-in state changes.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (!cancelled) setCaptures([]);
          return;
        }
        const res = await listMyCaptures();
        if (!cancelled) setCaptures(res.captures);
      } catch {
        if (!cancelled) setCaptures([]);
      }
    };
    void pull();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void pull();
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [setCaptures]);

  // Hydrate store from URL once graph is loaded.
  useEffect(() => {
    if (!graph) return;
    if (search.view !== viewMode) setViewMode(search.view);
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
      <h1 className="sr-only">Mnemosyne — Explore Your Second Brain</h1>
      <LeftSidebar graph={graph} />
      <main className="flex-1 relative bg-[#050508]">
        {/* Ambient violet haze — matches Command Constellation */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(139,123,255,0.10) 0%, rgba(5,5,8,0) 55%)",
          }}
        />
        {viewMode === "2d" && <GraphCanvas graph={graph} />}
        {viewMode === "3d" && <GraphCanvas3D graph={graph} />}
        {viewMode === "street" && <StreetMapCanvas graph={graph} />}
        {viewMode === "3d" ? <InfiniteIsmHud graph={graph} /> : <TopBar graph={graph} />}
        <HubHoverCard graph={graph} />
      </main>
      <RightPanel graph={graph} />
      <SearchCommand graph={graph} />
      <BootGreeting graph={graph} />
    </div>
  );
}
