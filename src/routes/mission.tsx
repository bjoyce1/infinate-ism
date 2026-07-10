import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProjects, listTasks } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtMoney, fmtRelative } from "@/lib/commandCenter/format";

export const Route = createFileRoute("/mission")({
  head: () => ({ meta: [{ title: "Mission Control — C.A.P.I.S.M." }, { name: "description", content: "Projects, tasks, deadlines, and the pipeline that drives revenue." }] }),
  component: MissionView,
});

type P = Awaited<ReturnType<typeof listProjects>>[number];
type T = Awaited<ReturnType<typeof listTasks>>[number];

function MissionView() {
  const fetchProjects = useServerFn(listProjects);
  const fetchTasks = useServerFn(listTasks);
  const [projects, setProjects] = useState<P[]>([]);
  const [tasks, setTasks] = useState<T[]>([]);

  useEffect(() => {
    fetchProjects({ data: undefined as never }).then(setProjects);
    fetchTasks({ data: undefined as never }).then(setTasks);
  }, [fetchProjects, fetchTasks]);

  const buckets: { key: T["status"]; label: string; accent: string }[] = [
    { key: "todo",    label: "To Do",   accent: "var(--cc-cyan)" },
    { key: "doing",   label: "Doing",   accent: "var(--cc-gold)" },
    { key: "blocked", label: "Blocked", accent: "var(--cc-crimson)" },
    { key: "done",    label: "Done",    accent: "var(--cc-emerald)" },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6">
      <PageHeader eyebrow="Operational" title="Mission Control" description="Projects and tasks in one board — with revenue, deadlines, and next actions in view." />

      <CCPanel title="Projects" subtitle={`${projects.length} tracked · ${fmtMoney(projects.reduce((n, p) => n + (Number(p.revenue_potential_cents) || 0), 0))} pipeline`}>
        {projects.length === 0 ? <CCEmpty title="No projects yet." hint="Create one via ⌘⇧N Quick Create." /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div key={p.id} className="rounded-lg border border-cc-border bg-black/25 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: p.color ?? "var(--cc-violet)" }} />
                  <div className="truncate text-[13px] font-medium text-cc-text">{p.name}</div>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <CCTag>{p.status}</CCTag>
                  <CCTag accent={p.priority === "high" ? "var(--cc-crimson)" : "var(--cc-gold)"}>{p.priority}</CCTag>
                  {p.revenue_potential_cents ? <CCTag accent="var(--cc-emerald)">{fmtMoney(p.revenue_potential_cents)}</CCTag> : null}
                </div>
                {p.next_action && <div className="line-clamp-2 text-[11px] text-cc-muted">→ {p.next_action}</div>}
                {p.deadline && <div className="mt-1.5 font-mono text-[10px] text-cc-muted">Due {fmtRelative(p.deadline)}</div>}
              </div>
            ))}
          </div>
        )}
      </CCPanel>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {buckets.map((b) => (
          <CCPanel key={b.key} title={b.label} subtitle={`${tasks.filter((t) => t.status === b.key).length} tasks`}>
            <ul className="space-y-2">
              {tasks.filter((t) => t.status === b.key).slice(0, 12).map((t) => (
                <li key={t.id} className="rounded-md border border-cc-border bg-black/25 p-2.5">
                  <div className="truncate text-[13px] text-cc-text">{t.title}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <CCTag accent={b.accent}>{t.priority}</CCTag>
                    {t.due_date && <span className="font-mono text-[10px] text-cc-muted">{t.due_date}</span>}
                  </div>
                </li>
              ))}
              {tasks.filter((t) => t.status === b.key).length === 0 && <CCEmpty title="Empty" />}
            </ul>
          </CCPanel>
        ))}
      </div>
    </div>
  );
}