## Goal

Rebuild the 2D graph view (`src/components/graph/GraphCanvas.tsx`) so it renders as a clean **solar system** matching the uploaded reference: a bright central "sun" (the hub `site_mrcap1_com`), concentric visible orbit rings, and nodes placed on those rings like planets — no more organic force-directed drift.

## Reference Interpretation

From the uploaded image:
- A large glowing sun anchored bottom-left / or centered — we'll center it.
- 7-9 concentric thin white/blue orbit rings expanding outward.
- One "planet" per ring, sized differently, with a text label below it.
- Deep navy → black radial background with a faint starfield and a diagonal starry "milky way" streak.
- Rings are perfect circles, evenly-ish spaced, thin 1px strokes at low opacity.

## Layout Rules

1. **Hub = Sun**: `site_mrcap1_com` fixed at (0,0), rendered large with a warm orange glow (`#FDBA47` → `#F97316` radial gradient), no image clipping needed for the sun itself.
2. **Orbit assignment**:
   - Group nodes by `community` (fallback: category). Each community = one orbit ring.
   - Rings ordered by community size (biggest community = innermost after Mercury-equivalent, or by hub-distance if available).
   - Ring radii: `R(i) = R0 + i * step` where `R0 = 140`, `step = 110`. Scales with node count via `Math.min` cap.
3. **Node placement on ring**:
   - Nodes on the same ring are evenly distributed by angle: `angle = (index / count) * 2π + hash(id) * smallJitter`.
   - Positions are **fixed** (`fx`, `fy`) — no force simulation moves them. This is the key departure from current code.
   - Drag is disabled (`enableNodeDrag={false}`) so the layout stays clean.
4. **Rings rendered as canvas overlay**: draw concentric circles at each ring radius using `onRenderFramePre` (react-force-graph exposes a canvas hook), stroke `rgba(180,200,255,0.18)`, `lineWidth = 0.6`.
5. **Node sizing**: image/hub nodes 14-26px, satellite nodes 3-6px based on `degree` (unchanged sizing logic).
6. **Labels**: always show for nodes with `image` or `is_hub`, plus at zoom > 2.5 for the rest. Label sits below the node in white `#E4E4E7`.

## Force Config Changes

- Remove `clusterForce`, custom `charge`, `collide`, and link distance overrides.
- Zero out d3 forces: `d3Force('link', null)`, `d3Force('charge', null)`, `d3Force('center', null)`, `d3Force('collide', null)`, `d3Force('orbital', null)`.
- `cooldownTicks={0}` so the sim never runs.
- Nodes carry `fx`/`fy` from the seed effect → positions are authoritative.

## Background

Keep the current starfield div. Add one extra radial gradient behind the sun position for the corona glow. Diagonal "milky way" streak can be a second absolutely-positioned div with a rotated linear-gradient of tiny white dots (optional polish).

## Files Touched

- `src/components/graph/GraphCanvas.tsx` — rewrite layout + force config + ring rendering + sun rendering. All other behavior (context menu, image mirroring, highlight set, particles, pulse) preserved.

No other files change. No schema, no server functions, no new deps.

## Out of Scope

- 3D view (`GraphCanvas3D.tsx`).
- Street/other views.
- Backend, filters, sidebar, panels.

## Acceptance

- Hub is a glowing orange sun at center.
- Nodes sit on visible concentric rings, one community per ring, evenly angled.
- Nothing drifts — layout is static on load and after filter changes.
- Links still render between connected nodes; hover/select highlight still works.
- No TypeScript errors; app builds cleanly.
