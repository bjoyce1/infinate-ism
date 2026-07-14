import { useEffect, useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { DetailPanel } from "./DetailPanel";
import { NotesPanel } from "./NotesPanel";
import { AskPanel } from "./AskPanel";
import { CapismHud } from "./CapismPanel";
import { StreetControlsPanel } from "./StreetControlsPanel";
import { ResizeHandle } from "./ResizeHandle";
import { useIsDesktop } from "@/hooks/useIsDesktop";

type Tab = "map" | "info" | "notes" | "ask" | "capism";

export function RightPanel({ graph }: { graph: NormalizedGraph }) {
  const [tab, setTab] = useState<Tab>("info");
  const open = useGraphStore((s) => s.rightPanelOpen);
  const setOpen = useGraphStore((s) => s.setRightPanel);
  const width = useGraphStore((s) => s.rightPanelWidth);
  const setWidth = useGraphStore((s) => s.setRightPanelWidth);
  const viewMode = useGraphStore((s) => s.viewMode);
  const isDesktop = useIsDesktop();
  const isStreet = viewMode === "street";

  // When entering Street view, jump to the Map tab and open the panel.
  useEffect(() => {
    if (isStreet) {
      setTab("map");
      setOpen(true);
    } else if (tab === "map") {
      setTab("info");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreet]);

  const tabs: Tab[] = isStreet
    ? ["map", "info", "notes", "ask", "capism"]
    : ["info", "notes", "ask", "capism"];

  const labelFor = (t: Tab) =>
    t === "map" ? "Map" :
    t === "info" ? "Info" :
    t === "notes" ? "Notes" :
    t === "ask" ? "Ask AI" :
    "◈ HUD";

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close panel"
          onClick={() => setOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-fade-in"
        />
      )}
      <aside
        style={isDesktop ? { width } : undefined}
        className={`fixed md:relative z-40 top-0 right-0 h-full w-[92vw] max-w-sm border-l border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:shadow-none shadow-2xl md:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
      <ResizeHandle side="right" width={width} onChange={setWidth} min={260} max={640} />
      <div className="flex border-b border-obsidian-border shrink-0">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-[10px] font-mono uppercase tracking-widest transition-colors ${
              tab === t
                ? "text-neon-primary border-b-2 border-neon-primary bg-white/[0.02]"
                : "text-muted-text hover:text-white"
            }`}
          >
            {labelFor(t)}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "map" && (
          <div className="h-full overflow-y-auto">
            <StreetControlsPanel graph={graph} />
          </div>
        )}
        {tab === "info" && (
          <div className="h-full overflow-y-auto">
            <DetailPanel graph={graph} />
          </div>
        )}
        {tab === "notes" && (
          <div className="h-full overflow-y-auto">
            <NotesPanel graph={graph} />
          </div>
        )}
        {tab === "ask" && <AskPanel graph={graph} />}
        {tab === "capism" && <CapismHud graph={graph} />}
      </div>
      </aside>
    </>
  );
}