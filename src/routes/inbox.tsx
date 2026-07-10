import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listInbox, updateInboxItem } from "@/lib/commandCenter.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtRelative } from "@/lib/commandCenter/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, Flame, Clock, MessageSquareReply, HelpCircle, ShieldAlert, Info, Trash2 } from "lucide-react";

export const Route = createFileRoute("/inbox")({
  head: () => ({ meta: [{ title: "Unified Inbox — C.A.P.I.S.M." }, { name: "description", content: "One inbox: gmail, slack, dm, and calendar — categorized by intent." }] }),
  component: InboxView,
});

const CATS = [
  { key: "urgent",          label: "Urgent",           Icon: Flame,           accent: "var(--cc-crimson)" },
  { key: "needs_reply",     label: "Needs Reply",      Icon: MessageSquareReply, accent: "var(--cc-gold)" },
  { key: "needs_decision",  label: "Needs Decision",   Icon: HelpCircle,      accent: "var(--cc-violet)" },
  { key: "waiting",         label: "Waiting On",       Icon: Clock,           accent: "var(--cc-cyan)" },
  { key: "finance_security",label: "Finance / Security", Icon: ShieldAlert,   accent: "var(--cc-emerald)" },
  { key: "fyi",             label: "FYI",              Icon: Info,            accent: "var(--muted-text)" },
  { key: "noise",           label: "Noise",            Icon: Trash2,          accent: "var(--muted-text)" },
] as const;
type CatKey = typeof CATS[number]["key"];

type Item = Awaited<ReturnType<typeof listInbox>>[number];

function InboxView() {
  const fetchInbox = useServerFn(listInbox);
  const patch = useServerFn(updateInboxItem);
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<CatKey>("urgent");

  useEffect(() => { fetchInbox({ data: undefined as never }).then(setItems); }, [fetchInbox]);

  const handle = async (id: string) => {
    try { await patch({ data: { id, is_handled: true } }); setItems((xs) => xs.filter((x) => x.id !== id)); }
    catch (e) { toast.error((e as Error).message); }
  };

  const bucket = items.filter((i) => !i.is_handled && (i.category ?? "fyi") === tab);
  const counts = CATS.map((c) => ({ ...c, n: items.filter((i) => !i.is_handled && (i.category ?? "fyi") === c.key).length }));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader eyebrow="Unified" title="Inbox" description="Every channel triaged by intent. Reply, decide, or dismiss — never scroll." />

      <div className="mb-4 flex flex-wrap gap-2">
        {counts.map((c) => {
          const active = c.key === tab;
          const Icon = c.Icon;
          return (
            <button
              key={c.key}
              onClick={() => setTab(c.key)}
              className={"group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors " + (active ? "text-cc-text" : "text-cc-muted hover:text-cc-text")}
              style={{ borderColor: active ? c.accent : "var(--color-cc-border)", background: active ? `${c.accent}18` : "rgba(0,0,0,0.25)" }}
            >
              <Icon className="size-3.5" style={{ color: c.accent }} />
              {c.label}
              <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-cc-muted">{c.n}</span>
            </button>
          );
        })}
      </div>

      <CCPanel>
        {bucket.length === 0 ? (
          <CCEmpty title="Nothing here." hint="Connect Gmail, Slack, or Calendar in Integrations to see real messages routed by intent." />
        ) : (
          <ul className="divide-y divide-cc-border">
            {bucket.map((c) => (
              <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-3 sm:grid-cols-[80px_minmax(0,1fr)_auto]">
                <div className="hidden shrink-0 sm:block"><CCTag accent="var(--cc-cyan)">{c.source}</CCTag></div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-cc-text">{c.subject ?? c.sender ?? "Message"}</div>
                  <div className="mt-0.5 truncate text-[11px] text-cc-muted">{c.sender ?? ""} · {c.snippet}</div>
                  {c.suggested_action && <div className="mt-1 text-[11px] italic text-cc-emerald">Suggested: {c.suggested_action}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden font-mono text-[10px] text-cc-muted md:inline">{fmtRelative(c.received_at)}</span>
                  <Button size="sm" variant="outline" onClick={() => handle(c.id)} className="h-7 border-cc-border bg-black/30 px-2 text-[11px] text-cc-emerald hover:bg-white/[0.04]">
                    <Check className="mr-1 size-3" /> Handled
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CCPanel>
    </div>
  );
}