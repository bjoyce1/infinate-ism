import { useEffect, useRef } from "react";
import type { NormalizedGraph } from "./types";
import { useGraphStore } from "./useGraphStore";

const DWELL_MS = 3600;
const TOP_N = 14;

/**
 * Fly-through tour: cycles through the top N most-connected nodes, selecting
 * each and asking the active canvas to fly to it. Any manual selection that
 * isn't the current tour step stops the tour.
 */
export function useTour(graph: NormalizedGraph) {
  const tourActive = useGraphStore((s) => s.tourActive);
  const selectedId = useGraphStore((s) => s.selectedId);
  const setTour = useGraphStore((s) => s.setTour);
  const select = useGraphStore((s) => s.select);
  const flyTo = useGraphStore((s) => s.flyTo);

  const stepRef = useRef(0);
  const currentIdRef = useRef<string | null>(null);
  const stepsRef = useRef<string[]>([]);

  // Precompute steps whenever the underlying graph changes.
  useEffect(() => {
    stepsRef.current = [...graph.nodes]
      .sort((a, b) => b.degree - a.degree)
      .slice(0, TOP_N)
      .map((n) => n.id);
  }, [graph]);

  // Tour driver.
  useEffect(() => {
    if (!tourActive) {
      currentIdRef.current = null;
      return;
    }
    const steps = stepsRef.current;
    if (steps.length === 0) return;

    const advance = () => {
      const id = steps[stepRef.current % steps.length];
      stepRef.current += 1;
      currentIdRef.current = id;
      select(id);
      flyTo(id);
    };
    advance();
    const iv = setInterval(advance, DWELL_MS);
    return () => clearInterval(iv);
  }, [tourActive, select, flyTo]);

  // Stop tour if the user manually selects something else (or deselects).
  useEffect(() => {
    if (!tourActive) return;
    if (selectedId !== currentIdRef.current) setTour(false);
  }, [selectedId, tourActive, setTour]);
}