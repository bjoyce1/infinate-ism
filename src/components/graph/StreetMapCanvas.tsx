import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedGraph } from "@/lib/graph/types";
import { filterGraph } from "@/lib/graph/filterGraph";
import { CATEGORY_COLORS } from "@/lib/graph/loadGraph";
import { useGraphStore } from "@/lib/graph/useGraphStore";
import { buildStreetLayout, sampleRoad, type StreetLayout, type StreetNode } from "@/lib/graph/streetLayout";

type Camera = { x: number; y: number; zoom: number };

export function StreetMapCanvas({ graph }: { graph: NormalizedGraph }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const selectedId = useGraphStore((s) => s.selectedId);
  const focusMode = useGraphStore((s) => s.focusMode);
  const activeCommunity = useGraphStore((s) => s.activeCommunity);
  const activeCategories = useGraphStore((s) => s.activeCategories);
  const hideCode = useGraphStore((s) => s.hideCode);
  const includeTsFiles = useGraphStore((s) => s.includeTsFiles);
  const select = useGraphStore((s) => s.select);
  const particleIntensity = useGraphStore((s) => s.particleIntensity);
  const linkIntensity = useGraphStore((s) => s.linkIntensity);
  const showLabels = useGraphStore((s) => s.showLabels);
  const recenterToken = useGraphStore((s) => s.recenterToken);
  const cameraResetToken = useGraphStore((s) => s.cameraResetToken);

  const data = useMemo(
    () => filterGraph(graph, { activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId }),
    [graph, activeCategories, hideCode, includeTsFiles, activeCommunity, focusMode, selectedId],
  );

  // Build layout once for the *base* graph so positions stay stable when
  // filters toggle; filter just controls what we draw.
  const layout = useMemo<StreetLayout>(() => buildStreetLayout(graph), [graph]);
  const visibleIds = useMemo(() => new Set(data.nodes.map((n) => n.id)), [data]);
  const highlight = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    for (const nb of graph.neighbors.get(selectedId) ?? []) set.add(nb);
    return set;
  }, [selectedId, graph.neighbors]);

  // Camera state (world→screen: sx = (wx - cam.x) * zoom + w/2)
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 0.6 });
  const [, forceTick] = useState(0);

  // Fit-to-bounds helper.
  const fit = useCallback(() => {
    const b = layout.bounds;
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const zx = size.w / bw;
    const zy = size.h / bh;
    const zoom = Math.max(0.08, Math.min(zx, zy) * 0.9);
    camRef.current = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, zoom };
    forceTick((n) => n + 1);
  }, [layout, size]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Initial fit + on reset/recenter tokens.
  useEffect(() => { if (size.w > 0) fit(); }, [layout, size.w > 0]); // eslint-disable-line
  useEffect(() => { fit(); }, [cameraResetToken]); // eslint-disable-line
  useEffect(() => {
    const hub = layout.nodes.get("site_mrcap1_com");
    if (!hub) return;
    camRef.current = { x: hub.x, y: hub.y, zoom: Math.max(0.6, camRef.current.zoom) };
    forceTick((n) => n + 1);
  }, [recenterToken, layout]);

  // Pan / zoom handlers.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY; moved = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      const cam = camRef.current;
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
      if (moved < 4) handleClick(e);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camRef.current;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // World point under mouse.
      const wx = (px - rect.width / 2) / cam.zoom + cam.x;
      const wy = (py - rect.height / 2) / cam.zoom + cam.y;
      const factor = Math.exp(-e.deltaY * 0.0015);
      cam.zoom = Math.max(0.05, Math.min(6, cam.zoom * factor));
      // Keep world point stationary.
      cam.x = wx - (px - rect.width / 2) / cam.zoom;
      cam.y = wy - (py - rect.height / 2) / cam.zoom;
    };

    const handleClick = (e: PointerEvent) => {
      const cam = camRef.current;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const wx = (px - rect.width / 2) / cam.zoom + cam.x;
      const wy = (py - rect.height / 2) / cam.zoom + cam.y;
      // Nearest node within radius (in world units).
      let best: StreetNode | null = null;
      let bestD = Infinity;
      for (const n of layout.nodes.values()) {
        if (!visibleIds.has(n.id)) continue;
        const r = nodeRadius(n) + 6 / cam.zoom;
        const d = Math.hypot(n.x - wx, n.y - wy);
        if (d < r && d < bestD) { best = n; bestD = d; }
      }
      select(best ? best.id : null);
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [layout, visibleIds, select]);

  // Traffic particles per road. Precompute one array per visible road.
  const particlesRef = useRef<Map<string, { offset: number; speed: number }[]>>(new Map());
  useEffect(() => {
    const map = new Map<string, { offset: number; speed: number }[]>();
    for (const road of layout.roads) {
      if (!visibleIds.has(road.source) || !visibleIds.has(road.target)) continue;
      const baseCount =
        road.kind === "highway" ? 4 : road.kind === "street" ? 2 : 1;
      const count = Math.max(1, Math.round(baseCount * particleIntensity * (0.5 + road.weight * 0.5)));
      const list: { offset: number; speed: number }[] = [];
      for (let i = 0; i < count; i++) {
        list.push({
          offset: Math.random() * road.length,
          speed: (road.kind === "highway" ? 42 : road.kind === "street" ? 28 : 18) * (0.7 + Math.random() * 0.6),
        });
      }
      map.set(`${road.source}|${road.target}`, list);
    }
    particlesRef.current = map;
  }, [layout, visibleIds, particleIntensity]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let stopped = false;
    let last = performance.now();

    const render = () => {
      if (stopped) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const cam = camRef.current;
      const w = size.w;
      const h = size.h;
      const toScreenX = (wx: number) => (wx - cam.x) * cam.zoom + w / 2;
      const toScreenY = (wy: number) => (wy - cam.y) * cam.zoom + h / 2;

      // Background — deep charcoal.
      ctx.fillStyle = "#0A0A0B";
      ctx.fillRect(0, 0, w, h);

      // Subtle world grid (graticule).
      const gridStep = 24;
      const gridPx = gridStep * cam.zoom;
      if (gridPx > 6) {
        const startWX = cam.x - w / 2 / cam.zoom;
        const startWY = cam.y - h / 2 / cam.zoom;
        const firstX = Math.floor(startWX / gridStep) * gridStep;
        const firstY = Math.floor(startWY / gridStep) * gridStep;
        ctx.strokeStyle = "rgba(255,255,255,0.03)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = firstX; x < startWX + w / cam.zoom + gridStep; x += gridStep) {
          const sx = toScreenX(x);
          ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
        }
        for (let y = firstY; y < startWY + h / cam.zoom + gridStep; y += gridStep) {
          const sy = toScreenY(y);
          ctx.moveTo(0, sy); ctx.lineTo(w, sy);
        }
        ctx.stroke();
      }

      // District polygons.
      for (const d of layout.districts) {
        if (!visibleIds.has(d.hubId)) continue;
        const x = toScreenX(d.bounds.x);
        const y = toScreenY(d.bounds.y);
        const bw = d.bounds.w * cam.zoom;
        const bh = d.bounds.h * cam.zoom;
        ctx.fillStyle = hexA(d.color, 0.06);
        ctx.strokeStyle = hexA(d.color, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundRect(ctx, x, y, bw, bh, 6);
        ctx.fill();
        ctx.stroke();
      }

      // Roads — casing pass, then surface pass.
      const linkOp = Math.max(0.15, Math.min(1, linkIntensity));
      // Casings
      ctx.strokeStyle = `rgba(28,28,34,${linkOp})`;
      for (const road of layout.roads) {
        if (!visibleIds.has(road.source) || !visibleIds.has(road.target)) continue;
        const wCase = road.kind === "highway" ? 8 : road.kind === "street" ? 5 : 3;
        ctx.lineWidth = Math.max(1.2, wCase * cam.zoom * 0.6);
        drawPath(ctx, road.path, toScreenX, toScreenY);
        ctx.stroke();
      }
      // Surfaces
      for (const road of layout.roads) {
        if (!visibleIds.has(road.source) || !visibleIds.has(road.target)) continue;
        const isHi = !!highlight && highlight.has(road.source) && highlight.has(road.target);
        const wSurf = road.kind === "highway" ? 5 : road.kind === "street" ? 3 : 1.6;
        ctx.lineWidth = Math.max(0.8, wSurf * cam.zoom * 0.6);
        ctx.strokeStyle = isHi
          ? `rgba(61,237,151,${Math.min(1, 0.85 * linkOp)})`
          : road.kind === "highway"
            ? `rgba(220,220,235,${0.55 * linkOp})`
            : road.kind === "street"
              ? `rgba(150,155,175,${0.4 * linkOp})`
              : `rgba(110,115,135,${0.28 * linkOp})`;
        drawPath(ctx, road.path, toScreenX, toScreenY);
        ctx.stroke();
      }
      // Highway centerline dashes.
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = `rgba(250,210,120,${0.45 * linkOp})`;
      for (const road of layout.roads) {
        if (road.kind !== "highway") continue;
        if (!visibleIds.has(road.source) || !visibleIds.has(road.target)) continue;
        ctx.lineWidth = Math.max(0.4, 0.8 * cam.zoom * 0.6);
        drawPath(ctx, road.path, toScreenX, toScreenY);
        ctx.stroke();
      }
      ctx.restore();

      // Traffic particles.
      for (const road of layout.roads) {
        if (!visibleIds.has(road.source) || !visibleIds.has(road.target)) continue;
        const list = particlesRef.current.get(`${road.source}|${road.target}`);
        if (!list) continue;
        const isHi = !!highlight && highlight.has(road.source) && highlight.has(road.target);
        const color = isHi ? "#3DED97" : road.kind === "highway" ? "#FDE68A" : "#E4E4E7";
        for (const p of list) {
          p.offset += p.speed * dt;
          const pt = sampleRoad(road, p.offset);
          const sx = toScreenX(pt.x);
          const sy = toScreenY(pt.y);
          if (sx < -10 || sy < -10 || sx > w + 10 || sy > h + 10) continue;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(1, 1.5 * particleIntensity), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Nodes.
      const nodesSorted: StreetNode[] = [];
      for (const n of layout.nodes.values()) if (visibleIds.has(n.id)) nodesSorted.push(n);
      nodesSorted.sort((a, b) => Number(a.isHub) - Number(b.isHub));
      for (const n of nodesSorted) {
        const sx = toScreenX(n.x);
        const sy = toScreenY(n.y);
        if (sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40) continue;
        const r = Math.max(2, nodeRadius(n) * cam.zoom);
        const dim = highlight && !highlight.has(n.id);
        const color = dim
          ? "rgba(90,90,100,0.35)"
          : (n.color ?? CATEGORY_COLORS[n.category] ?? "#E4E4E7");
        if (n.isDowntown) {
          drawStar(ctx, sx, sy, r * 1.6, "#FDE68A");
        } else if (n.isHub) {
          ctx.fillStyle = "#0A0A0B";
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          roundRect(ctx, sx - r, sy - r, r * 2, r * 2, Math.max(2, r * 0.35));
          ctx.fill(); ctx.stroke();
          // inner dot
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(sx, sy, r * 0.42, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          roundRect(ctx, sx - r, sy - r, r * 2, r * 2, Math.max(1, r * 0.3));
          ctx.fill();
        }
        if (selectedId === n.id) {
          ctx.strokeStyle = "#3DED97";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Labels with priority + collision.
      if (showLabels) {
        type L = { text: string; x: number; y: number; halfW: number; halfH: number; priority: number; isHub: boolean };
        const entries: L[] = [];
        for (const n of nodesSorted) {
          const sx = toScreenX(n.x);
          const sy = toScreenY(n.y);
          if (sx < 0 || sy < 0 || sx > w || sy > h) continue;
          // Zoom gating
          if (cam.zoom < 0.4 && !n.isHub) continue;
          if (cam.zoom < 1.5 && !n.isHub && n.degree < 4 && selectedId !== n.id) continue;
          const text = n.label;
          const fs = n.isDowntown ? 13 : n.isHub ? 11 : 9;
          const halfW = (text.length * fs * 0.32) + 4;
          const halfH = fs * 0.7;
          let priority = n.degree;
          if (n.isHub) priority += 5000;
          if (n.isDowntown) priority += 100000;
          if (selectedId === n.id) priority += 1_000_000;
          entries.push({ text, x: sx, y: sy + nodeRadius(n) * cam.zoom + halfH + 4, halfW, halfH, priority, isHub: n.isHub });
        }
        entries.sort((a, b) => b.priority - a.priority);
        const placed: L[] = [];
        for (const e of entries) {
          let overlap = false;
          for (const p of placed) {
            if (Math.abs(e.x - p.x) < e.halfW + p.halfW && Math.abs(e.y - p.y) < e.halfH + p.halfH) { overlap = true; break; }
          }
          if (overlap) continue;
          placed.push(e);
          const fs = e.isHub ? 11 : 9;
          ctx.font = `${e.isHub ? "600" : "500"} ${fs}px ui-monospace, SFMono-Regular, monospace`;
          const label = e.isHub ? e.text.toUpperCase() : e.text;
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = "rgba(10,10,11,0.72)";
          ctx.fillRect(e.x - tw / 2 - 3, e.y - fs / 2 - 1, tw + 6, fs + 2);
          ctx.fillStyle = e.isHub ? "#F5E9C6" : "#D4D4D8";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, e.x, e.y);
        }
      }

      requestAnimationFrame(render);
    };
    const id = requestAnimationFrame(render);
    return () => { stopped = true; cancelAnimationFrame(id); };
  }, [size, layout, visibleIds, highlight, selectedId, particleIntensity, linkIntensity, showLabels]);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="block cursor-grab active:cursor-grabbing" />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-white/10 bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400 backdrop-blur">
        Street View · CAPISM · drag to pan · scroll to zoom
      </div>
    </div>
  );
}

function nodeRadius(n: StreetNode): number {
  if (n.isDowntown) return 9;
  if (n.isHub) return 6 + Math.min(4, Math.sqrt(n.degree) * 0.6);
  return 2.2 + Math.min(2.5, Math.sqrt(n.degree) * 0.4);
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  path: { x: number; y: number }[],
  toScreenX: (x: number) => number,
  toScreenY: (y: number) => number,
) {
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const sx = toScreenX(path[i].x);
    const sy = toScreenY(path[i].y);
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const spikes = 5;
  const outer = r;
  const inner = r * 0.45;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#0A0A0B";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function hexA(hex: string, a: number): string {
  if (!hex.startsWith("#")) return `rgba(120,120,140,${a})`;
  const s = hex.slice(1);
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}