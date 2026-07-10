export function fmtMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents == null || Number.isNaN(cents)) return "—";
  const dollars = Number(cents) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: dollars >= 1000 ? 0 : 2 }).format(dollars);
}

export function fmtChicagoNow(d = new Date()): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return { date, time };
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = (Date.now() - then) / 1000;
  const abs = Math.abs(diff);
  const fut = diff < 0;
  if (abs < 60) return fut ? "in a moment" : "just now";
  if (abs < 3600) return `${Math.round(abs / 60)}m ${fut ? "from now" : "ago"}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ${fut ? "from now" : "ago"}`;
  if (abs < 604800) return `${Math.round(abs / 86400)}d ${fut ? "from now" : "ago"}`;
  return new Date(iso).toLocaleDateString();
}

export function severityDot(sev: string | null | undefined) {
  switch (sev) {
    case "critical": return "bg-cc-crimson shadow-[0_0_10px_var(--cc-crimson)]";
    case "warning":  return "bg-cc-gold shadow-[0_0_10px_var(--cc-gold)]";
    case "success":  return "bg-cc-emerald shadow-[0_0_10px_var(--cc-emerald)]";
    default:         return "bg-cc-cyan shadow-[0_0_10px_var(--cc-cyan)]";
  }
}