import type { NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";

export function DetailPanel({ graph }: { graph: NormalizedGraph }) {
  const selectedId = useGraphStore((s) => s.selectedId);
  const select = useGraphStore((s) => s.select);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  const node = selectedId ? graph.byId.get(selectedId) : null;

  if (!node) {
    return (
      <aside className="w-96 border-l border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 h-full">
        <div className="p-8 flex-1 flex flex-col items-center justify-center text-center gap-4">
          <div className="size-2 rounded-full bg-neon-primary shadow-[0_0_10px_#3DED97] animate-pulse" />
          <p className="text-xs font-mono uppercase tracking-widest text-muted-text">
            No node selected
          </p>
          <p className="text-sm text-white/60 max-w-[220px] leading-relaxed">
            Click a star in the constellation to trace its connections.
          </p>
        </div>
      </aside>
    );
  }

  const neighbors = Array.from(graph.neighbors.get(node.id) ?? [])
    .map((id) => graph.byId.get(id))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .slice(0, 40);

  const color = CATEGORY_COLORS[node.category];

  const edges = graph.links.filter((l) => l.source === node.id || l.target === node.id);
  const knownKeys = new Set([
    "id",
    "label",
    "category",
    "degree",
    "file_type",
    "source_file",
    "source_location",
    "_origin",
    "community",
    "norm_label",
  ]);
  const extraEntries = Object.entries(node as Record<string, unknown>).filter(
    ([k, v]) => !knownKeys.has(k) && v !== undefined && v !== null && v !== "",
  );

  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    return String(v);
  };

  return (
    <aside className="w-96 border-l border-obsidian-border bg-obsidian-surface flex flex-col shrink-0 h-full overflow-y-auto">
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <span
            className="px-2 py-0.5 border rounded text-[10px] font-mono uppercase"
            style={{
              color,
              borderColor: `${color}40`,
              backgroundColor: `${color}1a`,
            }}
          >
            {node.category}
          </span>
          <span className="text-xs text-muted-text font-mono">
            deg {node.degree} · c{node.community ?? "—"}
          </span>
        </div>

        <h2 className="text-2xl font-light mb-2 leading-tight break-words">{node.label}</h2>
        {node.source_file && (
          <p className="text-sm text-muted-text leading-relaxed mb-8 font-mono break-all">
            {node.source_file}
            {node.source_location ? `:${node.source_location}` : ""}
          </p>
        )}

        <div className="space-y-6">
          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-3">
              All Properties
            </h4>
            <div className="space-y-2">
              <PropRow label="ID" value={node.id} mono />
              <PropRow label="Label" value={node.label} />
              <PropRow label="Category" value={node.category} />
              <PropRow label="File Type" value={node.file_type ?? "—"} />
              <PropRow label="Community" value={node.community != null ? String(node.community) : "—"} />
              <PropRow label="Degree" value={String(node.degree)} />
              <PropRow label="Origin" value={node._origin ?? "—"} />
              <PropRow label="Norm Label" value={node.norm_label ?? "—"} mono />
              <PropRow label="Source File" value={node.source_file ?? "—"} mono />
              <PropRow label="Source Location" value={node.source_location ?? "—"} mono />
              {extraEntries.map(([k, v]) => (
                <PropRow key={k} label={k} value={formatValue(v)} mono />
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-3">
              Connections ({edges.length})
            </h4>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {edges.length === 0 && (
                <div className="text-xs text-muted-text font-mono">no edges</div>
              )}
              {edges.map((l, i) => {
                const otherId = l.source === node.id ? l.target : l.source;
                const dir = l.source === node.id ? "→" : "←";
                const other = graph.byId.get(otherId);
                if (!other) return null;
                return (
                  <button
                    key={`${otherId}-${i}`}
                    type="button"
                    onClick={() => select(other.id)}
                    className="w-full p-3 bg-white/5 border border-obsidian-border rounded-lg hover:border-white/20 cursor-pointer transition-colors text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs truncate">
                        <span className="text-muted-text font-mono mr-1">{dir}</span>
                        {other.label}
                      </span>
                      <div
                        className="size-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[other.category] }}
                      />
                    </div>
                    {(l.relation || l.weight != null) && (
                      <div className="mt-1 text-[10px] font-mono text-muted-text">
                        {l.relation ?? "link"}
                        {l.weight != null ? ` · w${l.weight}` : ""}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-text mb-3">
              Direct Neighbors ({neighbors.length})
            </h4>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {neighbors.length === 0 && (
                <div className="text-xs text-muted-text font-mono">no connections</div>
              )}
              {neighbors.map((nb) => (
                <button
                  key={nb.id}
                  type="button"
                  onClick={() => select(nb.id)}
                  className="w-full p-3 bg-white/5 border border-obsidian-border rounded-lg flex items-center justify-between hover:border-white/20 cursor-pointer transition-colors text-left"
                >
                  <span className="text-xs truncate pr-2">{nb.label}</span>
                  <div
                    className="size-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[nb.category] }}
                  />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="mt-auto p-8 border-t border-obsidian-border flex gap-4">
        <button
          type="button"
          onClick={toggleFocus}
          className={`flex-1 py-3 rounded font-semibold text-xs uppercase tracking-wider cursor-pointer transition-colors ${
            focusMode
              ? "bg-neon-primary text-obsidian-bg"
              : "bg-white text-obsidian-bg hover:brightness-110"
          }`}
        >
          {focusMode ? "Exit Focus" : "Focus Neighborhood"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (node.source_file && typeof navigator !== "undefined") {
              void navigator.clipboard?.writeText(
                node.source_location ? `${node.source_file}:${node.source_location}` : node.source_file,
              );
            }
          }}
          title="Copy source path"
          className="p-3 bg-white/5 border border-obsidian-border rounded cursor-pointer hover:border-white/20 transition-colors"
        >
          <div className="size-4 border border-white/40 rounded-sm" />
        </button>
      </div>
    </aside>
  );
}

function PropRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const isUrl = /^https?:\/\//.test(value);
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-start py-1.5 border-b border-white/5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-text pt-0.5">
        {label}
      </div>
      {isUrl ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-mono text-neon-primary break-all hover:underline"
        >
          {value}
        </a>
      ) : (
        <div className={`text-xs break-all ${mono ? "font-mono text-white/80" : "text-white"}`}>
          {value}
        </div>
      )}
    </div>
  );
}