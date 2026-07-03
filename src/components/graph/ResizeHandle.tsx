import { useCallback, useEffect, useRef } from "react";

type Props = {
  side: "left" | "right";
  width: number;
  onChange: (w: number) => void;
  min?: number;
  max?: number;
};

/**
 * Vertical drag handle for resizing a side panel.
 * `side` = which edge of the viewport the panel is anchored to.
 * On the left panel, the handle sits on its right edge; dragging right grows it.
 * On the right panel, the handle sits on its left edge; dragging left grows it.
 */
export function ResizeHandle({ side, width, onChange, min = 220, max = 640 }: Props) {
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      const delta = side === "left" ? dx : -dx;
      const next = Math.max(min, Math.min(max, startWRef.current + delta));
      onChange(next);
    },
    [side, min, max, onChange],
  );

  const stop = useCallback(() => {
    draggingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => onPointerMove(e);
    const up = () => stop();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [onPointerMove, stop]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 32 : 8;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(Math.max(min, width - (side === "left" ? step : -step)));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onChange(Math.max(min, Math.min(max, width + (side === "left" ? step : -step))));
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      tabIndex={0}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        draggingRef.current = true;
        startXRef.current = e.clientX;
        startWRef.current = width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      onDoubleClick={() => onChange(side === "left" ? 288 : 384)}
      onKeyDown={onKeyDown}
      className={`hidden md:block absolute top-0 ${side === "left" ? "-right-1" : "-left-1"} h-full w-2 z-50 cursor-col-resize group`}
    >
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-obsidian-border group-hover:bg-neon-primary/60 group-active:bg-neon-primary transition-colors" />
    </div>
  );
}