import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listCaptures, createCapture, updateCapture, deleteCapture } from "@/lib/brain.functions";
import { processCapture } from "@/lib/brainAi.functions";
import { AppShell, GlassCard, NeonButton, priorityColor } from "@/components/brain/AppShell";
import { Sparkles, Archive, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Capture Inbox — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: InboxPage,
});

const TYPES = ["note", "idea", "link", "client_note", "project_thought", "lyrics", "business_idea", "ai_prompt"] as const;

function InboxPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCaptures);
  const createFn = useServerFn(createCapture);
  const updateFn = useServerFn(updateCapture);
  const deleteFn = useServerFn(deleteCapture);
  const processFn = useServerFn(processCapture);

  const [filter, setFilter] = useState<"inbox" | "processed" | "archived" | "all">("inbox");
  const { data: captures = [] } = useQuery({
    queryKey: ["captures", filter],
    queryFn: () => listFn({ data: filter === "all" ? {} : { status: filter } }),
  });

  const [draft, setDraft] = useState({ title: "", body: "", type: "note" as (typeof TYPES)[number] });
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["captures"] });

  const addOne = useMutation({
    mutationFn: () => createFn({ data: { title: draft.title || draft.body.slice(0, 80), body: draft.body, type: draft.type } }),
    onSuccess: () => { setDraft({ title: "", body: "", type: "note" }); invalidate(); },
  });

  const patchOne = useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) => updateFn({ data: v }),
    onSuccess: invalidate,
  });
  const removeOne = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const enrich = async (id: string) => {
    setAiLoadingId(id);
    try {
      const s = await processFn({ data: { id } });
      await updateFn({ data: { id, patch: {
        title: s.title,
        priority: (s.priority as "low"|"medium"|"high"|"urgent") ?? undefined,
        next_action: s.next_action ?? null,
        type: (TYPES.includes(s.suggested_type as (typeof TYPES)[number]) ? s.suggested_type : undefined) as never,
      } } });
      invalidate();
    } finally { setAiLoadingId(null); }
  };

  return (
    <AppShell title="Capture Inbox">
      {/* New capture */}
      <GlassCard className="p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-xs uppercase tracking-[0.15em] text-[#3DED97]/80">New capture</div>
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as (typeof TYPES)[number] })}
            className="ml-auto bg-white/[0.03] border border-white/10 rounded-md px-2 py-1 text-xs">
            {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
        </div>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Title (optional)" className="w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:border-[#3DED97]/50" />
        <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          placeholder="What's on your mind?" rows={3}
          className="w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50 resize-none" />
        <div className="flex justify-end mt-2">
          <NeonButton onClick={() => addOne.mutate()} disabled={!draft.body.trim() || addOne.isPending}>
            <Plus className="h-3.5 w-3.5" /> Capture
          </NeonButton>
        </div>
      </GlassCard>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 text-xs">
        {(["inbox", "processed", "archived", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md border transition-colors ${filter === f ? "border-[#3DED97]/40 bg-[#3DED97]/10 text-[#3DED97]" : "border-white/10 text-white/50 hover:text-white/80"}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {captures.length === 0 && <GlassCard className="p-8 text-center text-sm text-white/40">Nothing here. Capture something above.</GlassCard>}
        {captures.map((c) => (
          <GlassCard key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 text-[10px]">
                  <span className="uppercase tracking-wider text-[#3DED97]/70">{c.type.replace("_", " ")}</span>
                  <span className={`px-1.5 py-0.5 rounded border ${priorityColor[c.priority] ?? ""}`}>{c.priority}</span>
                  <span className="text-white/30">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div className="text-sm font-medium text-white/90">{c.title}</div>
                {c.body && <p className="text-sm text-white/60 mt-1 whitespace-pre-wrap">{c.body}</p>}
                {c.next_action && (
                  <div className="mt-2 text-xs text-[#3DED97] flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> {c.next_action}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <NeonButton variant="ghost" onClick={() => enrich(c.id)} disabled={aiLoadingId === c.id}>
                  <Sparkles className="h-3 w-3" /> {aiLoadingId === c.id ? "…" : "AI"}
                </NeonButton>
                <NeonButton variant="ghost" onClick={() => patchOne.mutate({ id: c.id, patch: { status: c.status === "inbox" ? "processed" : "archived" } })}>
                  <Archive className="h-3 w-3" /> {c.status === "inbox" ? "Process" : "Archive"}
                </NeonButton>
                <NeonButton variant="danger" onClick={() => removeOne.mutate(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </NeonButton>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </AppShell>
  );
}