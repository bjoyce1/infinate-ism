import { useState } from "react";

type Day = {
  label?: string;
  distance?: string;
  duration?: string;
  directions?: string;
};

export function buildDirectionsText(
  header: string,
  distance?: string,
  duration?: string,
  directions?: string,
  days?: Day[],
): string {
  const lines: string[] = [];
  lines.push(`🚶 ${header}`);
  if (distance || duration) {
    lines.push(`${distance ?? "—"} · ${duration ?? "—"}`);
  }
  if (directions) {
    lines.push("");
    lines.push(directions);
  }
  if (days && days.length) {
    days.forEach((d, i) => {
      lines.push("");
      lines.push(d.label ?? `Day ${i + 1}`);
      if (d.distance || d.duration) {
        lines.push(`${d.distance ?? "—"} · ${d.duration ?? "—"}`);
      }
      if (d.directions) lines.push(d.directions);
    });
  }
  return lines.join("\n");
}

export function CopyDirectionsButton({
  text,
  className,
  asSpan = false,
}: {
  text: string;
  className?: string;
  asSpan?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const doCopy = async (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const label = copied ? "✓ Copied" : "📋 Copy";
  const base =
    className ??
    "text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors";

  if (asSpan) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={doCopy}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") doCopy(e);
        }}
        className={base + " cursor-pointer inline-block select-none"}
        aria-label="Copy walking directions to clipboard"
      >
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={doCopy}
      className={base}
      aria-label="Copy walking directions to clipboard"
    >
      {label}
    </button>
  );
}