import type { ReactNode } from "react";

export function CCPanel({ title, subtitle, action, children, className = "" }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={"cc-panel cc-panel-hover overflow-hidden " + className}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-cc-border px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="truncate text-[13px] font-semibold tracking-wide text-cc-text">{title}</h3>}
            {subtitle && <p className="truncate text-[11px] text-cc-muted">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function CCMetric({ label, value, hint, accent = "var(--cc-violet)" }: { label: string; value: ReactNode; hint?: string; accent?: string }) {
  return (
    <div className="cc-panel relative overflow-hidden p-4">
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cc-muted">{label}</div>
      <div className="mt-1.5 font-mono text-[24px] font-semibold leading-none text-cc-text">{value}</div>
      {hint && <div className="mt-1.5 text-[11px] text-cc-muted">{hint}</div>}
    </div>
  );
}

export function CCEmpty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-cc-border bg-black/20 px-5 py-8 text-center">
      <div className="text-[13px] font-medium text-cc-text">{title}</div>
      {hint && <div className="max-w-md text-[12px] text-cc-muted">{hint}</div>}
      {action}
    </div>
  );
}

export function CCTag({ children, accent = "var(--cc-cyan)" }: { children: ReactNode; accent?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest"
      style={{ color: accent, borderColor: `${accent}55`, background: `${accent}10` }}
    >
      {children}
    </span>
  );
}