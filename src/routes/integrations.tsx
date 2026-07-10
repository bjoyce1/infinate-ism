import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCTag } from "@/components/command-center/Panels";
import { Button } from "@/components/ui/button";
import { Mail, Slack, Calendar, HardDrive, StickyNote, Github, MessageSquare, DollarSign } from "lucide-react";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations — C.A.P.I.S.M." }, { name: "description", content: "Connect Gmail, Slack, Calendar, Drive, Notion, GitHub, and more." }] }),
  component: IntegrationsView,
});

const CATALOG = [
  { name: "Gmail",            icon: Mail,        group: "Communication", desc: "Route email into the unified inbox by intent." },
  { name: "Slack",            icon: Slack,       group: "Communication", desc: "Ambient DMs and channel signals as messages." },
  { name: "Google Calendar",  icon: Calendar,    group: "Time",          desc: "Two-way sync, briefing packets, prep blocks." },
  { name: "Microsoft Outlook",icon: Mail,        group: "Communication", desc: "Alternate email + calendar path." },
  { name: "Google Drive",     icon: HardDrive,   group: "Documents",     desc: "Docs, sheets, and contracts as first-class references." },
  { name: "Notion",           icon: StickyNote,  group: "Documents",     desc: "Bring pages into the Second Brain graph." },
  { name: "GitHub",           icon: Github,      group: "Build",         desc: "Repo activity feeds into Mission Control." },
  { name: "Telegram",         icon: MessageSquare,group: "Communication", desc: "DM messages and voice notes into inbox." },
  { name: "Stripe",           icon: DollarSign,  group: "Finance",       desc: "Live invoice + subscription health." },
];

function IntegrationsView() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader eyebrow="Fabric" title="Integrations" description="Connect the systems that feed your day. Each integration becomes an intelligence layer, not just a data pipe." />
      <CCPanel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATALOG.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.name} className="rounded-lg border border-cc-border bg-black/25 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-md border border-cc-border bg-black/40">
                    <Icon className="size-4 text-cc-text" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-cc-text">{c.name}</div>
                    <CCTag>{c.group}</CCTag>
                  </div>
                </div>
                <p className="mb-3 text-[12px] text-cc-muted">{c.desc}</p>
                <Button size="sm" variant="outline" className="w-full border-cc-border bg-black/30 text-cc-text hover:bg-white/[0.04]">Connect</Button>
              </div>
            );
          })}
        </div>
      </CCPanel>
    </div>
  );
}