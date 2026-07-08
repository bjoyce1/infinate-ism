import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/brain.functions";
import { AppShell, GlassCard } from "@/components/brain/AppShell";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/constellation")({
  head: () => ({ meta: [{ title: "Constellation — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: ConstellationPage,
});

function ConstellationPage() {
  const fetchFn = useServerFn(getDashboard);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchFn() });

  const nodes = useMemo(() => {
    if (!data) return [] as { id: string; label: string; x: number; y: number; color: string; r: number }[];
    const areas = data.areas.map((a, i) => {
      const t = (i / Math.max(data.areas.length, 1)) * Math.PI * 2;
      return { id: `a_${a.id}`, label: a.name, x: Math.cos(t) * 140, y: Math.sin(t) * 140, color: a.color ?? "#4C6FFF", r: 14 };
    });
    const projs = data.projects.map((p, i) => {
      const t = (i / Math.max(data.projects.length, 1)) * Math.PI * 2 + 0.2;
      return { id: `p_${p.id}`, label: p.name, x: Math.cos(t) * 280, y: Math.sin(t) * 280, color: "#3DED97", r: 8 };
    });
    return [...areas, ...projs];
  }, [data]);

  return (
    <AppShell title="Constellation">
      <GlassCard className="p-4 h-[70vh] relative overflow-hidden">
        <svg viewBox="-400 -300 800 600" className="w-full h-full">
          <defs>
            <radialGradient id="sun">
              <stop offset="0%" stopColor="#3DED97" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#3DED97" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="0" cy="0" r="200" fill="url(#sun)" />
          <circle cx="0" cy="0" r="140" fill="none" stroke="#ffffff10" strokeDasharray="2 4" />
          <circle cx="0" cy="0" r="280" fill="none" stroke="#ffffff10" strokeDasharray="2 4" />
          {nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <circle r={n.r} fill={n.color} opacity="0.9" style={{ filter: `drop-shadow(0 0 10px ${n.color})` }} />
              <text y={n.r + 14} textAnchor="middle" fill="white" fillOpacity="0.75" fontSize="10">{n.label}</text>
            </g>
          ))}
          <text x="0" y="4" textAnchor="middle" fill="#3DED97" fontSize="12" fontWeight="700" letterSpacing="2">YOU</text>
        </svg>
      </GlassCard>
      <div className="mt-4 text-xs text-white/40 text-center">Your areas orbit close; active projects sit further out. Tasks, notes, and links will populate the outer belt next.</div>
    </AppShell>
  );
}