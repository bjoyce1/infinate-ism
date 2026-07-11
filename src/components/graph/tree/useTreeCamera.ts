import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { CANVAS_H, CANVAS_W } from "./treeTypes";

export type Camera = { x: number; y: number; k: number };

/** Camera hook with GSAP-tweened animations and reduced-motion support. */
export function useTreeCamera(size: { w: number; h: number }) {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotion.current = m.matches;
    const onChange = () => { reduceMotion.current = m.matches; };
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);

  const setInstant = useCallback((c: Camera) => {
    tweenRef.current?.kill();
    const k = Math.min(6, Math.max(0.2, c.k));
    setCamera({ x: c.x, y: c.y, k });
  }, []);

  const tweenTo = useCallback((target: Camera, dur = 0.6) => {
    const clamped: Camera = { x: target.x, y: target.y, k: Math.min(6, Math.max(0.2, target.k)) };
    if (reduceMotion.current) { setInstant(clamped); return; }
    tweenRef.current?.kill();
    const from = { ...cameraRef.current };
    tweenRef.current = gsap.to(from, {
      x: clamped.x, y: clamped.y, k: clamped.k,
      duration: dur, ease: "power3.out",
      onUpdate: () => setCamera({ x: from.x, y: from.y, k: from.k }),
    });
  }, [setInstant]);

  const fit = useCallback((animate = true) => {
    const scale = Math.min(size.w / CANVAS_W, size.h / CANVAS_H);
    const target = {
      x: (size.w - CANVAS_W * scale) / 2,
      y: (size.h - CANVAS_H * scale) / 2,
      k: scale,
    };
    animate ? tweenTo(target, 0.5) : setInstant(target);
  }, [size, tweenTo, setInstant]);

  const focus = useCallback((pt: { x: number; y: number }, k?: number) => {
    const targetK = k ?? Math.max(cameraRef.current.k, 1.3);
    tweenTo({
      x: size.w / 2 - pt.x * targetK,
      y: size.h * 0.55 - pt.y * targetK,
      k: targetK,
    }, 0.7);
  }, [size, tweenTo]);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    const t = cameraRef.current;
    const k = Math.min(6, Math.max(0.2, t.k * factor));
    const scale = k / t.k;
    setInstant({ k, x: px - (px - t.x) * scale, y: py - (py - t.y) * scale });
  }, [setInstant]);

  return { camera, setInstant, tweenTo, fit, focus, zoomAt, reduceMotion };
}