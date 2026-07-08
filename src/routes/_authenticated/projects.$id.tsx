import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getProject, upsertTask, setTaskStatus, deleteTask, upsertProject, deleteProject } from "@/lib/brain.functions";
import { runProjectAction } from "@/lib/brainAi.functions";
import { AppShell, GlassCard, NeonButton, priorityColor, statusColor } from "@/components/brain/AppShell";
import { Sparkles, Plus, Check, Trash2, ArrowLeft, FileText, Mail, ListChecks, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: ProjectDetail,
});

const ACTIONS = [
  { kind: "summarize" as const, label: "Summarize", icon: FileText },
  { kind: "next_steps" as const, label: "Next steps", icon: Wand2 },
  { kind: "task_list" as const, label: "Task list", icon: ListChecks },
  { kind: "email_draft" as const, label: "Email draft", icon: Mail },
  { kind: "sow" as const, label: "Draft SOW", icon: FileText },
];

function ProjectDetail() {
  const { id } = useParams({ from: "/_authenticated/projects/$id" });
  const qc = useQueryClient();
  const getFn = useServerFn(getProject);
  const upsertTaskFn = useServerFn(upsertTask);
  const setStatusFn = useServerFn(setTaskStatus);
  const deleteTaskFn = useServerFn(deleteTask);
  const upsertProjectFn = useServerFn(upsertProject);
  const deleteProjectFn = useServerFn(deleteProject);
  const runActionFn = useServerFn(runProjectAction);

  const { data } = useQuery({ queryKey: ["project", id], queryFn: () => getFn({ data: { id } }) });

  const [newTask, setNewTask] = useState("");
  const [aiOutput, setAiOutput] = useState<{ kind: string; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["project", id] });

  const addTask = useMutation({
    mutationFn: () => upsertTaskFn({ data: { title: newTask, project_id: id, status: "todo", priority: "medium" } }),
    onSuccess: () => { setNewTask(""); invalidate(); },
  });
  const toggleTask = useMutation({
    mutationFn: (v: { id: string; status: "todo"|"done" }) => setStatusFn({ data: v }),
    onSuccess: invalidate,
  });
  const removeTask = useMutation({
    mutationFn: (tid: string) => deleteTaskFn({ data: { id: tid } }),
    onSuccess: invalidate,
  });

  const runAI = async (kind: typeof ACTIONS[number]["kind"]) => {
    setAiBusy(kind);
    setAiOutput(null);
    try {
      const r = await runActionFn({ data: { project_id: id, kind } });
      setAiOutput({ kind, text: r.text });
    } finally { setAiBusy(null); }
  };

  if (!data) return <AppShell title="Loading…"><div className="text-white/40">Loading project…</div></AppShell>;
  const p = data.project;
  const openTasks = data.tasks.filter((t) => t.status !== "done");
  const doneTasks = data.tasks.filter((t) => t.status === "done");

  return (
    <AppShell title={p.name} actions={
      <Link to="/projects" className="text-xs text-white/50 hover:text-white flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> All projects</Link>
    }>
      {/* Header card */}
      <GlassCard className="p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#3DED97]/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2 text-[10px]">
            <span className={`px-1.5 py-0.5 rounded border ${statusColor[p.status]}`}>{p.status}</span>
            <span className={`px-1.5 py-0.5 rounded border ${priorityColor[p.priority]}`}>{p.priority}</span>
            {p.deadline && <span className="text-white/50">deadline {p.deadline}</span>}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{p.name}</h2>
          {p.goal && <p className="text-sm text-white/60 mt-2 max-w-3xl">{p.goal}</p>}
          {p.next_action && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#3DED97]/30 bg-[#3DED97]/5 px-3 py-1.5 text-xs text-[#3DED97]">
              <Sparkles className="h-3 w-3" /> Next action: {p.next_action}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <NeonButton onClick={() => upsertProjectFn({ data: { id, name: p.name, status: p.status === "active" ? "paused" : "active", priority: p.priority } }).then(invalidate)}>
              {p.status === "active" ? "Pause" : "Activate"}
            </NeonButton>
            <NeonButton variant="ghost" onClick={() => upsertProjectFn({ data: { id, name: p.name, status: "completed", priority: p.priority } }).then(invalidate)}>Complete</NeonButton>
            <NeonButton variant="danger" onClick={() => { if (confirm("Delete this project? This removes all its tasks.")) deleteProjectFn({ data: { id } }).then(() => window.location.href = "/projects"); }}>Delete</NeonButton>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tasks */}
        <GlassCard className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold tracking-wide mb-3">Tasks</h3>
          <div className="flex gap-2 mb-4">
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newTask.trim()) addTask.mutate(); }}
              placeholder="Add a task…" className="flex-1 bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
            <NeonButton onClick={() => addTask.mutate()} disabled={!newTask.trim()}><Plus className="h-3.5 w-3.5" /></NeonButton>
          </div>
          <ul className="space-y-1.5">
            {openTasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-2 -mx-2 rounded-md hover:bg-white/[0.03] group">
                <button onClick={() => toggleTask.mutate({ id: t.id, status: "done" })} className="h-4 w-4 rounded border border-white/20 hover:border-[#3DED97] flex-shrink-0" />
                <span className="flex-1 text-sm">{t.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${priorityColor[t.priority]}`}>{t.priority}</span>
                <button onClick={() => removeTask.mutate(t.id)} className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-red-400"><Trash2 className="h-3 w-3" /></button>
              </li>
            ))}
            {openTasks.length === 0 && <li className="text-sm text-white/40 py-2">All caught up.</li>}
          </ul>
          {doneTasks.length > 0 && (
            <details className="mt-4">
              <summary className="text-xs text-white/40 cursor-pointer hover:text-white/70">Completed ({doneTasks.length})</summary>
              <ul className="mt-2 space-y-1">
                {doneTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 p-1.5 text-sm text-white/40 line-through">
                    <button onClick={() => toggleTask.mutate({ id: t.id, status: "todo" })} className="h-4 w-4 rounded border border-[#3DED97]/40 bg-[#3DED97]/10 flex items-center justify-center flex-shrink-0"><Check className="h-3 w-3 text-[#3DED97]" /></button>
                    <span className="flex-1">{t.title}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </GlassCard>

        {/* AI Action Panel */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-[#3DED97]" />
            <h3 className="text-sm font-semibold tracking-wide">AI Action Panel</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <button key={a.kind} onClick={() => runAI(a.kind)} disabled={aiBusy !== null}
                className={`flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-left transition-all hover:border-[#3DED97]/40 hover:bg-[#3DED97]/5 hover:text-[#3DED97] disabled:opacity-40 ${aiBusy === a.kind ? "border-[#3DED97]/50 bg-[#3DED97]/10 text-[#3DED97]" : "text-white/80"}`}>
                <a.icon className="h-3.5 w-3.5" />
                {aiBusy === a.kind ? "Thinking…" : a.label}
              </button>
            ))}
          </div>
          {aiOutput && (
            <div className="mt-4 rounded-md border border-[#3DED97]/20 bg-black/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-[#3DED97]/70 mb-2">{aiOutput.kind.replace("_", " ")}</div>
              <pre className="whitespace-pre-wrap text-xs text-white/85 font-sora leading-relaxed">{aiOutput.text}</pre>
            </div>
          )}
        </GlassCard>

        {/* Notes & captures preview */}
        <GlassCard className="p-5 lg:col-span-3">
          <h3 className="text-sm font-semibold tracking-wide mb-3">Related captures</h3>
          {data.captures.length === 0 ? <div className="text-sm text-white/40">No captures linked yet.</div> :
            <ul className="space-y-2">
              {data.captures.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="text-[10px] uppercase tracking-wider text-[#3DED97]/60 mr-2">{c.type}</span>
                  <span className="text-white/80">{c.title}</span>
                  {c.body && <span className="text-white/50"> — {c.body.slice(0, 200)}</span>}
                </li>
              ))}
            </ul>
          }
        </GlassCard>
      </div>
    </AppShell>
  );
}