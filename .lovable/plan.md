## Problem

Hovering a node in the 3D view stalls for several seconds because `handleNodeHover` calls `fgRef.current.refresh()` (in `src/components/graph/GraphCanvas3D.tsx`). In `react-force-graph-3d`, `refresh()` tears down and rebuilds **every** node's Three.js object — for every node it re-invokes `nodeThreeObject`, which allocates a brand-new `SpriteText` (new canvas texture, new material, new geometry). On a graph with hundreds of nodes this is tens of MB of GPU/CPU churn per hover, plus a GC pause. Every mousemove that crosses a node triggers it again.

Secondary contributors:
- `handleNodeHover` depends on `selectedHighlightSet`, so the callback identity changes whenever selection changes, which can force `react-force-graph-3d` to re-diff props.
- Hovering writes `hoveredId` into the zustand store on every enter/leave, waking every subscriber (`HubHoverCard`, etc.), even though the 3D canvas already tracks hover in a ref.

## Fix

Keep hover purely visual and cheap — never rebuild the scene:

1. **Remove `fgRef.current.refresh()`** from `handleNodeHover`. Instead, mutate the cached Three.js materials in place:
   - Keep a `Map<string, THREE.Object3D>` populated inside `nodeThreeObject` (the sphere passed in as the first arg when using `nodeThreeObjectExtend`), plus the existing sprite cache.
   - On hover, walk the neighborhood set and set `material.color`/`material.opacity` on the cached sphere + link materials directly. Non-neighbors get dimmed; neighbors get their category color. This is O(nodes) simple assignments, no allocations.
   - Link particle intensity was already reading `highlightRef` — since the library recomputes accessors each frame for particles, that keeps working without `refresh()`.

2. **Stabilize `handleNodeHover`** — drop `selectedHighlightSet` from its deps and read it from a ref (`selectedHighlightRef`) that a small effect keeps in sync. That way the prop passed to `<ForceGraph3D>` never changes identity from hover/selection.

3. **Throttle hover to one update per animation frame.** Wrap the handler so repeated `onNodeHover` calls during a fast mousemove coalesce into a single rAF-scheduled update.

4. **Stop writing hover into the zustand store from 3D.** Move `hoverRef.current(nextId)` behind a check — only fire it when the tooltip/hover consumers actually need it (they don't in 3D; the tooltip is already handled locally via `tooltipRef`). This eliminates cross-component re-renders on every hover.

5. **Guard `nodeThreeObject` against duplicate builds.** Cache the returned sprite per node id and return the cached instance on subsequent calls so an accidental rebuild (e.g. filter change) reuses existing sprites instead of leaking them.

## Files to edit

- `src/components/graph/GraphCanvas3D.tsx` — the four changes above (hover handler, ref stabilization, rAF throttle, sphere/material cache).

## Verification

- Open `/?view=3d`, sweep the mouse across dense clusters — no multi-second freeze; highlight still dims non-neighbors and brightens the ego-network.
- Selecting a node still works, focus mode still filters, tooltip still tracks the hovered node.
- No new console warnings; no growth in Three.js object count across many hovers (spot-check via `renderer.info` if needed).
