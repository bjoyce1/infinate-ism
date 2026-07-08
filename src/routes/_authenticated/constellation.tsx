import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { getDashboard, upsertProject, upsertTask, upsertNote, createCapture, upsertClient, upsertArea } from "@/lib/brain.functions";
import { AppShell, GlassCard } from "@/components/brain/AppShell";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderKanban, CheckSquare, StickyNote, Inbox, Users, Compass } from "lucide-react";

export const Route = createFileRoute("/_authenticated/constellation")({
  head: () => ({ meta: [{ title: "Constellation — Infinite ISM" }, { name: "robots", content: "noindex" }] }),
  component: ConstellationPage,
});

type Kind = "area" | "project" | "task" | "note" | "capture" | "client";
type Node = {
  id: string;
  kind: Kind;
  ref: string; // db id
  label: string;
  x: number;
  y: number;
  r: number;
  color: string;
  raw: any;
};

const KIND_META: Record<Kind, { color: string; label: string; Icon: any }> = {
  area:    { color: "#4C6FFF", label: "Area",    Icon: Compass },
  project: { color: "#3DED97", label: "Project", Icon: FolderKanban },
  task:    { color: "#F5A623", label: "Task",    Icon: CheckSquare },
  note:    { color: "#B78BFF", label: "Note",    Icon: StickyNote },
  capture: { color: "#FF7AB6", label: "Capture", Icon: Inbox },
  client:  { color: "#3ED6FF", label: "Client",  Icon: Users },
};

function ring(count: number, radius: number, offset = 0) {
  return (i: number) => {
    const t = (i / Math.max(count, 1)) * Math.PI * 2 + offset;
    return { x: Math.cos(t) * radius, y: Math.sin(t) * radius };
  };
}

function ConstellationPage() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getDashboard);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchFn() });
  const [selected, setSelected] = useState<Node | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["dashboard"] });

  const nodes = useMemo<Node[]>(() => {
    if (!data) return [];
    const out: Node[] = [];
    const areaPos = ring(data.areas.length, 130);
    data.areas.forEach((a: any, i: number) => {
      const p = areaPos(i);
      out.push({ id: `area_${a.id}`, kind: "area", ref: a.id, label: a.name, x: p.x, y: p.y, r: 12, color: a.color ?? KIND_META.area.color, raw: a });
    });
    const projPos = ring(data.projects.length, 240, 0.2);
    data.projects.forEach((p: any, i: number) => {
      const pos = projPos(i);
      out.push({ id: `project_${p.id}`, kind: "project", ref: p.id, label: p.name, x: pos.x, y: pos.y, r: 10, color: p.color ?? KIND_META.project.color, raw: p });
    });
    const clientPos = ring(data.clients.length, 335, 0.9);
    data.clients.forEach((c: any, i: number) => {
      const pos = clientPos(i);
      out.push({ id: `client_${c.id}`, kind: "client", ref: c.id, label: c.name, x: pos.x, y: pos.y, r: 8, color: KIND_META.client.color, raw: c });
    });
    const taskPos = ring(data.tasks.length, 355, 1.7);
    data.tasks.forEach((t: any, i: number) => {
      const pos = taskPos(i);
      out.push({ id: `task_${t.id}`, kind: "task", ref: t.id, label: t.title, x: pos.x, y: pos.y, r: 5, color: KIND_META.task.color, raw: t });
    });
    const notePos = ring(data.notes.length, 400, 2.5);
    data.notes.forEach((n: any, i: number) => {
      const pos = notePos(i);
      out.push({ id: `note_${n.id}`, kind: "note", ref: n.id, label: n.title, x: pos.x, y: pos.y, r: 5, color: KIND_META.note.color, raw: n });
    });
    const capPos = ring(data.captures.length, 430, 3.1);
    data.captures.forEach((c: any, i: number) => {
      const pos = capPos(i);
      out.push({ id: `capture_${c.id}`, kind: "capture", ref: c.id, label: c.title || "(untitled)", x: pos.x, y: pos.y, r: 5, color: KIND_META.capture.color, raw: c });
    });
    return out;
  }, [data]);

  const links = useMemo(() => {
    if (!data) return [] as { x1: number; y1: number; x2: number; y2: number; color: string }[];
    const byRef = new Map(nodes.map((n) => [`${n.kind}_${n.ref}`, n]));
    const out: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    for (const p of data.projects) {
      const src = byRef.get(`project_${p.id}`);
      if (!src) continue;
      if (p.area_id) {
        const t = byRef.get(`area_${p.area_id}`);
        if (t) out.push({ x1: src.x, y1: src.y, x2: t.x, y2: t.y, color: "#4C6FFF55" });
      }
      if (p.client_id) {
        const t = byRef.get(`client_${p.client_id}`);
        if (t) out.push({ x1: src.x, y1: src.y, x2: t.x, y2: t.y, color: "#3ED6FF55" });
      }
    }
    for (const t of data.tasks) {
      if (!t.project_id) continue;
      const src = byRef.get(`task_${t.id}`); const tgt = byRef.get(`project_${t.project_id}`);
      if (src && tgt) out.push({ x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y, color: "#F5A62333" });
    }
    for (const n of data.notes) {
      const src = byRef.get(`note_${n.id}`);
      if (!src) continue;
      if (n.project_id) {
        const t = byRef.get(`project_${n.project_id}`);
        if (t) out.push({ x1: src.x, y1: src.y, x2: t.x, y2: t.y, color: "#B78BFF33" });
      } else if (n.area_id) {
        const t = byRef.get(`area_${n.area_id}`);
        if (t) out.push({ x1: src.x, y1: src.y, x2: t.x, y2: t.y, color: "#B78BFF33" });
      }
    }
    for (const c of data.captures) {
      if (!c.project_id) continue;
      const src = byRef.get(`capture_${c.id}`); const tgt = byRef.get(`project_${c.project_id}`);
      if (src && tgt) out.push({ x1: src.x, y1: src.y, x2: tgt.x, y2: tgt.y, color: "#FF7AB633" });
    }
    return out;
  }, [data, nodes]);

  return (
    <AppShell title="Constellation">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/60">
        <span>Click any node to open details and spawn linked items.</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {(Object.keys(KIND_META) as Kind[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: KIND_META[k].color, boxShadow: `0 0 8px ${KIND_META[k].color}` }} />
              {KIND_META[k].label}
            </span>
          ))}
        </div>
      </div>
      <GlassCard className="p-4 h-[72vh] relative overflow-hidden">
        <svg viewBox="-500 -400 1000 800" className="w-full h-full">
          <defs>
            <radialGradient id="sun">
              <stop offset="0%" stopColor="#3DED97" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#3DED97" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="0" cy="0" r="220" fill="url(#sun)" />
          {[130, 240, 335, 355, 400, 430].map((r) => (
            <circle key={r} cx="0" cy="0" r={r} fill="none" stroke="#ffffff08" strokeDasharray="2 5" />
          ))}
          {links.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth="1" />
          ))}
          {nodes.map((n) => {
            const active = selected?.id === n.id;
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} className="cursor-pointer" onClick={() => setSelected(n)}>
                <circle r={n.r + (active ? 4 : 0)} fill={n.color} opacity={active ? 1 : 0.9} style={{ filter: `drop-shadow(0 0 ${active ? 16 : 8}px ${n.color})` }} />
                <text y={n.r + 12} textAnchor="middle" fill="white" fillOpacity={active ? 1 : 0.7} fontSize="9" style={{ pointerEvents: "none" }}>
                  {n.label.length > 22 ? n.label.slice(0, 22) + "…" : n.label}
                </text>
              </g>
            );
          })}
          <text x="0" y="4" textAnchor="middle" fill="#3DED97" fontSize="12" fontWeight="700" letterSpacing="2">YOU</text>
        </svg>
      </GlassCard>

      <NodeSheet node={selected} onClose={() => setSelected(null)} onChanged={invalidate} />
    </AppShell>
  );
}

function NodeSheet({ node, onClose, onChanged }: { node: Node | null; onClose: () => void; onChanged: () => void }) {
  const open = !!node;
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-[#0b0f1a] border-white/10 text-white overflow-y-auto">
        {node && <NodeSheetBody node={node} onChanged={onChanged} />}
      </SheetContent>
    </Sheet>
  );
}

function NodeSheetBody({ node, onChanged }: { node: Node; onChanged: () => void }) {
  const meta = KIND_META[node.kind];
  const Icon = meta.Icon;
  const [mode, setMode] = useState<null | Kind>(null);

  const deepLink = (() => {
    switch (node.kind) {
      case "project": return `/projects/${node.ref}`;
      case "client":  return `/clients`;
      case "area":    return `/areas`;
      case "capture": return `/inbox`;
      case "task":    return node.raw.project_id ? `/projects/${node.raw.project_id}` : `/dashboard`;
      case "note":    return node.raw.project_id ? `/projects/${node.raw.project_id}` : `/dashboard`;
    }
  })();

  // Which kinds can be spawned linked to this node
  const spawnKinds: Kind[] = (() => {
    switch (node.kind) {
      case "area":    return ["project", "note"];
      case "project": return ["task", "note", "capture"];
      case "client":  return ["project", "capture"];
      case "task":    return ["note", "capture"];
      case "note":    return ["task", "capture"];
      case "capture": return ["project", "task", "note"];
    }
  })();

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 text-white">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `${meta.color}22`, color: meta.color, boxShadow: `0 0 12px ${meta.color}55` }}>
            <Icon className="h-4 w-4" />
          </span>
          {node.label}
        </SheetTitle>
        <SheetDescription className="text-white/60 flex items-center gap-2">
          <Badge variant="outline" className="border-white/20 text-white/70">{meta.label}</Badge>
          {node.raw.status && <Badge variant="outline" className="border-white/20 text-white/70">{node.raw.status}</Badge>}
          {node.raw.priority && <Badge variant="outline" className="border-white/20 text-white/70">{node.raw.priority}</Badge>}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-2 text-sm text-white/80">
        {node.raw.goal && <p><span className="text-white/50">Goal: </span>{node.raw.goal}</p>}
        {node.raw.description && <p>{node.raw.description}</p>}
        {node.raw.next_action && <p><span className="text-white/50">Next: </span>{node.raw.next_action}</p>}
        {node.raw.content && <p className="whitespace-pre-wrap text-white/70">{node.raw.content}</p>}
        {node.raw.body && <p className="whitespace-pre-wrap text-white/70">{node.raw.body}</p>}
        {node.raw.company && <p><span className="text-white/50">Company: </span>{node.raw.company}</p>}
        {node.raw.email && <p><span className="text-white/50">Email: </span>{node.raw.email}</p>}
        {node.raw.due_date && <p><span className="text-white/50">Due: </span>{node.raw.due_date}</p>}
        {node.raw.deadline && <p><span className="text-white/50">Deadline: </span>{node.raw.deadline}</p>}
      </div>

      {deepLink && (
        <div className="mt-4">
          <Button asChild variant="outline" size="sm" className="border-white/20 text-white bg-white/5 hover:bg-white/10">
            <Link to={deepLink}>Open full view →</Link>
          </Button>
        </div>
      )}

      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Spawn linked</div>
        {!mode ? (
          <div className="flex flex-wrap gap-2">
            {spawnKinds.map((k) => {
              const M = KIND_META[k];
              const KIcon = M.Icon;
              return (
                <Button key={k} size="sm" variant="outline" onClick={() => setMode(k)} className="border-white/15 bg-white/5 hover:bg-white/10 text-white">
                  <Plus className="h-3 w-3 mr-1" />
                  <KIcon className="h-3 w-3 mr-1" style={{ color: M.color }} />
                  {M.label}
                </Button>
              );
            })}
          </div>
        ) : (
          <SpawnForm parent={node} kind={mode} onCancel={() => setMode(null)} onSaved={() => { setMode(null); onChanged(); toast.success("Created & linked"); }} />
        )}
      </div>

      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-white/50">Convert</div>
        <ConvertActions node={node} onDone={onChanged} />
      </div>
    </>
  );
}

function inferLinkPayload(parent: Node, kind: Kind): Record<string, any> {
  // Best-effort: link the new entity to the parent using known FKs.
  const link: Record<string, any> = {};
  if (kind === "project") {
    if (parent.kind === "area") link.area_id = parent.ref;
    if (parent.kind === "client") link.client_id = parent.ref;
  }
  if (kind === "task") {
    if (parent.kind === "project") link.project_id = parent.ref;
    if (parent.kind === "note" || parent.kind === "capture") link.project_id = parent.raw.project_id ?? null;
  }
  if (kind === "note") {
    if (parent.kind === "project") link.project_id = parent.ref;
    if (parent.kind === "area") link.area_id = parent.ref;
    if (parent.kind === "task" || parent.kind === "capture") link.project_id = parent.raw.project_id ?? null;
  }
  if (kind === "capture") {
    if (parent.kind === "project") link.project_id = parent.ref;
    if (parent.kind === "task" || parent.kind === "note") link.project_id = parent.raw.project_id ?? null;
  }
  return link;
}

function SpawnForm({ parent, kind, onCancel, onSaved }: { parent: Node; kind: Kind; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const projFn    = useServerFn(upsertProject);
  const taskFn    = useServerFn(upsertTask);
  const noteFn    = useServerFn(upsertNote);
  const capFn     = useServerFn(createCapture);
  const clientFn  = useServerFn(upsertClient);
  const areaFn    = useServerFn(upsertArea);

  const submit = async () => {
    if (!title.trim()) { toast.error("Give it a title"); return; }
    setBusy(true);
    try {
      const link = inferLinkPayload(parent, kind);
      if (kind === "project")      await projFn({ data: { name: title, goal: body || null, ...link } as any });
      else if (kind === "task")    await taskFn({ data: { title, description: body || null, ...link } as any });
      else if (kind === "note")    await noteFn({ data: { title, content: body || undefined, ...link } as any });
      else if (kind === "capture") await capFn({ data: { title, body: body || undefined, type: "note", ...link } as any });
      else if (kind === "client")  await clientFn({ data: { name: title, notes: body || null } as any });
      else if (kind === "area")    await areaFn({ data: { name: title, description: body || null } as any });
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create");
    } finally { setBusy(false); }
  };

  const M = KIND_META[kind];
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-white/60">New {M.label} linked to <span style={{ color: parent.color }}>{parent.label}</span></div>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${M.label} title`} className="bg-black/30 border-white/10 text-white" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Details (optional)" rows={3} className="bg-black/30 border-white/10 text-white" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-white/70">Cancel</Button>
        <Button size="sm" onClick={submit} disabled={busy} style={{ backgroundColor: M.color, color: "#0b0f1a" }}>{busy ? "Saving…" : "Create & link"}</Button>
      </div>
    </div>
  );
}

function ConvertActions({ node, onDone }: { node: Node; onDone: () => void }) {
  const projFn = useServerFn(upsertProject);
  const taskFn = useServerFn(upsertTask);
  const noteFn = useServerFn(upsertNote);
  const capFn  = useServerFn(createCapture);

  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    try { await fn(); toast.success(`Converted to ${label}`); onDone(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(null); }
  };

  const title = node.label;
  const body  = node.raw.body ?? node.raw.content ?? node.raw.description ?? node.raw.goal ?? "";

  const targets: { to: string; go: () => Promise<any> }[] = (() => {
    switch (node.kind) {
      case "capture": return [
        { to: "project", go: () => projFn({ data: { name: title, goal: body || null } as any }) },
        { to: "task",    go: () => taskFn({ data: { title, description: body || null, project_id: node.raw.project_id ?? null } as any }) },
        { to: "note",    go: () => noteFn({ data: { title, content: body || undefined, project_id: node.raw.project_id ?? null } as any }) },
      ];
      case "note": return [
        { to: "task",    go: () => taskFn({ data: { title, description: body || null, project_id: node.raw.project_id ?? null } as any }) },
        { to: "project", go: () => projFn({ data: { name: title, goal: body || null, area_id: node.raw.area_id ?? null } as any }) },
        { to: "capture", go: () => capFn({ data: { title, body: body || undefined, type: "note", project_id: node.raw.project_id ?? null } as any }) },
      ];
      case "task": return [
        { to: "note",    go: () => noteFn({ data: { title, content: body || undefined, project_id: node.raw.project_id ?? null } as any }) },
        { to: "project", go: () => projFn({ data: { name: title, goal: body || null } as any }) },
      ];
      case "project": return [
        { to: "note",    go: () => noteFn({ data: { title, content: body || undefined, project_id: node.ref } as any }) },
      ];
      default: return [];
    }
  })();

  if (targets.length === 0) return <div className="text-xs text-white/40">No conversions available for this node type.</div>;

  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((t) => {
        const M = KIND_META[t.to as Kind];
        return (
          <Button key={t.to} size="sm" variant="outline" disabled={busy === t.to} onClick={() => run(t.to, t.go)} className="border-white/15 bg-white/5 hover:bg-white/10 text-white">
            → {M.label}
          </Button>
        );
      })}
    </div>
  );
}