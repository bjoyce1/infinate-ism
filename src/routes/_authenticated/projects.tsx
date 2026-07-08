import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listProjects, upsertProject, listAreas } from "@/lib/brain.functions";
import { AppShell, GlassCard, NeonButton, priorityColor, statusColor } from "@/components/brain/AppShell";
import { Plus, ArrowRight, Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projects — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjects);
  const areasFn = useServerFn(listAreas);
  const upsertFn = useServerFn(upsertProject);

  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => areasFn() });

  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ name: "", goal: "", priority: "medium" as const, area_id: "" });

  const create = useMutation({
    mutationFn: () => upsertFn({ data: {
      name: draft.name,
      goal: draft.goal || null,
      priority: draft.priority,
      status: "active",
      area_id: draft.area_id || null,
    } }),
    onSuccess: () => { setShowNew(false); setDraft({ name: "", goal: "", priority: "medium", area_id: "" }); qc.invalidateQueries({ queryKey: ["projects"] }); },
  });

  const grouped = groupBy(projects, (p) => p.status);

  return (
    <AppShell title="Projects" actions={
      <NeonButton onClick={() => setShowNew((v) => !v)}><Plus className="h-3.5 w-3.5" /> New project</NeonButton>
    }>
      {showNew && (
        <GlassCard className="p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input placeholder="Project name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
            <select value={draft.area_id} onChange={(e) => setDraft({ ...draft, area_id: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm">
              <option value="">No area</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <textarea placeholder="Goal / outcome" value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} rows={2}
            className="w-full mt-3 bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50 resize-none" />
          <div className="flex justify-end mt-3 gap-2">
            <NeonButton variant="ghost" onClick={() => setShowNew(false)}>Cancel</NeonButton>
            <NeonButton onClick={() => create.mutate()} disabled={!draft.name.trim() || create.isPending}>Create</NeonButton>
          </div>
        </GlassCard>
      )}

      {(["active", "paused", "completed", "archived"] as const).map((s) => (
        <div key={s} className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${statusColor[s]}`}>{s}</div>
            <div className="h-px flex-1 bg-white/[0.06]" />
            <div className="text-xs text-white/40">{grouped[s]?.length ?? 0}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(grouped[s] ?? []).map((p) => (
              <Link key={p.id} to="/projects/$id" params={{ id: p.id }}>
                <GlassCard className="p-4 hover:border-[#3DED97]/30 hover:shadow-[0_0_24px_-8px_rgba(61,237,151,0.4)] transition-all group cursor-pointer h-full">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white/95 truncate">{p.name}</div>
                      {p.goal && <div className="text-xs text-white/50 mt-1 line-clamp-2">{p.goal}</div>}
                    </div>
                    <ArrowRight className="h-4 w-4 text-white/20 group-hover:text-[#3DED97] group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-[10px]">
                    <span className={`px-1.5 py-0.5 rounded border ${priorityColor[p.priority]}`}>{p.priority}</span>
                    {p.area && <span className="px-1.5 py-0.5 rounded border border-white/10 text-white/60">{(p.area as {name:string}).name}</span>}
                    {p.client && <span className="px-1.5 py-0.5 rounded border border-white/10 text-white/60">{(p.client as {name:string}).name}</span>}
                    {p.deadline && <span className="ml-auto flex items-center gap-1 text-white/40"><Calendar className="h-3 w-3" />{p.deadline}</span>}
                  </div>
                </GlassCard>
              </Link>
            ))}
            {(grouped[s]?.length ?? 0) === 0 && <div className="text-sm text-white/30 italic md:col-span-2 xl:col-span-3">Nothing here.</div>}
          </div>
        </div>
      ))}
    </AppShell>
  );
}

function groupBy<T, K extends string>(arr: T[], fn: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const x of arr) { const k = fn(x); (out[k] ||= []).push(x); }
  return out;
}