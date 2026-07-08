## Solar System Layout for the 2D Graph

Rework the 2D graph so it reads like the reference solar-system diagram: the mrcap1.com hub is the "Sun" in the lower-left, main (image/hub) nodes sit on labeled concentric orbit rings arcing outward, and their spawn children cluster near their parent planet.

### Visual model

```text
                                             . Pluto-ring
                                     .  Neptune-ring
                       . Uranus-ring
              . Saturn-ring (with satellites clustered around it)
       . Jupiter-ring
   . Earth/Mars/Venus/Mercury inner rings
[SUN]  ← mrcap1.com hub, anchored lower-left
```

- Hub soft-pinned near the lower-left corner of the viewport (Sun position).
- Every "main" node (`is_hub || image`) is assigned to an orbit ring by degree/importance rank; ring radius grows with rank.
- Each planet is placed at an angle in the upper-right arc (roughly 0°–90°, i.e. up and to the right of the Sun), spaced evenly so labels don't collide.
- Faint concentric orbit arcs are drawn behind the nodes for the solar-system look.
- Spawn children of each planet cluster in a tight local swarm around that planet (small radial jitter), keeping their existing edges.
- A subtle asteroid-belt band of star dots between two chosen rings for flavor (purely decorative canvas draw).

### Forces

- Replace the current centroid-clustering force with a **ring force** that pulls each main node toward its assigned `(ringRadius, angle)` polar target.
- Child (non-main) nodes get a **parent-attraction force** pulling them toward their primary parent planet, plus mild jitter so they form a halo instead of a dot.
- Keep existing link/charge/collide forces but reduce link strength between main nodes on different rings so rings stay legible.
- Respect the existing `orbitLayout` toggle (off → current free-drift layout untouched) and the `layoutSeed` (deterministic angle/jitter).

### Controls

Add to the Left Sidebar under Force Layout:
- **Ring spacing** slider (multiplier on ring radius).
- **Sun angle spread** slider (arc width used for planet placement, default 90°).
- **Child halo radius** slider (how tightly spawns hug their planet).

### Files to change

- `src/lib/graph/useGraphStore.ts` — add `ringSpacing`, `sunArcSpread`, `childHaloRadius` state + setters, include in `resetForceParams`.
- `src/components/graph/GraphCanvas.tsx` — new seeding pass (assign ring + angle per main node, place children around parent), new `ringForce` + `parentAttractForce` replacing `clusterForce`, decorative orbit-arc + asteroid-belt draw via `onRenderFramePre`.
- `src/components/graph/LeftSidebar.tsx` — three new sliders in the Force Layout group.

### Out of scope

- 3D view and Street View are untouched.
- No node data changes; only layout + rendering rules.
