import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedGraph, GraphNode } from "@/lib/graph/types";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { filterGraph } from "@/lib/graph/filterGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { buildStreetLayout, type StreetLayout, type StreetRoad } from "@/lib/graph/streetLayout";

const HUB_ID = "site_mrcap1_com";

function hubColorFor(n: GraphNode): string {
  return n.color || CATEGORY_COLORS[n.category] || "#3DED97";
}

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

// Sample a point along a polyline at parametric t in [0,1].
function samplePolyline(points: { x: number; y: number }[], length: number, t: number) {
  const target = t * length;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const seg = Math.hypot(dx, dy);
    if (acc + seg >= target) {
      const k = (target - acc) / (seg || 1);
      return { x: points[i - 1].x + dx * k, y: points[i - 1].y + dy * k };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

// Draw an orthogonal road with softly rounded corners.
function traceRoad(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], radius: number) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, radius);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

export function StreetMapCanvas({ graph }: { graph: NormalizedGraph }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const selectedId = useGraphStore((s) => s.selectedId);
  const hoveredId = useGraphStore((s) => s.hoveredId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const hideCode = useGraphStore((s) => s.hideCode);
  const includeTsFiles = useGraphStore((s) => s.includeTsFiles);
  const select = useGraphStore((s) => s.select);
  const hover = useGraphStore((s) => s.hover);
  const particleIntensity = useGraphStore((s) => s.particleIntensity);
  const linkIntensity = useGraphStore((s) => s.linkIntensity);
  const showLabels = useGraphStore((s) => s.showLabels);
  const labelSize = useGraphStore((s) => s.labelSize);
  const recenterToken = useGraphStore((s) => s.recenterToken);
  const cameraResetToken = useGraphStore((s) => s.cameraResetToken);

  // Filtered graph → filtered layout.
  const filtered = useMemo(
    () => filterGraph(graph, { activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId }),
    [graph, activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId],
  );

  const layout = useMemo<StreetLayout>(() => {
    // Re-normalize filtered subset into a NormalizedGraph-shaped object for the layout.
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
    return buildStreetLayout(sub, hubColorFor);
  }, [filtered, graph]);

  // Camera (world → screen).  cam.zoom in css px per world unit.
  const camRef = useRef({ x: 0, y: 0, zoom: 0.35, tx: 0, ty: 0, tzoom: 0.35 });
  const draggingRef = useRef<{ x: number; y: number } | null>(null);
  const hoverIdRef = useRef<string | null>(null);

  // Fit to layout bounds when layout changes.
  const fitToBounds = () => {
    const b = layout.bounds;
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    const zoom = Math.min((size.w - 60) / w, (size.h - 60) / h);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    camRef.current.tx = cx;
    camRef.current.ty = cy;
    camRef.current.tzoom = zoom;
  };

  useEffect(() => {
    fitToBounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, size.w, size.h, cameraResetToken]);

  useEffect(() => {
    const hub = layout.nodes.get(HUB_ID);
    if (!hub) return;
    camRef.current.tx = hub.x;
    camRef.current.ty = hub.y;
    camRef.current.tzoom = Math.max(0.35, camRef.current.tzoom);
  }, [recenterToken, layout]);

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

    let raf = 0;
    let last = performance.now();

    // Per-road particle state (reset when road list changes).
    const particleState = new Map<string, number[]>();
    const particleCount = (r: StreetRoad) => {
      const base = r.kind === "highway" ? 4 : r.kind === "street" ? 2 : 1;
      return Math.max(1, Math.round(base * Math.max(0.3, particleIntensity)));
    };
    for (const r of layout.roads) {
      const n = particleCount(r);
      const arr: number[] = [];
      for (let i = 0; i < n; i++) arr.push(Math.random());
      particleState.set(r.id, arr);
    }

    // Roads leaving mrcap1 = "GPS routes" from downtown out to every hub.
    const gpsRoads = layout.roads.filter((r) => r.from === HUB_ID || r.to === HUB_ID);

    const worldToScreen = (x: number, y: number) => {
      const c = camRef.current;
      return {
        x: (x - c.x) * c.zoom + size.w / 2,
        y: (y - c.y) * c.zoom + size.h / 2,
      };
    };

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Ease camera toward target.
      const c = camRef.current;
      c.x += (c.tx - c.x) * Math.min(1, dt * 6);
      c.y += (c.ty - c.y) * Math.min(1, dt * 6);
      c.zoom += (c.tzoom - c.zoom) * Math.min(1, dt * 6);

      // Selection highlight sets — connections and neighbors of selected node.
      let highlightRoads: Set<string> | null = null;
      let highlightNodes: Set<string> | null = null;
      if (selectedId && layout.nodes.has(selectedId)) {
        highlightRoads = new Set();
        highlightNodes = new Set([selectedId]);
        for (const r of layout.roads) {
          if (r.from === selectedId || r.to === selectedId) {
            highlightRoads.add(r.id);
            highlightNodes.add(r.from === selectedId ? r.to : r.from);
          }
        }
      }
      const dimmed = (id: string) => highlightRoads !== null && !highlightRoads.has(id);
      const dimmedNode = (id: string) => highlightNodes !== null && !highlightNodes.has(id);

      // Background — deep navy with subtle radial vignette (matches reference map).
      const bg = ctx.createRadialGradient(size.w / 2, size.h / 2, 0, size.w / 2, size.h / 2, Math.max(size.w, size.h) * 0.7);
      bg.addColorStop(0, "#0f1f38");
      bg.addColorStop(1, "#050a17");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size.w, size.h);

      // Grid graticule (world-space, culled to viewport).
      const step = 200;
      const viewMinX = c.x - size.w / 2 / c.zoom;
      const viewMaxX = c.x + size.w / 2 / c.zoom;
      const viewMinY = c.y - size.h / 2 / c.zoom;
      const viewMaxY = c.y + size.h / 2 / c.zoom;
      ctx.strokeStyle = "rgba(120,170,220,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = Math.floor(viewMinX / step) * step;
      const endX = Math.ceil(viewMaxX / step) * step;
      for (let gx = startX; gx <= endX; gx += step) {
        const a = worldToScreen(gx, viewMinY);
        const b = worldToScreen(gx, viewMaxY);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      const startY = Math.floor(viewMinY / step) * step;
      const endY = Math.ceil(viewMaxY / step) * step;
      for (let gy = startY; gy <= endY; gy += step) {
        const a = worldToScreen(viewMinX, gy);
        const b = worldToScreen(viewMaxX, gy);
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();

      // District halos.
      for (const d of layout.districts) {
        const p = worldToScreen(d.cx, d.cy);
        const r = d.radius * c.zoom;
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r);
        g.addColorStop(0, `${d.color}22`);
        g.addColorStop(1, `${d.color}00`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Prepare screen-space polylines for roads.
      const roadWidthFor = (r: StreetRoad) =>
        r.kind === "highway" ? Math.max(4, 6 * c.zoom) :
        r.kind === "street" ? Math.max(2.5, 3.5 * c.zoom) :
        Math.max(1.5, 2 * c.zoom);

      const cornerRadius = Math.max(4, 10 * c.zoom);

      // 1. Faint base street lattice under everything (like the reference map's
      // background street grid).  Drawn as thin cyan lines with low alpha.
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const r of layout.roads) {
        const pts = r.points.map((p) => worldToScreen(p.x, p.y));
        ctx.strokeStyle = "rgba(120,190,240,0.09)";
        ctx.lineWidth = 1;
        traceRoad(ctx, pts, cornerRadius);
        ctx.stroke();
      }
      // 2. Bright glowing cyan routes for highways + streets (the "lit" arteries).
      const pulse = 0.6 + 0.4 * Math.sin(now / 500);
      for (const r of layout.roads) {
        if (r.kind === "alley") continue;
        const isGps = r.from === HUB_ID || r.to === HUB_ID;
        const pts = r.points.map((p) => worldToScreen(p.x, p.y));
        const isHi = highlightRoads?.has(r.id);
        ctx.globalAlpha = dimmed(r.id) ? 0.15 : 1;
        const core = isHi ? "#ffe066" : isGps ? "#7df9ff" : "#22c8ff";
        const glow = isHi ? "rgba(255,224,102," : isGps ? "rgba(125,249,255," : "rgba(34,200,255,";
        // Outer glow.
        ctx.strokeStyle = `${glow}${(isHi ? 0.5 : isGps ? 0.22 : 0.14) * pulse})`;
        ctx.lineWidth = roadWidthFor(r) + (isHi ? 18 : isGps ? 14 : 8);
        traceRoad(ctx, pts, cornerRadius);
        ctx.stroke();
        // Mid glow.
        ctx.strokeStyle = `${glow}${isHi ? 0.7 : isGps ? 0.35 : 0.22})`;
        ctx.lineWidth = roadWidthFor(r) + 3;
        traceRoad(ctx, pts, cornerRadius);
        ctx.stroke();
        // Bright core.
        ctx.strokeStyle = core;
        ctx.lineWidth = Math.max(1.6, (isHi ? 3.2 : isGps ? 2.6 : 2) * c.zoom);
        traceRoad(ctx, pts, cornerRadius);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 3. Alleys as thin darker connectors.
      for (const r of layout.roads) {
        if (r.kind !== "alley") continue;
        const pts = r.points.map((p) => worldToScreen(p.x, p.y));
        const isHi = highlightRoads?.has(r.id);
        ctx.globalAlpha = dimmed(r.id) ? 0.15 : 1;
        ctx.strokeStyle = isHi ? "rgba(255,224,102,0.85)" : "rgba(90,140,190,0.35)";
        ctx.lineWidth = Math.max(1, 1.4 * c.zoom);
        traceRoad(ctx, pts, cornerRadius);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // 5. Traffic particles.
      const particleGain = Math.max(0.4, particleIntensity);
      for (const r of layout.roads) {
        const arr = particleState.get(r.id);
        if (!arr) continue;
        const speed = (r.kind === "highway" ? 0.18 : r.kind === "street" ? 0.11 : 0.07) * particleGain;
        for (let i = 0; i < arr.length; i++) {
          arr[i] += speed * dt;
          if (arr[i] > 1) arr[i] -= 1;
          const p = samplePolyline(r.points, r.length, arr[i]);
          const s = worldToScreen(p.x, p.y);
          const isGps = r.from === HUB_ID || r.to === HUB_ID;
          ctx.fillStyle = isGps ? "#ffffff" : "#ffd66a";
          ctx.beginPath();
          ctx.arc(s.x, s.y, isGps ? 2.4 : 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 6. Buildings / nodes.
      layout.nodes.forEach((n) => {
        const p = worldToScreen(n.x, n.y);
        const isSelected = selectedId === n.id;
        const isHover = hoveredId === n.id || hoverIdRef.current === n.id;
        const color = hubColorFor(n.node);
        ctx.globalAlpha = dimmedNode(n.id) ? 0.2 : 1;
        const imgSrc = n.node.image || n.node.artwork;
        const img = imgSrc ? getImage(imgSrc, () => {}) : null;

        // Helper: draw a circular image clipped to a disc of radius r.
        const drawAvatar = (cx: number, cy: number, r: number, ringColor: string) => {
          if (!img) return false;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          // cover-fit the image into the circle.
          const iw = img.naturalWidth || img.width;
          const ih = img.naturalHeight || img.height;
          const scale = Math.max((2 * r) / iw, (2 * r) / ih);
          const dw = iw * scale;
          const dh = ih * scale;
          ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
          ctx.restore();
          // Ring around the avatar for the map-pin look.
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = `${ringColor}55`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
          ctx.stroke();
          return true;
        };

        if (n.kind === "downtown") {
          const r = 18 + (isHover ? 3 : 0);
          // Downtown halo (always visible even with image).
          ctx.fillStyle = "rgba(61,237,151,0.18)";
          ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
          if (drawAvatar(p.x, p.y, r, "#3DED97")) return;
          // Downtown = big star pin.
          const rStar = 14 + (isHover ? 3 : 0);
          ctx.fillStyle = "#3DED97";
          ctx.strokeStyle = "#0b0d10";
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
            const rad = i % 2 === 0 ? rStar : rStar * 0.45;
            const px = p.x + Math.cos(a) * rad;
            const py = p.y + Math.sin(a) * rad;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (n.kind === "hub") {
          const rOuter = 14 + (isSelected ? 3 : 0);
          if (drawAvatar(p.x, p.y, rOuter, color)) return;
          // Hub HQ = GPS destination pin: outer ring + inner dot in hub color.
          const rPin = 11 + (isSelected ? 3 : 0);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rPin, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = `${color}55`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rPin + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Building — if it has an image, show a small avatar; otherwise a chip.
          const r = 8 + (isHover ? 2 : 0) + (isSelected ? 2 : 0);
          if (drawAvatar(p.x, p.y, r, color)) return;
          // Building.
          const s = 6 + (isHover ? 2 : 0) + (isSelected ? 3 : 0);
          ctx.fillStyle = color;
          ctx.strokeStyle = "#0b0d10";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(p.x - s / 2, p.y - s / 2, s, s, 1.5);
          ctx.fill();
          ctx.stroke();
        }
      });

      // 7. Labels (zoom-gated, no overlap check for perf — just prioritize).
      if (showLabels) {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const drawLabel = (x: number, y: number, text: string, color: string, sizePx: number, bold = false) => {
          ctx.font = `${bold ? "700 " : "600 "}${sizePx}px 'Space Grotesk','Sora',sans-serif`;
          const w = ctx.measureText(text).width;
          ctx.fillStyle = "rgba(11,13,16,0.85)";
          ctx.fillRect(x - w / 2 - 4, y, w + 8, sizePx + 4);
          ctx.fillStyle = color;
          ctx.fillText(text, x, y + 2);
        };
        // Downtown always labeled.
        const dt = layout.nodes.get(HUB_ID);
        if (dt) {
          const p = worldToScreen(dt.x, dt.y);
          drawLabel(p.x, p.y + 18, "MRCAP1 · DOWNTOWN", "#3DED97", 11 * labelSize, true);
        }
        // Hubs when zoomed above 0.25.
        if (c.zoom > 0.22) {
          layout.nodes.forEach((n) => {
            if (n.kind !== "hub") return;
            const p = worldToScreen(n.x, n.y);
            drawLabel(p.x, p.y + 14, (n.node.label || n.id).toUpperCase(), "#e6ecf5", 10 * labelSize, true);
          });
        }
        // Buildings only when very close.
        if (c.zoom > 0.9) {
          layout.nodes.forEach((n) => {
            if (n.kind !== "building") return;
            const p = worldToScreen(n.x, n.y);
            drawLabel(p.x, p.y + 8, n.node.label || n.id, "rgba(220,225,235,0.85)", 9 * labelSize);
          });
        }
      }

      // 8. Selected pin marker (drop-pin style) on top.
      if (selectedId) {
        const sel = layout.nodes.get(selectedId);
        if (sel) {
          const p = worldToScreen(sel.x, sel.y);
          ctx.strokeStyle = "#ffcc4d";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 18 + Math.sin(now / 300) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Intensity: link intensity applied to overall overlay dimming when < 1.
      if (linkIntensity < 1) {
        ctx.fillStyle = `rgba(11,13,16,${(1 - linkIntensity) * 0.4})`;
        ctx.fillRect(0, 0, size.w, size.h);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [layout, size.w, size.h, selectedId, hoveredId, showLabels, labelSize, particleIntensity, linkIntensity]);

  // Interactions.
  const screenToWorld = (sx: number, sy: number) => {
    const c = camRef.current;
    return {
      x: (sx - size.w / 2) / c.zoom + c.x,
      y: (sy - size.h / 2) / c.zoom + c.y,
    };
  };

  const hitTest = (sx: number, sy: number): string | null => {
    const w = screenToWorld(sx, sy);
    let bestId: string | null = null;
    let bestDist = Infinity;
    layout.nodes.forEach((n) => {
      const r = n.kind === "downtown" ? 18 : n.kind === "hub" ? 14 : 8;
      const dr = r / camRef.current.zoom;
      const d = Math.hypot(n.x - w.x, n.y - w.y);
      if (d <= dr && d < bestDist) {
        bestDist = d;
        bestId = n.id;
      }
    });
    return bestId;
  };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        draggingRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const drag = draggingRef.current;
        draggingRef.current = null;
        if (!drag) return;
        const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
        if (moved < 4) {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
          select(id);
          if (id) {
            const n = layout.nodes.get(id);
            if (n) {
              camRef.current.tx = n.x;
              camRef.current.ty = n.y;
              camRef.current.tzoom = Math.max(camRef.current.tzoom, 0.9);
            }
          }
        }
      }}
      onPointerMove={(e) => {
        const drag = draggingRef.current;
        const c = camRef.current;
        if (drag) {
          const dx = (e.clientX - drag.x) / c.zoom;
          const dy = (e.clientY - drag.y) / c.zoom;
          c.tx -= dx; c.ty -= dy;
          c.x -= dx; c.y -= dy;
          draggingRef.current = { x: e.clientX, y: e.clientY };
        } else {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
          if (id !== hoverIdRef.current) {
            hoverIdRef.current = id;
            hover(id);
          }
        }
      }}
      onWheel={(e) => {
        e.preventDefault();
        const c = camRef.current;
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const before = screenToWorld(px, py);
        const factor = Math.exp(-e.deltaY * 0.0015);
        c.tzoom = Math.max(0.08, Math.min(4, c.tzoom * factor));
        c.zoom = Math.max(0.08, Math.min(4, c.zoom * factor));
        const after = screenToWorld(px, py);
        c.tx += before.x - after.x;
        c.ty += before.y - after.y;
        c.x += before.x - after.x;
        c.y += before.y - after.y;
      }}
    >
      <canvas ref={canvasRef} />
      <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none bg-obsidian-surface/70 backdrop-blur border border-neon-primary/30 rounded-full px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-neon-primary">
        CAPISM · STREET VIEW
      </div>
    </div>
  );
}