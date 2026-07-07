# Infinite Ism v2 — Street View

A new visualization mode that reimagines the graph as the streets of CAPISM. Adds a "Street View" tab alongside the existing 2D / 3D views. mrcap1.com sits at the city center; each entity/hub node is a neighborhood HQ; the nodes spawned from that entity form the surrounding neighborhood blocks. Roads connect nodes, and animated particles flow along them as traffic.

## What you'll see

- Dark cartographic canvas (deep charcoal background, subtle grid, faint districts).
- **mrcap1.com** = downtown plaza at (0,0), rendered as a landmark.
- Each **entity / hub node** = a neighborhood HQ (larger marker, name label, colored district polygon underneath).
- Each **child node** of a hub = a building/lot placed on streets radiating from that HQ, laid out on a clean orthogonal grid so blocks read as coherent neighborhoods.
- **Streets** = links, drawn as double-stroked road ribbons (dark asphalt + light centerline). Highways between hubs are thicker; neighborhood streets are thinner.
- **Traffic** = particles flowing along roads, speed/density tied to link weight and the existing particle intensity slider.
- **Labels** = street-map typography: HQ names uppercase, small building labels along their street, collision-culled at zoom.
- **Interactive**: click a node to select (reuses existing DetailPanel), hover for a tooltip, pan + zoom, click a neighborhood district to focus.

## Reference feel

Both uploaded maps (blueprint city + Tokyo map) drive the aesthetic: crisp thin road network, dense readable blocks, one accent color per district, everything legible when zoomed out AND when zoomed in.

## New tab

TopBar gets a third view toggle: **2D · 3D · STREET**. The `view` URL param already exists (`?view=2d`); we'll extend it to accept `street`.

## Layout algorithm (deterministic, not physics)

Physics sim looks organic; a street map needs order. Instead:

1. Place mrcap1.com at origin.
2. Collect all hub nodes (`is_hub === true`) and lay them out on a **ring / concentric-blocks pattern** around downtown, spaced by degree so bigger hubs get bigger districts. Snap positions to a coarse grid.
3. For each hub, take its child nodes and place them on an orthogonal grid inside a bounding "neighborhood" rectangle assigned to that hub. Order children by degree so important ones sit on the main avenue.
4. Route links as **orthogonal (Manhattan) paths** with rounded corners — this is what makes it read as streets rather than a spider web.
5. Cache the layout once per graph load; no per-frame force simulation. Drag / zoom only moves the camera.

## Rendering

Use a dedicated canvas component (`StreetMapCanvas.tsx`) built on the same `react-force-graph-2d` primitives isn't a fit — we'll render directly with a `<canvas>` + custom draw loop (or PixiJS if we want it buttery at high node counts; falls back to plain 2D canvas otherwise). Camera: pan (drag), zoom (wheel / pinch).

Layers, back to front:
1. Background + grid graticule.
2. Neighborhood district polygons (soft translucent fills, per-hub accent color).
3. Road casings (wider dark stroke).
4. Road surfaces (narrower lighter stroke) + dashed centerline for highways.
5. Traffic particles (animated dots along each polyline, existing `particleIntensity` and `linkIntensity` sliders apply).
6. Building markers (nodes) — small rounded squares for children, larger rounded rectangles with icons for hubs, star for mrcap1.
7. Labels with collision culling (reuse the priority logic from `GraphCanvas3D`).

## Interactivity

- Click node → `select(node.id)` (existing zustand action) → existing DetailPanel opens.
- Hover → tooltip with label + category.
- Click empty space → clear selection.
- Filters, focus mode, hide-code, TS toggle from `useGraphStore` all apply (reuse `filterGraph`).
- Auto-rotate / orbit toggles are hidden in street view (they don't apply).
- New street-view-only controls in the left sidebar: **Block Size**, **Road Width**, **Show Districts**, **Show Building Labels**.

## Files

**New**
- `src/components/graph/StreetMapCanvas.tsx` — canvas renderer + camera + interactions.
- `src/lib/graph/streetLayout.ts` — deterministic neighborhood/grid layout.
- `src/lib/graph/orthogonalRoute.ts` — Manhattan routing with corner smoothing.
- `src/components/graph/StreetViewControls.tsx` — sidebar section shown only when `view === 'street'`.

**Edited**
- `src/routes/index.tsx` — read `view=street` from search params, mount `StreetMapCanvas`.
- `src/components/graph/TopBar.tsx` — add STREET tab; hide orbit/auto-rotate toggles in street view.
- `src/lib/graph/useGraphStore.ts` — add `view: '2d' | '3d' | 'street'` + street-view-only settings (`blockSize`, `roadWidth`, `showDistricts`, `showStreetLabels`).
- `src/components/graph/LeftSidebar.tsx` — conditionally render `StreetViewControls`.

Nothing in the existing 2D/3D canvases is touched.

## Technical details

- **Layout is O(N) once**; result cached in a `useMemo` keyed by `graph`.
- **Traffic particles**: precompute each road's polyline arc-length table; each frame advance particle `t` by `speed * dt`, sample position with `linkIntensity` scaling count. Cap at ~2000 particles total for perf.
- **Hit testing**: quadtree over node positions in world space; convert click coords via inverse camera transform.
- **Labels**: same screen-space collision approach as `GraphCanvas3D` label loop — sort by priority (selected > hub > degree), place highest first, cull overlaps.
- **Zoom levels**:
  - < 0.4× → only hub names + district shapes visible.
  - 0.4×–1.5× → hub names + top-degree child labels.
  - > 1.5× → all labels attempted.
- **Colors**: reuse `CATEGORY_COLORS`; district fill = hub color at 8% alpha; roads = `#2a2a30` casing + `#3a3a44` surface; highways add `#3DED97` dashed centerline for highlighted paths.
- **Future-proof for new nodes**: layout accepts new nodes without reshuffling existing ones — new children append to the end of their hub's grid; new hubs get placed in the next open ring slot. This keeps the map stable as you add content.

## Open questions

1. **Neighborhoods = hubs only, or also communities?** Two options: (a) one district per `is_hub` node (matches your description literally), or (b) use the existing `community` field so unrelated non-hub clusters also get their own district. I'd default to **(a) hubs = HQs**, and tint each hub's district by its `community` so related hubs read as sharing a borough.
2. **Highways vs streets**: I'll treat links between two hubs as **highways** (thicker, dashed centerline, faster traffic) and everything else as **streets**. OK?
3. **Perf**: how many total nodes today, and expected ceiling? If we're under ~5k, plain 2D canvas is fine. If it might grow past that, I'd add PixiJS behind the same component so it stays 60fps.
4. **PixiJS dependency**: OK to add? It's ~200KB gzipped but pays for itself on large graphs. If you'd rather stay dependency-free, I'll ship pure canvas.
5. **Building icons for hubs**: use the existing hub images (like `mrcap1-coin.png`) as the HQ marker in street view too, or draw a generic HQ glyph? I'd default to using the images — it keeps continuity with 2D/3D.

Once you confirm those (or say "your call on all"), I'll implement.
