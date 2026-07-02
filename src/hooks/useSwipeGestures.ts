import { useEffect } from "react";
import { useGraphStore } from "@/lib/graph/useGraphStore";

const EDGE_ZONE = 32; // px from screen edge to initiate opening swipe
const OPEN_THRESHOLD = 60; // horizontal px required to open a panel
const CLOSE_THRESHOLD = 50; // horizontal px required to close a panel
const VERTICAL_TOLERANCE = 60; // max vertical drift for a valid horizontal swipe
const MAX_DURATION = 600; // ms — longer than this and it's not a swipe
const MOBILE_BREAKPOINT = 768;

export function useSwipeGestures() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;
    let intent: "open-left" | "open-right" | "close-left" | "close-right" | null = null;

    const isMobile = () => window.innerWidth < MOBILE_BREAKPOINT;

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobile()) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const { leftPanelOpen, rightPanelOpen } = useGraphStore.getState();

      // Determine intent from where the touch begins.
      if (leftPanelOpen) {
        intent = "close-left";
      } else if (rightPanelOpen) {
        intent = "close-right";
      } else if (t.clientX <= EDGE_ZONE) {
        intent = "open-left";
      } else if (t.clientX >= window.innerWidth - EDGE_ZONE) {
        intent = "open-right";
      } else {
        intent = null;
        return;
      }

      startX = t.clientX;
      startY = t.clientY;
      startTime = e.timeStamp;
      tracking = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking || !intent) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      const dt = e.timeStamp - startTime;
      if (dt > MAX_DURATION) return;
      if (dy > VERTICAL_TOLERANCE) return;

      const store = useGraphStore.getState();
      switch (intent) {
        case "open-left":
          if (dx > OPEN_THRESHOLD) store.setLeftPanel(true);
          break;
        case "close-left":
          if (dx < -CLOSE_THRESHOLD) store.setLeftPanel(false);
          break;
        case "open-right":
          if (dx < -OPEN_THRESHOLD) store.setRightPanel(true);
          break;
        case "close-right":
          if (dx > CLOSE_THRESHOLD) store.setRightPanel(false);
          break;
      }
      intent = null;
    };

    const onTouchCancel = () => {
      tracking = false;
      intent = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);
}