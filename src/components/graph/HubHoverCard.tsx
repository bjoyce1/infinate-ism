import { useMemo } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";

const HUB_ID = "site_mrcap1_com";

export function HubHoverCard({ graph }: { graph: NormalizedGraph }) {
  const hoveredId = useGraphStore((s) => s.hoveredId);
  const hub = graph.byId.get(HUB_ID);

  const spawnSources = useMemo(() => {
    const ids = graph.neighbors.get(HUB_ID);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => graph.byId.get(id))
      .filter((n): n is NonNullable<typeof n> => Boolean(n))
      .sort((a, b) => b.degree - a.degree);
  }, [graph]);

  if (!hub || hoveredId !== HUB_ID) return null;

  const preview = spawnSources.slice(0, 10);
  const remaining = spawnSources.length - preview.length;

  return (
    <div className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 z-20">
      <div className="w-[340px] rounded-lg border border-amber-500/40 bg-obsidian-surface/95 backdrop-blur shadow-2xl px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="size-2 rounded-full bg-amber-400 shadow-[0_0_10px_#F59E0B]" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
            Single hub · {spawnSources.length} spawned nodes
          </span>
        </div>
        <div className="text-sm font-semibold text-white mb-1">{hub.label}</div>
        <p className="text-[11px] text-white/70 leading-snug mb-3">
          Central source of truth. Every node in the graph radiates from here —
          the sim pulls it to the center and the layout branches outward.
        </p>
        <div className="text-[9px] font-mono uppercase tracking-widest text-muted-text mb-1.5">
          Spawned from
        </div>
        <ul className="space-y-1 max-h-48 overflow-hidden">
          {preview.map((n) => (
            <li key={n.id} className="flex items-center gap-2 text-[11px]">
              <span
                className="size-1.5 rounded-full shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[n.category] }}
              />
              <span className="truncate text-white/85">{n.label}</span>
              <span className="ml-auto text-[9px] font-mono text-muted-text">
                ×{n.degree}
              </span>
            </li>
          ))}
        </ul>
        {remaining > 0 && (
          <div className="mt-2 text-[10px] font-mono text-muted-text">
            + {remaining} more
          </div>
        )}
      </div>
    </div>
  );
}
