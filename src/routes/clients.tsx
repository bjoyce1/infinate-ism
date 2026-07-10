import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listClients } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtMoney, fmtRelative } from "@/lib/commandCenter/format";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Clients — C.A.P.I.S.M." }, { name: "description", content: "Client roster with payment status, follow-ups, and next actions." }] }),
  component: ClientsView,
});

function ClientsView() {
  const fetchClients = useServerFn(listClients);
  const [clients, setClients] = useState<Awaited<ReturnType<typeof listClients>>>([]);
  const [q, setQ] = useState("");
  useEffect(() => { fetchClients({ data: undefined as never }).then(setClients); }, [fetchClients]);

  const filtered = clients.filter((c) => !q || (c.name + " " + (c.company ?? "")).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader eyebrow="Relationships" title="Clients" description="Who's waiting, who's paying, what's next — at a glance." />
      <div className="mb-4"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients or companies…" className="max-w-sm border-cc-border bg-black/30 text-cc-text placeholder:text-cc-muted" /></div>
      <CCPanel>
        {filtered.length === 0 ? <CCEmpty title="No clients yet." hint="Add one via Quick Create." /> : (
          <ul className="divide-y divide-cc-border">
            {filtered.map((c) => (
              <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-cc-text">{c.name}</div>
                  <div className="truncate text-[11px] text-cc-muted">{c.company ?? c.email ?? "—"}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {c.payment_status && <CCTag accent={c.payment_status === "paid" ? "var(--cc-emerald)" : c.payment_status === "overdue" ? "var(--cc-crimson)" : "var(--cc-gold)"}>{c.payment_status}</CCTag>}
                  {c.budget_cents ? <CCTag accent="var(--cc-emerald)">{fmtMoney(c.budget_cents)}</CCTag> : null}
                  {c.follow_up_date && <span className="font-mono text-[10px] text-cc-muted">Follow-up {fmtRelative(c.follow_up_date)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CCPanel>
    </div>
  );
}