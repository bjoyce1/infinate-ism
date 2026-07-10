import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFinance } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtMoney, fmtRelative, severityDot } from "@/lib/commandCenter/format";

export const Route = createFileRoute("/finance")({
  head: () => ({ meta: [{ title: "Finance & Admin — C.A.P.I.S.M." }, { name: "description", content: "Invoices, subscriptions, renewals, and account security — one calm ledger." }] }),
  component: FinanceView,
});

function FinanceView() {
  const fetchFinance = useServerFn(listFinance);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listFinance>>>([]);
  useEffect(() => { fetchFinance({ data: undefined as never }).then(setRows); }, [fetchFinance]);

  const total = rows.reduce((n, r) => n + (Number(r.amount_cents) || 0), 0);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader eyebrow="Ledger" title="Finance & Admin" description="Every renewal, invoice, and security-relevant billing event routed to your attention." />
      <CCPanel title="Open Items" subtitle={`${rows.length} tracked · ${fmtMoney(total)} at stake`}>
        {rows.length === 0 ? <CCEmpty title="No open finance items." hint="Connect Stripe, Wave, or Zoho Books to activate live tracking." /> : (
          <ul className="divide-y divide-cc-border">
            {rows.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={"size-2 shrink-0 rounded-full " + severityDot(r.severity)} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-cc-text">{r.label}</div>
                    <div className="truncate text-[11px] text-cc-muted">{r.vendor ?? "—"} · {r.kind}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CCTag accent="var(--cc-emerald)">{fmtMoney(r.amount_cents)}</CCTag>
                  {r.due_date && <span className="font-mono text-[10px] text-cc-muted">{fmtRelative(r.due_date)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CCPanel>
    </div>
  );
}