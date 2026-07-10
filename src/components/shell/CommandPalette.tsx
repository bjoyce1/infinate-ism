import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { NAV_ITEMS } from "@/lib/commandCenter/nav";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Plus } from "lucide-react";

type Hit = { kind: "project"|"client"|"note"|"task"|"prompt"|"resource"; id: string; label: string; sub?: string };

export function CommandPalette({
  open, onOpenChange, onAskAi,
}: { open: boolean; onOpenChange: (v: boolean) => void; onAskAi: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || q.trim().length < 2) { setHits([]); return; }
    let cancelled = false;
    const term = `%${q.trim()}%`;
    (async () => {
      const [p, c, n, t, pr, rs] = await Promise.all([
        supabase.from("projects").select("id,name,status").ilike("name", term).limit(6),
        supabase.from("clients").select("id,name,company").ilike("name", term).limit(6),
        supabase.from("notes").select("id,title,content").or(`title.ilike.${term},content.ilike.${term}`).limit(6),
        supabase.from("tasks").select("id,title,status").ilike("title", term).limit(6),
        supabase.from("prompts").select("id,title,body").or(`title.ilike.${term},body.ilike.${term}`).limit(6),
        supabase.from("resources").select("id,title,url").ilike("title", term).limit(6),
      ]);
      if (cancelled) return;
      const out: Hit[] = [];
      (p.data ?? []).forEach((r) => out.push({ kind: "project", id: r.id, label: r.name, sub: r.status }));
      (c.data ?? []).forEach((r) => out.push({ kind: "client", id: r.id, label: r.name, sub: r.company ?? undefined }));
      (n.data ?? []).forEach((r) => out.push({ kind: "note", id: r.id, label: r.title ?? "Untitled note", sub: (r.content ?? "").slice(0, 80) }));
      (t.data ?? []).forEach((r) => out.push({ kind: "task", id: r.id, label: r.title, sub: r.status }));
      (pr.data ?? []).forEach((r) => out.push({ kind: "prompt", id: r.id, label: r.title ?? "Prompt", sub: (r.body ?? "").slice(0, 80) }));
      (rs.data ?? []).forEach((r) => out.push({ kind: "resource", id: r.id, label: r.title ?? "Resource", sub: r.url ?? undefined }));
      setHits(out);
    })();
    return () => { cancelled = true; };
  }, [q, open]);

  const go = (to: string) => { onOpenChange(false); navigate({ to }); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={q} onValueChange={setQ} placeholder="Search or type a command…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>{q.trim().length < 2 ? "Type to search across the workspace." : "No matches — try different keywords."}</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={onAskAi}>
            <Sparkles className="mr-2 size-4" style={{ color: "var(--cc-violet)" }} />
            Ask C.A.P.I.S.M. Chief of Staff
          </CommandItem>
          <CommandItem onSelect={() => go("/today")}>
            <Plus className="mr-2 size-4" /> Plan my day
          </CommandItem>
        </CommandGroup>

        {hits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Results">
              {hits.map((h) => (
                <CommandItem key={`${h.kind}-${h.id}`} onSelect={() => {
                  if (h.kind === "project") go(`/mission?project=${h.id}`);
                  else if (h.kind === "client") go(`/clients?client=${h.id}`);
                  else if (h.kind === "task") go(`/mission?task=${h.id}`);
                  else go(`/brain?type=${h.kind}&id=${h.id}`);
                }}>
                  <span className="mr-2 rounded border border-cc-border bg-black/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-cc-muted">{h.kind}</span>
                  <span className="truncate">{h.label}</span>
                  {h.sub && <span className="ml-2 truncate text-[11px] text-cc-muted">{h.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((n) => {
            const Icon = n.icon;
            return (
              <CommandItem key={n.to} onSelect={() => go(n.to)}>
                <Icon className="mr-2 size-4" style={{ color: n.accent }} />
                {n.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}