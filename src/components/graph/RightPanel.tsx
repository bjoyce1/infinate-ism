import { useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { DetailPanel } from "./DetailPanel";
import { NotesPanel } from "./NotesPanel";
import { AskPanel } from "./AskPanel";

type Tab = "info" | "notes" | "ask";

export function RightPanel({ graph }: { graph: NormalizedGraph }) {
  const [tab, setTab] = useState<Tab>("info");
  return (
    <aside className="w-96 border-l border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 h-full">
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
  );
}