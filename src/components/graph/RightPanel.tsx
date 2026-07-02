import { useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { DetailPanel } from "./DetailPanel";
import { NotesPanel } from "./NotesPanel";
import { AskPanel } from "./AskPanel";

type Tab = "info" | "notes" | "ask";

export function RightPanel({ graph }: { graph: NormalizedGraph }) {
  const [tab, setTab] = useState<Tab>("info");
  const open = useGraphStore((s) => s.rightPanelOpen);
  const setOpen = useGraphStore((s) => s.setRightPanel);
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
        className={`fixed md:relative z-40 top-0 right-0 h-full w-[92vw] max-w-sm md:w-80 lg:w-96 border-l border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 transform-gpu will-change-transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:shadow-none shadow-2xl md:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
      <div className="flex border-b border-obsidian-border shrink-0">
        {(["info", "notes", "ask"] as const).map((t) => (
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
            {t === "info" ? "Info" : t === "notes" ? "Notes" : "Ask AI"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
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
      </div>
      </aside>
    </>
  );
}