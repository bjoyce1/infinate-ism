import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAreas, upsertArea, deleteArea, listProjects } from "@/lib/brain.functions";
import { AppShell, GlassCard, NeonButton } from "@/components/brain/AppShell";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/areas")({
  head: () => ({ meta: [{ title: "Areas — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: AreasPage,
});

const COLORS = ["#3DED97", "#4C6FFF", "#E879F9", "#F59E0B", "#EF4444", "#22D3EE"];

function AreasPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAreas);
  const upsertFn = useServerFn(upsertArea);
  const deleteFn = useServerFn(deleteArea);
  const projectsFn = useServerFn(listProjects);
  const { data: areas = [] } = useQuery({ queryKey: ["areas"], queryFn: () => listFn() });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const [draft, setDraft] = useState({ name: "", description: "", color: COLORS[0] });

  const create = useMutation({
    mutationFn: () => upsertFn({ data: draft }),
    onSuccess: () => { setDraft({ name: "", description: "", color: COLORS[0] }); qc.invalidateQueries({ queryKey: ["areas"] }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["areas"] }),
  });

  const counts = projects.reduce<Record<string, number>>((acc, p) => { if (p.area_id) acc[p.area_id] = (acc[p.area_id] ?? 0) + 1; return acc; }, {});

  return (
    <AppShell title="Areas" actions={<span className="text-xs text-white/40">Ongoing life & work domains</span>}>
      <GlassCard className="p-4 mb-6">
        <div className="text-xs uppercase tracking-[0.15em] text-[#3DED97]/80 mb-3">New area</div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2">
          <input placeholder="Music, AI, Web design, Crypto…" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
          <input placeholder="Optional description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
          <NeonButton onClick={() => create.mutate()} disabled={!draft.name.trim()}><Plus className="h-3.5 w-3.5" /> Add</NeonButton>
        </div>
        <div className="flex gap-2 mt-3">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setDraft({ ...draft, color: c })}
              className={`h-6 w-6 rounded-full border-2 transition-all ${draft.color === c ? "border-white scale-110" : "border-transparent"}`}
              style={{ background: c, boxShadow: `0 0 12px ${c}66` }} />
          ))}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {areas.map((a) => (
          <GlassCard key={a.id} className="p-4 relative overflow-hidden group">
            <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full blur-2xl opacity-40" style={{ background: a.color ?? "#3DED97" }} />
            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: a.color ?? "#3DED97", boxShadow: `0 0 8px ${a.color ?? "#3DED97"}` }} />
                    <div className="text-base font-semibold">{a.name}</div>
                  </div>
                  {a.description && <div className="text-xs text-white/50 mt-2">{a.description}</div>}
                </div>
                <button onClick={() => { if (confirm("Delete area?")) remove.mutate(a.id); }} className="opacity-0 group-hover:opacity-60 hover:opacity-100 text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-4 text-[11px] text-white/40 uppercase tracking-wider">{counts[a.id] ?? 0} projects</div>
            </div>
          </GlassCard>
        ))}
        {areas.length === 0 && <div className="text-sm text-white/40 md:col-span-2 xl:col-span-3">No areas yet. Add your first ongoing domain above.</div>}
      </div>
    </AppShell>
  );
}