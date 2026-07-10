import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listAutomations, toggleAutomation } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/automations")({
  head: () => ({ meta: [{ title: "Automations — C.A.P.I.S.M." }, { name: "description", content: "Rules that turn signals into action — email → task, meeting → note, silence → follow-up." }] }),
  component: AutomationsView,
});

type R = Awaited<ReturnType<typeof listAutomations>>[number];

function AutomationsView() {
  const fetchRules = useServerFn(listAutomations);
  const toggle = useServerFn(toggleAutomation);
  const [rules, setRules] = useState<R[]>([]);
  useEffect(() => { fetchRules({ data: undefined as never }).then(setRules); }, [fetchRules]);

  const flip = async (r: R) => {
    const enabled = r.status !== "active";
    try {
      await toggle({ data: { id: r.id, enabled } });
      setRules((xs) => xs.map((x) => x.id === r.id ? { ...x, status: enabled ? "active" : "paused" } : x));
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader eyebrow="Rules Engine" title="Automations" description="Starter rules ship paused — flip on the ones that fit your rhythm, tune inside." />
      <CCPanel>
        {rules.length === 0 ? <CCEmpty title="No rules yet." hint="Load demo data on the Command Overview to see 7 starter rules." /> : (
          <ul className="divide-y divide-cc-border">
            {rules.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[13px] font-medium text-cc-text">{r.name}</div>
                    <CCTag accent={r.status === "active" ? "var(--cc-emerald)" : r.status === "error" ? "var(--cc-crimson)" : "var(--muted-text)"}>{r.status}</CCTag>
                    {r.is_starter && <CCTag accent="var(--cc-violet)">starter</CCTag>}
                  </div>
                  {r.description && <div className="mt-0.5 text-[11px] text-cc-muted">{r.description}</div>}
                </div>
                <Switch checked={r.status === "active"} onCheckedChange={() => flip(r)} />
              </li>
            ))}
          </ul>
        )}
      </CCPanel>
    </div>
  );
}