import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPrompts, upsertPrompt, deletePrompt } from "@/lib/brain.functions";
import { AppShell, GlassCard, NeonButton } from "@/components/brain/AppShell";
import { Plus, Copy, Trash2, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/prompts")({
  head: () => ({ meta: [{ title: "Prompt Library — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: PromptsPage,
});

function PromptsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPrompts);
  const upsertFn = useServerFn(upsertPrompt);
  const deleteFn = useServerFn(deletePrompt);
  const { data: prompts = [] } = useQuery({ queryKey: ["prompts"], queryFn: () => listFn() });
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ title: "", category: "", platform: "", prompt: "", use_case: "" });
  const [q, setQ] = useState("");

  const create = useMutation({
    mutationFn: () => upsertFn({ data: draft }),
    onSuccess: () => { setShowNew(false); setDraft({ title: "", category: "", platform: "", prompt: "", use_case: "" }); qc.invalidateQueries({ queryKey: ["prompts"] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteFn({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }) });

  const filtered = prompts.filter((p) => !q || p.title.toLowerCase().includes(q.toLowerCase()) || p.prompt.toLowerCase().includes(q.toLowerCase()) || (p.category ?? "").toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell title="Prompt Library" actions={
      <NeonButton onClick={() => setShowNew((v) => !v)}><Plus className="h-3.5 w-3.5" /> New prompt</NeonButton>
    }>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prompts…"
        className="w-full mb-4 bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />

      {showNew && (
        <GlassCard className="p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
            <input placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
            <input placeholder="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
            <input placeholder="Platform (ChatGPT, Claude, Suno…)" value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
          </div>
          <textarea placeholder="Prompt text" value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} rows={4}
            className="w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm mb-2 font-mono focus:outline-none focus:border-[#3DED97]/50 resize-none" />
          <input placeholder="Use case" value={draft.use_case} onChange={(e) => setDraft({ ...draft, use_case: e.target.value })}
            className="w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:border-[#3DED97]/50" />
          <div className="flex justify-end gap-2">
            <NeonButton variant="ghost" onClick={() => setShowNew(false)}>Cancel</NeonButton>
            <NeonButton onClick={() => create.mutate()} disabled={!draft.title.trim() || !draft.prompt.trim()}>Save prompt</NeonButton>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((p) => (
          <GlassCard key={p.id} className="p-4 group">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold">{p.title}</div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-white/50">
                  {p.category && <span className="px-1.5 py-0.5 rounded border border-white/10">{p.category}</span>}
                  {p.platform && <span className="px-1.5 py-0.5 rounded border border-[#3DED97]/30 text-[#3DED97]">{p.platform}</span>}
                  {p.rating && <span className="flex items-center gap-0.5 text-amber-300"><Star className="h-3 w-3 fill-current" />{p.rating}</span>}
                </div>
              </div>
              <div className="flex gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                <button onClick={() => navigator.clipboard.writeText(p.prompt)} className="p-1.5 rounded hover:bg-white/10" title="Copy"><Copy className="h-3.5 w-3.5" /></button>
                <button onClick={() => { if (confirm("Delete prompt?")) remove.mutate(p.id); }} className="p-1.5 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <pre className="mt-3 text-xs text-white/70 whitespace-pre-wrap font-mono bg-black/30 rounded-md p-3 max-h-40 overflow-auto">{p.prompt}</pre>
            {p.use_case && <div className="text-xs text-white/40 mt-2">{p.use_case}</div>}
          </GlassCard>
        ))}
        {filtered.length === 0 && <div className="text-sm text-white/40 md:col-span-2">No prompts. Save your first one above.</div>}
      </div>
    </AppShell>
  );
}