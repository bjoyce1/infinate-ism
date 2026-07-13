## Goal

On the Street View, replace straight-line connections between properties with routes that follow the actual Houston street network, then animate glowing particles flowing along those routes.

## Approach

Use OSRM's public routing API (`https://router.project-osrm.org/route/v1/driving/{coords}?geometries=geojson&overview=full`) to convert every road pair (from `city.roads`) into a real street-following polyline. Cache results in-memory (Map keyed by `fromCoord|toCoord`) and in `localStorage` (`ism.streetRoutes.v1`) so we only hit OSRM once per unique pair.

Fallback: if OSRM fails or is rate-limited, fall back to the current straight line for that pair so nothing disappears.

## File changes

1. **New `src/lib/street/routeStreets.ts`**
   - `fetchStreetRoute(from: LngLat, to: LngLat): Promise<LngLat[]>` — memoised + localStorage-cached OSRM call.
   - `resolveRoutes(roads: CityRoad[]): Promise<Map<roadId, LngLat[]>>` — batches with small concurrency (e.g. 6 parallel), skips duplicates, returns straight-line fallback on error.
   - No new npm dep.

2. **`src/components/graph/StreetMapCanvas.tsx`**
   - After building `city`, kick off `resolveRoutes(city.roads)` in an effect; store resulting geometry in a ref/state keyed by roadId.
   - `updateRoads` writes each feature's `LineString` as the resolved route (fallback to `[fromCoord, toCoord]` while pending).
   - Add a **particle flow layer**:
     - New GeoJSON source `ism-particles` populated on a `requestAnimationFrame` loop.
     - Each active road (bridge + sameOwner) emits 2–3 particles animated along its polyline using `@turf/along`-style linear interpolation (implemented inline over the polyline segments — no dep needed).
     - Rendered as a `circle` layer with additive glow: `circle-color` matching tier (`#a78bfa` bridges, `#ffd66a` same-owner), `circle-radius` ~3–4 px, `circle-blur` 0.8, `circle-opacity` fading in/out along the trajectory.
     - Rendered above roads, below markers.
   - RAF ticker updates particle positions ~30fps; clean up on unmount and on view change.
   - Selected sameOwner routes get more/brighter particles.

3. **No other files touched.** Route metadata, tests, and district geometry are untouched.

## Technical notes

- `polyline distance` and `along` implemented as ~30 lines of pure JS (haversine per segment, walk cumulative length). Keeps bundle small.
- Cache key rounds coordinates to 5 decimals so tiny numerical drift doesn't miss the cache.
- Concurrency limit prevents OSRM 429s on first load with hundreds of roads.
- Particle animation pauses when the tab is hidden (`document.visibilityState`).

## Acceptance

- Bridge and same-owner connections visibly bend along Houston streets, not straight through buildings.
- Small glowing dots continuously travel along each route from source to destination.
- Selected node's owner routes glow gold with denser particles.
- First render still shows straight lines while OSRM resolves, then smoothly upgrades to real routes.
- No new dependencies; existing Street View tests remain green.
