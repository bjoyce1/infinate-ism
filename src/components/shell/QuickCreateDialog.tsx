import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createCapture } from "@/lib/brain.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckSquare, StickyNote, Briefcase, UserPlus, Loader2, Zap } from "lucide-react";

type Kind = "capture" | "task" | "note" | "project" | "client";

export function QuickCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [kind, setKind] = useState<Kind>("capture");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const runCapture = useServerFn(createCapture);

  const submit = async () => {
    if (!title.trim() && !body.trim()) return;
    setBusy(true);
    try {
      if (kind === "capture") {
        const raw = (title + " " + body).trim();
        const urlMatch = raw.match(/https?:\/\/\S+/);
        await runCapture({ data: {
          title: title.trim() || undefined,
          body: body.trim() || undefined,
          source_url: urlMatch?.[0],
        } });
        toast.success("Captured — enrich it on Second Brain");
        setTitle(""); setBody("");
        onOpenChange(false);
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sign in required.");
      if (kind === "task") {
        await supabase.from("tasks").insert({ user_id: uid, title: title.trim(), description: body || undefined, status: "todo", priority: "medium" }).throwOnError();
      } else if (kind === "note") {
        await supabase.from("notes").insert({ user_id: uid, title: title.trim(), content: body || undefined }).throwOnError();
      } else if (kind === "project") {
        await supabase.from("projects").insert({ user_id: uid, name: title.trim(), goal: body || undefined, status: "active", priority: "medium" }).throwOnError();
      } else {
        await supabase.from("clients").insert({ user_id: uid, name: title.trim(), notes: body || undefined }).throwOnError();
      }
      toast.success(`${labelOf(kind)} created`);
      setTitle(""); setBody("");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-cc-border bg-cc-panel/95 text-cc-text backdrop-blur-2xl sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[14px] font-semibold tracking-wide">Quick create</DialogTitle>
        </DialogHeader>
        <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
          <TabsList className="grid w-full grid-cols-5 bg-black/40">
            <TabsTrigger value="capture" className="gap-1.5 text-[12px]"><Zap className="size-3.5" /> Capture</TabsTrigger>
            <TabsTrigger value="task" className="gap-1.5 text-[12px]"><CheckSquare className="size-3.5" /> Task</TabsTrigger>
            <TabsTrigger value="note" className="gap-1.5 text-[12px]"><StickyNote className="size-3.5" /> Note</TabsTrigger>
            <TabsTrigger value="project" className="gap-1.5 text-[12px]"><Briefcase className="size-3.5" /> Project</TabsTrigger>
            <TabsTrigger value="client" className="gap-1.5 text-[12px]"><UserPlus className="size-3.5" /> Client</TabsTrigger>
          </TabsList>
          <TabsContent value={kind} className="mt-4 space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind==="capture" ? "Optional title or URL" : `${labelOf(kind)} name`} className="border-cc-border bg-black/30 text-cc-text placeholder:text-cc-muted" />
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={placeholderOf(kind)} rows={3} className="border-cc-border bg-black/30 text-cc-text placeholder:text-cc-muted" />
          </TabsContent>
        </Tabs>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-cc-muted hover:text-cc-text">Cancel</Button>
          <Button onClick={submit} disabled={busy || (!title.trim() && !body.trim())} className="bg-cc-violet text-white hover:bg-cc-violet/90">
            {busy && <Loader2 className="mr-2 size-3.5 animate-spin" />} Create {labelOf(kind)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function labelOf(k: Kind) { return k === "capture" ? "Capture" : k === "task" ? "Task" : k === "note" ? "Note" : k === "project" ? "Project" : "Client"; }
function placeholderOf(k: Kind) {
  return k === "capture" ? "Paste text, a URL, or a raw thought — enrichment classifies + files it." :
         k === "task" ? "Details, links, next action…" :
         k === "note" ? "Capture the thought — voice, quote, or draft." :
         k === "project" ? "Goal or outcome" : "Company, context, notes";
}