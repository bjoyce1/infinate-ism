import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listNotes } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtRelative } from "@/lib/commandCenter/format";
import { Button } from "@/components/ui/button";
import { Network } from "lucide-react";

export const Route = createFileRoute("/brain")({
  head: () => ({ meta: [{ title: "Second Brain — C.A.P.I.S.M." }, { name: "description", content: "Notes, captures, prompts, and resources — searchable, connected, alive." }] }),
  component: BrainView,
});

function BrainView() {
  const fetchNotes = useServerFn(listNotes);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof listNotes>>>([]);
  useEffect(() => { fetchNotes({ data: undefined as never }).then(setNotes); }, [fetchNotes]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Second Brain"
        description="The living archive — notes, voice captures, prompts, and reference material."
        actions={<Button asChild className="border border-cc-border bg-black/30 text-cc-text hover:bg-white/[0.04]"><a href="/"><Network className="mr-2 size-4" /> Open Knowledge Graph</a></Button>}
      />
      <CCPanel title="Recent Notes" subtitle={`${notes.length} tracked`}>
        {notes.length === 0 ? <CCEmpty title="No notes yet." hint="Capture from Quick Create or voice." /> : (
          <ul className="divide-y divide-cc-border">
            {notes.slice(0, 40).map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-baseline gap-2">
                  <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-cc-text">{n.title ?? "Untitled"}</div>
                  <span className="shrink-0 font-mono text-[10px] text-cc-muted">{fmtRelative(n.updated_at)}</span>
                </div>
                {n.content && <div className="mt-0.5 line-clamp-2 text-[11px] text-cc-muted">{n.content}</div>}
                {n.tags && n.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {n.tags.slice(0, 5).map((t) => <CCTag key={t}>{t}</CCTag>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CCPanel>
    </div>
  );
}