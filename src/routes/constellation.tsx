import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPages, getPage } from "@/lib/brain.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Search, RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/constellation")({
  head: () => ({ meta: [
    { title: "Command Constellation — C.A.P.I.S.M." },
    { name: "description", content: "Orbital view of your Second Brain — skills, memory, routines, applications radiating from CLAUDE.MD." },
  ]}),
  component: Constellation,
});

type Page = { id: string; slug: string; title: string; type: string; department: string | null; updated_at: string };
type Ring = { key: "skill"|"memory"|"routine"|"application"; label: string; radius: number; color: string; nodes: Page[] };

const DEPT_COLOR: Record<string, string> = {
  Personal: "#F5D33F", Product: "#3DE0C7", Community: "#4A9BFF",
  Content: "#E840D3", Business: "#8B7BFF",
};

function Constellation() {
  const fetchPages = useServerFn(listPages);
  const fetchPage = useServerFn(getPage);
  const [pages, setPages] = useState<Page[]>([]);
  const [q, setQ] = useState("");
  const [speed, setSpeed] = useState([0.4]);
  const [nodeSize, setNodeSize] = useState([1]);
  const [showNames, setShowNames] = useState(true);
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof getPage>> | null>(null);
  const [tick, setTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void fetchPages({ data: undefined as never }).then((r) => setPages(r as Page[])); }, [fetchPages]);

  useEffect(() => {
    const loop = () => { setTick((t) => t + 1); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  const rings = useMemo<Ring[]>(() => {
    const filt = (p: Page) => !q.trim() || p.title.toLowerCase().includes(q.toLowerCase());
    const skills = pages.filter(p => p.type === "skill" && filt(p));
    const routines = pages.filter(p => p.type === "routine" && filt(p));
    const apps = pages.filter(p => p.type === "application" && filt(p));
    const memory = pages.filter(p => !["skill","routine","application"].includes(p.type) && filt(p));
    return [
      { key: "skill",       label: "SKILLS",       radius: 150, color: "#FF8C42", nodes: skills },
      { key: "memory",      label: "MEMORY",       radius: 280, color: "#8B7BFF", nodes: memory },
      { key: "routine",     label: "ROUTINES",     radius: 400, color: "#F5D33F", nodes: routines },
      { key: "application", label: "APPLICATIONS", radius: 510, color: "#3DE0C7", nodes: apps },
    ];
  }, [pages, q]);

  const open = async (slug: string) => setSelected(await fetchPage({ data: { slug } }));

  const W = 1200, H = 900, cx = W / 2, cy = H / 2;
  const spin = tick * 0.0005 * speed[0];

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Command Constellation"
        description="CLAUDE.MD at the core. Skills, memory, routines, and applications in orbit."
        actions={<div className="flex gap-2">
          <Button onClick={() => fetchPages({ data: undefined as never }).then((r) => setPages(r as Page[]))} className="border border-cc-border bg-black/30 text-cc-text hover:bg-white/[0.04]"><RefreshCcw className="mr-2 size-4" /> Refresh</Button>
        </div>}
      />

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-cc-border bg-cc-panel/60 p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-cc-muted" />
          <Input ref={searchRef} value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search constellation ( / )" className="border-cc-border bg-black/30 pl-8 text-cc-text placeholder:text-cc-muted" />
        </div>
        <label className="flex items-center gap-2 text-[11px] text-cc-muted">Spin
          <div className="w-32"><Slider value={speed} onValueChange={setSpeed} min={0} max={3} step={0.1} /></div>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-cc-muted">Node size
          <div className="w-24"><Slider value={nodeSize} onValueChange={setNodeSize} min={0.5} max={2} step={0.1} /></div>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-cc-muted"><Switch checked={showNames} onCheckedChange={setShowNames} /> Show names</label>
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

            {rings.map((r) => (
              <circle key={r.key} cx={cx} cy={cy} r={r.radius}
                fill="none" stroke={r.color} strokeOpacity={0.25}
                strokeWidth={1} strokeDasharray="3 6" />
            ))}
            {rings.map((r) => (
              <text key={r.key+"l"} x={cx + r.radius + 6} y={cy - 4}
                fill={r.color} fillOpacity={0.6}
                className="font-mono" fontSize={9} letterSpacing={3}>{r.label}</text>
            ))}

            {/* core glow */}
            <circle cx={cx} cy={cy} r={90} fill="url(#core)" />
            <circle cx={cx} cy={cy} r={22} fill="#0A0A0F" stroke="#8B7BFF" strokeWidth={1.5} />
            <text x={cx} y={cy - 2} textAnchor="middle" fill="#fff" fontSize={9} className="font-mono">CLAUDE.MD</text>
            <text x={cx} y={cy + 9} textAnchor="middle" fill="#8B7BFF" fontSize={7} className="font-mono" letterSpacing={2}>C.A.P.I.S.M.</text>

            {rings.map((ring) => {
              const n = Math.max(ring.nodes.length, 1);
              const ringSpin = spin * (ring.key === "memory" ? 0.4 : ring.key === "application" ? 0.25 : 1);
              return ring.nodes.map((p, i) => {
                const a = (i / n) * Math.PI * 2 + ringSpin;
                const x = cx + Math.cos(a) * ring.radius;
                const y = cy + Math.sin(a) * ring.radius;
                const col = ring.key === "memory" && p.department ? (DEPT_COLOR[p.department] ?? ring.color) : ring.color;
                const size = (ring.key === "application" ? 7 : 5) * nodeSize[0];
                const isHex = ring.key === "application";
                return (
                  <g key={p.id} className="cursor-pointer" onClick={() => open(p.slug)}>
                    {isHex ? (
                      <polygon points={hexPoints(x, y, size + 1)} fill="#0A0A0F" stroke={col} strokeWidth={1.2} />
                    ) : ring.key === "routine" ? (
                      <circle cx={x} cy={y} r={size} fill="#0A0A0F" stroke={col} strokeWidth={1.5} />
                    ) : (
                      <circle cx={x} cy={y} r={size} fill={col} fillOpacity={0.85}>
                        <animate attributeName="fillOpacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {showNames && (
                      <text x={x} y={y - size - 4} textAnchor="middle" fill="#cfcfe0" fontSize={8} className="pointer-events-none font-mono">{p.title.slice(0, 22)}</text>
                    )}
                  </g>
                );
              });
            })}
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
          {!selected?.page ? (
            <div className="text-[12px] text-cc-muted">Click a node to inspect its brain page, citations, and backlinks.</div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-cc-muted">{selected.page.type} · {selected.page.department ?? "—"}</div>
                <h3 className="text-[15px] font-semibold text-cc-text">{selected.page.title}</h3>
              </div>
              {selected.page.body && <p className="whitespace-pre-wrap text-[12px] text-cc-text/90">{String(selected.page.body).slice(0, 600)}</p>}
              {Array.isArray(selected.page.citations) && (selected.page.citations as { url: string; title?: string }[]).length > 0 && (
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-cc-muted">Citations</div>
                  <ul className="space-y-1 text-[11px]">
                    {(selected.page.citations as { url: string; title?: string }[]).slice(0, 6).map((c, i) => (
                      <li key={i}><a href={c.url} target="_blank" rel="noreferrer" className="text-cc-cyan hover:underline">· {c.title ?? c.url}</a></li>
                    ))}
                  </ul>
                </div>
              )}
              {(selected.outLinks.length + selected.inLinks.length) > 0 && (
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-cc-muted">Backlinks</div>
                  <ul className="space-y-0.5 text-[11px]">
                    {selected.outLinks.slice(0,8).map((l, i) => l.target && (
                      <li key={"o"+i}><button className="text-cc-text hover:text-cc-violet" onClick={() => open((l.target as { slug: string }).slug)}>→ {(l.target as { title: string }).title} <span className="text-cc-muted">({l.relation})</span></button></li>
                    ))}
                    {selected.inLinks.slice(0,8).map((l, i) => l.source && (
                      <li key={"i"+i}><button className="text-cc-text hover:text-cc-violet" onClick={() => open((l.source as { slug: string }).slug)}>← {(l.source as { title: string }).title} <span className="text-cc-muted">({l.relation})</span></button></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
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
