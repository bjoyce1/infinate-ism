import type { NormalizedGraph } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { trackLinkClick } from "@/lib/analytics/trackClick";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

export function DetailPanel({ graph }: { graph: NormalizedGraph }) {
  const selectedId = useGraphStore((s) => s.selectedId);
  const hoveredId = useGraphStore((s) => s.hoveredId);
  const select = useGraphStore((s) => s.select);
  const focusMode = useGraphStore((s) => s.focusMode);
  const toggleFocus = useGraphStore((s) => s.toggleFocus);
  // Hover previews the node; clicking pins it. Hover wins when both exist.
  const activeId = hoveredId ?? selectedId;
  const node = activeId ? graph.byId.get(activeId) : null;
  const isPinned = Boolean(selectedId && selectedId === activeId);
  const isPreview = Boolean(hoveredId && hoveredId !== selectedId);

  if (!node) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center gap-4">
          <div className="size-2 rounded-full bg-neon-primary shadow-[0_0_10px_#3DED97] animate-pulse" />
          <p className="text-xs font-mono uppercase tracking-widest text-muted-text">
            No node selected
          </p>
          <p className="text-sm text-white/60 max-w-[220px] leading-relaxed">
            Click a star in the constellation to trace its connections.
          </p>
      </div>
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
    "image",
    "artwork",
    "gallery",
    "alt",
    "caption",
  ]);

  const galleryRaw = (node as Record<string, unknown>).gallery;
  const gallery: string[] = Array.isArray(galleryRaw)
    ? galleryRaw.filter((v): v is string => typeof v === "string")
    : [];
  const showCarousel = gallery.length > 1;
  const showSingleImage = !showCarousel && Boolean(node.image);
  const extraEntries = Object.entries(node as Record<string, unknown>).filter(
    ([k, v]) => !knownKeys.has(k) && v !== undefined && v !== null && v !== "",
  );

  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    return String(v);
  };

  // Pick a primary outbound URL for the node so the header + open button link
  // somewhere meaningful. Prefer explicit URL-shaped properties, then fall back
  // to a URL-looking id/label/source_file.
  const isHttp = (v: unknown): v is string =>
    typeof v === "string" && /^https?:\/\//i.test(v);
  const record = node as Record<string, unknown>;
  const primaryUrl: string | null = (() => {
    for (const key of ["url", "href", "link", "permalink", "canonical_url"]) {
      const v = record[key];
      if (isHttp(v)) return v;
    }
    if (isHttp(record.source_file)) return record.source_file as string;
    if (isHttp(node.id)) return node.id;
    // Domain-looking labels (e.g. "mrcap1.com") → https://
    if (typeof node.label === "string" && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(node.label)) {
      return `https://${node.label.replace(/^https?:\/\//, "")}`;
    }
    return null;
  })();
  const sourceFileIsUrl = isHttp(node.source_file);

  const track = (url: string) =>
    trackLinkClick({
      url,
      nodeId: node.id,
      nodeLabel: node.label,
      nodeCategory: node.category,
    });

  return (
    <div className="flex flex-col">
      <div className="p-8">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
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
          <span
            className={`px-1.5 py-0.5 rounded-full border text-[9px] font-mono uppercase tracking-widest ml-auto ${
              isPreview
                ? "border-white/20 text-white/60 bg-white/5"
                : isPinned
                  ? "border-neon-primary/40 text-neon-primary bg-neon-primary/10"
                  : "border-white/10 text-muted-text bg-white/5"
            }`}
          >
            {isPreview ? "hover" : isPinned ? "pinned" : "idle"}
          </span>
        </div>

        <h2 className="text-2xl font-light mb-2 leading-tight break-words">
          {primaryUrl ? (
            <a
              href={primaryUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => track(primaryUrl)}
              onAuxClick={() => track(primaryUrl)}
              className="text-white hover:text-neon-primary transition-colors underline decoration-white/20 hover:decoration-neon-primary underline-offset-4"
            >
              {node.label}
            </a>
          ) : (
            node.label
          )}
        </h2>
        {primaryUrl && (
          <a
            href={primaryUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => track(primaryUrl)}
            onAuxClick={() => track(primaryUrl)}
            className="inline-flex items-center gap-1.5 mb-4 text-[10px] font-mono uppercase tracking-widest text-neon-primary hover:underline"
          >
            Open ↗ <span className="text-muted-text normal-case tracking-normal truncate max-w-[220px]">{primaryUrl}</span>
          </a>
        )}
        {showCarousel && (
          <div className="mb-6 mt-4 relative">
            <Carousel opts={{ loop: true }} className="w-full">
              <CarouselContent>
                {gallery.map((src, i) => (
                  <CarouselItem key={`${src}-${i}`}>
                    <div className="rounded-lg overflow-hidden border border-obsidian-border bg-black/40">
                      <img
                        src={src}
                        alt={`${node.label} — image ${i + 1} of ${gallery.length}`}
                        className="w-full h-auto object-contain"
                        loading="lazy"
                      />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="left-2" />
              <CarouselNext className="right-2" />
            </Carousel>
            <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-muted-text text-center">
              Gallery · {gallery.length} photos
            </div>
          </div>
        )}
        {showSingleImage && (
          <div className="mb-6 mt-4 rounded-lg overflow-hidden border border-obsidian-border bg-black/40">
            <img
              src={node.image}
              alt={`${node.label} artwork`}
              className="w-full h-auto object-contain"
              loading="lazy"
            />
          </div>
        )}
        {node.source_file && (
          <p className="text-sm text-muted-text leading-relaxed mb-8 font-mono break-all">
            {sourceFileIsUrl ? (
              <a
                href={node.source_file}
                target="_blank"
                rel="noreferrer"
                onClick={() => track(node.source_file as string)}
                onAuxClick={() => track(node.source_file as string)}
                className="text-neon-primary hover:underline"
              >
                {node.source_file}
              </a>
            ) : (
              node.source_file
            )}
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
                <PropRow
                  key={k}
                  label={k}
                  value={formatValue(v)}
                  mono
                  onLinkClick={track}
                />
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
                const walkDirections = (l as unknown as Record<string, unknown>).walk_directions;
                const walkDaysRaw = (l as unknown as Record<string, unknown>).walk_days;
                const walkDays = Array.isArray(walkDaysRaw)
                  ? (walkDaysRaw as Array<{
                      label?: string;
                      distance?: string;
                      duration?: string;
                      directions?: string;
                    }>)
                  : [];
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
                    {typeof walkDirections === "string" && walkDirections && (
                      <div className="mt-1 text-[10px] text-white/60 leading-relaxed normal-case">
                        🚶 {walkDirections}
                      </div>
                    )}
                    {walkDays.length > 0 && (
                      <ol className="mt-2 space-y-2 border-t border-white/10 pt-2">
                        {walkDays.map((d, di) => (
                          <li
                            key={di}
                            className="text-[10px] text-white/70 leading-relaxed normal-case"
                          >
                            <div className="font-mono uppercase tracking-wider text-neon-primary">
                              {d.label ?? `Day ${di + 1}`}
                            </div>
                            <div className="text-white/50 font-mono">
                              {d.distance ?? "—"} · {d.duration ?? "—"}
                            </div>
                            {d.directions && <div className="mt-0.5">🚶 {d.directions}</div>}
                          </li>
                        ))}
                      </ol>
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
    </div>
  );
}

function PropRow({
  label,
  value,
  mono,
  onLinkClick,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onLinkClick?: (url: string) => void;
}) {
  const isUrl = /^https?:\/\//.test(value);
  const isMailto = /^mailto:/i.test(value);
  const isLink = isUrl || isMailto;
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-start py-1.5 border-b border-white/5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-text pt-0.5">
        {label}
      </div>
      {isLink ? (
        <a
          href={value}
          target={isMailto ? undefined : "_blank"}
          rel={isMailto ? undefined : "noreferrer"}
          onClick={() => onLinkClick?.(value)}
          onAuxClick={() => onLinkClick?.(value)}
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