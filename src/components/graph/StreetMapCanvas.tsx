import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { filterGraph } from "@/lib/graph/filterGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { buildCityModel, type CityModel, type PropertyInstance, type CityRoad } from "@/lib/street/cityLayout";
import {
  DISTRICTS,
  DISTRICT_BY_ID,
  HIGHWAYS,
  DOWNTOWN_ID,
  CITY_BOUNDS,
  type DistrictId,
} from "@/lib/street/houstonCityConfig";
import {
  type Camera,
  clampTilt,
  clampYaw,
  easeCam,
  screenToWorld,
  worldToScreen,
} from "@/lib/street/cityProjection";

// Shared cache of loaded <img> elements keyed by src URL. Kept module-scoped
// so switching view modes doesn't re-download every asset.
const imageCache = new Map<string, HTMLImageElement | "loading" | "error">();
function getImage(src: string, onReady: () => void): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached === "loading" || cached === "error") return null;
  if (cached) return cached;
  imageCache.set(src, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    imageCache.set(src, img);
    onReady();
  };
  img.onerror = () => imageCache.set(src, "error");
  img.src = src;
  return null;
}

type Palette = {
  bgOuter: string;
  bgInner: string;
  grid: string;
  district: string;
  districtBorder: string;
  highway: string;
  highwayGlow: string;
  loop: string;
  road: string;
  roadResidential: string;
  bridge: string;
  sameOwner: string;
  landmark: string;
  building: string;
  house: string;
  text: string;
  textMuted: string;
  window: string;
  ambient: number; // 0..1 window-glow intensity
};

const NIGHT_PALETTE: Palette = {
  bgOuter: "#04070f",
  bgInner: "#0c1424",
  grid: "rgba(140,180,220,0.05)",
  district: "rgba(255,255,255,0.02)",
  districtBorder: "rgba(255,255,255,0.12)",
  highway: "#ffe082",
  highwayGlow: "rgba(255,224,130,0.35)",
  loop: "#7dd3fc",
  road: "rgba(180,210,240,0.55)",
  roadResidential: "rgba(150,180,220,0.35)",
  bridge: "rgba(167,139,250,0.55)",
  sameOwner: "#ffd66a",
  landmark: "#8ce9ff",
  building: "#1e2740",
  house: "#2b3550",
  text: "#e6ecf5",
  textMuted: "rgba(220,225,235,0.55)",
  window: "rgba(255,214,106,0.85)",
  ambient: 1,
};

const DAY_PALETTE: Palette = {
  bgOuter: "#dfe8f2",
  bgInner: "#f2f5fa",
  grid: "rgba(20,40,80,0.05)",
  district: "rgba(20,40,80,0.03)",
  districtBorder: "rgba(20,40,80,0.15)",
  highway: "#e08a1a",
  highwayGlow: "rgba(224,138,26,0.25)",
  loop: "#2563eb",
  road: "rgba(30,50,80,0.45)",
  roadResidential: "rgba(30,50,80,0.28)",
  bridge: "rgba(124,58,237,0.55)",
  sameOwner: "#c47a00",
  landmark: "#0369a1",
  building: "#c8d4e6",
  house: "#dbe4f0",
  text: "#0f172a",
  textMuted: "rgba(15,23,42,0.6)",
  window: "rgba(30,64,175,0.4)",
  ambient: 0.2,
};

function samplePolyline(points: { x: number; y: number }[], t: number) {
  if (points.length < 2) return points[0];
  let length = 0;
  const segs: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const s = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segs.push(s);
    length += s;
  }
  const target = t * length;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    if (acc + segs[i - 1] >= target) {
      const k = (target - acc) / (segs[i - 1] || 1);
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * k,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * k,
      };
    }
    acc += segs[i - 1];
  }
  return points[points.length - 1];
}

export function StreetMapCanvas({ graph }: { graph: NormalizedGraph }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [dayMode, setDayMode] = useState(false);
  const [propertyId, setPropertyId] = useState<string | null>(null); // instance id
  const [breadcrumbDistrict, setBreadcrumbDistrict] = useState<DistrictId | null>(null);
  const [hoveredRoadId, setHoveredRoadId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const selectedId = useGraphStore((s) => s.selectedId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const hideCode = useGraphStore((s) => s.hideCode);
  const includeTsFiles = useGraphStore((s) => s.includeTsFiles);
  const select = useGraphStore((s) => s.select);
  const hover = useGraphStore((s) => s.hover);
  const showLabels = useGraphStore((s) => s.showLabels);
  const labelSize = useGraphStore((s) => s.labelSize);
  const recenterToken = useGraphStore((s) => s.recenterToken);
  const cameraResetToken = useGraphStore((s) => s.cameraResetToken);

  // Filtered graph → city model.
  const filtered = useMemo(
    () => filterGraph(graph, { activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId }),
    [graph, activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId],
  );

  const city = useMemo<CityModel>(() => {
    const nodes = filtered.nodes.map((n) => ({ ...n }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const neighbors = new Map<string, Set<string>>();
    for (const n of nodes) neighbors.set(n.id, new Set());
    for (const l of filtered.links) {
      neighbors.get(l.source)?.add(l.target);
      neighbors.get(l.target)?.add(l.source);
    }
    const sub: NormalizedGraph = {
      nodes,
      links: filtered.links.map((l) => ({ ...l })),
      neighbors,
      byId,
      communities: graph.communities,
      categoryCounts: graph.categoryCounts,
    };
    return buildCityModel(sub);
  }, [filtered, graph]);

  // Camera state (current + target for smooth easing).
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 0.03, yaw: 0, tilt: 0.28 });
  const targetRef = useRef<Camera>({ ...camRef.current });
  const draggingRef = useRef<{ x: number; y: number; button: number } | null>(null);
  const hoverPropRef = useRef<string | null>(null);

  const fitCity = () => {
    const b = CITY_BOUNDS;
    const zoom = Math.min((size.w - 80) / (b.maxX - b.minX), (size.h - 80) / (b.maxY - b.minY));
    targetRef.current = { x: 0, y: 0, zoom, yaw: 0, tilt: 0.28 };
  };

  const focusDistrict = (id: DistrictId) => {
    const d = DISTRICT_BY_ID[id];
    const zoom = Math.min(size.w, size.h) / (d.radius * 3.4);
    targetRef.current = { x: d.center.x, y: d.center.y, zoom, yaw: 0, tilt: 0.32 };
    setBreadcrumbDistrict(id);
  };

  const focusProperty = (inst: PropertyInstance) => {
    targetRef.current = {
      x: inst.x,
      y: inst.y,
      zoom: Math.min(size.w, size.h) / 400,
      yaw: targetRef.current.yaw,
      tilt: 0.42,
    };
    setPropertyId(inst.id);
    setBreadcrumbDistrict(inst.districtId);
  };

  useEffect(() => {
    fitCity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, cameraResetToken]);

  useEffect(() => {
    focusDistrict(DOWNTOWN_ID);
    setBreadcrumbDistrict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  // Resize observer.
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const palette = dayMode ? DAY_PALETTE : NIGHT_PALETTE;

    let raf = 0;
    let last = performance.now();

    const w2s = (x: number, y: number) => worldToScreen(x, y, camRef.current, size.w, size.h);

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      easeCam(camRef.current, targetRef.current, dt, 5.5);
      const cam = camRef.current;

      // --- Background gradient ---
      const bg = ctx.createRadialGradient(size.w / 2, size.h / 2, 0, size.w / 2, size.h / 2, Math.max(size.w, size.h) * 0.7);
      bg.addColorStop(0, palette.bgInner);
      bg.addColorStop(1, palette.bgOuter);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size.w, size.h);

      // --- Highlights: property instances of currently selected canonical id ---
      const ownerInsts = selectedId ? city.propertiesByCanonical.get(selectedId) ?? [] : [];
      const ownerSet = new Set(ownerInsts.map((p) => p.id));

      // --- District halos (soft polygons, not perfect circles) ---
      for (const d of city.districts) {
        const c0 = w2s(d.center.x, d.center.y);
        const r = d.radius * cam.zoom;
        const g = ctx.createRadialGradient(c0.x, c0.y, r * 0.1, c0.x, c0.y, r * 1.4);
        g.addColorStop(0, `${d.color}33`);
        g.addColorStop(0.6, `${d.color}18`);
        g.addColorStop(1, `${d.color}00`);
        ctx.fillStyle = g;
        ctx.beginPath();
        // Irregular parcel-ish blob using 8 anchor angles with per-district noise.
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          const noise = 1 + 0.15 * Math.sin(a * 3 + d.center.x);
          const rr = r * noise;
          const px = c0.x + Math.cos(a) * rr;
          const py = c0.y + Math.sin(a) * rr * Math.cos(cam.tilt);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = palette.districtBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // --- Highway skeleton ---
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const hw of HIGHWAYS) {
        const pts = hw.points.map((p) => w2s(p.x, p.y));
        const isLoop = hw.tier === "loop";
        const width = Math.max(isLoop ? 2 : 3, (isLoop ? 8 : 14) * cam.zoom);
        // Outer glow.
        ctx.strokeStyle = palette.highwayGlow;
        ctx.lineWidth = width + 8;
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        // Core.
        ctx.strokeStyle = isLoop ? palette.loop : palette.highway;
        ctx.lineWidth = width;
        ctx.beginPath();
        pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        // Center dash for interstates.
        if (!isLoop) {
          ctx.setLineDash([Math.max(4, 8 * cam.zoom), Math.max(6, 12 * cam.zoom)]);
          ctx.strokeStyle = dayMode ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.65)";
          ctx.lineWidth = Math.max(0.6, width * 0.18);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // --- Roads (LOD: hide residential at wide zoom) ---
      const showResidential = cam.zoom > 0.08;
      const showBridges = true;
      for (const r of city.roads) {
        if (r.tier === "residential" && !showResidential) continue;
        if (r.tier === "main" && !showResidential) continue;
        if (r.tier === "bridge" && !showBridges) continue;
        const a = w2s(r.fromPoint.x, r.fromPoint.y);
        const b = w2s(r.toPoint.x, r.toPoint.y);
        const isOwner = r.relation === "same-owner" && (selectedId && (city.propertiesById.get(r.from)?.canonicalId === selectedId || city.propertiesById.get(r.to)?.canonicalId === selectedId));
        const isHover = hoveredRoadId === r.id;
        let color: string;
        let width: number;
        if (isOwner) {
          color = palette.sameOwner;
          width = 3;
        } else if (r.tier === "highway") {
          color = palette.highway;
          width = Math.max(2, 4 * cam.zoom);
        } else if (r.tier === "bridge") {
          color = palette.bridge;
          width = Math.max(1, 2 * cam.zoom);
        } else if (r.tier === "main") {
          color = palette.road;
          width = Math.max(0.8, 1.6 * cam.zoom);
        } else {
          color = palette.roadResidential;
          width = Math.max(0.5, 1.2 * cam.zoom);
        }
        if (isHover) width += 1.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // Owner routes: animated dash overlay.
        if (isOwner) {
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -(now / 40) % 14;
          ctx.strokeStyle = "#fff2b3";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
      }

      // --- Properties (buildings) with tilt-based footprint ---
      const tiltShift = Math.sin(cam.tilt) * 0.6;
      // Sort back-to-front so tilt looks right (higher y renders later).
      const sortedProps = [...city.properties].sort((a, b) => a.y - b.y);
      for (const p of sortedProps) {
        const s = w2s(p.x, p.y);
        const parcelPx = p.parcelW * cam.zoom;
        // Parcel footprint (subtle).
        ctx.fillStyle = dayMode ? "rgba(30,50,80,0.06)" : "rgba(255,255,255,0.04)";
        ctx.beginPath();
        ctx.ellipse(s.x, s.y + parcelPx * 0.35, parcelPx * 0.55, parcelPx * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();

        const isSel = selectedId === p.canonicalId;
        const isOwner = ownerSet.has(p.id);
        const isProp = propertyId === p.id;
        const scale = isSel || isProp ? 1.15 : 1;

        // Building silhouette — pseudo-3D block.
        const w = parcelPx * 0.55 * scale;
        const h = parcelPx * 0.55 * scale;
        const zH = (p.kind === "landmark" ? 90 : p.kind === "skyscraper" ? 70 : p.kind === "studio" ? 26 : 18) * cam.zoom * (1 + tiltShift);

        // Side face (right).
        ctx.fillStyle = shade(p.color || palette.building, dayMode ? -25 : -30);
        ctx.beginPath();
        ctx.moveTo(s.x + w / 2, s.y - h / 2);
        ctx.lineTo(s.x + w / 2 + zH * 0.35, s.y - h / 2 - zH);
        ctx.lineTo(s.x + w / 2 + zH * 0.35, s.y + h / 2 - zH);
        ctx.lineTo(s.x + w / 2, s.y + h / 2);
        ctx.closePath();
        ctx.fill();

        // Front/top face.
        ctx.fillStyle = p.color || palette.building;
        ctx.beginPath();
        ctx.moveTo(s.x - w / 2, s.y - h / 2);
        ctx.lineTo(s.x - w / 2 + zH * 0.35, s.y - h / 2 - zH);
        ctx.lineTo(s.x + w / 2 + zH * 0.35, s.y - h / 2 - zH);
        ctx.lineTo(s.x + w / 2, s.y - h / 2);
        ctx.closePath();
        ctx.fill();

        // Face outline + window rows for taller buildings.
        ctx.strokeStyle = dayMode ? "rgba(15,23,42,0.35)" : "rgba(0,0,0,0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x - w / 2, s.y - h / 2, w, h);

        if (zH > 8) {
          const rows = Math.max(2, Math.floor(zH / 8));
          const cols = Math.max(1, Math.floor(w / 6));
          ctx.fillStyle = palette.window;
          ctx.globalAlpha = palette.ambient * 0.9;
          for (let ry = 0; ry < rows; ry++) {
            for (let cx = 0; cx < cols; cx++) {
              // Deterministic on/off based on hash.
              const on = ((ry * 7 + cx * 11 + p.canonicalId.length) % 3) !== 0;
              if (!on) continue;
              const wx = s.x - w / 2 + 2 + cx * 6;
              const wy = s.y - h / 2 - (ry + 1) * (zH / rows) + 2;
              ctx.fillRect(wx, wy, 2, Math.max(1, zH / rows - 3));
            }
          }
          ctx.globalAlpha = 1;
        }

        // Selected / owner rings.
        if (isSel || isOwner || isProp) {
          ctx.strokeStyle = isProp ? "#ffde7a" : palette.sameOwner;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y + parcelPx * 0.35, parcelPx * 0.65 + Math.sin(now / 280) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Optional avatar puck for hubs/landmarks.
        const imgSrc = p.node.image || p.node.artwork;
        if (p.isLandmark && imgSrc) {
          const img = getImage(imgSrc, () => {});
          if (img) {
            const rr = w * 0.6;
            ctx.save();
            ctx.beginPath();
            ctx.arc(s.x, s.y - h / 2 - zH - rr - 4, rr, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            const iw = img.naturalWidth || img.width;
            const ih = img.naturalHeight || img.height;
            const scaleImg = Math.max((2 * rr) / iw, (2 * rr) / ih);
            ctx.drawImage(img, s.x - (iw * scaleImg) / 2, s.y - h / 2 - zH - rr - 4 - (ih * scaleImg) / 2, iw * scaleImg, ih * scaleImg);
            ctx.restore();
            ctx.strokeStyle = p.color || palette.landmark;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(s.x, s.y - h / 2 - zH - rr - 4, rr, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // --- District & building labels ---
      if (showLabels) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const d of city.districts) {
          const c0 = w2s(d.center.x, d.center.y - d.radius * 0.85);
          const fs = Math.max(11, Math.min(22, 14 * labelSize + cam.zoom * 40));
          ctx.font = `800 ${fs}px 'Space Grotesk','Sora',sans-serif`;
          const w = ctx.measureText(d.name.toUpperCase()).width + 20;
          ctx.fillStyle = dayMode ? "rgba(255,255,255,0.85)" : "rgba(10,15,25,0.75)";
          ctx.strokeStyle = d.color;
          ctx.lineWidth = 1;
          const rectX = c0.x - w / 2;
          const rectY = c0.y - fs / 2 - 4;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(rectX, rectY, w, fs + 8, 6);
          else ctx.rect(rectX, rectY, w, fs + 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = d.color;
          ctx.fillText(d.name.toUpperCase(), c0.x, c0.y);
        }
        if (cam.zoom > 0.15) {
          ctx.font = `600 ${10 * labelSize}px 'Space Grotesk','Sora',sans-serif`;
          ctx.fillStyle = palette.textMuted;
          for (const p of city.properties) {
            if (!p.isLandmark && p.kind !== "skyscraper" && cam.zoom < 0.35) continue;
            const s = w2s(p.x, p.y);
            ctx.fillText(p.label, s.x, s.y + p.parcelH * cam.zoom * 0.55);
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [city, size.w, size.h, selectedId, propertyId, hoveredRoadId, dayMode, showLabels, labelSize]);

  // Interactions ------------------------------------------------------------
  const s2w = (sx: number, sy: number) => screenToWorld(sx, sy, camRef.current, size.w, size.h);

  const hitTestProperty = (sx: number, sy: number): PropertyInstance | null => {
    const w = s2w(sx, sy);
    let best: PropertyInstance | null = null;
    let bestDist = Infinity;
    for (const p of city.properties) {
      const r = (p.parcelW * 0.5) / 1; // world units
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d <= r && d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  };

  const hitTestRoad = (sx: number, sy: number): CityRoad | null => {
    const w = s2w(sx, sy);
    const tol = 10 / camRef.current.zoom;
    let best: CityRoad | null = null;
    let bestDist = Infinity;
    for (const r of city.roads) {
      const ax = r.fromPoint.x, ay = r.fromPoint.y;
      const bx = r.toPoint.x, by = r.toPoint.y;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((w.x - ax) * dx + (w.y - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, py = ay + dy * t;
      const d = Math.hypot(w.x - px, w.y - py);
      if (d <= tol && d < bestDist) {
        best = r;
        bestDist = d;
      }
    }
    return best;
  };

  const activeProperty = propertyId ? city.propertiesById.get(propertyId) ?? null : null;
  const hoveredRoad = hoveredRoadId ? city.roads.find((r) => r.id === hoveredRoadId) ?? null : null;
  const roadEndpointLabel = (id: string) => {
    if (id === "downtown") return "Downtown";
    const p = city.propertiesById.get(id);
    if (p) return p.label;
    const d = DISTRICTS.find((x) => x.id === (id as DistrictId));
    return d?.name ?? id;
  };
  const roadTierLabel = (t: CityRoad["tier"]) =>
    t === "highway" ? "Highway" :
    t === "interstate" ? "Interstate" :
    t === "main" ? "Main road" :
    t === "residential" ? "Residential street" :
    "Bridge";

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        draggingRef.current = { x: e.clientX, y: e.clientY, button: e.button };
      }}
      onPointerUp={(e) => {
        const drag = draggingRef.current;
        draggingRef.current = null;
        if (!drag) return;
        const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
        if (moved >= 4) return;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const hit = hitTestProperty(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) {
          focusProperty(hit);
        } else {
          setPropertyId(null);
          select(null);
        }
      }}
      onPointerMove={(e) => {
        const drag = draggingRef.current;
        const c = camRef.current;
        const t = targetRef.current;
        if (drag) {
          // Right button / shift = yaw+tilt drag.
          if (drag.button === 2 || e.shiftKey) {
            const dxr = (e.clientX - drag.x) * 0.005;
            const dyr = (e.clientY - drag.y) * 0.004;
            t.yaw = clampYaw(t.yaw + dxr);
            t.tilt = clampTilt(t.tilt + dyr);
            c.yaw = t.yaw;
            c.tilt = t.tilt;
          } else {
            const cos = Math.cos(-c.yaw), sin = Math.sin(-c.yaw);
            const dxs = (e.clientX - drag.x) / c.zoom;
            const dys = (e.clientY - drag.y) / (c.zoom * Math.max(0.01, Math.cos(c.tilt)));
            const dx = dxs * cos - dys * sin;
            const dy = dxs * sin + dys * cos;
            t.x -= dx; t.y -= dy;
            c.x -= dx; c.y -= dy;
          }
          draggingRef.current = { x: e.clientX, y: e.clientY, button: drag.button };
        } else {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
          const hit = hitTestProperty(sx, sy);
          hoverPropRef.current = hit?.id ?? null;
          hover(hit?.canonicalId ?? null);
          if (!hit) {
            const rd = hitTestRoad(sx, sy);
            setHoveredRoadId(rd?.id ?? null);
            setHoverPos(rd ? { x: sx, y: sy } : null);
          } else {
            setHoveredRoadId(null);
            setHoverPos(null);
          }
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      onWheel={(e) => {
        e.preventDefault();
        const c = camRef.current;
        const t = targetRef.current;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const before = s2w(px, py);
        const factor = Math.exp(-e.deltaY * 0.0015);
        t.zoom = Math.max(0.01, Math.min(4, t.zoom * factor));
        c.zoom = Math.max(0.01, Math.min(4, c.zoom * factor));
        const after = s2w(px, py);
        t.x += before.x - after.x;
        t.y += before.y - after.y;
        c.x += before.x - after.x;
        c.y += before.y - after.y;
      }}
    >
      <canvas ref={canvasRef} />

      {/* Top HUD: breadcrumbs + title */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1.5">
        <div className="bg-obsidian-surface/70 backdrop-blur border border-neon-primary/30 rounded-full px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-neon-primary">
          CAPISM · Street View · Houston Grid
        </div>
        <div className="bg-obsidian-surface/60 backdrop-blur border border-white/10 rounded-full px-3 py-1 text-[11px] font-mono text-white/80 flex items-center gap-1.5 pointer-events-auto">
          <button className="hover:text-white transition" onClick={() => { fitCity(); setBreadcrumbDistrict(null); setPropertyId(null); }}>City</button>
          {breadcrumbDistrict && (
            <>
              <span className="text-white/30">›</span>
              <button className="hover:text-white transition" onClick={() => { focusDistrict(breadcrumbDistrict); setPropertyId(null); }}>
                {DISTRICT_BY_ID[breadcrumbDistrict].name}
              </button>
            </>
          )}
          {activeProperty && (
            <>
              <span className="text-white/30">›</span>
              <span className="text-neon-primary truncate max-w-[220px]">{activeProperty.label}</span>
            </>
          )}
        </div>
      </div>

      {/* Left rail: navigation controls */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-auto">
        <button
          className="bg-obsidian-surface/80 backdrop-blur border border-neon-primary/40 rounded-md px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-neon-primary hover:bg-neon-primary/10 transition"
          onClick={() => { focusDistrict(DOWNTOWN_ID); setPropertyId(null); }}
        >
          ⌂ Downtown
        </button>
        <button
          className="bg-obsidian-surface/80 backdrop-blur border border-white/15 rounded-md px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-white/80 hover:bg-white/5 transition"
          onClick={() => { fitCity(); setBreadcrumbDistrict(null); setPropertyId(null); }}
        >
          ⤢ Fit City
        </button>
        <button
          className="bg-obsidian-surface/80 backdrop-blur border border-white/15 rounded-md px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-white/80 hover:bg-white/5 transition"
          onClick={() => setDayMode((d) => !d)}
        >
          {dayMode ? "☾ Night" : "☀ Day"}
        </button>
      </div>

      {/* Right rail: district jump list */}
      <div className="absolute top-4 right-4 flex flex-col gap-1 pointer-events-auto bg-obsidian-surface/60 backdrop-blur border border-white/10 rounded-md p-2 max-w-[220px]">
        <div className="text-[9px] font-mono uppercase tracking-widest text-white/40 px-1 mb-1">Districts</div>
        {DISTRICTS.map((d) => (
          <button
            key={d.id}
            className="flex items-center gap-2 px-2 py-1 text-[11px] rounded hover:bg-white/5 transition text-left"
            onClick={() => { focusDistrict(d.id); setPropertyId(null); }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
            <span className="text-white/90 truncate">{d.name}</span>
          </button>
        ))}
      </div>

      {/* Road hover tooltip */}
      {hoveredRoad && hoverPos && (
        <div
          className="absolute pointer-events-none bg-obsidian-surface/95 backdrop-blur border border-white/15 rounded-md px-2.5 py-1.5 text-[11px] shadow-xl"
          style={{ left: hoverPos.x + 14, top: hoverPos.y + 14 }}
        >
          <div className="text-[9px] font-mono uppercase tracking-widest text-neon-primary">
            {roadTierLabel(hoveredRoad.tier)}
            {hoveredRoad.relation ? ` · ${hoveredRoad.relation}` : ""}
          </div>
          <div className="text-white/90">
            {roadEndpointLabel(hoveredRoad.from)} <span className="text-white/40">→</span> {roadEndpointLabel(hoveredRoad.to)}
          </div>
        </div>
      )}

      {/* Property-level panel */}
      {activeProperty && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:max-w-md bg-obsidian-surface/95 backdrop-blur border border-neon-primary/40 rounded-xl p-4 shadow-2xl pointer-events-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] font-mono uppercase tracking-widest text-neon-primary/80 mb-1">
                {DISTRICT_BY_ID[activeProperty.districtId].name} · {activeProperty.kind.replace("_", " ")}
              </div>
              <div className="text-base font-semibold text-white truncate">{activeProperty.label}</div>
              <div className="mt-0.5 text-[11px] font-mono text-white/50">
                #{Math.abs(activeProperty.x | 0)} · {Math.abs(activeProperty.y | 0)} {activeProperty.y < 0 ? "N" : "S"} {activeProperty.x < 0 ? "W" : "E"}
              </div>
              {city.propertiesByCanonical.get(activeProperty.canonicalId)!.length > 1 && (
                <div className="mt-1 text-[10px] font-mono text-[#ffd66a]">
                  ★ Owner has {city.propertiesByCanonical.get(activeProperty.canonicalId)!.length} properties in the city
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPropertyId(null)}
              className="text-white/50 hover:text-white text-lg leading-none px-1"
              aria-label="Close property view"
            >
              ×
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest bg-neon-primary/20 border border-neon-primary/50 text-neon-primary rounded-md hover:bg-neon-primary/30 transition"
              onClick={() => {
                select(activeProperty.canonicalId);
              }}
            >
              Open Details →
            </button>
            <button
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest border border-white/15 text-white/80 rounded-md hover:bg-white/5 transition"
              onClick={() => { focusDistrict(activeProperty.districtId); setPropertyId(null); }}
            >
              ← Neighborhood
            </button>
            <button
              className="px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest border border-white/15 text-white/80 rounded-md hover:bg-white/5 transition"
              onClick={() => { fitCity(); setBreadcrumbDistrict(null); setPropertyId(null); }}
            >
              ← City
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- utilities ---
function shade(hex: string, delta: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 0xff) + delta);
  const g = clamp(((n >> 8) & 0xff) + delta);
  const b = clamp((n & 0xff) + delta);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}