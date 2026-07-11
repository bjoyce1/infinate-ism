import type { LaidOut } from "./treeTypes";
import { DEPARTMENTS } from "./treeTypes";

export function TreeTooltip({
  node, x, y, viewport,
}: { node: LaidOut; x: number; y: number; viewport: { w: number; h: number } }) {
  const d = node.data;
  const dept = DEPARTMENTS.find((p) => p.key === d.dept);
  const width = 260;
  const height = d.node?.image ? 220 : 140;
  const px = Math.min(viewport.w - width - 12, Math.max(12, x + 16));
  const py = Math.min(viewport.h - height - 12, Math.max(12, y + 16));
  const kindLabel: Record<string, string> = {
    root: "Root",
    department: "Department",
    community: "Community",
    subhub: "Sub-branch",
    cluster: "Collapsed group",
    leaf: "Node",
  };
  const src = d.meta?.source;
  const cat = d.meta?.category ?? d.node?.category;
  const degree = d.node?.degree;
  const commLabel = d.meta?.community != null ? `#${d.meta.community}` : null;

  return (
    <div
      className="pointer-events-none absolute z-50 rounded-lg border shadow-2xl backdrop-blur bg-black/85"
      style={{
        left: px, top: py, width,
        borderColor: `${d.color}55`,
        boxShadow: `0 8px 32px ${d.color}22`,
      }}
    >
      <div className="px-3 py-2 border-b" style={{ borderColor: `${d.color}33` }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/50">
            {kindLabel[d.kind]} · {dept?.short}
          </span>
        </div>
        <div className="mt-1 text-[13px] font-semibold text-white leading-tight break-words">
          {d.label || "—"}
        </div>
      </div>
      {d.node?.image && (
        <div className="w-full h-24 overflow-hidden">
          <img src={d.node.image} alt="" className="w-full h-full object-cover opacity-90" />
        </div>
      )}
      <div className="px-3 py-2 space-y-1 font-mono text-[10px] text-white/70">
        {dept && <Row label="Dept"      value={dept.name} />}
        {commLabel && <Row label="Comm" value={commLabel} />}
        {src && <Row label="Source" value={src} />}
        {cat && <Row label="Cat"    value={cat} />}
        {typeof degree === "number" && <Row label="Links" value={String(degree)} />}
        {typeof d.count === "number" && <Row label="Items" value={String(d.count)} />}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-white/40 min-w-[36px]">{label}</span>
      <span className="text-white/85 truncate">{value}</span>
    </div>
  );
}