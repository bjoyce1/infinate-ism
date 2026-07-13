// Real-street routing for Street View connections.
// Uses public OSRM demo server; results cached in-memory + localStorage so we
// only hit the network once per unique coordinate pair.

import type { LngLat } from "./houstonGeoConfig";
import type { CityRoad } from "./geoCityModel";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const LS_KEY = "ism.streetRoutes.v1";
const memory = new Map<string, LngLat[]>();
let loadedFromStorage = false;

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function keyFor(from: LngLat, to: LngLat): string {
  return `${round5(from[0])},${round5(from[1])}|${round5(to[0])},${round5(to[1])}`;
}

function loadCache() {
  if (loadedFromStorage) return;
  loadedFromStorage = true;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, LngLat[]>;
    for (const [k, v] of Object.entries(obj)) memory.set(k, v);
  } catch {}
}

let flushHandle: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush() {
  if (typeof localStorage === "undefined") return;
  if (flushHandle) clearTimeout(flushHandle);
  flushHandle = setTimeout(() => {
    try {
      const obj: Record<string, LngLat[]> = {};
      // Cap entries to avoid unbounded growth.
      const entries = Array.from(memory.entries()).slice(-4000);
      for (const [k, v] of entries) obj[k] = v;
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch {}
  }, 1500);
}

async function fetchStreetRoute(from: LngLat, to: LngLat): Promise<LngLat[]> {
  loadCache();
  const k = keyFor(from, to);
  const cached = memory.get(k);
  if (cached) return cached;
  const url = `${OSRM_BASE}/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const j: any = await res.json();
    const coords: LngLat[] | undefined = j?.routes?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) throw new Error("no route");
    memory.set(k, coords);
    scheduleFlush();
    return coords;
  } catch {
    const fallback: LngLat[] = [from, to];
    memory.set(k, fallback);
    return fallback;
  }
}

export function getCachedRoute(from: LngLat, to: LngLat): LngLat[] | null {
  loadCache();
  return memory.get(keyFor(from, to)) ?? null;
}

export async function resolveRoutes(
  roads: CityRoad[],
  onProgress?: (resolvedCount: number, total: number) => void,
  signal?: { aborted: boolean },
): Promise<Map<string, LngLat[]>> {
  loadCache();
  const out = new Map<string, LngLat[]>();
  // Seed with cache immediately.
  for (const r of roads) {
    const c = memory.get(keyFor(r.fromCoord, r.toCoord));
    if (c) out.set(r.id, c);
  }

  const pending = roads.filter((r) => !out.has(r.id));
  let idx = 0;
  let done = 0;
  const total = pending.length;
  const CONCURRENCY = 5;

  async function worker() {
    while (!signal?.aborted) {
      const i = idx++;
      if (i >= pending.length) return;
      const r = pending[i];
      const coords = await fetchStreetRoute(r.fromCoord, r.toCoord);
      out.set(r.id, coords);
      done++;
      onProgress?.(done, total);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, pending.length); i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

// -------- Polyline geometry helpers --------

function haversine(a: LngLat, b: LngLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const aa =
    s1 * s1 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(aa)));
}

export type PolylineMetrics = {
  cum: number[]; // cumulative length at each vertex
  total: number;
};

export function measurePolyline(coords: LngLat[]): PolylineMetrics {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return { cum, total: cum[cum.length - 1] || 1 };
}

/** t in [0,1] → interpolated LngLat along polyline */
export function pointAlong(
  coords: LngLat[],
  metrics: PolylineMetrics,
  t: number,
): LngLat {
  if (coords.length < 2) return coords[0] ?? [0, 0];
  const target = Math.max(0, Math.min(1, t)) * metrics.total;
  // binary-ish search
  let lo = 0;
  let hi = metrics.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (metrics.cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  const segLen = metrics.cum[hi] - metrics.cum[lo] || 1;
  const f = (target - metrics.cum[lo]) / segLen;
  const a = coords[lo];
  const b = coords[hi];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}