import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getDashboard, createCapture, setTaskStatus } from "@/lib/brain.functions";
import { AppShell, GlassCard, NeonButton, priorityColor, statusColor } from "@/components/brain/AppShell";
import { Plus, Check, ArrowRight, Zap, Target, Inbox as InboxIcon, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Command Dashboard — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const fetchDash = useServerFn(getDashboard);
  const createFn = useServerFn(createCapture);
  const setStatusFn = useServerFn(setTaskStatus);

  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDash() });
  const [quick, setQuick] = useState("");
  const [busy, setBusy] = useState(false);

  const complete = useMutation({
    mutationFn: (id: string) => setStatusFn({ data: { id, status: "done" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const submitQuick = async () => {
    if (!quick.trim() || busy) return;
    setBusy(true);
    try {
      await createFn({ data: { title: quick.slice(0, 200), body: quick, type: "note" } });
      setQuick("");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } finally { setBusy(false); }
  };

  const activeProjects = (data?.projects ?? []).filter((p) => p.status === "active");
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = (data?.tasks ?? []).filter((t) => !t.due_date || t.due_date <= today).slice(0, 6);
  const followUps = (data?.clients ?? []).filter((c) => c.follow_up_date).slice(0, 5);
  const inboxCount = data?.captures.length ?? 0;

  return (
    <AppShell title="Command Dashboard" actions={
      <NeonButton onClick={() => router.navigate({ to: "/inbox" })}>
        <Plus className="h-3.5 w-3.5" /> New capture
      </NeonButton>
    }>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Target} label="Active projects" value={activeProjects.length} accent="#3DED97" />
        <StatCard icon={Zap} label="Tasks today" value={todayTasks.length} accent="#F59E0B" />
        <StatCard icon={InboxIcon} label="Inbox" value={inboxCount} accent="#4C6FFF" />
        <StatCard icon={TrendingUp} label="Follow-ups" value={followUps.length} accent="#E879F9" />
      </div>

      {/* Quick capture */}
      <GlassCard className="p-4 mb-6">
        <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-[0.15em] text-white/40">
          <div className="h-1 w-1 rounded-full bg-[#3DED97]" /> Quick capture
        </div>
        <div className="flex gap-2">
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitQuick(); } }}
            placeholder="Drop a thought, link, lyric, idea… Enter to save."
            className="flex-1 bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm placeholder-white/30 focus:outline-none focus:border-[#3DED97]/50 focus:shadow-[0_0_0_3px_rgba(61,237,151,0.1)]"
          />
          <NeonButton onClick={submitQuick} disabled={busy || !quick.trim()}>Save</NeonButton>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's priorities */}
        <GlassCard className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-white/90">Today's priorities</h2>
            <Link to="/projects" className="text-xs text-[#3DED97] hover:underline">Projects →</Link>
          </div>
          {todayTasks.length === 0 ? (
            <p className="text-sm text-white/40">Nothing due. Cast a wider net or capture something.</p>
          ) : (
            <ul className="space-y-2">
              {todayTasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 p-2 -mx-2 rounded-md hover:bg-white/[0.03] group">
                  <button onClick={() => complete.mutate(t.id)} className="mt-0.5 h-4 w-4 rounded border border-white/20 hover:border-[#3DED97] flex items-center justify-center transition-colors">
                    <Check className="h-3 w-3 opacity-0 group-hover:opacity-40" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white/90">{t.title}</div>
                    <div className="flex items-center gap-2 mt-1 text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded border ${priorityColor[t.priority] ?? ""}`}>{t.priority}</span>
                      <span className={`px-1.5 py-0.5 rounded border ${statusColor[t.status] ?? ""}`}>{t.status}</span>
                      {t.due_date && <span className="text-white/40">due {t.due_date}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* Active projects */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-white/90">Active projects</h2>
            <Link to="/projects" className="text-xs text-[#3DED97] hover:underline">All →</Link>
          </div>
          <ul className="space-y-2">
            {activeProjects.slice(0, 8).map((p) => (
              <li key={p.id}>
                <Link to="/projects/$id" params={{ id: p.id }} className="flex items-center justify-between p-2 -mx-2 rounded-md hover:bg-white/[0.04] group">
                  <div className="min-w-0">
                    <div className="text-sm text-white/90 truncate">{p.name}</div>
                    {p.next_action && <div className="text-[11px] text-white/40 truncate">→ {p.next_action}</div>}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-white/20 group-hover:text-[#3DED97] group-hover:translate-x-0.5 transition-all" />
                </Link>
              </li>
            ))}
            {activeProjects.length === 0 && (
              <li className="text-sm text-white/40">
                No active projects.{" "}
                <Link to="/projects" className="text-[#3DED97] hover:underline">Start one →</Link>
              </li>
            )}
          </ul>
        </GlassCard>

        {/* Inbox preview */}
        <GlassCard className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-white/90">Recent captures</h2>
            <Link to="/inbox" className="text-xs text-[#3DED97] hover:underline">Inbox →</Link>
          </div>
          {(data?.captures ?? []).length === 0 ? (
            <p className="text-sm text-white/40">Inbox is clear. The quiet is a feature.</p>
          ) : (
            <ul className="space-y-2">
              {data?.captures.slice(0, 6).map((c) => (
                <li key={c.id} className="p-2 -mx-2 rounded-md hover:bg-white/[0.03]">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-[#3DED97]/70">{c.type.replace("_", " ")}</span>
                    <span className="text-[10px] text-white/30">{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-white/80 truncate">{c.title || c.body?.slice(0, 120)}</div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        {/* Follow-ups */}
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-white/90">Client follow-ups</h2>
            <Link to="/clients" className="text-xs text-[#3DED97] hover:underline">All →</Link>
          </div>
          <ul className="space-y-2">
            {followUps.map((c) => (
              <li key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-white/80 truncate">{c.name}</span>
                <span className="text-[11px] text-white/40">{c.follow_up_date}</span>
              </li>
            ))}
            {followUps.length === 0 && <li className="text-sm text-white/40">Nothing scheduled.</li>}
          </ul>
        </GlassCard>
      </div>
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Target; label: string; value: number; accent: string }) {
  return (
    <GlassCard className="p-4 relative overflow-hidden">
      <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full blur-2xl opacity-40" style={{ background: accent }} />
      <div className="relative">
        <Icon className="h-4 w-4 mb-2" style={{ color: accent }} />
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-white/40 mt-0.5">{label}</div>
      </div>
    </GlassCard>
  );
}