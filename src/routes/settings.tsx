import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCTag } from "@/components/command-center/Panels";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — C.A.P.I.S.M." }, { name: "description", content: "Account, appearance, keyboard, and system settings." }] }),
  component: SettingsView,
});

function SettingsView() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <PageHeader eyebrow="System" title="Settings" description="Tune your command surface. Simple defaults, deep controls." />
      <div className="grid gap-4 lg:grid-cols-2">
        <CCPanel title="Account">
          <div className="space-y-2 text-[13px]">
            <div className="flex items-center gap-2"><CCTag>signed in</CCTag><span className="font-mono text-cc-text">{email ?? "guest"}</span></div>
            <Button size="sm" variant="outline" onClick={async () => { await supabase.auth.signOut(); location.href = "/auth"; }} className="border-cc-border bg-black/30 text-cc-crimson hover:bg-white/[0.04]"><LogOut className="mr-2 size-3.5" /> Sign out</Button>
          </div>
        </CCPanel>
        <CCPanel title="Keyboard">
          <ul className="space-y-2 text-[13px] text-cc-muted">
            <li className="flex items-center justify-between"><span>Open Command Palette</span><kbd className="rounded border border-cc-border bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-cc-text">⌘K</kbd></li>
            <li className="flex items-center justify-between"><span>Ask Chief of Staff</span><kbd className="rounded border border-cc-border bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-cc-text">⌘J</kbd></li>
            <li className="flex items-center justify-between"><span>Quick Create</span><kbd className="rounded border border-cc-border bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-cc-text">⌘⇧N</kbd></li>
          </ul>
        </CCPanel>
        <CCPanel title="Appearance">
          <p className="text-[12px] text-cc-muted">Obsidian Executive is the only theme — carbon black + violet, cyan, gold accents. Motion respects your OS reduced-motion setting.</p>
        </CCPanel>
        <CCPanel title="Data & Privacy">
          <p className="text-[12px] text-cc-muted">All data lives in your Lovable Cloud project with row-level security. Server-side AI calls run through your Lovable AI Gateway credit balance.</p>
        </CCPanel>
      </div>
    </div>
  );
}