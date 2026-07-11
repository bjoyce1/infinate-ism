import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listNotes } from "@/lib/commandCenter.functions";
import {
  brainHealth, listPages, listCaptures, enrichCapture, fileCapture, askBrain, seedBrainRings,
  type EnrichmentProposal,
} from "@/lib/brain.functions";
import { PageHeader } from "@/components/shell/CommandShell";
import { CCPanel, CCEmpty, CCTag } from "@/components/command-center/Panels";
import { fmtRelative } from "@/lib/commandCenter/format";
import { Button } from "@/components/ui/button";
import { Network, Sparkles, RefreshCcw, Loader2, FileCheck2, HeartPulse, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/brain")({
  head: () => ({ meta: [{ title: "Second Brain — C.A.P.I.S.M." }, { name: "description", content: "Notes, captures, prompts, and resources — searchable, connected, alive." }] }),
  component: BrainView,
});

function BrainView() {
  const fetchNotes = useServerFn(listNotes);
  const fetchHealth = useServerFn(brainHealth);
  const fetchPages = useServerFn(listPages);
  const fetchCaptures = useServerFn(listCaptures);
  const runEnrich = useServerFn(enrichCapture);
  const runFile = useServerFn(fileCapture);
  const runAsk = useServerFn(askBrain);
  const runSeed = useServerFn(seedBrainRings);

  const [notes, setNotes] = useState<Awaited<ReturnType<typeof listNotes>>>([]);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof brainHealth>> | null>(null);
  const [pages, setPages] = useState<Awaited<ReturnType<typeof listPages>>>([]);
  const [caps, setCaps] = useState<Awaited<ReturnType<typeof listCaptures>>>([]);
  const [ask, setAsk] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; citations: { slug: string; title: string }[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Record<string, EnrichmentProposal>>({});

  const refresh = useCallback(async () => {
    const [n, h, p, c] = await Promise.all([
      fetchNotes({ data: undefined as never }),
      fetchHealth({ data: undefined as never }),
      fetchPages({ data: undefined as never }),
      fetchCaptures({ data: {} }),
    ]);
    setNotes(n); setHealth(h); setPages(p); setCaps(c);
  }, [fetchNotes, fetchHealth, fetchPages, fetchCaptures]);

  useEffect(() => { void refresh(); }, [refresh]);

  const doEnrich = async (id: string) => {
    setBusy(`enrich:${id}`);
    try {
      const p = await runEnrich({ data: { captureId: id } });
      setProposal((s) => ({ ...s, [id]: p }));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const doFile = async (id: string) => {
    const p = proposal[id]; if (!p) return;
    setBusy(`file:${id}`);
    try {
      await runFile({ data: { captureId: id, proposal: p } });
      toast.success(`Filed as "${p.title}"`);
      setProposal((s) => { const n = { ...s }; delete n[id]; return n; });
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const doAsk = async () => {
    if (!ask.trim()) return;
    setBusy("ask"); setAnswer(null);
    try { setAnswer(await runAsk({ data: { question: ask } })); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const doSeed = async () => {
    setBusy("seed");
    try {
      const { created } = await runSeed({ data: undefined as never });
      toast.success(`Seeded ${created} skill / routine / app pages`);
      await refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  const scoreColor = (n: number) => n >= 80 ? "var(--cc-emerald)" : n >= 60 ? "var(--cc-gold)" : "var(--cc-crimson)";

  return (
    <div className="mx-auto max-w-6xl p-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Second Brain"
        description="Capture → enrich → file. Every fact carries a citation; every page has one home."
        actions={<div className="flex gap-2">
          <Button onClick={doSeed} disabled={busy==="seed"} className="border border-cc-border bg-black/30 text-cc-text hover:bg-white/[0.04]">
            {busy==="seed" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />} Seed rings
          </Button>
          <Button onClick={refresh} className="border border-cc-border bg-black/30 text-cc-text hover:bg-white/[0.04]"><RefreshCcw className="mr-2 size-4" /> Refresh</Button>
          <Button asChild className="border border-cc-border bg-black/30 text-cc-text hover:bg-white/[0.04]"><a href="/constellation"><Network className="mr-2 size-4" /> Constellation</a></Button>
        </div>}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <CCPanel title="Brain Health" subtitle="Overall archive score" className="lg:col-span-1">
          {!health ? <CCEmpty title="Scoring…" /> : (
            <div className="space-y-3">
              <div className="flex items-baseline gap-3">
                <div className="font-mono text-[40px] font-semibold leading-none" style={{ color: scoreColor(health.score) }}>{health.score}</div>
                <div className="text-[11px] text-cc-muted">/100 · {health.counts.pages} pages · {health.counts.links} links · {health.linkCoverage}% linked</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <Stat label="Orphans" n={health.checks.orphans.length} />
                <Stat label="No citations" n={health.checks.missingCitations.length} />
                <Stat label="Stale >90d" n={health.checks.stale.length} />
                <Stat label="Inbox stuck" n={health.counts.inboxStuck} />
                <Stat label="Types" n={Object.keys(health.byType).length} />
                <Stat label="Depts" n={Object.keys(health.byDept).length} />
              </div>
            </div>
          )}
        </CCPanel>

        <CCPanel title="Ask the Brain" subtitle="Keyword → neighborhood → synthesis" className="lg:col-span-2">
          <div className="flex gap-2">
            <Input value={ask} onChange={(e)=>setAsk(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") doAsk(); }} placeholder="Ask anything grounded in your brain…" className="border-cc-border bg-black/30 text-cc-text placeholder:text-cc-muted" />
            <Button onClick={doAsk} disabled={busy==="ask" || !ask.trim()} className="bg-cc-violet text-white hover:bg-cc-violet/90">
              {busy==="ask" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
          {answer && (
            <div className="mt-3 space-y-2 rounded-md border border-cc-border bg-black/25 p-3">
              <div className="whitespace-pre-wrap text-[12px] text-cc-text">{answer.answer}</div>
              {answer.citations.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t border-cc-border pt-2">
                  {answer.citations.map((c) => <CCTag key={c.slug} accent="var(--cc-cyan)">[{c.slug}] {c.title}</CCTag>)}
                </div>
              )}
            </div>
          )}
        </CCPanel>
      </div>

      <CCPanel title="Inbox — enrich & file" subtitle={`${caps.filter(c=>c.status!=="filed").length} pending`} className="mb-4">
        {caps.length === 0 ? <CCEmpty title="Inbox empty" hint="Use ⌘⇧N or the Capture button to add." /> : (
          <ul className="space-y-2">
            {caps.filter(c => c.status !== "filed").slice(0,15).map((c) => {
              const p = proposal[c.id];
              return (
                <li key={c.id} className="rounded-md border border-cc-border bg-black/25 p-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-cc-text">{c.title}</div>
                      {c.body && <div className="mt-0.5 line-clamp-2 text-[11px] text-cc-muted">{c.body}</div>}
                      {c.source_url && <a href={c.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block truncate font-mono text-[10px] text-cc-cyan hover:underline">{c.source_url}</a>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <CCTag accent={c.status==="enriched" ? "var(--cc-gold)" : "var(--cc-muted)"}>{c.status}</CCTag>
                      {!p ? (
                        <Button size="sm" onClick={()=>doEnrich(c.id)} disabled={busy===`enrich:${c.id}`} className="h-7 bg-cc-violet text-white hover:bg-cc-violet/90">
                          {busy===`enrich:${c.id}` ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          <span className="ml-1 text-[11px]">Enrich</span>
                        </Button>
                      ) : (
                        <Button size="sm" onClick={()=>doFile(c.id)} disabled={busy===`file:${c.id}`} className="h-7 bg-cc-emerald text-black hover:bg-cc-emerald/90">
                          {busy===`file:${c.id}` ? <Loader2 className="size-3 animate-spin" /> : <FileCheck2 className="size-3" />}
                          <span className="ml-1 text-[11px]">File</span>
                        </Button>
                      )}
                    </div>
                  </div>
                  {p && (
                    <div className="mt-2 rounded border border-cc-border/60 bg-black/40 p-2">
                      <div className="mb-1 flex flex-wrap gap-1">
                        <CCTag accent="var(--cc-violet)">{p.type}</CCTag>
                        <CCTag accent="var(--cc-cyan)">{p.department}</CCTag>
                        {p.entities.slice(0,5).map((e,i)=><CCTag key={i} accent="var(--cc-gold)">{e.name}</CCTag>)}
                      </div>
                      <div className="text-[11px] font-medium text-cc-text">{p.title}</div>
                      <div className="mt-0.5 whitespace-pre-wrap text-[11px] text-cc-muted">{p.summary}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CCPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <CCPanel title="Brain Pages" subtitle={`${pages.length} filed`}>
          {pages.length === 0 ? <CCEmpty title="No pages yet." hint="Enrich a capture to create your first page." /> : (
            <ul className="divide-y divide-cc-border">
              {pages.slice(0,25).map((p)=> (
                <li key={p.id} className="py-2">
                  <div className="flex items-baseline gap-2">
                    <div className="min-w-0 flex-1 truncate text-[13px] text-cc-text">{p.title}</div>
                    <span className="shrink-0 font-mono text-[10px] text-cc-muted">{fmtRelative(p.updated_at)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    <CCTag accent="var(--cc-violet)">{p.type}</CCTag>
                    {p.department && <CCTag accent="var(--cc-cyan)">{p.department}</CCTag>}
                    {Array.isArray(p.citations) && (p.citations as unknown[]).length===0 && <CCTag accent="var(--cc-crimson)">no citations</CCTag>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CCPanel>

        <CCPanel title={<span className="inline-flex items-center gap-2"><HeartPulse className="size-3.5" /> Health details</span> as unknown as string}>
          {!health ? <CCEmpty title="Loading…" /> : (
            <div className="space-y-3 text-[11px]">
              <HealthList label="Orphan pages" items={health.checks.orphans} accent="var(--cc-gold)" />
              <HealthList label="Missing citations" items={health.checks.missingCitations} accent="var(--cc-crimson)" />
              <HealthList label="Stale (>90 days)" items={health.checks.stale} accent="var(--cc-muted)" />
            </div>
          )}
        </CCPanel>
      </div>

      <CCPanel title="Recent Notes" subtitle={`${notes.length} tracked`}>
        {notes.length === 0 ? <CCEmpty title="No notes yet." hint="Capture from Quick Create or voice." /> : (
          <ul className="divide-y divide-cc-border">
            {notes.slice(0, 40).map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-baseline gap-2">
                  <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-cc-text">{n.title ?? "Untitled"}</div>
                  <span className="shrink-0 font-mono text-[10px] text-cc-muted">{fmtRelative(n.updated_at)}</span>
                </div>
                {n.content && <div className="mt-0.5 line-clamp-2 text-[11px] text-cc-muted">{n.content}</div>}
                {n.tags && n.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {n.tags.slice(0, 5).map((t) => <CCTag key={t}>{t}</CCTag>)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CCPanel>
    </div>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded border border-cc-border bg-black/30 p-2">
      <div className="font-mono text-[16px] text-cc-text">{n}</div>
      <div className="text-[9px] uppercase tracking-widest text-cc-muted">{label}</div>
    </div>
  );
}

function HealthList({ label, items, accent }: { label: string; items: { slug: string; title: string }[]; accent: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: accent }}>{label}</span>
        <span className="text-cc-muted">{items.length}</span>
      </div>
      {items.length === 0 ? <div className="text-cc-muted">Clean.</div> : (
        <ul className="space-y-0.5">
          {items.slice(0,6).map((p) => <li key={p.slug} className="truncate text-cc-text">· {p.title}</li>)}
        </ul>
      )}
    </div>
  );
}