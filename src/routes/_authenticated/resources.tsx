import { createFileRoute } from "@tanstack/react-router";
import { AppShell, GlassCard } from "@/components/brain/AppShell";

export const Route = createFileRoute("/_authenticated/resources")({
  head: () => ({ meta: [{ title: "Resources — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <AppShell title="Resources">
      <GlassCard className="p-8 text-center">
        <div className="text-sm text-white/60">Resource library — templates, SOWs, design refs, brand assets, research. Coming next.</div>
      </GlassCard>
    </AppShell>
  ),
});