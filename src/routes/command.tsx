import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOverview, seedDemoData } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCMetric, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtMoney, fmtRelative, severityDot } from "@/lib/commandCenter/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/command")({
  head: () => ({ meta: [{ title: "Command Overview — C.A.P.I.S.M." }, { name: "description", content: "Executive command overview: pipeline, priorities, alerts, and live activity." }] }),
  component: CommandOverview,
});

type Overview = Awaited<ReturnType<typeof getOverview>>;

function CommandOverview() {
  const fetchOverview = useServerFn(getOverview);
  const seed = useServerFn(seedDemoData);
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchOverview({ data: undefined as never }).then(setData).catch((e) => setErr(e.message));
  }, [fetchOverview]);

  const runSeed = async () => {
    setBusy(true);
    try {
      const { seeded } = await seed({ data: undefined as never });
      toast.success(seeded ? "Demo data loaded" : "Demo data already present");
      const fresh = await fetchOverview({ data: undefined as never });
      setData(fresh);
      router.invalidate();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  if (err) {
    return (
      <div className="p-6">
        <PageHeader eyebrow="System" title="Command Overview" description="Something interrupted the executive feed." />
        <CCEmpty title="Unable to load overview" hint={err} action={<Button onClick={() => location.reload()} className="mt-2">Retry</Button>} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-6">
        <PageHeader eyebrow="Loading" title="Command Overview" description="Assembling the executive feed…" />
        <div className="grid animate-pulse gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="cc-panel h-[92px]" />)}
        </div>
      </div>
    );
  }

  const m = data.metrics;

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader
        eyebrow="Live · Executive Feed"
        title="Command Overview"
        description="The single glance that runs the day — priorities, pipeline, and pressure points."
        actions={
          <>
            <Button variant="outline" onClick={runSeed} disabled={busy} className="border-cc-border bg-black/30 text-cc-text hover:bg-white/[0.04]">
              {busy && <Loader2 className="mr-2 size-3.5 animate-spin" />} Load demo data
            </Button>
            <Button className="bg-cc-violet text-white hover:bg-cc-violet/90"><Sparkles className="mr-2 size-4" /> Ask Chief of Staff</Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CCMetric label="Urgent" value={m.urgent} hint="Alerts marked critical" accent="var(--cc-crimson)" />
        <CCMetric label="Due Today" value={m.dueToday} hint={`${m.overdue} overdue`} accent="var(--cc-gold)" />
        <CCMetric label="Active Projects" value={m.activeProjects} hint={`${fmtMoney(m.pipelineCents)} pipeline`} accent="var(--cc-emerald)" />
        <CCMetric label="Inbox Actionable" value={m.actionableComms} hint={`${m.clientsWaiting} clients waiting`} accent="var(--cc-cyan)" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <CCPanel title="Priorities · Today" subtitle="Tight, decisive, executable" className="lg:col-span-2">
          {data.dueToday.length === 0 && data.overdue.length === 0 ? (
            <CCEmpty title="No fires — set the tempo." hint="Add a task from the ⌘⇧N Quick Create menu." />
          ) : (
            <ul className="divide-y divide-cc-border">
              {[...data.overdue, ...data.dueToday].slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className="size-1.5 rounded-full" style={{ background: t.priority === "high" ? "var(--cc-crimson)" : t.priority === "low" ? "var(--cc-cyan)" : "var(--cc-gold)" }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-cc-text">{t.title}</span>
                  <CCTag accent={t.due_date && t.due_date < data.today ? "var(--cc-crimson)" : "var(--cc-gold)"}>{t.due_date ?? "no date"}</CCTag>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>

        <CCPanel title="Alerts" subtitle="Ambient status signals">
          {data.alerts.length === 0 ? (
            <CCEmpty title="All clear." hint="No unread alerts right now." />
          ) : (
            <ul className="space-y-3">
              {data.alerts.slice(0, 6).map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className={"mt-1 size-2 shrink-0 rounded-full " + severityDot(a.severity)} />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-cc-text">{a.title}</div>
                    {a.body && <div className="line-clamp-2 text-[11px] text-cc-muted">{a.body}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <CCPanel title="Inbox · Needs You" className="lg:col-span-2">
          {data.comms.length === 0 ? (
            <CCEmpty title="Inbox is quiet." hint="Connect Gmail or Slack in Integrations to route real messages here." />
          ) : (
            <ul className="divide-y divide-cc-border">
              {data.comms.slice(0, 6).map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <CCTag accent="var(--cc-cyan)">{c.source}</CCTag>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-cc-text">{c.subject ?? c.sender ?? "Message"}</div>
                    <div className="truncate text-[11px] text-cc-muted">{c.snippet}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-cc-muted">{fmtRelative(c.received_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>

        <CCPanel title="Live Activity" subtitle="System · people · signals">
          {data.activity.length === 0 ? (
            <CCEmpty title="Awaiting first event." />
          ) : (
            <ul className="space-y-3">
              {data.activity.slice(0, 8).map((a) => (
                <li key={a.id} className="flex gap-2 text-[12px]">
                  <CCTag accent="var(--cc-violet)">{a.kind}</CCTag>
                  <span className="min-w-0 flex-1 truncate text-cc-text">{a.summary}</span>
                  <span className="shrink-0 font-mono text-[10px] text-cc-muted">{fmtRelative(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>
      </div>
    </div>
  );
}