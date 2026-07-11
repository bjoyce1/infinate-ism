// Lightweight 2.5D projection for the Street View canvas.
// World is a right-handed 2D plane (see houstonCityConfig.ts). The camera
// pans in world space, zooms uniformly, yaws around its own centre, and
// tilts by compressing the Y axis toward the horizon. This gives an
// isometric/illustrated feel without dragging in a 3D engine.

export type Camera = {
  x: number; // world-space centre
  y: number;
  zoom: number; // css px per world unit at tilt = 0
  yaw: number; // radians, clamped to ±25° at the caller
  tilt: number; // 0 = top-down, up to ~0.55 rad for a shallow tilt
};

export const YAW_LIMIT = (25 * Math.PI) / 180;
export const TILT_LIMIT = 0.55;

/** Convert a world point to screen space (css px, origin = top-left). */
export function worldToScreen(
  wx: number,
  wy: number,
  cam: Camera,
  viewW: number,
  viewH: number,
): { x: number; y: number; scale: number } {
  // Translate to camera space.
  const tx = wx - cam.x;
  const ty = wy - cam.y;
  // Yaw around camera.
  const c = Math.cos(cam.yaw);
  const s = Math.sin(cam.yaw);
  const rx = tx * c - ty * s;
  const ry = tx * s + ty * c;
  // Tilt: compress Y; approximate parallax via a mild depth scale.
  const tiltC = Math.cos(cam.tilt);
  const yProj = ry * tiltC;
  // Depth scale so nearer (larger ry) objects render slightly bigger.
  const depth = 1 + ry * 0.0001 * Math.sin(cam.tilt);
  const scale = cam.zoom * depth;
  return {
    x: viewW / 2 + rx * cam.zoom,
    y: viewH / 2 + yProj * cam.zoom,
    scale,
  };
}

/** Inverse of worldToScreen — used for pan/hit-testing. Ignores depth scale. */
export function screenToWorld(
  sx: number,
  sy: number,
  cam: Camera,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const rx = (sx - viewW / 2) / cam.zoom;
  const yProj = (sy - viewH / 2) / cam.zoom;
  const ry = yProj / Math.max(0.01, Math.cos(cam.tilt));
  const c = Math.cos(-cam.yaw);
  const s = Math.sin(-cam.yaw);
  const tx = rx * c - ry * s;
  const ty = rx * s + ry * c;
  return { x: tx + cam.x, y: ty + cam.y };
}

export function clampYaw(v: number): number {
  return Math.max(-YAW_LIMIT, Math.min(YAW_LIMIT, v));
}

export function clampTilt(v: number): number {
  return Math.max(0, Math.min(TILT_LIMIT, v));
}

export function easeCam(cam: Camera, target: Camera, dt: number, rate = 6): void {
  const k = Math.min(1, dt * rate);
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y) * k;
  cam.zoom += (target.zoom - cam.zoom) * k;
  cam.yaw += (target.yaw - cam.yaw) * k;
  cam.tilt += (target.tilt - cam.tilt) * k;
}