import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listClients, upsertClient } from "@/lib/brain.functions";
import { AppShell, GlassCard, NeonButton } from "@/components/brain/AppShell";
import { Plus, Mail, Phone, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Clients — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listClients);
  const upsertFn = useServerFn(upsertClient);
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => listFn() });
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ name: "", company: "", email: "", website: "", follow_up_date: "" });

  const create = useMutation({
    mutationFn: () => upsertFn({ data: {
      name: draft.name, company: draft.company || null, email: draft.email || null,
      website: draft.website || null, follow_up_date: draft.follow_up_date || null,
    } }),
    onSuccess: () => { setShowNew(false); setDraft({ name: "", company: "", email: "", website: "", follow_up_date: "" }); qc.invalidateQueries({ queryKey: ["clients"] }); },
  });

  return (
    <AppShell title="Client Command Center" actions={
      <NeonButton onClick={() => setShowNew((v) => !v)}><Plus className="h-3.5 w-3.5" /> New client</NeonButton>
    }>
      {showNew && (
        <GlassCard className="p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
            <input placeholder="Company" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
            <input placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
            <input placeholder="Website" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })}
              className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#3DED97]/50" />
            <input type="date" value={draft.follow_up_date} onChange={(e) => setDraft({ ...draft, follow_up_date: e.target.value })}
              className="bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end mt-3 gap-2">
            <NeonButton variant="ghost" onClick={() => setShowNew(false)}>Cancel</NeonButton>
            <NeonButton onClick={() => create.mutate()} disabled={!draft.name.trim()}>Create</NeonButton>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {clients.map((c) => (
          <GlassCard key={c.id} className="p-4">
            <div className="text-base font-semibold">{c.name}</div>
            {c.company && <div className="text-xs text-white/50">{c.company}</div>}
            <div className="mt-3 space-y-1 text-xs text-white/60">
              {c.email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</div>}
              {c.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</div>}
              {c.website && <div className="flex items-center gap-1.5"><Globe className="h-3 w-3" />{c.website}</div>}
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px]">
              <span className={`px-1.5 py-0.5 rounded border ${c.payment_status === "paid" ? "border-[#3DED97]/30 text-[#3DED97]" : c.payment_status === "overdue" ? "border-red-500/40 text-red-300" : "border-white/10 text-white/50"}`}>{c.payment_status}</span>
              {c.follow_up_date && <span className="text-white/50">follow-up {c.follow_up_date}</span>}
            </div>
          </GlassCard>
        ))}
        {clients.length === 0 && <div className="text-sm text-white/40 md:col-span-2 xl:col-span-3">No clients yet.</div>}
      </div>
    </AppShell>
  );
}