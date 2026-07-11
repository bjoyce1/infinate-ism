import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPages, getPage } from "@/lib/brain.functions";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Search, X, Menu, ChevronsUpDown, ChevronsDownUp, Sliders } from "lucide-react";

export const Route = createFileRoute("/constellation")({
  head: () => ({ meta: [
    { title: "Command Constellation — C.A.P.I.S.M." },
    { name: "description", content: "Orbital command instrument for the Second Brain — skills, memory, routines, applications radiating from CLAUDE_MD." },
  ]}),
  component: Constellation,
});

// ---------- Types ----------

type BrainPage = { id: string; slug: string; title: string; type: string; department: string | null; updated_at: string };
type GraphRaw = { nodes: Array<{ id: string; label?: string; file_type?: string; community?: number | null }>; links: Array<{ source: string; target: string }> };

type MemNode = {
  kind: "brain" | "graph";
  id: string;
  slug?: string;
  title: string;
  dept: DeptKey;
  degree: number;
  meta?: { file_type?: string; community?: number | null };
};

type DeptKey = "Personal" | "Product" | "Community" | "Content" | "Business";
type Layout = "force" | "circle" | "grid" | "rings";
type ViewMode = "departments" | "folders";

const DEPTS: DeptKey[] = ["Personal","Product","Community","Content","Business"];
const DEPT_COLOR: Record<DeptKey, string> = {
  Personal: "#F5D33F",
  Product:  "#3DE0C7",
  Community:"#4A9BFF",
  Content:  "#E840D3",
  Business: "#8B7BFF",
};
// Rings band colors
const C_SKILL = "#FF8C42";
const C_ROUTE = "#F5D33F";
const C_APP   = "#9DB6C9";
const C_CORE  = "#D18A3A";

// ---------- Classification ----------

function classifyGraphNode(n: { label?: string; file_type?: string }): DeptKey {
  const ft = n.file_type ?? "";
  if (ft === "code" || /route|component|config|module|hook/.test(ft)) return "Product";
  if (ft === "blog" || ft === "image" || ft === "video") return "Content";
  if (["music","artist","hub","release","shop","sound","archive","member","audio","album"].includes(ft)) return "Community";
  const label = (n.label ?? "").toLowerCase();
  if (/yates|school|class|family|personal|birthday|selflove|home/.test(label)) return "Personal";
  if (/mortuary|venture|paypal|invoice|client|business|llc|inc|studio|records/.test(label)) return "Business";
  if (/\.com|\.app|\.io|\.dev|site|component|config|route|api/.test(label)) return "Product";
  return "Community";
}

// Deterministic pseudo-random from string id — two floats in [0,1)
function hashSeed(s: string): { a: number; b: number; c: number } {
  let h1 = 2166136261 >>> 0, h2 = 5381 >>> 0, h3 = 52711 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = ((h2 << 5) + h2) ^ c;
    h3 = Math.imul(h3 ^ c, 2654435761);
  }
  return { a: (h1 >>> 0) / 4294967295, b: (h2 >>> 0) / 4294967295, c: (h3 >>> 0) / 4294967295 };
}

// ---------- Component ----------

function Constellation() {
  const fetchPages = useServerFn(listPages);
  const fetchPage = useServerFn(getPage);

  const [pages, setPages] = useState<BrainPage[]>([]);
  const [graph, setGraph] = useState<GraphRaw | null>(null);

  const [q, setQ] = useState("");
  const [layout, setLayout] = useState<Layout>("rings");
  const [view, setView] = useState<ViewMode>("departments");
  const [ringSpin, setRingSpin] = useState([0.4]);
  const [linkSpring, setLinkSpring] = useState([1.0]);
  const [maxSize, setMaxSize] = useState([1.0]);
  const [hideNames, setHideNames] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [dataOpen, setDataOpen] = useState(false);

  const [selected, setSelected] = useState<
    | { kind: "brain"; data: Awaited<ReturnType<typeof getPage>> }
    | { kind: "graph"; node: { id: string; label?: string; file_type?: string; community?: number | null; dept: DeptKey; neighbors: string[] } }
    | null
  >(null);

  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Pan / zoom stage transform.
  const stageRef = useRef<SVGSVGElement | null>(null);
  const [view3, setView3] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => { void fetchPages({ data: undefined as never }).then((r) => setPages(r as BrainPage[])); }, [fetchPages]);
  useEffect(() => { fetch("/graph.json").then((r) => r.ok ? r.json() as Promise<GraphRaw> : null).then((g) => g && setGraph(g)).catch(() => {}); }, []);

  // Rotation ticker.
  useEffect(() => {
    const loop = () => { setTick((t) => t + 1); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  // Build derived data.
  const skills = useMemo(() => pages.filter((p) => p.type === "skill"), [pages]);
  const routines = useMemo(() => pages.filter((p) => p.type === "routine"), [pages]);
  const apps = useMemo(() => pages.filter((p) => p.type === "application"), [pages]);

  const memoryNodes = useMemo<MemNode[]>(() => {
    const brain: MemNode[] = pages
      .filter((p) => !["skill","routine","application"].includes(p.type))
      .map((p) => ({
        kind: "brain", id: p.id, slug: p.slug, title: p.title,
        dept: (p.department as DeptKey) ?? "Business", degree: 8,
      }));
    if (!graph) return brain;
    const deg = new Map<string, number>();
    for (const l of graph.links) {
      deg.set(l.source, (deg.get(l.source) ?? 0) + 1);
      deg.set(l.target, (deg.get(l.target) ?? 0) + 1);
    }
    const gnodes: MemNode[] = graph.nodes.map((n) => ({
      kind: "graph", id: n.id, title: n.label ?? n.id,
      dept: classifyGraphNode(n),
      degree: deg.get(n.id) ?? 0,
      meta: { file_type: n.file_type, community: n.community ?? null },
    }));
    return [...brain, ...gnodes];
  }, [pages, graph]);

  const deptCounts = useMemo(() => {
    const c: Record<DeptKey, number> = { Personal: 0, Product: 0, Community: 0, Content: 0, Business: 0 };
    for (const n of memoryNodes) c[n.dept]++;
    return c;
  }, [memoryNodes]);

  // Search dim mask.
  const query = q.trim().toLowerCase();
  const dim = (title: string) => (query && !title.toLowerCase().includes(query) ? 0.08 : 1);

  // Pan/zoom handlers.
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView3((v) => {
      const k = Math.max(0.35, Math.min(4, v.k * factor));
      const nx = mx - ((mx - v.x) * (k / v.k));
      const ny = my - ((my - v.y) * (k / v.k));
      return { x: nx, y: ny, k };
    });
  };
  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[data-node]")) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: view3.x, oy: view3.y };
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    setView3((v) => ({ ...v, x: drag.current!.ox + (e.clientX - drag.current!.x), y: drag.current!.oy + (e.clientY - drag.current!.y) }));
  };
  const onUp = () => { drag.current = null; };

  const openBrain = useCallback(async (slug: string) => {
    const data = await fetchPage({ data: { slug } });
    setSelected({ kind: "brain", data });
  }, [fetchPage]);

  const openGraph = useCallback((id: string, dept: DeptKey) => {
    if (!graph) return;
    const raw = graph.nodes.find((n) => n.id === id);
    if (!raw) return;
    const neighbors = graph.links
      .filter((l) => l.source === id || l.target === id)
      .map((l) => (l.source === id ? l.target : l.source))
      .slice(0, 40);
    setSelected({ kind: "graph", node: { ...raw, dept, neighbors } });
  }, [graph]);

  // Stage dimensions.
  const W = 1600, H = 1200, cx = W / 2, cy = H / 2;
  const spin = tick * 0.0005 * ringSpin[0];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#050508] select-none">
      {/* Ambient haze */}
      <div className="pointer-events-none absolute inset-0" style={{
        background: "radial-gradient(circle at 50% 45%, rgba(139,123,255,0.10) 0%, rgba(5,5,8,0) 55%)",
      }} />

      {/* Stage */}
      <svg
        ref={stageRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        style={{ cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <defs>
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F5D33F" stopOpacity="0.55" />
            <stop offset="50%" stopColor={C_CORE} stopOpacity="0.18" />
            <stop offset="100%" stopColor={C_CORE} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="node-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g transform={`translate(${view3.x} ${view3.y}) scale(${view3.k})`}>
          {/* Faint link web across the center */}
          <LinkWeb cx={cx} cy={cy} tick={tick} spring={linkSpring[0]} />

          {/* Core glow */}
          <circle cx={cx} cy={cy} r={110} fill="url(#core-glow)" />

          {layout === "rings" && (
            <RingsStage
              cx={cx} cy={cy} spin={spin} maxSize={maxSize[0]} hideNames={hideNames}
              skills={skills} routines={routines} apps={apps}
              memory={memoryNodes} view={view}
              onBrain={openBrain} onGraph={openGraph}
              dim={dim}
            />
          )}
          {layout === "force" && (
            <ForceStage
              cx={cx} cy={cy} spin={spin} maxSize={maxSize[0]} hideNames={hideNames}
              skills={skills} routines={routines} apps={apps}
              memory={memoryNodes} deptCounts={deptCounts}
              expandAll={expandAll}
              onBrain={openBrain} onGraph={openGraph}
              dim={dim}
            />
          )}
          {layout === "circle" && (
            <CircleStage
              cx={cx} cy={cy} spin={spin} maxSize={maxSize[0]} hideNames={hideNames}
              memory={memoryNodes} skills={skills} routines={routines} apps={apps}
              onBrain={openBrain} onGraph={openGraph}
              dim={dim}
            />
          )}
          {layout === "grid" && (
            <GridStage
              cx={cx} cy={cy} maxSize={maxSize[0]} hideNames={hideNames}
              memory={memoryNodes} skills={skills} routines={routines} apps={apps}
              onBrain={openBrain} onGraph={openGraph}
              dim={dim}
            />
          )}

          {/* Core badge (rounded amber square) */}
          <g pointerEvents="none">
            <rect x={cx - 22} y={cy - 22} width={44} height={44} rx={9}
              fill="#0A0A0F" stroke={C_CORE} strokeWidth={1.5} />
            <rect x={cx - 16} y={cy - 16} width={32} height={32} rx={6}
              fill={C_CORE} fillOpacity={0.18} stroke={C_CORE} strokeOpacity={0.6} strokeWidth={0.5} />
            <text x={cx} y={cy + 4} textAnchor="middle" fill="#F5D33F" fontSize={10} className="font-mono font-bold">MD</text>
            <text x={cx} y={cy + 46} textAnchor="middle" fill="#D9C7A0" fontSize={9} letterSpacing={3} className="font-mono">CLAUDE_MD</text>
          </g>
        </g>
      </svg>

      {/* MENU pill top-right */}
      <button
        onClick={() => setPanelOpen((o) => !o)}
        className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full border border-[#C99A56] bg-black/60 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-[#E7C48A] shadow-[0_0_20px_rgba(201,154,86,0.25)] backdrop-blur hover:bg-black/80"
      >
        <Menu className="size-3" /> Menu
      </button>

      {/* Floating control panel */}
      {panelOpen && (
        <div className="absolute right-4 top-14 z-20 w-[280px] rounded-xl border border-white/10 bg-black/70 p-3 text-cc-text shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-cc-muted" />
            <Input
              ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${(memoryNodes.length).toLocaleString()}+ files… ( / )`}
              className="h-8 border-white/10 bg-black/40 pl-7 text-[12px] text-cc-text placeholder:text-cc-muted"
            />
          </div>

          <Segmented label="Layout" value={layout} onChange={(v) => setLayout(v as Layout)}
            options={[["force","Force"],["circle","Circle"],["grid","Grid"],["rings","Rings"]]} />
          <Segmented label="View" value={view} onChange={(v) => setView(v as ViewMode)}
            options={[["departments","Departments"],["folders","Folders"]]} />

          <SliderRow label="Ring spin (rings + orbits)" value={ringSpin} onChange={setRingSpin} min={0} max={3} step={0.05} />

          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-cc-text/80">
            <input type="checkbox" checked={hideNames} onChange={(e) => setHideNames(e.target.checked)}
              className="size-3 accent-[#8B7BFF]" />
            Hide names
          </label>

          <SliderRow label="Link springs" value={linkSpring} onChange={setLinkSpring} min={0} max={3} step={0.05} showValue />
          <SliderRow label="Circle / Max size" value={maxSize} onChange={setMaxSize} min={0.5} max={2.2} step={0.05} showValue />

          <div className="mt-3 flex gap-2">
            <button onClick={() => setExpandAll(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-white/10 bg-black/40 py-1.5 font-mono text-[10px] uppercase tracking-widest text-cc-text hover:bg-white/[0.06]">
              <ChevronsUpDown className="size-3" /> Expand all
            </button>
            <button onClick={() => setExpandAll(false)}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border border-white/10 bg-black/40 py-1.5 font-mono text-[10px] uppercase tracking-widest text-cc-text hover:bg-white/[0.06]">
              <ChevronsDownUp className="size-3" /> Collapse all
            </button>
          </div>

          <button onClick={() => setDataOpen((o) => !o)}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-[#C99A56] bg-black/40 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[#E7C48A] hover:bg-black/60">
            <Sliders className="size-3" /> Data settings
          </button>

          {dataOpen && (
            <div className="mt-2 rounded-md border border-white/10 bg-black/50 p-2 text-[10px] text-cc-muted">
              <div className="mb-1 font-mono uppercase tracking-widest text-cc-muted">Departments</div>
              {DEPTS.map((d) => (
                <div key={d} className="flex items-center gap-2 py-0.5">
                  <span className="size-1.5 rounded-full" style={{ background: DEPT_COLOR[d] }} />
                  <span className="flex-1 text-cc-text/80">{d}</span>
                  <span className="font-mono text-cc-text">{deptCounts[d]}</span>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between text-cc-text/80">
                <span>Skills</span><span className="font-mono text-cc-text">{skills.length}</span>
              </div>
              <div className="flex items-center justify-between text-cc-text/80">
                <span>Routines</span><span className="font-mono text-cc-text">{routines.length}</span>
              </div>
              <div className="flex items-center justify-between text-cc-text/80">
                <span>Applications</span><span className="font-mono text-cc-text">{apps.length}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating detail overlay */}
      {selected && (
        <div className="absolute bottom-4 right-4 z-20 w-[340px] max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-black/75 p-4 text-cc-text shadow-[0_10px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <button onClick={() => setSelected(null)} className="absolute right-2 top-2 rounded p-1 text-cc-muted hover:text-cc-text"><X className="size-3.5" /></button>
          {selected.kind === "brain" && selected.data?.page ? (
            <BrainDetail data={selected.data} onOpen={openBrain} />
          ) : selected.kind === "graph" ? (
            <GraphDetail node={selected.node} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------- Small UI helpers ----------

function Segmented({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="mt-3">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-cc-muted">{label}</div>
      <div className="flex overflow-hidden rounded-md border border-white/10 bg-black/30">
        {options.map(([k, lbl]) => (
          <button key={k} onClick={() => onChange(k)}
            className={`flex-1 py-1 font-mono text-[10px] uppercase tracking-wider transition ${
              value === k ? "bg-white/[0.08] text-cc-text" : "text-cc-muted hover:text-cc-text/80"
            }`}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step, showValue }: {
  label: string; value: number[]; onChange: (v: number[]) => void;
  min: number; max: number; step: number; showValue?: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-cc-muted">
        <span>{label}</span>
        {showValue && <span className="text-cc-text/70">{value[0].toFixed(2)}</span>}
      </div>
      <Slider value={value} onValueChange={onChange} min={min} max={max} step={step} />
    </div>
  );
}

// ---------- Rings Stage ----------

type StageCommon = {
  cx: number; cy: number; spin: number; maxSize: number; hideNames: boolean;
  onBrain: (slug: string) => void;
  onGraph: (id: string, dept: DeptKey) => void;
  dim: (title: string) => number;
};

function RingsStage(props: StageCommon & {
  skills: BrainPage[]; routines: BrainPage[]; apps: BrainPage[];
  memory: MemNode[]; view: ViewMode;
}) {
  const { cx, cy, spin, maxSize, hideNames, skills, routines, apps, memory, onBrain, onGraph, dim } = props;

  // Radii
  const SKILL_RADII = [110, 132, 154];
  const MEMORY_RMIN = 210, MEMORY_RMAX = 400;
  const MEMORY_RADII = [220, 250, 280, 310, 340, 370, 395];
  const ROUTE_R = 450;
  const APP_R = 530;

  // Memory bucketing by dept.
  const deptSlots: Array<{ dept: DeptKey; a0: number; a1: number }> = DEPTS.map((d, i) => {
    const slot = (Math.PI * 2) / DEPTS.length;
    const gap = 0.05;
    return { dept: d, a0: i * slot + gap, a1: (i + 1) * slot - gap };
  });

  return (
    <g>
      {/* SKILLS band — 3 tight dotted rings */}
      {SKILL_RADII.map((r, i) => (
        <circle key={"sr"+i} cx={cx} cy={cy} r={r} fill="none"
          stroke={C_SKILL} strokeOpacity={0.35} strokeWidth={1}
          strokeDasharray="1 5" />
      ))}
      <BandLabel cx={cx} cy={cy - SKILL_RADII[SKILL_RADII.length - 1] - 8} text="SKILLS" color={C_SKILL} />

      {/* MEMORY band — many concentric dotted trails */}
      {MEMORY_RADII.map((r, i) => (
        <circle key={"mr"+i} cx={cx} cy={cy} r={r} fill="none"
          stroke="#8B7BFF" strokeOpacity={0.14} strokeWidth={1}
          strokeDasharray="1 6" />
      ))}
      <BandLabel cx={cx} cy={cy - MEMORY_RMAX - 8} text="MEMORY" color="#8B7BFF" />

      {/* Dept sub-labels around MEMORY band */}
      {deptSlots.map(({ dept, a0, a1 }) => {
        const mid = (a0 + a1) / 2 + spin * 0.4;
        const r = MEMORY_RMAX + 22;
        const x = cx + Math.cos(mid) * r;
        const y = cy + Math.sin(mid) * r;
        return (
          <text key={"dl"+dept} x={x} y={y} textAnchor="middle" fill={DEPT_COLOR[dept]} fillOpacity={0.85}
            fontSize={9} letterSpacing={2} className="font-mono">{dept.toUpperCase()}</text>
        );
      })}

      {/* ROUTINES ring */}
      <circle cx={cx} cy={cy} r={ROUTE_R} fill="none" stroke={C_ROUTE} strokeOpacity={0.4}
        strokeWidth={1} strokeDasharray="2 5" />
      <BandLabel cx={cx} cy={cy - ROUTE_R - 8} text="ROUTINES" color={C_ROUTE} />

      {/* APPLICATIONS ring */}
      <circle cx={cx} cy={cy} r={APP_R} fill="none" stroke={C_APP} strokeOpacity={0.45}
        strokeWidth={1} strokeDasharray="2 6" />
      <BandLabel cx={cx} cy={cy - APP_R - 8} text="APPLICATIONS" color={C_APP} />

      {/* MEMORY nodes — filling arc-trails */}
      {memory.map((n) => {
        const slot = deptSlots.find((s) => s.dept === n.dept)!;
        const seed = hashSeed(n.id);
        const rIdx = Math.floor(seed.a * MEMORY_RADII.length);
        const r = MEMORY_RADII[rIdx];
        const angleWithin = seed.b;
        const speed = 1 - rIdx / (MEMORY_RADII.length + 4);
        const a = slot.a0 + angleWithin * (slot.a1 - slot.a0) + spin * 0.5 * speed;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        // Size by degree, clamped small.
        const deg = Math.max(1, Math.min(40, n.degree));
        const size = (1 + Math.sqrt(deg) * 0.35) * maxSize;
        const bright = 0.5 + Math.min(0.5, deg / 40) * 0.5;
        const op = dim(n.title) * bright;
        const glow = seed.c > 0.985;
        return (
          <g key={n.id} data-node
            className="cursor-pointer"
            onClick={(e) => { e.stopPropagation(); if (n.kind === "brain") onBrain(n.slug!); else onGraph(n.id, n.dept); }}
          >
            {glow && <circle cx={x} cy={y} r={size * 3} fill={DEPT_COLOR[n.dept]} fillOpacity={0.1} />}
            <circle cx={x} cy={y} r={size} fill={DEPT_COLOR[n.dept]} fillOpacity={op} />
            {!hideNames && (deg > 20 || n.kind === "brain") && (
              <text x={x} y={y - size - 3} textAnchor="middle" fill="#e7e7f0" fillOpacity={op}
                fontSize={7} className="pointer-events-none font-mono">{n.title.slice(0, 20)}</text>
            )}
          </g>
        );
      })}

      {/* Dept badge nodes — one bigger colored node per dept slot */}
      {deptSlots.map(({ dept, a0, a1 }) => {
        const mid = (a0 + a1) / 2 + spin * 0.5;
        const r = 300;
        const x = cx + Math.cos(mid) * r;
        const y = cy + Math.sin(mid) * r;
        return (
          <g key={"db"+dept} pointerEvents="none">
            <circle cx={x} cy={y} r={10} fill={DEPT_COLOR[dept]} fillOpacity={0.9} />
            <circle cx={x} cy={y} r={16} fill="none" stroke={DEPT_COLOR[dept]} strokeOpacity={0.5} />
          </g>
        );
      })}

      {/* SKILLS dots — spread across 3 skill rings */}
      {skills.map((p, i) => {
        const ringR = SKILL_RADII[i % SKILL_RADII.length];
        const a = (i / Math.max(skills.length, 1)) * Math.PI * 2 + spin * 1.3;
        const x = cx + Math.cos(a) * ringR;
        const y = cy + Math.sin(a) * ringR;
        const op = dim(p.title);
        return (
          <g key={p.id} data-node className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onBrain(p.slug); }}>
            <circle cx={x} cy={y} r={3 * maxSize} fill={C_SKILL} fillOpacity={op}>
              <animate attributeName="fillOpacity" values={`${0.4*op};${op};${0.4*op}`} dur="2.5s" repeatCount="indefinite" />
            </circle>
            {!hideNames && (
              <text x={x} y={y - 8} textAnchor="middle" fill="#e7e7f0" fillOpacity={op * 0.85}
                fontSize={7.5} className="pointer-events-none font-mono">{p.title.slice(0, 16)}</text>
            )}
          </g>
        );
      })}

      {/* ROUTINES — circled-dot badges evenly spaced */}
      {routines.map((p, i) => {
        const a = (i / Math.max(routines.length, 1)) * Math.PI * 2 + spin * 0.7;
        const x = cx + Math.cos(a) * ROUTE_R;
        const y = cy + Math.sin(a) * ROUTE_R;
        const op = dim(p.title);
        const s = 6 * maxSize;
        return (
          <g key={p.id} data-node className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onBrain(p.slug); }}>
            <circle cx={x} cy={y} r={s} fill="#0A0A0F" stroke={C_ROUTE} strokeWidth={1.3} strokeOpacity={op} />
            <circle cx={x} cy={y} r={s * 0.35} fill={C_ROUTE} fillOpacity={op} />
            {!hideNames && (
              <text x={x} y={y - s - 4} textAnchor="middle" fill="#e7e7f0" fillOpacity={op}
                fontSize={8} className="pointer-events-none font-mono">{p.title.slice(0, 18)}</text>
            )}
          </g>
        );
      })}

      {/* APPLICATIONS — hexagon badges */}
      {apps.map((p, i) => {
        const a = (i / Math.max(apps.length, 1)) * Math.PI * 2 + spin * 0.5;
        const x = cx + Math.cos(a) * APP_R;
        const y = cy + Math.sin(a) * APP_R;
        return (
          <AppHex key={p.id} x={x} y={y} size={11 * maxSize} title={p.title}
            onClick={() => onBrain(p.slug)} hideName={hideNames} opacity={dim(p.title)} />
        );
      })}
    </g>
  );
}

function BandLabel({ cx, cy, text, color }: { cx: number; cy: number; text: string; color: string }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" fill={color} fillOpacity={0.85}
      fontSize={10} letterSpacing={4} className="pointer-events-none font-mono">{text}</text>
  );
}

// Application hex with letter glyph.
function AppHex({ x, y, size, title, onClick, hideName, opacity }: {
  x: number; y: number; size: number; title: string; onClick: () => void; hideName: boolean; opacity: number;
}) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${x + Math.cos(a) * size},${y + Math.sin(a) * size}`);
  }
  const letter = title.replace(/^app[-_ ]/i, "").trim().slice(0, 1).toUpperCase() || "•";
  return (
    <g data-node className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onClick(); }} opacity={opacity}>
      <polygon points={pts.join(" ")} fill="#0A0A0F" stroke={C_APP} strokeWidth={1.2} />
      <text x={x} y={y + size * 0.35} textAnchor="middle" fill="#E7EEF6" fontSize={size * 0.9}
        className="font-mono font-bold pointer-events-none">{letter}</text>
      {!hideName && (
        <text x={x} y={y + size + 10} textAnchor="middle" fill="#cfcfe0" fillOpacity={0.75}
          fontSize={7.5} className="font-mono pointer-events-none">{title.replace(/^app[-_ ]/i, "").slice(0, 14)}</text>
      )}
    </g>
  );
}

// ---------- Force Stage ----------

function ForceStage(props: StageCommon & {
  skills: BrainPage[]; routines: BrainPage[]; apps: BrainPage[];
  memory: MemNode[]; deptCounts: Record<DeptKey, number>;
  expandAll: boolean;
}) {
  const { cx, cy, spin, maxSize, hideNames, skills, routines, apps, memory, deptCounts, expandAll, onBrain, onGraph, dim } = props;

  const clusters: Array<{ key: string; label: string; color: string; angle: number; radius: number; blob: number }> = [
    { key: "Community",    label: "COMMUNITY",    color: DEPT_COLOR.Community,  angle: -Math.PI * 0.75, radius: 380, blob: 110 },
    { key: "Content",      label: "CONTENT",      color: DEPT_COLOR.Content,    angle:  Math.PI,        radius: 380, blob: 100 },
    { key: "Personal",     label: "PERSONAL",     color: DEPT_COLOR.Personal,   angle: -Math.PI / 2,    radius: 260, blob: 150 },
    { key: "Product",      label: "PRODUCT",      color: DEPT_COLOR.Product,    angle:  Math.PI / 2,    radius: 300, blob: 100 },
    { key: "Business",     label: "BUSINESS",     color: DEPT_COLOR.Business,   angle:  Math.PI * 0.75, radius: 380, blob: 100 },
    { key: "Skills",       label: "SKILLS",       color: C_SKILL,               angle: -Math.PI * 0.95, radius: 460, blob: 60 },
    { key: "Routines",     label: "ROUTINES",     color: C_ROUTE,               angle:  Math.PI * 0.25, radius: 420, blob: 70 },
    { key: "Applications", label: "APPLICATIONS", color: C_APP,                 angle: -Math.PI * 0.25, radius: 460, blob: 70 },
  ];

  const centerFor = (c: (typeof clusters)[number]) => {
    const a = c.angle + spin * 0.15;
    return { x: cx + Math.cos(a) * c.radius, y: cy + Math.sin(a) * c.radius };
  };

  return (
    <g>
      {/* Faint inter-cluster web */}
      {clusters.map((c1, i) => clusters.slice(i + 1).map((c2, j) => {
        const p1 = centerFor(c1); const p2 = centerFor(c2);
        return <line key={"w"+i+"-"+j} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke="#ffffff" strokeOpacity={0.04} strokeWidth={0.5} />;
      }))}

      {clusters.map((c) => {
        const { x: ccx, y: ccy } = centerFor(c);
        const isDept = DEPTS.includes(c.key as DeptKey);
        const dept = c.key as DeptKey;
        const nodes = isDept
          ? memory.filter((n) => n.dept === dept)
          : c.key === "Skills" ? skills.map(brainToMem) : c.key === "Routines" ? routines.map(brainToMem) : apps.map(brainToMem);

        // Collapsed: show one big count badge; expanded: show all dots.
        const collapsed = !expandAll && nodes.length > 60;

        return (
          <g key={c.key}>
            <circle cx={ccx} cy={ccy} r={c.blob + 12} fill={c.color} fillOpacity={0.05}
              stroke={c.color} strokeOpacity={0.2} strokeDasharray="2 5" />
            <text x={ccx} y={ccy - c.blob - 12} textAnchor="middle" fill={c.color} fillOpacity={0.85}
              fontSize={10} letterSpacing={3} className="font-mono pointer-events-none">{c.label}</text>

            {collapsed ? (
              <g data-node className="cursor-pointer" onClick={() => {/* expand single — using global for now */}}>
                <circle cx={ccx} cy={ccy} r={38} fill={c.color} fillOpacity={0.15}
                  stroke={c.color} strokeOpacity={0.6} strokeWidth={1.5} />
                <text x={ccx} y={ccy - 2} textAnchor="middle" fill="#fff" fontSize={18}
                  className="font-mono font-bold pointer-events-none">{nodes.length.toLocaleString()}</text>
                <text x={ccx} y={ccy + 14} textAnchor="middle" fill="#cfcfe0" fillOpacity={0.7}
                  fontSize={7} letterSpacing={2} className="font-mono pointer-events-none">EXPAND</text>
              </g>
            ) : (
              nodes.map((n, i) => {
                const seed = hashSeed(n.id + i);
                const rr = Math.sqrt(seed.a) * c.blob;
                const aa = seed.b * Math.PI * 2 + spin * 0.5;
                const x = ccx + Math.cos(aa) * rr;
                const y = ccy + Math.sin(aa) * rr;
                const op = dim(n.title);
                if (c.key === "Applications") {
                  // Honeycomb — hexagons packed near cluster.
                  return <AppHex key={n.id} x={x} y={y} size={9 * maxSize} title={n.title}
                    onClick={() => n.kind === "brain" ? onBrain(n.slug!) : onGraph(n.id, n.dept)}
                    hideName={hideNames} opacity={op} />;
                }
                if (c.key === "Routines") {
                  const s = 5 * maxSize;
                  return (
                    <g key={n.id} data-node className="cursor-pointer" onClick={() => n.kind === "brain" ? onBrain(n.slug!) : onGraph(n.id, n.dept)}>
                      <circle cx={x} cy={y} r={s} fill="#0A0A0F" stroke={c.color} strokeWidth={1.3} strokeOpacity={op} />
                      <circle cx={x} cy={y} r={s * 0.4} fill={c.color} fillOpacity={op} />
                    </g>
                  );
                }
                if (c.key === "Skills") {
                  const s = 3 * maxSize;
                  return (
                    <g key={n.id} data-node className="cursor-pointer" onClick={() => n.kind === "brain" ? onBrain(n.slug!) : onGraph(n.id, n.dept)}>
                      <circle cx={x} cy={y} r={s * 2.2} fill={c.color} fillOpacity={0.08 * op} />
                      <circle cx={x} cy={y} r={s} fill={c.color} fillOpacity={op}>
                        <animate attributeName="fillOpacity" values={`${0.4*op};${op};${0.4*op}`} dur="2s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  );
                }
                const deg = Math.max(1, Math.min(40, n.degree));
                const size = (1 + Math.sqrt(deg) * 0.35) * maxSize;
                return (
                  <g key={n.id} data-node className="cursor-pointer"
                     onClick={() => n.kind === "brain" ? onBrain(n.slug!) : onGraph(n.id, n.dept)}>
                    <circle cx={x} cy={y} r={size} fill={c.color} fillOpacity={op * (0.5 + Math.min(0.5, deg / 40) * 0.5)} />
                  </g>
                );
              })
            )}
          </g>
        );
      })}
    </g>
  );
}

function brainToMem(p: BrainPage): MemNode {
  return { kind: "brain", id: p.id, slug: p.slug, title: p.title, dept: (p.department as DeptKey) ?? "Business", degree: 6 };
}

// ---------- Circle Stage ----------

function CircleStage(props: StageCommon & {
  memory: MemNode[]; skills: BrainPage[]; routines: BrainPage[]; apps: BrainPage[];
}) {
  const { cx, cy, spin, maxSize, hideNames, memory, skills, routines, apps, onBrain, onGraph, dim } = props;
  // All memory sorted by dept, on one big circle. Skills/routines/apps on inner + outer.
  const grouped = DEPTS.flatMap((d) => memory.filter((n) => n.dept === d));
  const R = 360;
  return (
    <g>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#8B7BFF" strokeOpacity={0.15} strokeDasharray="1 6" />
      {grouped.map((n, i) => {
        const a = (i / grouped.length) * Math.PI * 2 + spin * 0.3;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        const deg = Math.max(1, Math.min(40, n.degree));
        const size = (1 + Math.sqrt(deg) * 0.3) * maxSize;
        const op = dim(n.title);
        return (
          <g key={n.id} data-node className="cursor-pointer" onClick={() => n.kind === "brain" ? onBrain(n.slug!) : onGraph(n.id, n.dept)}>
            <circle cx={x} cy={y} r={size} fill={DEPT_COLOR[n.dept]} fillOpacity={op} />
          </g>
        );
      })}
      {/* skills inner */}
      {skills.map((p, i) => {
        const a = (i / Math.max(skills.length, 1)) * Math.PI * 2 + spin;
        const x = cx + Math.cos(a) * 160; const y = cy + Math.sin(a) * 160;
        return <circle key={p.id} data-node cx={x} cy={y} r={3 * maxSize} fill={C_SKILL}
          className="cursor-pointer" onClick={() => onBrain(p.slug)} fillOpacity={dim(p.title)} />;
      })}
      {/* routines mid */}
      {routines.map((p, i) => {
        const a = (i / Math.max(routines.length, 1)) * Math.PI * 2 + spin * 0.7;
        const x = cx + Math.cos(a) * 240; const y = cy + Math.sin(a) * 240;
        const op = dim(p.title); const s = 5 * maxSize;
        return (
          <g key={p.id} data-node className="cursor-pointer" onClick={() => onBrain(p.slug)}>
            <circle cx={x} cy={y} r={s} fill="#0A0A0F" stroke={C_ROUTE} strokeOpacity={op} strokeWidth={1.3} />
            <circle cx={x} cy={y} r={s * 0.4} fill={C_ROUTE} fillOpacity={op} />
          </g>
        );
      })}
      {/* apps outer */}
      {apps.map((p, i) => {
        const a = (i / Math.max(apps.length, 1)) * Math.PI * 2 + spin * 0.4;
        const x = cx + Math.cos(a) * 460; const y = cy + Math.sin(a) * 460;
        return <AppHex key={p.id} x={x} y={y} size={10 * maxSize} title={p.title}
          onClick={() => onBrain(p.slug)} hideName={hideNames} opacity={dim(p.title)} />;
      })}
    </g>
  );
}

// ---------- Grid Stage ----------

function GridStage(props: Omit<StageCommon, "spin"> & {
  memory: MemNode[]; skills: BrainPage[]; routines: BrainPage[]; apps: BrainPage[];
}) {
  const { cx, cy, maxSize, hideNames, memory, skills, routines, apps, onBrain, onGraph, dim } = props;
  // Dept columns, grid of dots. Skills/Routines/Apps as their own columns.
  const columns: Array<{ key: string; label: string; color: string; nodes: Array<{ id: string; title: string; kind: "brain"|"graph"; slug?: string; dept?: DeptKey; degree?: number }> }> = [
    ...DEPTS.map((d) => ({ key: d, label: d.toUpperCase(), color: DEPT_COLOR[d],
      nodes: memory.filter((n) => n.dept === d).map((n) => ({ id: n.id, title: n.title, kind: n.kind, slug: n.slug, dept: n.dept, degree: n.degree })) })),
    { key: "Skills", label: "SKILLS", color: C_SKILL, nodes: skills.map((p) => ({ id: p.id, title: p.title, kind: "brain" as const, slug: p.slug })) },
    { key: "Routines", label: "ROUTINES", color: C_ROUTE, nodes: routines.map((p) => ({ id: p.id, title: p.title, kind: "brain" as const, slug: p.slug })) },
    { key: "Applications", label: "APPLICATIONS", color: C_APP, nodes: apps.map((p) => ({ id: p.id, title: p.title, kind: "brain" as const, slug: p.slug })) },
  ];
  const colW = 110;
  const totalW = columns.length * colW;
  const x0 = cx - totalW / 2 + colW / 2;
  return (
    <g>
      {columns.map((col, ci) => {
        const x = x0 + ci * colW;
        const per = 10; // per row
        const cellH = 14;
        return (
          <g key={col.key}>
            <text x={x} y={cy - 260} textAnchor="middle" fill={col.color} fillOpacity={0.85}
              fontSize={9} letterSpacing={3} className="font-mono pointer-events-none">{col.label}</text>
            {col.nodes.slice(0, 300).map((n, i) => {
              const gx = x + ((i % per) - (per - 1) / 2) * 10;
              const gy = cy - 230 + Math.floor(i / per) * cellH;
              const size = 3 * maxSize;
              const op = dim(n.title);
              return (
                <g key={n.id} data-node className="cursor-pointer"
                  onClick={() => n.kind === "brain" && n.slug ? onBrain(n.slug) : n.dept ? onGraph(n.id, n.dept) : undefined}>
                  <circle cx={gx} cy={gy} r={size} fill={col.color} fillOpacity={op} />
                </g>
              );
            })}
            {!hideNames && col.nodes.length > 300 && (
              <text x={x} y={cy - 230 + Math.ceil(300 / per) * cellH + 12} textAnchor="middle" fill={col.color} fillOpacity={0.6}
                fontSize={9} className="font-mono pointer-events-none">+{col.nodes.length - 300}</text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ---------- Link Web (subtle center threads) ----------

function LinkWeb({ cx, cy, tick, spring }: { cx: number; cy: number; tick: number; spring: number }) {
  // 8 gentle drifting lines across the center, spring modulates length.
  const lines: React.ReactNode[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + tick * 0.0002;
    const r = 240 + Math.sin(tick * 0.001 + i) * 40 * spring;
    lines.push(
      <line key={i}
        x1={cx + Math.cos(a) * r} y1={cy + Math.sin(a) * r}
        x2={cx + Math.cos(a + Math.PI) * r * 0.6} y2={cy + Math.sin(a + Math.PI) * r * 0.6}
        stroke="#ffffff" strokeOpacity={0.05} strokeWidth={0.5} />
    );
  }
  return <g pointerEvents="none">{lines}</g>;
}

// ---------- Detail overlays ----------

function BrainDetail({ data, onOpen }: { data: NonNullable<Awaited<ReturnType<typeof getPage>>>; onOpen: (slug: string) => void }) {
  const page = data.page; if (!page) return null;
  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-cc-muted">{page.type} · {page.department ?? "—"}</div>
        <h3 className="text-[15px] font-semibold text-cc-text">{page.title}</h3>
      </div>
      {page.body && <p className="whitespace-pre-wrap text-[12px] text-cc-text/90">{String(page.body).slice(0, 500)}</p>}
      {Array.isArray(page.citations) && (page.citations as { url: string; title?: string }[]).length > 0 && (
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-cc-muted">Citations</div>
          <ul className="space-y-1 text-[11px]">
            {(page.citations as { url: string; title?: string }[]).slice(0, 6).map((c, i) => (
              <li key={i}><a href={c.url} target="_blank" rel="noreferrer" className="text-cc-cyan hover:underline">· {c.title ?? c.url}</a></li>
            ))}
          </ul>
        </div>
      )}
      {(data.outLinks.length + data.inLinks.length) > 0 && (
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-cc-muted">Backlinks</div>
          <ul className="space-y-0.5 text-[11px]">
            {data.outLinks.slice(0,6).map((l, i) => l.target && (
              <li key={"o"+i}><button className="text-cc-text hover:text-cc-violet" onClick={() => onOpen((l.target as { slug: string }).slug)}>→ {(l.target as { title: string }).title} <span className="text-cc-muted">({l.relation})</span></button></li>
            ))}
            {data.inLinks.slice(0,6).map((l, i) => l.source && (
              <li key={"i"+i}><button className="text-cc-text hover:text-cc-violet" onClick={() => onOpen((l.source as { slug: string }).slug)}>← {(l.source as { title: string }).title} <span className="text-cc-muted">({l.relation})</span></button></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GraphDetail({ node }: { node: { id: string; label?: string; file_type?: string; community?: number | null; dept: DeptKey; neighbors: string[] } }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-cc-muted">Graph memory · {node.file_type ?? "node"}</div>
        <h3 className="text-[15px] font-semibold text-cc-text">{node.label ?? node.id}</h3>
        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-cc-muted">
          <span className="inline-block size-1.5 rounded-full" style={{ background: DEPT_COLOR[node.dept] }} />
          {node.dept}{node.community != null ? ` · community ${node.community}` : ""} · {node.neighbors.length} connections
        </div>
      </div>
      <p className="text-[12px] text-cc-muted">Read-only node from the public knowledge graph.</p>
      <Link to="/" className="inline-block font-mono text-[10px] uppercase tracking-widest text-cc-violet hover:underline">Open in Knowledge Graph →</Link>
    </div>
  );
}