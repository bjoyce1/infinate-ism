import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askChiefOfStaff } from "@/lib/commandCenter.functions";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What's the shape of my day?",
  "Which clients are at risk this week?",
  "Summarize overdue tasks with next actions.",
  "Draft a follow-up to my top-priority client.",
];

export function ChiefOfStaffDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(askChiefOfStaff);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.slice(-8);
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const { text: reply } = await ask({ data: { prompt: q, history } });
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `Unable to reach the Chief of Staff right now. ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-cc-border bg-cc-panel/95 p-0 text-cc-text backdrop-blur-2xl sm:max-w-[440px]">
        <SheetHeader className="border-b border-cc-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-[14px] font-semibold tracking-wide">
            <Sparkles className="size-4" style={{ color: "var(--cc-violet)" }} />
            Chief of Staff
          </SheetTitle>
          <p className="text-[11px] text-cc-muted">Grounded in your projects, clients, tasks, and inbox.</p>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {msgs.length === 0 && (
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="w-full rounded-lg border border-cc-border bg-black/30 px-3 py-2 text-left text-[12px] text-cc-text/90 transition-colors hover:border-cc-border-2 hover:bg-white/[0.04]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-6 rounded-lg border border-cc-border bg-white/[0.04] px-3 py-2 text-[13px]" : "mr-6 rounded-lg border border-cc-border bg-black/40 px-3 py-2 text-[13px]"}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-cc-muted">{m.role === "user" ? "You" : "Chief of Staff"}</div>
              <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
            </div>
          ))}
          {busy && (
            <div className="mr-6 flex items-center gap-2 rounded-lg border border-cc-border bg-black/40 px-3 py-2 text-[12px] text-cc-muted">
              <Loader2 className="size-3.5 animate-spin" /> Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-cc-border bg-black/30 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about pipeline, priorities, follow-ups…"
              rows={2}
              className="min-h-[44px] resize-none border-cc-border bg-black/40 text-[13px] text-cc-text placeholder:text-cc-muted"
            />
            <Button type="button" onClick={() => send(input)} disabled={busy || !input.trim()} className="h-[44px] bg-cc-violet text-white hover:bg-cc-violet/90">
              <Send className="size-4" />
            </Button>
          </div>
          <div className="mt-2 text-[10px] text-cc-muted">Press ⌘J anywhere to open. Enter to send • Shift+Enter for newline.</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}