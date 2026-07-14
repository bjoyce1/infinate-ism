import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { NormalizedGraph } from "@/lib/graph/types";
import { filterGraph } from "@/lib/graph/filterGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import {
  buildGeoCityModel,
  type GeoCityModel,
  type PropertyInstance,
} from "@/lib/street/geoCityModel";
import {
  resolveRoutes,
  measurePolyline,
  pointAlong,
  type PolylineMetrics,
} from "@/lib/street/routeStreets";
import type { LngLat } from "@/lib/street/houstonGeoConfig";
import {
  DISTRICT_BY_ID,
  DOWNTOWN_BUILDINGS,
  DOWNTOWN_ID,
  GEO_DISTRICTS,
  HOUSTON_CENTER,
  type DistrictId,
} from "@/lib/street/houstonGeoConfig";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

// -------------------- Dark restyle helpers ---------------------------------

function applyDarkStyle(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;

  // Base land background.
  try { map.setPaintProperty("background", "background-color", "#07091a"); } catch {}

  for (const layer of style.layers) {
    const id = layer.id;
    const src = (layer as any)["source-layer"] as string | undefined;
    const type = layer.type;

    try {
      // Hide neighborhood / suburb / locality / POI / house-number labels so we
      // can overlay Infinite ISM project names cleanly. Keep road & highway
      // shields and major place labels so Houston stays recognisable.
      if (
        src === "poi" ||
        /poi/i.test(id) ||
        /neighbourhood|neighborhood|suburb|hamlet|quarter|locality|housenumber|building.*label/i.test(id)
      ) {
        map.setLayoutProperty(id, "visibility", "none");
        continue;
      }

      if (type === "fill") {
        if (src === "water" || /water/i.test(id)) {
          map.setPaintProperty(id, "fill-color", "#0a1a2c");
          continue;
        }
        if (src === "park" || /park|grass|forest|wood/i.test(id)) {
          map.setPaintProperty(id, "fill-color", "#0b1a12");
          continue;
        }
        if (/building/i.test(id)) {
          map.setPaintProperty(id, "fill-color", "#141a2b");
          map.setPaintProperty(id, "fill-outline-color", "#1e2740");
          continue;
        }
        if (/landuse|landcover/i.test(id) || src === "landuse") {
          map.setPaintProperty(id, "fill-color", "#0a0f1e");
          continue;
        }
      }

      if (type === "line") {
        if (src === "water" || /waterway/i.test(id)) {
          map.setPaintProperty(id, "line-color", "#2a5988");
          continue;
        }
        if (/motorway|highway|trunk/i.test(id)) {
          const isCasing = /casing|outline/i.test(id);
          map.setPaintProperty(id, "line-color", isCasing ? "#8a5a10" : "#ffcf6b");
          continue;
        }
        if (/primary/i.test(id)) {
          map.setPaintProperty(id, "line-color", "#b8c4de");
          continue;
        }
        if (/secondary|tertiary/i.test(id)) {
          map.setPaintProperty(id, "line-color", "#5c6a86");
          continue;
        }
        if (/road|street|path|link/i.test(id)) {
          map.setPaintProperty(id, "line-color", "#333a52");
          continue;
        }
        if (/boundary|admin/i.test(id)) {
          map.setPaintProperty(id, "line-color", "#334155");
        }
      }

      if (type === "symbol") {
        // Keep only highway shields + major place / road labels; darken text.
        const isRoad = /road|street|highway|motorway|shield|ref/i.test(id);
        const isPlace = /place|city|town|state|country/i.test(id);
        if (!isRoad && !isPlace) {
          map.setLayoutProperty(id, "visibility", "none");
          continue;
        }
        try {
          map.setPaintProperty(id, "text-color", "#e6ecf5");
          map.setPaintProperty(id, "text-halo-color", "#000000");
          map.setPaintProperty(id, "text-halo-width", 1.5);
        } catch {}
      }
    } catch {
      // Some layers won't accept some properties; skip.
    }
  }
}

function applyDayStyle(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;
  try { map.setPaintProperty("background", "background-color", "#f4f6fb"); } catch {}
  for (const layer of style.layers) {
    const id = layer.id;
    const src = (layer as any)["source-layer"] as string | undefined;
    const type = layer.type;
    try {
      if (src === "poi" || /poi/i.test(id) || /neighbourhood|neighborhood|suburb|hamlet|quarter|locality|housenumber/i.test(id)) {
        map.setLayoutProperty(id, "visibility", "none");
        continue;
      }
      if (type === "fill") {
        if (src === "water" || /water/i.test(id)) map.setPaintProperty(id, "fill-color", "#a8c8e6");
        else if (/park|grass|forest|wood/i.test(id)) map.setPaintProperty(id, "fill-color", "#cbe5c9");
        else if (/building/i.test(id)) map.setPaintProperty(id, "fill-color", "#dbe1ec");
        else if (/landuse|landcover/i.test(id) || src === "landuse") map.setPaintProperty(id, "fill-color", "#eef1f7");
      } else if (type === "line") {
        if (/motorway|highway|trunk/i.test(id)) map.setPaintProperty(id, "line-color", /casing|outline/i.test(id) ? "#c07018" : "#ffb347");
        else if (/primary/i.test(id)) map.setPaintProperty(id, "line-color", "#3a4b6c");
        else if (/secondary|tertiary/i.test(id)) map.setPaintProperty(id, "line-color", "#6b7791");
        else if (/road|street|path|link/i.test(id)) map.setPaintProperty(id, "line-color", "#c2c9d8");
        else if (src === "water" || /waterway/i.test(id)) map.setPaintProperty(id, "line-color", "#7fa9d0");
      } else if (type === "symbol") {
        const isRoad = /road|street|highway|motorway|shield|ref/i.test(id);
        const isPlace = /place|city|town|state|country/i.test(id);
        if (!isRoad && !isPlace) { map.setLayoutProperty(id, "visibility", "none"); continue; }
        try {
          map.setPaintProperty(id, "text-color", "#0f172a");
          map.setPaintProperty(id, "text-halo-color", "#ffffff");
          map.setPaintProperty(id, "text-halo-width", 1.5);
        } catch {}
      }
    } catch {}
  }
}

// -------------------- Component -------------------------------------------

export function StreetMapCanvas({ graph }: { graph: NormalizedGraph }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const styleReadyRef = useRef(false);
  const routesRef = useRef<Map<string, LngLat[]>>(new Map());
  const metricsRef = useRef<Map<string, PolylineMetrics>>(new Map());
  const rafRef = useRef<number | null>(null);
  const particleStartRef = useRef<number>(0);

  const [dayMode, setDayMode] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [breadcrumbDistrict, setBreadcrumbDistrict] = useState<DistrictId | null>(null);
  const [hoverProp, setHoverProp] = useState<PropertyInstance | null>(null);

  const selectedId = useGraphStore((s) => s.selectedId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const hideCode = useGraphStore((s) => s.hideCode);
  const includeTsFiles = useGraphStore((s) => s.includeTsFiles);
  const select = useGraphStore((s) => s.select);
  const setRightPanel = useGraphStore((s) => s.setRightPanel);
  const recenterToken = useGraphStore((s) => s.recenterToken);

  const filtered = useMemo(
    () => filterGraph(graph, { activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId }),
    [graph, activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId],
  );

  const city = useMemo<GeoCityModel>(() => {
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
  }, [filtered, graph]);

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: HOUSTON_CENTER,
      zoom: 10.2,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      pitchWithRotate: false,
      dragRotate: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();

    // Ensure map resizes once its container settles.
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);
    // Also nudge once after next frame — SSR hydration can yield 0-sized container.
    requestAnimationFrame(() => map.resize());
    setTimeout(() => map.resize(), 300);

    map.on("load", () => {
      styleReadyRef.current = true;
      applyDarkStyle(map);
      addOverlayLayers(map);
      // 2D lock — no pitch, no rotation.
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      styleReadyRef.current = false;
    };
  }, []);

  // Day/Night swap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    if (dayMode) applyDayStyle(map);
    else applyDarkStyle(map);
  }, [dayMode]);

  // Rebuild overlays whenever city model changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const setup = () => {
      updateDistrictLabels(map, city);
      updateRoads(map, city, selectedId, routesRef.current);
      updateMarkers(map, city, markersRef, setHoverProp, (inst) => {
        setPropertyId(inst.id);
        setBreadcrumbDistrict(inst.districtId);
        select(inst.canonicalId);
        map.easeTo({ center: inst.coord, zoom: 16.5, pitch: 0, duration: 900 });
      });
    };
    if (styleReadyRef.current) setup();
    else map.once("load", setup);
  }, [city, selectedId, select]);

  // Resolve real-street routes for connections, then re-render road lines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const signal = { aborted: false };
    const routableRoads = city.roads.filter(
      (r) => r.tier === "bridge" || r.tier === "sameOwner",
    );
    resolveRoutes(routableRoads, () => {
      // Live update as routes stream in.
      const combined = new Map(routesRef.current);
      // no-op — resolveRoutes populates its own map, we merge below.
    }, signal).then((resolved) => {
      if (signal.aborted) return;
      const merged = new Map(routesRef.current);
      const metrics = new Map(metricsRef.current);
      for (const [id, coords] of resolved) {
        merged.set(id, coords);
        metrics.set(id, measurePolyline(coords));
      }
      routesRef.current = merged;
      metricsRef.current = metrics;
      if (styleReadyRef.current) updateRoads(map, city, selectedId, merged);
    });
    return () => { signal.aborted = true; };
  }, [city, selectedId]);

  // Particle flow animation along resolved routes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    particleStartRef.current = performance.now();

    const tick = () => {
      if (cancelled) return;
      rafRef.current = requestAnimationFrame(tick);
      if (document.visibilityState === "hidden") return;
      const src = map.getSource("ism-particles") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const now = performance.now();
      const features: any[] = [];
      const routableRoads = city.roads.filter(
        (r) => r.tier === "bridge" || r.tier === "sameOwner",
      );
      for (const r of routableRoads) {
        const coords = routesRef.current.get(r.id) ?? [r.fromCoord, r.toCoord];
        let metrics = metricsRef.current.get(r.id);
        if (!metrics) {
          metrics = measurePolyline(coords);
          metricsRef.current.set(r.id, metrics);
        }
        const isOwnerSelected =
          r.tier === "sameOwner" && selectedId != null && r.id.startsWith(`own:${selectedId}:`);
        if (r.tier === "sameOwner" && !isOwnerSelected) continue;
        // Animation speed: complete a cycle every ~4s for short, ~10s for long routes.
        const cycleMs = Math.min(12000, Math.max(3500, metrics.total * 1.6));
        const particleCount = isOwnerSelected ? 4 : 2;
        const color = r.tier === "sameOwner" ? "#ffd66a" : "#a78bfa";
        for (let p = 0; p < particleCount; p++) {
          const phase = ((now - particleStartRef.current) / cycleMs + p / particleCount) % 1;
          const pt = pointAlong(coords, metrics, phase);
          // Fade in/out near endpoints.
          const fade =
            phase < 0.08 ? phase / 0.08 :
            phase > 0.92 ? (1 - phase) / 0.08 : 1;
          features.push({
            type: "Feature",
            properties: { color, opacity: fade, selected: isOwnerSelected },
            geometry: { type: "Point", coordinates: pt },
          });
        }
      }
      src.setData({ type: "FeatureCollection", features });
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [city, selectedId]);

  // Recentre when user asks.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: HOUSTON_CENTER, zoom: 10.2, pitch: 0, bearing: 0, duration: 900 });
    setPropertyId(null);
    setBreadcrumbDistrict(null);
  }, [recenterToken]);

  const focusDistrict = (id: DistrictId) => {
    const d = DISTRICT_BY_ID[id];
    setBreadcrumbDistrict(id);
    setPropertyId(null);
    mapRef.current?.easeTo({ center: d.center, zoom: 13.4, pitch: 0, duration: 900 });
  };

  const backToCity = () => {
    setBreadcrumbDistrict(null);
    setPropertyId(null);
    mapRef.current?.easeTo({ center: HOUSTON_CENTER, zoom: 10.2, pitch: 0, bearing: 0, duration: 900 });
  };

  const backToDistrict = () => {
    if (!breadcrumbDistrict) return backToCity();
    setPropertyId(null);
    focusDistrict(breadcrumbDistrict);
  };

  const property = propertyId ? city.propertiesById.get(propertyId) ?? null : null;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#04070f]">
      <div ref={containerRef} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />

      {/* Top-left HUD: breadcrumbs + controls */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-90px)] flex-wrap gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-xs text-white/80 backdrop-blur">
          <button className="rounded px-1 hover:text-white" onClick={backToCity}>Houston</button>
          {breadcrumbDistrict && (
            <>
              <span className="text-white/40">›</span>
              <button className="rounded px-1 hover:text-white" onClick={backToDistrict}>
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

        <div className="pointer-events-auto flex gap-1 rounded-md border border-white/10 bg-black/55 px-1 py-1 text-xs text-white/80 backdrop-blur">
          <button className="rounded px-2 py-0.5 hover:bg-white/10" onClick={backToCity}>Fit</button>
          <button className="rounded px-2 py-0.5 hover:bg-white/10" onClick={() => focusDistrict(DOWNTOWN_ID)}>Downtown</button>
          <button className="rounded px-2 py-0.5 hover:bg-white/10" onClick={() => setDayMode((d) => !d)}>
            {dayMode ? "Night" : "Day"}
          </button>
        </div>
      </div>

      {/* Right district jump list */}
      <div className="pointer-events-auto absolute right-3 top-16 z-10 flex flex-col gap-1 rounded-md border border-white/10 bg-black/55 p-1 text-[11px] text-white/80 backdrop-blur">
        {GEO_DISTRICTS.map((d) => (
          <button
            key={d.id}
            className="flex items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
            onClick={() => focusDistrict(d.id)}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            <span className="whitespace-nowrap">{d.name}</span>
          </button>
        ))}
      </div>

      {/* Property panel */}
      {property && (
        <div className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[320px] rounded-lg border border-white/10 bg-black/70 p-3 text-sm text-white/90 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/50">
                {DISTRICT_BY_ID[property.districtId].name}
              </div>
              <div className="text-base font-semibold" style={{ color: property.color }}>{property.label}</div>
            </div>
            <button className="rounded px-2 py-0.5 text-xs text-white/60 hover:bg-white/10" onClick={() => setPropertyId(null)}>✕</button>
          </div>
          <div className="mt-1 text-xs text-white/60">
            {property.kind} · {property.coord[1].toFixed(4)}°, {property.coord[0].toFixed(4)}°
          </div>
          {(() => {
            const dupes = city.propertiesByCanonical.get(property.canonicalId) ?? [];
            if (dupes.length < 2) return null;
            return (
              <div className="mt-2 text-xs">
                <div className="mb-1 text-white/60">Also owns property in:</div>
                <div className="flex flex-wrap gap-1">
                  {dupes.filter((d) => d.id !== property.id).map((d) => (
                    <button
                      key={d.id}
                      className="rounded border border-white/10 px-2 py-0.5 hover:bg-white/10"
                      onClick={() => {
                        setPropertyId(d.id);
                        setBreadcrumbDistrict(d.districtId);
                        mapRef.current?.easeTo({ center: d.coord, zoom: 16, pitch: 0, duration: 900 });
                      }}
                    >
                      {DISTRICT_BY_ID[d.districtId].name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="mt-3 flex gap-2">
            <button
              className="rounded bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
              onClick={() => { select(property.canonicalId); setRightPanel(true); }}
            >
              Open Details
            </button>
            <button className="rounded border border-white/15 px-3 py-1 text-xs hover:bg-white/10" onClick={backToDistrict}>
              Back to Neighborhood
            </button>
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {hoverProp && !property && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded border border-white/10 bg-black/70 px-2 py-1 text-xs text-white/80 backdrop-blur">
          {hoverProp.label}
          <span className="ml-2 text-white/40">
            · {DISTRICT_BY_ID[hoverProp.districtId].name}
          </span>
        </div>
      )}
    </div>
  );
}

// -------------------- Overlay layer helpers --------------------------------

function addOverlayLayers(map: maplibregl.Map) {
  // District polygons.
  const featureCollection = {
    type: "FeatureCollection" as const,
    features: GEO_DISTRICTS.map((d) => ({
      type: "Feature" as const,
      properties: { id: d.id, name: d.name, color: d.color },
      geometry: { type: "Polygon" as const, coordinates: [d.polygon] },
    })),
  };
  // Separate Point source for labels — one point per district at its centroid.
  // Rendering labels on the polygon layer can emit duplicates when MapLibre's
  // symbol placer finds multiple candidate anchors inside an irregular ring
  // (e.g. the street-bounded Mr. CAP block).
  const labelCollection = {
    type: "FeatureCollection" as const,
    features: GEO_DISTRICTS.map((d) => ({
      type: "Feature" as const,
      properties: { id: d.id, name: d.name },
      geometry: { type: "Point" as const, coordinates: d.center },
    })),
  };
  if (!map.getSource("ism-districts")) {
    map.addSource("ism-districts", { type: "geojson", data: featureCollection });
    map.addSource("ism-districts-label", { type: "geojson", data: labelCollection });
    map.addLayer({
      id: "ism-districts-fill",
      type: "fill",
      source: "ism-districts",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.10,
      },
    });
    map.addLayer({
      id: "ism-districts-line",
      type: "line",
      source: "ism-districts",
      paint: {
        "line-color": ["get", "color"],
        "line-opacity": 0.55,
        "line-width": 1.4,
        "line-dasharray": [3, 2],
      },
    });
    map.addLayer({
      id: "ism-districts-label",
      type: "symbol",
      source: "ism-districts-label",
      layout: {
        "text-field": ["get", "name"],
        "text-size": 12,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-anchor": "center",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "symbol-placement": "point",
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#000000",
        "text-halo-width": 1.6,
        "text-opacity": 0.92,
      },
    });
  }

  // Roads source (empty initially).
  if (!map.getSource("ism-roads")) {
    map.addSource("ism-roads", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({
      id: "ism-roads-bridge",
      type: "line",
      source: "ism-roads",
      filter: ["==", ["get", "tier"], "bridge"],
      paint: { "line-color": "#a78bfa", "line-opacity": 0.35, "line-width": 1, "line-dasharray": [2, 2] },
    });
    map.addLayer({
      id: "ism-roads-owner",
      type: "line",
      source: "ism-roads",
      filter: ["==", ["get", "tier"], "sameOwner"],
      paint: {
        "line-color": "#ffd66a",
        "line-opacity": ["case", ["get", "selected"], 0.95, 0.0],
        "line-width": 2.2,
      },
    });
  }

  // Particle flow layer — animated dots streaming along routes.
  if (!map.getSource("ism-particles")) {
    map.addSource("ism-particles", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "ism-particles-glow",
      type: "circle",
      source: "ism-particles",
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["case", ["get", "selected"], 9, 7],
        "circle-blur": 1.1,
        "circle-opacity": ["*", 0.55, ["get", "opacity"]],
      },
    });
    map.addLayer({
      id: "ism-particles-core",
      type: "circle",
      source: "ism-particles",
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["case", ["get", "selected"], 3.2, 2.4],
        "circle-blur": 0.2,
        "circle-opacity": ["get", "opacity"],
      },
    });
  }
}

function updateDistrictLabels(_map: maplibregl.Map, _city: GeoCityModel) {
  // District layer is static (from config); nothing to update per graph change.
}

function updateRoads(
  map: maplibregl.Map,
  city: GeoCityModel,
  selectedId: string | null,
  routes: Map<string, LngLat[]>,
) {
  const src = map.getSource("ism-roads") as maplibregl.GeoJSONSource | undefined;
  if (!src) return;
  const features = city.roads
    .filter((r) => r.tier === "bridge" || r.tier === "sameOwner")
    .map((r) => {
      const isOwnerSelected =
        r.tier === "sameOwner" && selectedId != null && r.id.startsWith(`own:${selectedId}:`);
      const coords = routes.get(r.id) ?? [r.fromCoord, r.toCoord];
      return {
        type: "Feature" as const,
        properties: { tier: r.tier, selected: isOwnerSelected },
        geometry: { type: "LineString" as const, coordinates: coords },
      };
    });
  src.setData({ type: "FeatureCollection", features });
}

const KIND_ICON: Record<string, string> = {
  landmark: "★",
  skyscraper: "▲",
  studio: "♪",
  record_store: "◈",
  venue: "◉",
  office: "▮",
  cinema: "◆",
  library: "▤",
  school: "▣",
  finance: "$",
  commercial: "▩",
  house: "▢",
};

function markerElement(inst: PropertyInstance): HTMLElement {
  const el = document.createElement("div");
  const isLandmark = inst.isLandmark || inst.kind === "landmark" || inst.kind === "skyscraper";
  const size = isLandmark ? 28 : 16;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.borderRadius = isLandmark ? "6px" : "4px";
  el.style.background = `linear-gradient(180deg, ${inst.color}dd, ${inst.color}66)`;
  el.style.border = `1.5px solid ${inst.color}`;
  el.style.boxShadow = `0 0 10px ${inst.color}55, inset 0 -4px 0 rgba(0,0,0,0.35)`;
  el.style.color = "#0b0f1a";
  el.style.fontSize = `${Math.round(size * 0.62)}px`;
  el.style.fontWeight = "700";
  el.style.cursor = "pointer";
  el.style.transform = "translateY(-2px)";
  el.textContent = KIND_ICON[inst.kind] ?? "▢";
  el.dataset.landmark = isLandmark ? "1" : "0";
  return el;
}

function updateMarkers(
  map: maplibregl.Map,
  city: GeoCityModel,
  markersRef: React.MutableRefObject<maplibregl.Marker[]>,
  onHover: (p: PropertyInstance | null) => void,
  onClick: (p: PropertyInstance) => void,
) {
  // Clear existing.
  markersRef.current.forEach((m) => m.remove());
  markersRef.current = [];

  // Cap markers to avoid overwhelming DOM (city + downtown landmarks always in).
  const priority = [...city.properties].sort((a, b) => {
    const rank = (p: PropertyInstance) =>
      (p.isLandmark ? 100 : 0) +
      (p.kind === "skyscraper" ? 40 : 0) +
      (p.node.degree ?? 0);
    return rank(b) - rank(a);
  });
  const capped = priority.slice(0, 500);
  // Always include the fixed downtown skyline.
  const forced = new Set(DOWNTOWN_BUILDINGS.map((b) => `dt:${b.id}`));
  for (const p of city.properties) {
    if (forced.has(p.id) && !capped.includes(p)) capped.push(p);
  }

  for (const p of capped) {
    const el = markerElement(p);
    el.addEventListener("mouseenter", () => onHover(p));
    el.addEventListener("mouseleave", () => onHover(null));
    el.addEventListener("click", (e) => { e.stopPropagation(); onClick(p); });
    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat(p.coord)
      .addTo(map);
    markersRef.current.push(marker);
  }
}