import { useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import type { NormalizedGraph, GraphNode, Category } from "@/lib/graph/types";
import { supabase } from "@/integrations/supabase/client";
import { useCapismLive, logCapismEvent, type CapismEvent } from "@/lib/graph/useCapismLive";

// ────────────────────────────────────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────────────────────────────────────

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number>(0);
  useEffect(() => {
    fromRef.current = value;
    startRef.current = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

function fmtClock(t: number): { time: string; date: string } {
  const d = new Date(t);
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const date = d
    .toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
    .toUpperCase();
  return { time, date };
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ────────────────────────────────────────────────────────────────────────────
// Metrics
// ────────────────────────────────────────────────────────────────────────────

type Metrics = {
  coreSync: number;
  efficiency: number;
  imageShare: number;
  neuralLoad: number;
  coreTemp: number;
  cpu: number;
  memory: number;
  gpu: number;
  network: number;
  storage: number;
  power: number;
  eventsPerSec: number;
  queriesPerSec: number;
  errorRate: number;
  successRate: number;
  nodesActive: number;
  regionsOnline: number;
  throughput: number;
  topCommunities: { id: number; name: string; count: number; pct: number; accent: string }[];
  categorySeries: Record<Category, number>;
  threat: "LOW" | "MED" | "HIGH";
};

const ACCENTS = ["#22d3ee", "#a855f7", "#f43f5e", "#f59e0b", "#22c55e", "#38bdf8"];

function useCapismMetrics(graph: NormalizedGraph): Metrics {
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const captures = useGraphStore((s) => s.captures);
  const selectedId = useGraphStore((s) => s.selectedId);

  return useMemo<Metrics>(() => {
    const nodes = graph.nodes;
    const total = Math.max(1, nodes.length);
    const withImage = nodes.filter((n) => !!n.image).length;
    const imageShare = withImage / total;

    const catCounts = graph.categoryCounts;
    const cpu = (catCounts.code ?? 0) / total;
    const memory = (catCounts.blog ?? 0) / total;
    const gpu = (catCounts.image ?? 0) / total;
    const network = Math.min(1, graph.links.length / (total * 2));
    const storage = Math.min(1, captures.length / 40);

    // filtered set
    const anyCat = activeCategories.size > 0;
    const filtered = nodes.filter((n) => {
      if (activeCommunity != null && n.community !== activeCommunity) return false;
      if (anyCat && !activeCategories.has(n.category)) return false;
      return true;
    });
    const neuralLoad = filtered.length / total;

    // core temp: mapped from average degree (0..~10) to 30..80°C
    const avgDeg = nodes.reduce((a, n) => a + (n.degree ?? 0), 0) / total;
    const coreTemp = 30 + Math.min(50, avgDeg * 4);

    // efficiency: nodes with a resolved image + community assignment
    const efficiency =
      nodes.filter((n) => !!n.image && n.community != null).length / total;

    // core sync — weighted composite
    const coreSync = 0.5 * imageShare + 0.3 * network + 0.2 * (1 - neuralLoad * 0.5);

    // top communities
    const communityMembers = new Map<number, GraphNode[]>();
    for (const n of nodes) {
      if (n.community == null) continue;
      const arr = communityMembers.get(n.community) ?? [];
      arr.push(n);
      communityMembers.set(n.community, arr);
    }
    const topCommunities = graph.communities
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((c, i) => ({
        id: c.id,
        name: c.name,
        count: c.count,
        pct: c.count / total,
        accent: ACCENTS[i % ACCENTS.length],
      }));

    // throughput proxy
    const throughput = graph.links.length;
    const nodesActive = filtered.length;
    const regionsOnline = graph.communities.length;

    // faux live rates seeded by graph shape (kept stable per graph)
    const eventsPerSec = Math.round(total * 8 + graph.links.length * 0.5);
    const queriesPerSec = Math.round(total * 4 + captures.length * 10);
    const errorRate = Math.max(0, 0.5 - imageShare * 0.4);
    const successRate = 100 - errorRate;

    const threat: Metrics["threat"] =
      neuralLoad > 0.85 ? "HIGH" : neuralLoad > 0.5 ? "MED" : "LOW";

    return {
      coreSync: coreSync * 100,
      efficiency: efficiency * 100,
      imageShare: imageShare * 100,
      neuralLoad: neuralLoad * 100,
      coreTemp,
      cpu: cpu * 100,
      memory: memory * 100,
      gpu: gpu * 100,
      network: network * 100,
      storage: storage * 100,
      power: 100,
      eventsPerSec,
      queriesPerSec,
      errorRate,
      successRate,
      nodesActive,
      regionsOnline,
      throughput,
      topCommunities,
      categorySeries: catCounts,
      threat,
    };
    // selectedId included so ring reacts to selection
  }, [graph, activeCategories, activeCommunity, captures, selectedId]);
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function Sparkline({
  values,
  color,
  width = 80,
  height = 22,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-6, max - min);
  const step = width / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
    </svg>
  );
}

function StatCard({
  label,
  value,
  suffix,
  color,
  series,
}: {
  label: string;
  value: string;
  suffix?: string;
  color: string;
  series: number[];
}) {
  return (
    <div className="relative rounded-lg border border-white/10 bg-black/40 px-3 py-2 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-40 [background:linear-gradient(180deg,transparent,rgba(255,255,255,0.03))]" />
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-widest text-white/50">
          {label}
        </span>
        <span
          className="size-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="font-mono text-lg leading-none" style={{ color }}>
          {value}
          {suffix && <span className="text-[10px] text-white/50 ml-1">{suffix}</span>}
        </div>
        <Sparkline values={series} color={color} />
      </div>
    </div>
  );
}

function StatusBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const v = useCountUp(value);
  return (
    <div className="grid grid-cols-[70px_1fr_36px] items-center gap-3 text-[10px] font-mono">
      <span className="uppercase tracking-widest text-white/70">{label}</span>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${Math.max(0, Math.min(100, v))}%`,
            backgroundColor: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>
      <span className="text-right" style={{ color }}>
        {Math.round(v)}%
      </span>
    </div>
  );
}

function CoreRing({
  sync,
  efficiency,
  reducedMotion,
}: {
  sync: number;
  efficiency: number;
  reducedMotion: boolean;
}) {
  const s = useCountUp(sync);
  const e = useCountUp(efficiency);
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const rings = [
    { r: 118, color: "#22d3ee", w: 1.5, dash: "6 4", spin: 60 },
    { r: 100, color: "#a855f7", w: 3, dash: `${(sync / 100) * 628} 628`, spin: 0 },
    { r: 82, color: "#f43f5e", w: 2, dash: "3 6", spin: -40 },
    { r: 64, color: "#22d3ee", w: 1, dash: "12 6", spin: 90 },
  ];
  return (
    <div className="relative flex items-center justify-center py-2">
      {/* Left/right vertical scales */}
      <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[9px] font-mono text-white/40 py-4">
        <span>100</span><span>75</span><span>50</span><span>25</span><span>0</span>
      </div>
      <div className="absolute right-0 top-0 h-full flex flex-col justify-between text-[9px] font-mono text-white/40 py-4 items-end">
        <span>MAX</span><span>75</span><span>50</span><span>25</span><span>MIN</span>
      </div>

      <svg width={size} height={size} className="overflow-visible">
        <defs>
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
            <stop offset="70%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={120} fill="url(#core-glow)" />
        {rings.map((r, i) => (
          <g
            key={i}
            style={{
              transformOrigin: `${cx}px ${cy}px`,
              animation: reducedMotion || r.spin === 0
                ? undefined
                : `capism-spin ${Math.abs(r.spin)}s linear infinite ${r.spin < 0 ? "reverse" : ""}`,
            }}
          >
            <circle
              cx={cx}
              cy={cy}
              r={r.r}
              fill="none"
              stroke={r.color}
              strokeWidth={r.w}
              strokeDasharray={r.dash}
              opacity={0.85}
              style={{ filter: `drop-shadow(0 0 4px ${r.color})` }}
            />
          </g>
        ))}
        {/* tick marks around outer */}
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
          const inner = 128;
          const outer = i % 5 === 0 ? 136 : 132;
          const x1 = cx + Math.cos(a) * inner;
          const y1 = cy + Math.sin(a) * inner;
          const x2 = cx + Math.cos(a) * outer;
          const y2 = cy + Math.sin(a) * outer;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#22d3ee"
              strokeWidth={i % 5 === 0 ? 1.2 : 0.6}
              opacity={0.5}
            />
          );
        })}
      </svg>

      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="font-mono text-[11px] tracking-[0.35em] text-cyan-300/90" style={{ textShadow: "0 0 8px #22d3ee" }}>
          C.A.P.I.S.M.
        </div>
        <div className="mt-1 text-[8px] font-mono uppercase tracking-widest text-white/50">
          Central AI Processing Interface
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[9px] font-mono text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: "0 0 6px #34d399" }} />
          ONLINE
        </div>
      </div>

      {/* Corner readouts */}
      <div className="absolute top-2 left-8 text-[10px] font-mono">
        <div className="text-rose-400/80 uppercase tracking-widest text-[8px]">Threat Lvl</div>
        <div className="text-rose-300 text-sm">LOW</div>
      </div>
      <div className="absolute top-2 right-8 text-[10px] font-mono text-right">
        <div className="text-fuchsia-400/80 uppercase tracking-widest text-[8px]">Efficiency</div>
        <div className="text-fuchsia-300 text-sm">{e.toFixed(1)}%</div>
      </div>
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 text-center">
        <div className="text-[8px] font-mono uppercase tracking-widest text-white/50">// Core Sync</div>
        <div className="text-cyan-300 font-mono text-sm">{s.toFixed(2)}%</div>
      </div>
    </div>
  );
}

// Rolling series for real-time analytics chart
function useRollingSeries(sample: () => number[], size = 40, tickMs = 1500) {
  const [buf, setBuf] = useState<number[][]>(() => [sample()]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setBuf((prev) => {
        const next = [...prev, sample()].slice(-size);
        return next;
      });
    }, tickMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return buf;
}

function AnalyticsChart({ metrics }: { metrics: Metrics }) {
  const buf = useRollingSeries(
    () => [
      metrics.cpu + (Math.random() - 0.5) * 8,
      metrics.memory + (Math.random() - 0.5) * 8,
      metrics.gpu + (Math.random() - 0.5) * 8,
      metrics.network + (Math.random() - 0.5) * 8,
    ],
    40,
    1500,
  );

  const width = 320;
  const height = 90;
  const series = [0, 1, 2, 3].map((idx) => buf.map((row) => row[idx] ?? 0));
  const colors = ["#22d3ee", "#a855f7", "#f43f5e", "#f59e0b"];
  const min = 0;
  const max = 100;
  const step = width / Math.max(1, buf.length - 1);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={0}
          x2={width}
          y1={height * p}
          y2={height * p}
          stroke="#ffffff"
          strokeOpacity={0.05}
        />
      ))}
      {series.map((s, i) => {
        if (s.length < 2) return null;
        const pts = s
          .map(
            (v, ix) =>
              `${(ix * step).toFixed(1)},${(height - ((v - min) / (max - min)) * height).toFixed(1)}`,
          )
          .join(" ");
        return (
          <polyline
            key={i}
            points={pts}
            fill="none"
            stroke={colors[i]}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: `drop-shadow(0 0 3px ${colors[i]})` }}
          />
        );
      })}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main panel
// ────────────────────────────────────────────────────────────────────────────

export function CapismHud({ graph }: { graph: NormalizedGraph }) {
  const [signedIn, setSignedIn] = useState(false);
  const mountedAtRef = useRef<number>(Date.now());
  const now = useNow(1000);
  const metrics = useCapismMetrics(graph);
  const captures = useGraphStore((s) => s.captures);
  const setCommunity = useGraphStore((s) => s.setCommunity);
  const select = useGraphStore((s) => s.select);
  const pulseNode = useGraphStore((s) => s.pulseNode);
  const setRightPanel = useGraphStore((s) => s.setRightPanel);
  const selectedId = useGraphStore((s) => s.selectedId);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);

  // Live database feed
  const { events: liveEvents, stats, connected } = useCapismLive(8);

  // Boot heartbeat on first mount
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    logCapismEvent("boot", {
      payload: { nodes: graph.nodes.length, links: graph.links.length },
    });
  }, [graph.nodes.length, graph.links.length]);

  // Log selections + community focus as live events
  useEffect(() => {
    if (!selectedId) return;
    const n = graph.byId.get(selectedId);
    if (!n) return;
    logCapismEvent("node_select", {
      node_id: n.id,
      node_label: n.label,
      community: n.community ?? null,
    });
  }, [selectedId, graph.byId]);
  useEffect(() => {
    if (activeCommunity == null) return;
    const c = graph.communities.find((x) => x.id === activeCommunity);
    logCapismEvent("community_focus", {
      community: activeCommunity,
      payload: { name: c?.name ?? null, count: c?.count ?? null },
    });
  }, [activeCommunity, graph.communities]);

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Auth for security level
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setSignedIn(!!session),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Rolling sparkline series for the stat cards
  const [tempSeries, setTempSeries] = useState<number[]>([]);
  const [loadSeries, setLoadSeries] = useState<number[]>([]);
  useEffect(() => {
    const id = window.setInterval(() => {
      setTempSeries((s) => [...s, metrics.coreTemp + (Math.random() - 0.5) * 2].slice(-24));
      setLoadSeries((s) => [...s, metrics.neuralLoad + (Math.random() - 0.5) * 4].slice(-24));
    }, 1500);
    return () => window.clearInterval(id);
  }, [metrics.coreTemp, metrics.neuralLoad]);

  const uptime = fmtUptime(now - mountedAtRef.current);
  const { time, date } = fmtClock(now);

  const recentCaptures = useMemo(() => {
    return [...captures]
      .sort((a, b) => {
        const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
        const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
        return tb - ta;
      })
      .slice(0, 4);
  }, [captures]);

  const jumpCommunity = (id: number) => {
    setCommunity(id);
  };

  const jumpNode = (id: string) => {
    select(id);
    pulseNode(id);
    setRightPanel(true);
    window.setTimeout(() => pulseNode(null), 2500);
  };

  return (
    <div className="h-full flex flex-col bg-[#050914] text-white">
        <style>{`
          @keyframes capism-spin { to { transform: rotate(360deg); } }
          @keyframes capism-scan {
            0% { transform: translateY(-100%); opacity: 0; }
            10% { opacity: 0.6; }
            100% { transform: translateY(100%); opacity: 0; }
          }
          .capism-scan::after {
            content: '';
            position: absolute; inset: 0;
            background: linear-gradient(180deg, transparent, rgba(34,211,238,0.15), transparent);
            pointer-events: none;
            animation: capism-scan 6s linear infinite;
          }
        `}</style>

        {/* Header */}
        <div className="relative overflow-hidden border-b border-cyan-500/20 bg-gradient-to-b from-cyan-500/[0.04] to-transparent px-4 py-3 capism-scan">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className="font-mono text-base tracking-[0.2em] text-cyan-200"
                style={{ textShadow: "0 0 10px rgba(34,211,238,0.6)" }}
              >
                C.A.P.I.S.M.
              </div>
              <div className="text-[8px] font-mono uppercase tracking-widest text-white/50 leading-tight mt-0.5">
                Cognitive Adaptive Processing
                <br />& Intelligent Systems Matrix
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-lg text-cyan-100 leading-none">{time}</div>
              <div className="font-mono text-[9px] text-white/50 mt-1 tracking-widest">
                {date}
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[9px] font-mono text-white/40 uppercase tracking-widest">
            <span>OS v4.3.7</span>
            <span>|</span>
            <span>Build {String(graph.nodes.length).padStart(4, "0")}.{String(graph.links.length).padStart(2, "0")}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Top stat cards */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="AI Core Temp"
              value={metrics.coreTemp.toFixed(1)}
              suffix="°C"
              color="#f59e0b"
              series={tempSeries}
            />
            <StatCard
              label="Neural Load"
              value={`${metrics.neuralLoad.toFixed(0)}`}
              suffix="%"
              color="#a855f7"
              series={loadSeries}
            />
            <StatCard
              label="System Uptime"
              value={uptime}
              color="#22d3ee"
              series={[]}
            />
            <StatCard
              label="Security Lvl"
              value={signedIn ? "ALPHA" : "BETA"}
              color={signedIn ? "#22c55e" : "#f59e0b"}
              series={[]}
            />
          </div>

          {/* Core ring */}
          <div className="relative rounded-lg border border-cyan-500/20 bg-black/40 px-4 pt-6 pb-2">
            <CoreRing
              sync={metrics.coreSync}
              efficiency={metrics.efficiency}
              reducedMotion={reducedMotion}
            />
            <div className="mt-1 grid grid-cols-2 gap-4 text-[10px] font-mono">
              <div>
                <div className="text-white/40 uppercase tracking-widest text-[9px]">Data Flow</div>
                <div className="text-cyan-300 text-sm">
                  {(metrics.throughput / 100).toFixed(2)} <span className="text-white/40 text-[9px]">TB/s</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-white/40 uppercase tracking-widest text-[9px]">Response</div>
                <div className="text-fuchsia-300 text-sm">
                  {(4 + (100 - metrics.coreSync) * 0.1).toFixed(1)} <span className="text-white/40 text-[9px]">ms</span>
                </div>
              </div>
            </div>
          </div>

          {/* System status bars */}
          <section className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/70">
                System Status
              </h3>
              <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>
            </div>
            <StatusBar label="CPU" value={metrics.cpu} color="#22d3ee" />
            <StatusBar label="Memory" value={metrics.memory} color="#a855f7" />
            <StatusBar label="GPU" value={metrics.gpu} color="#f43f5e" />
            <StatusBar label="Network" value={metrics.network} color="#22c55e" />
            <StatusBar label="Storage" value={metrics.storage} color="#38bdf8" />
            <StatusBar label="Power" value={metrics.power} color="#f59e0b" />
          </section>

          {/* AI Models = top communities */}
          <section className="rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/70">
                AI Models
              </h3>
              <span className="text-[9px] font-mono text-emerald-300">ACTIVE</span>
            </div>
            <div className="space-y-2">
              {metrics.topCommunities.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => jumpCommunity(c.id)}
                  className="w-full text-left group"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="truncate text-white/80 group-hover:text-white">
                      {c.name}
                    </span>
                    <span style={{ color: c.accent }}>{Math.round(c.pct * 100)}%</span>
                  </div>
                  <div className="h-1 mt-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${c.pct * 100}%`,
                        backgroundColor: c.accent,
                        boxShadow: `0 0 6px ${c.accent}`,
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Notifications */}
          <section className="rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/70">
                Notifications
              </h3>
              <span className="text-[9px] font-mono text-cyan-300">
                {recentCaptures.length} NEW
              </span>
            </div>
            {recentCaptures.length === 0 ? (
              <div className="text-[10px] font-mono text-white/40 py-3 text-center">
                No captures yet.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {recentCaptures.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => jumpNode(c.id)}
                      className="w-full flex items-center gap-2 text-[10px] font-mono text-left hover:text-cyan-200 transition-colors"
                    >
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: ACCENTS[i % ACCENTS.length],
                          boxShadow: `0 0 4px ${ACCENTS[i % ACCENTS.length]}`,
                        }}
                      />
                      <span className="text-white/50 tabular-nums w-10 shrink-0">
                        {timeAgo(c.updated_at)}
                      </span>
                      <span className="truncate text-white/80">{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Real-time analytics */}
          <section className="rounded-lg border border-white/10 bg-black/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-white/70">
                Real-Time Analytics
              </h3>
              <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
              </span>
            </div>
            <AnalyticsChart metrics={metrics} />
            <div className="mt-2 grid grid-cols-4 gap-2 text-[9px] font-mono">
              <div>
                <div className="text-white/40 uppercase tracking-widest">Events/s</div>
                <div className="text-cyan-300 text-sm">{metrics.eventsPerSec.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-white/40 uppercase tracking-widest">Queries/s</div>
                <div className="text-fuchsia-300 text-sm">{metrics.queriesPerSec.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-white/40 uppercase tracking-widest">Err %</div>
                <div className="text-rose-300 text-sm">{metrics.errorRate.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-white/40 uppercase tracking-widest">Success</div>
                <div className="text-emerald-300 text-sm">{metrics.successRate.toFixed(2)}</div>
              </div>
            </div>
          </section>

          {/* Footer readouts */}
          <section className="grid grid-cols-3 gap-2 text-[10px] font-mono">
            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="text-white/40 uppercase tracking-widest text-[9px]">Nodes</div>
              <div className="text-cyan-300 text-sm">
                {metrics.nodesActive.toLocaleString()}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="text-white/40 uppercase tracking-widest text-[9px]">Regions</div>
              <div className="text-fuchsia-300 text-sm">{metrics.regionsOnline}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
              <div className="text-white/40 uppercase tracking-widest text-[9px]">Throughput</div>
              <div className="text-emerald-300 text-sm">
                {(metrics.throughput / 100).toFixed(2)}
                <span className="text-white/40 text-[9px] ml-1">PB/s</span>
              </div>
            </div>
          </section>
        </div>
    </div>
  );
}