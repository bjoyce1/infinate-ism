import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOverview } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtChicagoNow, fmtRelative } from "@/lib/commandCenter/format";

export const Route = createFileRoute("/today")({
  head: () => ({ meta: [{ title: "Today — C.A.P.I.S.M." }, { name: "description", content: "Your executive day — priorities, meetings, follow-ups, and the shape of the next 24 hours." }] }),
  component: TodayView,
});

function TodayView() {
  const fetchOverview = useServerFn(getOverview);
  const [data, setData] = useState<Awaited<ReturnType<typeof getOverview>> | null>(null);
  useEffect(() => { fetchOverview({ data: undefined as never }).then(setData); }, [fetchOverview]);
  const { date, time } = fmtChicagoNow();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader eyebrow={`${date} · ${time} CT`} title="Today" description="One calm briefing. Everything that matters between now and midnight." />
      <div className="grid gap-4 lg:grid-cols-2">
        <CCPanel title="Do Today" subtitle="Priorities the day is built around">
          {(data?.dueToday.length ?? 0) === 0 ? (
            <CCEmpty title="No fixed priorities yet." hint="Create today's tasks from Quick Create (⌘⇧N)." />
          ) : (
            <ul className="divide-y divide-cc-border">
              {data!.dueToday.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className="size-1.5 rounded-full bg-cc-gold" />
                  <span className="min-w-0 flex-1 truncate text-cc-text">{t.title}</span>
                  <CCTag>{t.priority}</CCTag>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>
        <CCPanel title="Waiting on Others" subtitle="Follow-ups you're expecting">
          {(data?.followups.length ?? 0) === 0 ? (
            <CCEmpty title="Nothing outstanding." hint="Follow-ups appear here when tasks or emails go silent." />
          ) : (
            <ul className="divide-y divide-cc-border">
              {data!.followups.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className="size-1.5 rounded-full bg-cc-cyan" />
                  <span className="min-w-0 flex-1 truncate text-cc-text">{f.title}</span>
                  <span className="shrink-0 font-mono text-[10px] text-cc-muted">{fmtRelative(f.due_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CCPanel title="Overdue · Recover Fast">
          {(data?.overdue.length ?? 0) === 0 ? <CCEmpty title="Zero overdue. Executive." /> : (
            <ul className="divide-y divide-cc-border">
              {data!.overdue.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className="size-1.5 rounded-full bg-cc-crimson" />
                  <span className="min-w-0 flex-1 truncate text-cc-text">{t.title}</span>
                  <CCTag accent="var(--cc-crimson)">{t.due_date}</CCTag>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>
        <CCPanel title="Inbox · Actionable">
          {(data?.comms.length ?? 0) === 0 ? <CCEmpty title="Inbox is empty." /> : (
            <ul className="divide-y divide-cc-border">
              {data!.comms.slice(0, 6).map((c) => (
                <li key={c.id} className="py-2 text-[13px]">
                  <div className="truncate font-medium text-cc-text">{c.subject ?? c.sender}</div>
                  <div className="truncate text-[11px] text-cc-muted">{c.snippet}</div>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>
      </div>
    </div>
  );
}