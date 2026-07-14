import { useGraphStore } from "@/lib/graph/useGraphStore";
import { useStreetPanel } from "@/lib/street/useStreetPanel";
import {
  DISTRICT_BY_ID,
  DOWNTOWN_ID,
  GEO_DISTRICTS,
} from "@/lib/street/houstonGeoConfig";
import type { GeoCityModel } from "@/lib/street/geoCityModel";
import { useMemo } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { buildGeoCityModel } from "@/lib/street/geoCityModel";
import { filterGraph } from "@/lib/graph/filterGraph";

function useStreetCity(graph: NormalizedGraph): GeoCityModel {
  const selectedId = useGraphStore((s) => s.selectedId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const hideCode = useGraphStore((s) => s.hideCode);
  const includeTsFiles = useGraphStore((s) => s.includeTsFiles);
  return useMemo(() => {
    const filtered = filterGraph(graph, {
      activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId,
    });
    const nodes = filtered.nodes.map((n) => ({ ...n }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const neighbors = new Map<string, Set<string>>();
    for (const n of nodes) neighbors.set(n.id, new Set());
    for (const l of filtered.links) {
      neighbors.get(l.source)?.add(l.target);
      neighbors.get(l.target)?.add(l.source);
    }
    return buildGeoCityModel({
      nodes,
      links: filtered.links.map((l) => ({ ...l })),
      neighbors,
      byId,
      communities: graph.communities,
      categoryCounts: graph.categoryCounts,
    });
  }, [graph, activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId]);
}

export function StreetControlsPanel({ graph }: { graph: NormalizedGraph }) {
  const dayMode = useStreetPanel((s) => s.dayMode);
  const setDayMode = useStreetPanel((s) => s.setDayMode);
  const breadcrumbDistrict = useStreetPanel((s) => s.breadcrumbDistrict);
  const propertyId = useStreetPanel((s) => s.propertyId);
  const setPropertyId = useStreetPanel((s) => s.setPropertyId);
  const actions = useStreetPanel((s) => s.actions);
  const select = useGraphStore((s) => s.select);

  const city = useStreetCity(graph);
  const property = propertyId ? city.propertiesById.get(propertyId) ?? null : null;
  const dupes = property ? city.propertiesByCanonical.get(property.canonicalId) ?? [] : [];

  return (
    <div className="p-3 space-y-4 text-white/85 text-xs">
      {/* District jump list */}
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">Districts</div>
        <div className="flex flex-col gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1">
          {GEO_DISTRICTS.map((d) => (
            <button
              key={d.id}
              className="flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
              onClick={() => actions?.focusDistrict(d.id)}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
              <span className="whitespace-nowrap">{d.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Overlay controls — grouped beneath Districts */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-white/40">Controls</div>

        {/* Breadcrumbs */}
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <button className="rounded px-1 hover:text-white text-white/70" onClick={() => actions?.backToCity()}>
            Houston
          </button>
          {breadcrumbDistrict && (
            <>
              <span className="text-white/40">›</span>
              <button className="rounded px-1 hover:text-white text-white/70" onClick={() => actions?.backToDistrict()}>
                {DISTRICT_BY_ID[breadcrumbDistrict].name}
              </button>
            </>
          )}
          {property && (
            <>
              <span className="text-white/40">›</span>
              <span className="rounded px-1 text-white">{property.label}</span>
            </>
          )}
        </div>

        {/* View toggles */}
        <div className="flex gap-1">
          <button
            className="flex-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1 hover:bg-white/10"
            onClick={() => actions?.backToCity()}
          >
            Fit
          </button>
          <button
            className="flex-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1 hover:bg-white/10"
            onClick={() => actions?.focusDistrict(DOWNTOWN_ID)}
          >
            Downtown
          </button>
          <button
            className="flex-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1 hover:bg-white/10"
            onClick={() => setDayMode((d) => !d)}
          >
            {dayMode ? "Night" : "Day"}
          </button>
        </div>
      </div>

      {/* Property details */}
      {property && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/40">
                {DISTRICT_BY_ID[property.districtId].name}
              </div>
              <div className="text-sm font-semibold" style={{ color: property.color }}>{property.label}</div>
            </div>
            <button
              className="rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/10"
              onClick={() => setPropertyId(null)}
            >
              ✕
            </button>
          </div>
          <div className="mt-1 text-[11px] text-white/60">
            {property.kind} · {property.coord[1].toFixed(4)}°, {property.coord[0].toFixed(4)}°
          </div>
          {dupes.length > 1 && (
            <div className="mt-2">
              <div className="mb-1 text-[11px] text-white/60">Also owns property in:</div>
              <div className="flex flex-wrap gap-1">
                {dupes.filter((d) => d.id !== property.id).map((d) => (
                  <button
                    key={d.id}
                    className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/10"
                    onClick={() => actions?.easeToProperty(d.id)}
                  >
                    {DISTRICT_BY_ID[d.districtId].name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
              onClick={() => select(property.canonicalId)}
            >
              Open Details
            </button>
            <button
              className="rounded border border-white/15 px-3 py-1 text-xs hover:bg-white/10"
              onClick={() => actions?.backToDistrict()}
            >
              Back to Neighborhood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}