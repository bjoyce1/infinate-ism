import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listContent } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtRelative } from "@/lib/commandCenter/format";

export const Route = createFileRoute("/content")({
  head: () => ({ meta: [{ title: "Content Intelligence — C.A.P.I.S.M." }, { name: "description", content: "Turn ideas, meetings, and voice notes into a production-grade content pipeline." }] }),
  component: ContentView,
});

type C = Awaited<ReturnType<typeof listContent>>[number];

function ContentView() {
  const fetchContent = useServerFn(listContent);
  const [items, setItems] = useState<C[]>([]);
  useEffect(() => { fetchContent({ data: undefined as never }).then(setItems); }, [fetchContent]);

  const stages: { key: C["stage"]; label: string; accent: string }[] = [
    { key: "idea",       label: "Ideas",      accent: "var(--cc-violet)" },
    { key: "draft",      label: "Drafting",   accent: "var(--cc-gold)" },
    { key: "scheduled",  label: "Scheduled",  accent: "var(--cc-cyan)" },
    { key: "published",  label: "Published",  accent: "var(--cc-emerald)" },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader eyebrow="Signal" title="Content Intelligence" description="Ideas → drafts → scheduled → published. Every voice note becomes a content atom." />
      <div className="grid gap-4 lg:grid-cols-4">
        {stages.map((s) => (
          <CCPanel key={s.key ?? "stage"} title={s.label} subtitle={`${items.filter((i) => i.stage === s.key).length} items`}>
            <ul className="space-y-2">
              {items.filter((i) => i.stage === s.key).map((i) => (
                <li key={i.id} className="rounded-md border border-cc-border bg-black/25 p-2.5">
                  <div className="truncate text-[13px] text-cc-text">{i.title}</div>
                  {i.hook && <div className="mt-0.5 line-clamp-2 text-[11px] text-cc-muted">{i.hook}</div>}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {i.format && <CCTag accent={s.accent}>{i.format}</CCTag>}
                    {(i.platforms ?? []).slice(0, 3).map((p) => <CCTag key={p} accent="var(--cc-cyan)">{p}</CCTag>)}
                  </div>
                  {i.scheduled_for && <div className="mt-1.5 font-mono text-[10px] text-cc-muted">{fmtRelative(i.scheduled_for)}</div>}
                </li>
              ))}
              {items.filter((i) => i.stage === s.key).length === 0 && <CCEmpty title="Empty" />}
            </ul>
          </CCPanel>
        ))}
      </div>
    </div>
  );
}