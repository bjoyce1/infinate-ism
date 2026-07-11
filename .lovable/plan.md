## Goal

Turn the Mr. CAP Personal District from a symmetric rectangle around `[-95.3520, 29.7220]` into an irregular polygon whose edges follow the actual road geometry of:

- Calhoun Rd (west edge)
- Old Spanish Trail / OST (north edge)
- Martin Luther King Blvd (east edge)
- Griggs Rd (south edge)

All Personal District properties/nodes must sit inside that real polygon, and every road/link drawn from those nodes must originate at each node's true coordinate inside it.

## Files to change

1. `src/lib/street/houstonGeoConfig.ts`
   - Remove the `polyAround(...)` call for `mrcap_personal`.
   - Add a new exported constant `MRCAP_PERSONAL_POLYGON: LngLat[]` containing a hand-traced ring (~30–60 vertices) that follows the four named streets. Coordinates sourced from OpenStreetMap (Overpass) way geometry for:
     - Calhoun Rd between OST and Griggs
     - OST between Calhoun and MLK
     - MLK Blvd between OST and Griggs
     - Griggs Rd between MLK and Calhoun
     Ring is closed (first == last), WGS84 `[lon, lat]`, wound counter-clockwise.
   - Recompute `center` as the polygon centroid (or a labeled anchor inside it) and set a `radius` that matches the polygon's inradius so downstream code using `radius` still behaves.
   - Keep `id`, `name`, `communityId`, `color`, `accent`, `landmark` unchanged so existing wiring keeps working.

2. `src/lib/street/geoCityModel.ts`
   - `scatterCoord()` currently derives placement from a district's axis-aligned bounding rectangle, which will push points outside a non-rectangular polygon.
   - Add a small helper `pointInPolygon(coord, ring)` (standard ray-cast).
   - Replace the bbox math with:
     - Compute the polygon bbox once per district.
     - Sample a candidate inside that bbox using the existing deterministic hash-based angle/radius (so layout stays stable per node id).
     - Reject-and-retry (bounded, e.g. 12 attempts with jittered seed) until the candidate is inside `dist.polygon`; on final failure, snap to the polygon centroid.
   - The landmark/hub still anchors at `dist.center`, which is now guaranteed to be inside the polygon.
   - No change to road generation: roads already use each property's final `coord`, so once properties are inside the polygon, `fromCoord` / `toCoord` for every link automatically originate at real in-district positions.

3. `src/components/graph/StreetMapCanvas.tsx`
   - No behavioral change required — the district GeoJSON overlay reads `district.polygon` directly, so the new irregular ring renders as-is (dashed boundary + fill).
   - Verify the polygon source uses the ring verbatim (no `polyAround`-style regeneration) and that the "jump to district" fit-bounds call recomputes bounds from the new polygon extent, not from `center ± radius`.

4. `src/lib/street/__tests__/geoCityModel.test.ts`
   - Add one test: every property with `districtId === "mrcap_personal"` must satisfy `pointInPolygon(prop.coord, MRCAP_PERSONAL_POLYGON)`.
   - Keep existing tests green (downtown skyline, secondary properties, gold routes).

## Coordinate sourcing

Pull the four road centerlines from OpenStreetMap via an Overpass query at build/plan time (offline capture, not a runtime dependency), then hand-stitch them into one closed ring at their intersections:

- Calhoun Rd ∩ OST (NW corner)
- OST ∩ MLK Blvd (NE corner)
- MLK Blvd ∩ Griggs Rd (SE corner)
- Griggs Rd ∩ Calhoun Rd (SW corner)

Densify each edge with the intermediate OSM way nodes so the outline is visibly irregular, not four straight segments. Target ~40 vertices total.

## Non-goals

- No change to other districts' shapes.
- No change to marker icons, colors, or the `PropertyInstance` shape.
- No change to how "same-owner gold routes" are computed.
- No new npm dependencies (`pointInPolygon` is ~10 lines inline).

## Acceptance

- `mrcap_personal` overlay on the map visibly follows Calhoun / OST / MLK / Griggs and is not a rectangle.
- Every Personal District marker sits inside the new polygon; zero markers land on or outside the four boundary streets.
- Links from Personal District nodes start exactly at each marker's coordinate.
- All existing Street View tests pass; the new containment test passes.
