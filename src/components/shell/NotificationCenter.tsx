import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { severityDot, fmtRelative } from "@/lib/commandCenter/format";
import { useServerFn } from "@tanstack/react-start";
import { markAlertRead } from "@/lib/commandCenter.functions";
import { toast } from "sonner";
import { Bell, Check } from "lucide-react";

type Alert = { id: string; title: string; body: string | null; severity: string; source: string | null; is_read: boolean; created_at: string };

export function NotificationCenter({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState(false);
  const mark = useServerFn(markAlertRead);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    supabase.from("cc_alerts").select("*").order("created_at", { ascending: false }).limit(40)
      .then(({ data, error }) => {
        if (!error) setAlerts((data ?? []) as Alert[]);
        setBusy(false);
      });
  }, [open]);

  const acknowledge = async (id: string) => {
    try {
      await mark({ data: { id } });
      setAlerts((a) => a.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 border-cc-border bg-cc-panel/95 p-0 text-cc-text backdrop-blur-2xl sm:max-w-[420px]">
        <SheetHeader className="border-b border-cc-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-[14px] font-semibold tracking-wide">
            <Bell className="size-4" style={{ color: "var(--cc-gold)" }} /> Notification Center
          </SheetTitle>
          <p className="text-[11px] text-cc-muted">Alerts, follow-ups, and system signals across your command surface.</p>
        </SheetHeader>
        <div className="min-h-0 flex-1 divide-y divide-cc-border overflow-y-auto">
          {busy && <div className="p-5 text-[12px] text-cc-muted">Loading…</div>}
          {!busy && alerts.length === 0 && <div className="p-5 text-[12px] text-cc-muted">All clear. No alerts.</div>}
          {alerts.map((a) => (
            <div key={a.id} className={"flex gap-3 px-5 py-3 " + (a.is_read ? "opacity-60" : "")}>
              <span className={"mt-1.5 size-2 shrink-0 rounded-full " + severityDot(a.severity)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="truncate text-[13px] font-medium text-cc-text">{a.title}</div>
                  <div className="shrink-0 font-mono text-[10px] text-cc-muted">{fmtRelative(a.created_at)}</div>
                </div>
                {a.body && <div className="mt-0.5 text-[12px] text-cc-muted">{a.body}</div>}
                <div className="mt-1.5 flex items-center gap-2">
                  {a.source && <span className="rounded border border-cc-border bg-black/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-cc-muted">{a.source}</span>}
                  {!a.is_read && (
                    <button type="button" onClick={() => acknowledge(a.id)} className="ml-auto inline-flex items-center gap-1 text-[10px] text-cc-emerald hover:underline">
                      <Check className="size-3" /> Mark read
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}