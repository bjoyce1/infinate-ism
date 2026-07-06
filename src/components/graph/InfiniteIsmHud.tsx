import { useEffect, useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { useGraphStore } from "@/lib/graph/useGraphStore";

type LayoutMode = "MACRO" | "MID" | "MICRO" | "FULL";
type LinkMode = "LITE" | "FULL";

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    />
  );
}

function Shape({ kind, color }: { kind: "circle" | "diamond" | "square"; color: string }) {
  if (kind === "diamond")
    return (
      <span
        className="inline-block size-2 rotate-45"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
    );
  if (kind === "square")
    return (
      <span
        className="inline-block size-2 rounded-[1px]"
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
    );
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
    />
  );
}

export function InfiniteIsmHud({ graph }: { graph: NormalizedGraph }) {
  const [layout, setLayout] = useState<LayoutMode>("MACRO");
  const [linkMode, setLinkMode] = useState<LinkMode>("FULL");
  const [paused, setPaused] = useState(false);
  const [flow, setFlow] = useState(true);
  const setLinkIntensity = useGraphStore((s) => s.setLinkIntensity);
  const setParticleIntensity = useGraphStore((s) => s.setParticleIntensity);
  const setAutoRotate = useGraphStore((s) => s.setAutoRotate);
  const linkIntensity = useGraphStore((s) => s.linkIntensity);

  // Layout mode → drives density of shown links & particles.
  useEffect(() => {
    const map: Record<LayoutMode, { link: number; part: number }> = {
      MACRO: { link: 0.6, part: 1 },
      MID: { link: 0.9, part: 1.2 },
      MICRO: { link: 1.3, part: 1.6 },
      FULL: { link: 1.6, part: 2 },
    };
    const m = map[layout];
    setLinkIntensity(m.link);
    setParticleIntensity(flow && !paused ? m.part : 0);
  }, [layout, flow, paused, setLinkIntensity, setParticleIntensity]);

  useEffect(() => {
    setAutoRotate(!paused && flow);
  }, [paused, flow, setAutoRotate]);

  const workspaces = graph.communities.length;
  const files = graph.nodes.length;
  const vectorIndexes = Math.max(1, Math.round(graph.communities.length / 2));
  const edges = graph.links.length;
  const recall7d = Math.min(edges, Math.round(files * 0.08));

  return (
    <>
      {/* Top-left: title & counts */}
      <div className="pointer-events-none absolute left-4 top-4 sm:left-6 sm:top-6 z-20 select-none">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          Memory Graph · 3D
        </div>
        <div className="mt-1 font-mono text-sm sm:text-base text-zinc-200">
          <span className="text-white font-semibold">{workspaces}</span>{" "}
          <span className="text-zinc-400">workspaces</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className="text-white font-semibold">{files}</span>{" "}
          <span className="text-zinc-400">memory files</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span className="text-white font-semibold">{vectorIndexes}</span>{" "}
          <span className="text-zinc-400">vector indexes</span>
        </div>
      </div>

      {/* Top-right: category dot legend */}
      <div className="pointer-events-none absolute right-4 top-4 sm:right-6 sm:top-6 z-20 flex items-center gap-4 font-mono text-[11px] text-zinc-300">
        <span className="flex items-center gap-1.5"><Dot color="#3DED97" /> Core</span>
        <span className="flex items-center gap-1.5"><Dot color="#E4E4E7" /> Workspace</span>
        <span className="flex items-center gap-1.5"><Dot color="#B794F4" /> Vector index</span>
        <span className="flex items-center gap-1.5"><Dot color="#F6AD55" /> Stale</span>
      </div>

      {/* Bottom-left: shape legend + LAYOUT tabs */}
      <div className="pointer-events-none absolute left-4 bottom-4 sm:left-6 sm:bottom-6 z-20 space-y-3">
        <div className="pointer-events-auto inline-flex items-center gap-3 rounded-md border border-white/10 bg-black/50 px-3 py-1.5 font-mono text-[10px] text-zinc-300 backdrop-blur-sm">
          <span className="flex items-center gap-1.5"><Shape kind="circle" color="#3DED97" /> Memory Core</span>
          <span className="flex items-center gap-1.5"><Shape kind="circle" color="#E4E4E7" /> Workspace</span>
          <span className="flex items-center gap-1.5"><Shape kind="circle" color="#A1A1AA" /> File</span>
          <span className="flex items-center gap-1.5"><Shape kind="diamond" color="#B794F4" /> Decision</span>
          <span className="flex items-center gap-1.5"><Shape kind="square" color="#63B3ED" /> Session</span>
          <span className="flex items-center gap-1.5"><Shape kind="square" color="#F687B3" /> Skill</span>
        </div>
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/60 p-3 backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-zinc-500">Layout</span>
            <span className="font-mono text-[9px] text-zinc-500">Structured</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(["MACRO", "MID", "MICRO", "FULL"] as LayoutMode[]).map((m) => {
              const active = layout === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLayout(m)}
                  className={`group flex h-14 w-16 flex-col items-center justify-center gap-1 rounded-md border transition-colors ${
                    active
                      ? "border-white/40 bg-white/[0.06]"
                      : "border-white/10 bg-black/40 hover:border-white/20"
                  }`}
                >
                  <LayoutIcon mode={m} active={active} />
                  <span
                    className={`font-mono text-[9px] tracking-widest ${
                      active ? "text-zinc-100" : "text-zinc-400"
                    }`}
                  >
                    {m}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom-right: transport + link mode + stats */}
      <div className="pointer-events-auto absolute right-4 bottom-4 sm:right-6 sm:bottom-6 z-20 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-white/10 bg-black/60 px-3 py-2 font-mono text-[11px] text-zinc-300 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 hover:border-white/25"
          >
            <span className="inline-block h-2.5 w-2.5 border-l-[3px] border-r-[3px] border-zinc-300" />
            {paused ? "Play" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => setFlow((f) => !f)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 transition-colors ${
              flow ? "border-white/25 bg-white/[0.05]" : "border-white/10 hover:border-white/25"
            }`}
          >
            <span>✧</span> Flow
          </button>
          <div className="mx-1 inline-flex overflow-hidden rounded border border-white/10">
            {(["LITE", "FULL"] as LinkMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLinkMode(m)}
                className={`px-2 py-1 text-[10px] tracking-widest ${
                  linkMode === m ? "bg-white/[0.08] text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {m === "FULL" ? "✦ FULL" : "LITE"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500">Links</span>
            <input
              type="range"
              min={0.2}
              max={2}
              step={0.05}
              value={linkIntensity}
              onChange={(e) => setLinkIntensity(parseFloat(e.target.value))}
              className="h-1 w-24 accent-zinc-300"
            />
          </div>
          <div className="flex items-center gap-3 pl-2 text-zinc-400">
            <span>Nodes <span className="text-zinc-100 font-semibold">{files}</span></span>
            <span>Edges <span className="text-zinc-100 font-semibold">{edges}</span></span>
            <span>Recall 7d <span className="text-zinc-100 font-semibold">{recall7d}</span></span>
          </div>
      </div>
    </>
  );
}

function LayoutIcon({ mode, active }: { mode: LayoutMode; active: boolean }) {
  const stroke = active ? "#E4E4E7" : "#71717A";
  const glow = active ? "#3DED97" : "#52525B";
  if (mode === "MACRO")
    return (
      <svg width="26" height="20" viewBox="0 0 26 20" fill="none">
        <circle cx="13" cy="10" r="2.5" fill={glow} />
        <line x1="13" y1="10" x2="3" y2="4" stroke={stroke} strokeWidth="0.5" />
        <line x1="13" y1="10" x2="23" y2="4" stroke={stroke} strokeWidth="0.5" />
        <line x1="13" y1="10" x2="3" y2="16" stroke={stroke} strokeWidth="0.5" />
        <line x1="13" y1="10" x2="23" y2="16" stroke={stroke} strokeWidth="0.5" />
        <circle cx="3" cy="4" r="1" fill={stroke} />
        <circle cx="23" cy="4" r="1" fill={stroke} />
        <circle cx="3" cy="16" r="1" fill={stroke} />
        <circle cx="23" cy="16" r="1" fill={stroke} />
      </svg>
    );
  if (mode === "MID")
    return (
      <svg width="26" height="20" viewBox="0 0 26 20" fill="none">
        <circle cx="13" cy="10" r="2" fill={glow} />
        {[0, 60, 120, 180, 240, 300].map((a) => {
          const x = 13 + Math.cos((a * Math.PI) / 180) * 7;
          const y = 10 + Math.sin((a * Math.PI) / 180) * 6;
          return <circle key={a} cx={x} cy={y} r="1" fill={stroke} />;
        })}
      </svg>
    );
  if (mode === "MICRO")
    return (
      <svg width="26" height="20" viewBox="0 0 26 20" fill="none">
        {Array.from({ length: 10 }).map((_, i) => {
          const x = 4 + ((i * 13) % 20);
          const y = 3 + ((i * 7) % 14);
          return <circle key={i} cx={x} cy={y} r="0.9" fill={stroke} />;
        })}
      </svg>
    );
  return (
    <svg width="26" height="20" viewBox="0 0 26 20" fill="none">
      {Array.from({ length: 18 }).map((_, i) => {
        const x = 3 + ((i * 5) % 22);
        const y = 3 + ((i * 3) % 15);
        return <circle key={i} cx={x} cy={y} r="0.7" fill={stroke} opacity={0.75} />;
      })}
    </svg>
  );
}