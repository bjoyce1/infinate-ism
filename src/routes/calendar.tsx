import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty } from "@/components/command-center/Panels";
import { Button } from "@/components/ui/button";
import { Plug } from "lucide-react";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar — C.A.P.I.S.M." }, { name: "description", content: "Unified executive calendar across work, life, and travel." }] }),
  component: CalendarView,
});

function CalendarView() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader eyebrow="Time" title="Calendar" description="Meetings, travel, releases, and personal life on one time-blocked canvas." />
      <CCPanel title="Sync a calendar" subtitle="Connect Google Calendar or Outlook to activate this module.">
        <CCEmpty
          title="No calendar connected yet."
          hint="Once linked, C.A.P.I.S.M. will auto-block prep time, cluster deep work, and route conflicts to Chief of Staff."
          action={
            <Button asChild className="bg-cc-violet text-white hover:bg-cc-violet/90">
              <a href="/integrations"><Plug className="mr-2 size-4" /> Go to Integrations</a>
            </Button>
          }
        />
      </CCPanel>
    </div>
  );
}