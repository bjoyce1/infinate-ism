import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPages, getPage } from "@/lib/brain.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Search, RefreshCcw, Orbit, Sparkles } from "lucide-react";

export const Route = createFileRoute("/constellation")({
  head: () => ({ meta: [
    { title: "Command Constellation — C.A.P.I.S.M." },
    { name: "description", content: "Orbital view of your Second Brain — skills, memory, routines, applications radiating from CLAUDE.MD." },
  ]}),
  component: Constellation,
});

type BrainPage = { id: string; slug: string; title: string; type: string; department: string | null; updated_at: string };
type MemoryNode =
  | { kind: "brain"; id: string; slug: string; title: string; type: string; department: string; degree: number }
  | { kind: "graph"; id: string; title: string; department: string; file_type: string; community: number | null; degree: number };

const DEPT_COLOR: Record<string, string> = {
  Personal: "#F5D33F", Product: "#3DE0C7", Community: "#4A9BFF",
  Content: "#E840D3", Business: "#8B7BFF",
  // non-department clusters (Force mode)
  Skills: "#FF8C42", Routines: "#F5D33F", Applications: "#3DE0C7",
};

const DEPTS = ["Personal","Product","Community","Content","Business"] as const;

// Map graph.json node → department
function classifyGraphNode(n: { label?: string; file_type?: string; community?: number | null }): string {
  const ft = n.file_type ?? "other";
  if (ft === "code") return "Product";
  if (ft === "blog" || ft === "image") return "Content";
  if (["music","artist","hub","release","shop","sound","archive","member","audio"].includes(ft)) return "Community";
  const label = (n.label ?? "").toLowerCase();
  if (/yates|school|family|personal|birthday|selflove/.test(label)) return "Personal";
  if (/mortuary|venture|paypal|invoice|client|business|llc|inc/.test(label)) return "Business";
  if (/\.com|\.app|\.io|\.dev|site|component|config|route/.test(label)) return "Product";
  return "Business";
}

type RawGraph = { nodes: Array<{ id: string; label?: string; file_type?: string; community?: number | null }>; links: Array<{ source: string; target: string }> };

function Constellation() {
  const fetchPages = useServerFn(listPages);
  const fetchPage = useServerFn(getPage);
  const [pages, setPages] = useState<BrainPage[]>([]);
  const [graph, setGraph] = useState<RawGraph | null>(null);
  const [q, setQ] = useState("");
  const [layout, setLayout] = useState<"rings" | "force">("rings");
  const [showGraphMemory, setShowGraphMemory] = useState(true);
  const [speed, setSpeed] = useState([0.4]);
  const [nodeSize, setNodeSize] = useState([1]);
  const [showNames, setShowNames] = useState(true);
  const [maxMemory, setMaxMemory] = useState([200]);
  const [selected, setSelected] = useState<
    | { kind: "brain"; data: Awaited<ReturnType<typeof getPage>> }
    | { kind: "graph"; node: { id: string; label?: string; file_type?: string; community?: number | null; department: string; neighbors: string[] } }
    | null
  >(null);
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void fetchPages({ data: undefined as never }).then((r) => setPages(r as BrainPage[])); }, [fetchPages]);
  useEffect(() => {
    fetch("/graph.json").then((r) => r.ok ? r.json() as Promise<RawGraph> : null).then((g) => g && setGraph(g)).catch(() => {});
  }, []);

  useEffect(() => {
    const loop = () => { setTick((t) => t + 1); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  // Build graph-memory nodes (with degree-based ranking + LOD cap).
  const graphMemory = useMemo<MemoryNode[]>(() => {
    if (!graph || !showGraphMemory) return [];
    const deg = new Map<string, number>();
    for (const l of graph.links) {
      deg.set(l.source, (deg.get(l.source) ?? 0) + 1);
      deg.set(l.target, (deg.get(l.target) ?? 0) + 1);
    }
    const scored = graph.nodes.map((n) => ({
      kind: "graph" as const,
      id: n.id,
      title: n.label ?? n.id,
      department: classifyGraphNode(n),
      file_type: n.file_type ?? "other",
      community: n.community ?? null,
      degree: deg.get(n.id) ?? 0,
    }));
    scored.sort((a, b) => b.degree - a.degree);
    return scored.slice(0, Math.max(20, maxMemory[0]));
  }, [graph, showGraphMemory, maxMemory]);

  const brainMemory = useMemo<MemoryNode[]>(() => {
    return pages
      .filter((p) => !["skill","routine","application"].includes(p.type))
      .map((p) => ({
        kind: "brain" as const, id: p.id, slug: p.slug, title: p.title,
        type: p.type, department: p.department ?? "Business", degree: 0,
      }));
  }, [pages]);

  const allMemory = useMemo(() => {
    const filt = (t: string) => !q.trim() || t.toLowerCase().includes(q.toLowerCase());
    return [...brainMemory, ...graphMemory].filter((n) => filt(n.title));
  }, [brainMemory, graphMemory, q]);

  const skills = pages.filter(p => p.type === "skill" && (!q.trim() || p.title.toLowerCase().includes(q.toLowerCase())));
  const routines = pages.filter(p => p.type === "routine" && (!q.trim() || p.title.toLowerCase().includes(q.toLowerCase())));
  const apps = pages.filter(p => p.type === "application" && (!q.trim() || p.title.toLowerCase().includes(q.toLowerCase())));

  const deptCounts = useMemo(() => {
    const c: Record<string, number> = { Personal: 0, Product: 0, Community: 0, Content: 0, Business: 0 };
    for (const n of allMemory) c[n.department] = (c[n.department] ?? 0) + 1;
    return c;
  }, [allMemory]);

  const openNode = async (n: MemoryNode | BrainPage) => {
    if ("kind" in n && n.kind === "graph" && graph) {
      const neighbors = graph.links
        .filter((l) => l.source === n.id || l.target === n.id)
        .map((l) => (l.source === n.id ? l.target : l.source))
        .slice(0, 40);
      const raw = graph.nodes.find((x) => x.id === n.id)!;
      setSelected({ kind: "graph", node: { ...raw, department: n.department, neighbors } });
      return;
    }
    const slug = "kind" in n ? (n as { slug: string }).slug : n.slug;
    const data = await fetchPage({ data: { slug } });
    setSelected({ kind: "brain", data });
  };

  const W = 1200, H = 900, cx = W / 2, cy = H / 2;
  const spin = tick * 0.0005 * speed[0];

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Command Constellation"
        description="CLAUDE.MD at the core. Skills, memory, routines, and applications in orbit."
        actions={<div className="flex gap-2">
          <Button onClick={() => fetchPages({ data: undefined as never }).then((r) => setPages(r as BrainPage[]))} className="border border-cc-border bg-black/30 text-cc-text hover:bg-white/[0.04]"><RefreshCcw className="mr-2 size-4" /> Refresh</Button>
        </div>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-cc-border bg-cc-panel/60 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-cc-muted" />
          <Input ref={searchRef} value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search constellation ( / )" className="border-cc-border bg-black/30 pl-8 text-cc-text placeholder:text-cc-muted" />
        </div>
        <div className="flex overflow-hidden rounded-md border border-cc-border">
          <button onClick={() => setLayout("rings")} className={`flex items-center gap-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${layout==="rings" ? "bg-cc-violet/20 text-cc-violet" : "text-cc-muted hover:text-cc-text"}`}><Orbit className="size-3" /> Rings</button>
          <button onClick={() => setLayout("force")} className={`flex items-center gap-1 border-l border-cc-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest ${layout==="force" ? "bg-cc-violet/20 text-cc-violet" : "text-cc-muted hover:text-cc-text"}`}><Sparkles className="size-3" /> Force</button>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-cc-muted">Spin
          <div className="w-24"><Slider value={speed} onValueChange={setSpeed} min={0} max={3} step={0.1} /></div>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-cc-muted">Node
          <div className="w-20"><Slider value={nodeSize} onValueChange={setNodeSize} min={0.5} max={2} step={0.1} /></div>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-cc-muted">Memory cap
          <div className="w-24"><Slider value={maxMemory} onValueChange={setMaxMemory} min={40} max={800} step={20} /></div>
          <span className="font-mono text-[10px]">{maxMemory[0]}</span>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-cc-muted"><Switch checked={showNames} onCheckedChange={setShowNames} /> Names</label>
        <label className="flex items-center gap-2 text-[11px] text-cc-muted"><Switch checked={showGraphMemory} onCheckedChange={setShowGraphMemory} /> Graph memory</label>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {DEPTS.map((d) => (
          <div key={d} className="flex items-center gap-1.5 rounded-md border border-cc-border bg-black/30 px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
            <span className="size-1.5 rounded-full" style={{ background: DEPT_COLOR[d] }} />
            <span className="text-cc-muted">{d}</span>
            <span className="text-cc-text">{deptCounts[d]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 rounded-md border border-cc-border bg-black/30 px-2 py-1 font-mono text-[10px] uppercase tracking-widest">
          <span className="text-cc-muted">Skills</span><span className="text-cc-text">{skills.length}</span>
          <span className="mx-1 text-cc-muted">·</span>
          <span className="text-cc-muted">Routines</span><span className="text-cc-text">{routines.length}</span>
          <span className="mx-1 text-cc-muted">·</span>
          <span className="text-cc-muted">Apps</span><span className="text-cc-text">{apps.length}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative overflow-hidden rounded-xl border border-cc-border bg-[radial-gradient(circle_at_center,_#12121a_0%,_#050508_75%)]">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[720px]">
            <defs>
              <radialGradient id="core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
                <stop offset="60%" stopColor="#8B7BFF" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#8B7BFF" stopOpacity="0" />
              </radialGradient>
            </defs>

            {layout === "rings" ? (
              <RingsLayout cx={cx} cy={cy} spin={spin} nodeSize={nodeSize[0]} showNames={showNames}
                skills={skills} routines={routines} apps={apps} memory={allMemory} onOpen={openNode} />
            ) : (
              <ForceLayout cx={cx} cy={cy} spin={spin} nodeSize={nodeSize[0]} showNames={showNames}
                skills={skills} routines={routines} apps={apps} memory={allMemory} onOpen={openNode} />
            )}

            {/* core glow */}
            <circle cx={cx} cy={cy} r={90} fill="url(#core)" />
            <circle cx={cx} cy={cy} r={22} fill="#0A0A0F" stroke="#8B7BFF" strokeWidth={1.5} />
            <text x={cx} y={cy - 2} textAnchor="middle" fill="#fff" fontSize={9} className="font-mono">CLAUDE.MD</text>
            <text x={cx} y={cy + 9} textAnchor="middle" fill="#8B7BFF" fontSize={7} className="font-mono" letterSpacing={2}>C.A.P.I.S.M.</text>
          </svg>

          {pages.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="rounded-md border border-cc-border bg-black/60 px-4 py-3 text-center font-mono text-[11px] text-cc-muted">
                No brain pages yet — seed rings from Second Brain, or enrich a capture.
              </div>
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-cc-border bg-cc-panel/60 p-4">
          {!selected ? (
            <div className="text-[12px] text-cc-muted">Click a node to inspect its brain page, citations, and backlinks.</div>
          ) : selected.kind === "brain" && selected.data?.page ? (
            <BrainDetail data={selected.data} onOpen={(slug) => fetchPage({ data: { slug } }).then((d) => setSelected({ kind: "brain", data: d }))} />
          ) : selected.kind === "graph" ? (
            <GraphDetail node={selected.node} />
          ) : (
            <div className="text-[12px] text-cc-muted">No detail available.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------- Layouts ----------

type LayoutProps = {
  cx: number; cy: number; spin: number; nodeSize: number; showNames: boolean;
  skills: BrainPage[]; routines: BrainPage[]; apps: BrainPage[];
  memory: MemoryNode[];
  onOpen: (n: MemoryNode | BrainPage) => void;
};

function RingsLayout({ cx, cy, spin, nodeSize, showNames, skills, routines, apps, memory, onOpen }: LayoutProps) {
  const rings: Array<{ key: string; label: string; radius: number; color: string; nodes: Array<{ id: string; title: string; department?: string; isHex?: boolean; isRoutine?: boolean; ref: MemoryNode | BrainPage }> }> = [
    { key: "skills", label: "SKILLS", radius: 150, color: "#FF8C42",
      nodes: skills.map((p) => ({ id: p.id, title: p.title, ref: p })) },
    { key: "memory", label: "MEMORY", radius: 300, color: "#8B7BFF",
      nodes: memory.map((n) => ({ id: n.id, title: n.title, department: n.department, ref: n })) },
    { key: "routines", label: "ROUTINES", radius: 420, color: "#F5D33F",
      nodes: routines.map((p) => ({ id: p.id, title: p.title, isRoutine: true, ref: p })) },
    { key: "apps", label: "APPLICATIONS", radius: 530, color: "#3DE0C7",
      nodes: apps.map((p) => ({ id: p.id, title: p.title, isHex: true, ref: p })) },
  ];
  return (
    <g>
      {rings.map((r) => (
        <g key={r.key}>
          <circle cx={cx} cy={cy} r={r.radius} fill="none" stroke={r.color} strokeOpacity={0.25} strokeWidth={1} strokeDasharray="3 6" />
          <text x={cx + r.radius + 6} y={cy - 4} fill={r.color} fillOpacity={0.6} className="font-mono" fontSize={9} letterSpacing={3}>{r.label}</text>
        </g>
      ))}
      {rings.map((ring) => {
        const n = Math.max(ring.nodes.length, 1);
        const ringSpin = spin * (ring.key === "memory" ? 0.4 : ring.key === "apps" ? 0.25 : 1);
        return ring.nodes.map((node, i) => {
          const a = (i / n) * Math.PI * 2 + ringSpin;
          const x = cx + Math.cos(a) * ring.radius;
          const y = cy + Math.sin(a) * ring.radius;
          const col = ring.key === "memory" && node.department ? (DEPT_COLOR[node.department] ?? ring.color) : ring.color;
          const size = (node.isHex ? 7 : 5) * nodeSize;
          return (
            <NodeMark key={ring.key + node.id} x={x} y={y} size={size} color={col}
              isHex={!!node.isHex} isRoutine={!!node.isRoutine}
              title={node.title} showName={showNames} onClick={() => onOpen(node.ref)} />
          );
        });
      })}
    </g>
  );
}

function ForceLayout({ cx, cy, spin, nodeSize, showNames, skills, routines, apps, memory, onOpen }: LayoutProps) {
  // Deterministic pseudo-layout: cluster centers around the core, nodes placed
  // inside a soft blob around each cluster center with gentle rotation. No live simulation
  // needed — this stays snappy for 1000+ nodes and reads as a galaxy.
  const clusters: Array<{ key: string; label: string; color: string; angle: number; radius: number; blob: number; nodes: Array<{ id: string; title: string; department?: string; isHex?: boolean; isRoutine?: boolean; ref: MemoryNode | BrainPage }> }> = [
    { key: "Personal", label: "PERSONAL", color: DEPT_COLOR.Personal, angle: -Math.PI / 2, radius: 320, blob: 90, nodes: memory.filter((n) => n.department === "Personal").map((n) => ({ id: n.id, title: n.title, department: n.department, ref: n })) },
    { key: "Product", label: "PRODUCT", color: DEPT_COLOR.Product, angle: -Math.PI / 2 + (2*Math.PI)/5, radius: 340, blob: 110, nodes: memory.filter((n) => n.department === "Product").map((n) => ({ id: n.id, title: n.title, department: n.department, ref: n })) },
    { key: "Community", label: "COMMUNITY", color: DEPT_COLOR.Community, angle: -Math.PI / 2 + (4*Math.PI)/5, radius: 340, blob: 110, nodes: memory.filter((n) => n.department === "Community").map((n) => ({ id: n.id, title: n.title, department: n.department, ref: n })) },
    { key: "Content", label: "CONTENT", color: DEPT_COLOR.Content, angle: -Math.PI / 2 + (6*Math.PI)/5, radius: 340, blob: 100, nodes: memory.filter((n) => n.department === "Content").map((n) => ({ id: n.id, title: n.title, department: n.department, ref: n })) },
    { key: "Business", label: "BUSINESS", color: DEPT_COLOR.Business, angle: -Math.PI / 2 + (8*Math.PI)/5, radius: 340, blob: 100, nodes: memory.filter((n) => n.department === "Business").map((n) => ({ id: n.id, title: n.title, department: n.department, ref: n })) },
    { key: "Skills", label: "SKILLS", color: DEPT_COLOR.Skills, angle: Math.PI, radius: 170, blob: 55, nodes: skills.map((p) => ({ id: p.id, title: p.title, ref: p })) },
    { key: "Routines", label: "ROUTINES", color: DEPT_COLOR.Routines, angle: Math.PI/3, radius: 190, blob: 55, nodes: routines.map((p) => ({ id: p.id, title: p.title, isRoutine: true, ref: p })) },
    { key: "Applications", label: "APPLICATIONS", color: DEPT_COLOR.Applications, angle: -Math.PI/3, radius: 200, blob: 55, nodes: apps.map((p) => ({ id: p.id, title: p.title, isHex: true, ref: p })) },
  ];
  return (
    <g>
      {clusters.map((c) => {
        const centerAngle = c.angle + spin * 0.3;
        const ccx = cx + Math.cos(centerAngle) * c.radius;
        const ccy = cy + Math.sin(centerAngle) * c.radius;
        return (
          <g key={c.key}>
            <circle cx={ccx} cy={ccy} r={c.blob + 10} fill={c.color} fillOpacity={0.05} stroke={c.color} strokeOpacity={0.25} strokeDasharray="2 4" />
            <text x={ccx} y={ccy - c.blob - 6} textAnchor="middle" fill={c.color} fillOpacity={0.7} className="font-mono" fontSize={9} letterSpacing={3}>{c.label}</text>
            {c.nodes.map((node, i) => {
              const seed = hashSeed(node.id + i);
              // stable polar position within the blob
              const rr = Math.sqrt(seed.a) * c.blob;
              const aa = seed.b * Math.PI * 2 + spin * 0.4;
              const x = ccx + Math.cos(aa) * rr;
              const y = ccy + Math.sin(aa) * rr;
              const col = node.department ? (DEPT_COLOR[node.department] ?? c.color) : c.color;
              const size = (node.isHex ? 7 : 4) * nodeSize;
              // Hexagon apps float at cluster edge
              const finalX = node.isHex ? ccx + Math.cos(aa) * (c.blob + 6) : x;
              const finalY = node.isHex ? ccy + Math.sin(aa) * (c.blob + 6) : y;
              return (
                <NodeMark key={c.key + node.id} x={finalX} y={finalY} size={size} color={col}
                  isHex={!!node.isHex} isRoutine={!!node.isRoutine}
                  title={node.title} showName={showNames && c.nodes.length < 40}
                  onClick={() => onOpen(node.ref)} />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function NodeMark({ x, y, size, color, isHex, isRoutine, title, showName, onClick }: {
  x: number; y: number; size: number; color: string; isHex: boolean; isRoutine: boolean;
  title: string; showName: boolean; onClick: () => void;
}) {
  return (
    <g className="cursor-pointer" onClick={onClick}>
      {isHex ? (
        <polygon points={hexPoints(x, y, size + 1)} fill="#0A0A0F" stroke={color} strokeWidth={1.2} />
      ) : isRoutine ? (
        <circle cx={x} cy={y} r={size} fill="#0A0A0F" stroke={color} strokeWidth={1.5} />
      ) : (
        <circle cx={x} cy={y} r={size} fill={color} fillOpacity={0.85}>
          <animate attributeName="fillOpacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite" />
        </circle>
      )}
      {showName && (
        <text x={x} y={y - size - 4} textAnchor="middle" fill="#cfcfe0" fontSize={8} className="pointer-events-none font-mono">{title.slice(0, 22)}</text>
      )}
    </g>
  );
}

function BrainDetail({ data, onOpen }: { data: NonNullable<Awaited<ReturnType<typeof getPage>>>; onOpen: (slug: string) => void }) {
  const page = data.page;
  if (!page) return null;
  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-cc-muted">{page.type} · {page.department ?? "—"}</div>
        <h3 className="text-[15px] font-semibold text-cc-text">{page.title}</h3>
      </div>
      {page.body && <p className="whitespace-pre-wrap text-[12px] text-cc-text/90">{String(page.body).slice(0, 600)}</p>}
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
            {data.outLinks.slice(0,8).map((l, i) => l.target && (
              <li key={"o"+i}><button className="text-cc-text hover:text-cc-violet" onClick={() => onOpen((l.target as { slug: string }).slug)}>→ {(l.target as { title: string }).title} <span className="text-cc-muted">({l.relation})</span></button></li>
            ))}
            {data.inLinks.slice(0,8).map((l, i) => l.source && (
              <li key={"i"+i}><button className="text-cc-text hover:text-cc-violet" onClick={() => onOpen((l.source as { slug: string }).slug)}>← {(l.source as { title: string }).title} <span className="text-cc-muted">({l.relation})</span></button></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GraphDetail({ node }: { node: { id: string; label?: string; file_type?: string; community?: number | null; department: string; neighbors: string[] } }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-cc-muted">Graph memory · {node.file_type ?? "node"}</div>
        <h3 className="text-[15px] font-semibold text-cc-text">{node.label ?? node.id}</h3>
        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-cc-muted">
          <span className="inline-block size-1.5 rounded-full" style={{ background: DEPT_COLOR[node.department] }} />
          {node.department}{node.community != null ? ` · community ${node.community}` : ""} · {node.neighbors.length} connections
        </div>
      </div>
      <p className="text-[12px] text-cc-muted">Read-only node from the public knowledge graph. Open the Knowledge Graph view to explore its links.</p>
      <Link to="/" className="inline-block font-mono text-[10px] uppercase tracking-widest text-cc-violet hover:underline">Open in Knowledge Graph →</Link>
    </div>
  );
}

function hexPoints(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return pts.join(" ");
}

// Cheap deterministic pseudo-random from a string id → two floats in [0,1)
function hashSeed(s: string): { a: number; b: number } {
  let h1 = 2166136261, h2 = 5381;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = ((h2 << 5) + h2) ^ s.charCodeAt(i);
  }
  return { a: ((h1 >>> 0) % 10000) / 10000, b: ((h2 >>> 0) % 10000) / 10000 };
}