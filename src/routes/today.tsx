import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOverview } from "@/lib/commandCenter.functions";
import { dailyBriefing, enrichCapture, fileCapture, type EnrichmentProposal } from "@/lib/brain.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtChicagoNow, fmtRelative } from "@/lib/commandCenter/format";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, FileCheck2, Clock3, Inbox, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/today")({
  head: () => ({ meta: [{ title: "Today — C.A.P.I.S.M." }, { name: "description", content: "Your executive day — priorities, meetings, follow-ups, and the shape of the next 24 hours." }] }),
  component: TodayView,
});

function TodayView() {
  const fetchOverview = useServerFn(getOverview);
  const fetchBriefing = useServerFn(dailyBriefing);
  const runEnrich = useServerFn(enrichCapture);
  const runFile = useServerFn(fileCapture);
  const [data, setData] = useState<Awaited<ReturnType<typeof getOverview>> | null>(null);
  const [brief, setBrief] = useState<Awaited<ReturnType<typeof dailyBriefing>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    fetchOverview({ data: undefined as never }).then(setData);
    fetchBriefing({ data: undefined as never }).then(setBrief);
  }, [fetchOverview, fetchBriefing]);

  async function enrichAndFile(id: string) {
    setBusy(id);
    try {
      const proposal = (await runEnrich({ data: { captureId: id } })) as EnrichmentProposal;
      await runFile({ data: { captureId: id, proposal } });
      toast.success(`Filed as "${proposal.title}"`);
      setBrief(await fetchBriefing({ data: undefined as never }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const { date, time } = fmtChicagoNow();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader eyebrow={`${date} · ${time} CT`} title="Today" description="One calm briefing. Everything that matters between now and midnight." />

      <div className="mb-4 rounded-xl border border-cc-border bg-gradient-to-br from-cc-panel/80 to-black/50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-cc-violet">Chief of Staff · Morning Memo</div>
            <h2 className="text-lg font-semibold text-cc-text">Daily Briefing</h2>
          </div>
          {brief && <div className="font-mono text-[10px] text-cc-muted">as of {new Date(brief.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>}
        </div>
        {!brief ? (
          <div className="flex items-center gap-2 text-[12px] text-cc-muted"><Loader2 className="size-3 animate-spin" /> Assembling briefing…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <BriefBlock icon={<Inbox className="size-3.5" />} label="New captures · awaiting enrichment" count={brief.newCaptures.length}>
              {brief.newCaptures.length === 0 ? <EmptyLine text="Inbox clear." /> :
                <ul className="space-y-1.5">
                  {brief.newCaptures.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-cc-text">{c.title}</span>
                      <Button size="sm" disabled={busy === c.id} onClick={() => enrichAndFile(c.id)}
                        className="h-6 border border-cc-border bg-black/40 px-2 text-[10px] text-cc-violet hover:bg-white/[0.04]">
                        {busy === c.id ? <Loader2 className="size-3 animate-spin" /> : <><Sparkles className="mr-1 size-3" /> Enrich</>}
                      </Button>
                    </li>
                  ))}
                </ul>}
            </BriefBlock>
            <BriefBlock icon={<FileCheck2 className="size-3.5" />} label="Filed in the last 24h" count={brief.recentPages.length}>
              {brief.recentPages.length === 0 ? <EmptyLine text="No fresh pages yet." /> :
                <ul className="space-y-1.5">
                  {brief.recentPages.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-cc-text">{p.title}</span>
                      <span className="shrink-0 font-mono text-[9px] uppercase text-cc-muted">{p.department ?? p.type}</span>
                    </li>
                  ))}
                </ul>}
            </BriefBlock>
            <BriefBlock icon={<Clock3 className="size-3.5" />} label="Stale pages · nudge" count={brief.stalePages.length}>
              {brief.stalePages.length === 0 ? <EmptyLine text="Nothing stale." /> :
                <ul className="space-y-1.5">
                  {brief.stalePages.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate text-cc-text">{p.title}</span>
                      <span className="shrink-0 font-mono text-[10px] text-cc-muted">{fmtRelative(p.updated_at)}</span>
                    </li>
                  ))}
                </ul>}
            </BriefBlock>
            <BriefBlock icon={<ArrowUpRight className="size-3.5" />} label="Open tasks" count={brief.openTasks.length}>
              {brief.openTasks.length === 0 ? <EmptyLine text="Task list empty." /> :
                <ul className="space-y-1.5">
                  {brief.openTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-[12px]">
                      <span className="size-1.5 rounded-full bg-cc-gold" />
                      <span className="min-w-0 flex-1 truncate text-cc-text">{t.title}</span>
                      {t.due_date && <span className="shrink-0 font-mono text-[10px] text-cc-muted">{t.due_date}</span>}
                    </li>
                  ))}
                </ul>}
            </BriefBlock>
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Link to="/brain" className="font-mono text-[10px] uppercase tracking-widest text-cc-violet hover:underline">Open Second Brain →</Link>
        </div>
      </div>

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