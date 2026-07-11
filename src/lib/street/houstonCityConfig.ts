// Houston-inspired city geography for the Street View proof of concept.
// Coordinates use a right-handed 2D world where +x = east, +y = south.
// One world unit ≈ 1 meter; downtown = (0, 0).
//
// This file is data-only: no rendering, no side effects. It is imported by
// `cityLayout.ts` (to place districts, buildings, and roads) and by
// `StreetMapCanvas.tsx` (to draw the highway skeleton). Everything is
// deterministic and covered by tests.

export type Point = { x: number; y: number };

export type HighwayId =
  | "i10"
  | "i45"
  | "us59"
  | "hwy288"
  | "loop610"
  | "beltway8";

export type Highway = {
  id: HighwayId;
  label: string;
  points: Point[]; // polyline in world units
  loop?: boolean; // ring highways (610, Beltway 8)
  tier: "interstate" | "loop";
};

// --- Highway skeleton --------------------------------------------------------
// Not a GIS map — a stylised, recognisably-Houston skeleton. All coords
// are in metres from Downtown. Ring highways are polygons approximated as
// polylines of ~24 vertices each so canvas curves stay smooth after zoom.

function ring(radius: number, ellipse = 1.15, segments = 32): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push({
      x: Math.cos(t) * radius * ellipse,
      y: Math.sin(t) * radius,
    });
  }
  return pts;
}

export const HIGHWAYS: Highway[] = [
  // I-10 East–West, north of Downtown.
  {
    id: "i10",
    label: "I-10",
    tier: "interstate",
    points: [
      { x: -18000, y: -700 },
      { x: -6000, y: -900 },
      { x: 0, y: -800 },
      { x: 6000, y: -700 },
      { x: 18000, y: -400 },
    ],
  },
  // I-45 roughly N–S with a slight kink at Downtown.
  {
    id: "i45",
    label: "I-45",
    tier: "interstate",
    points: [
      { x: -1200, y: -18000 },
      { x: -600, y: -6000 },
      { x: 0, y: 0 },
      { x: 900, y: 6000 },
      { x: 1800, y: 18000 },
    ],
  },
  // US-59 / I-69 SW → NE diagonal through downtown.
  {
    id: "us59",
    label: "US-59 / I-69",
    tier: "interstate",
    points: [
      { x: -14000, y: 12000 },
      { x: -5000, y: 4000 },
      { x: 0, y: 0 },
      { x: 6000, y: -5000 },
      { x: 15000, y: -13000 },
    ],
  },
  // Highway 288 south from Downtown.
  {
    id: "hwy288",
    label: "TX-288",
    tier: "interstate",
    points: [
      { x: 200, y: 0 },
      { x: 400, y: 5000 },
      { x: 600, y: 12000 },
      { x: 800, y: 20000 },
    ],
  },
  { id: "loop610", label: "Loop 610", tier: "loop", loop: true, points: ring(6800) },
  { id: "beltway8", label: "Beltway 8", tier: "loop", loop: true, points: ring(14500, 1.1, 40) },
];

// --- Downtown skyline --------------------------------------------------------
// A recognisable cluster of tall buildings around the origin.
export type DowntownBuilding = {
  id: string;
  label: string;
  offset: Point;
  height: number; // rendered height in world units
  width: number;
  color: string;
  landmark?: boolean;
};

export const DOWNTOWN_BUILDINGS: DowntownBuilding[] = [
  { id: "dt_infinite_ism_tower", label: "Infinite ISM Tower", offset: { x: 0, y: -60 }, height: 340, width: 110, color: "#8ce9ff", landmark: true },
  { id: "dt_mrcap1_plaza", label: "mrcap1.com Plaza", offset: { x: -180, y: 40 }, height: 220, width: 130, color: "#3DED97" },
  { id: "dt_ism_command", label: "ISM Command Center", offset: { x: 180, y: 30 }, height: 180, width: 120, color: "#a78bfa" },
  { id: "dt_mrcap_tower", label: "Mr. CAP Tower", offset: { x: -80, y: 200 }, height: 280, width: 90, color: "#ffd66a" },
  { id: "dt_capism_center", label: "CAPISM Center", offset: { x: 150, y: 220 }, height: 210, width: 100, color: "#ff8fa3" },
  { id: "dt_cap_dist_hq", label: "CAP Distributions HQ", offset: { x: -260, y: 220 }, height: 190, width: 110, color: "#7dd3fc" },
];

// --- Proof-of-concept districts ---------------------------------------------
// `communityId` is the id used by loadGraph's community assignment. If the
// filtered graph has no members for a district, the district still renders
// (empty parcels + landmark) so the map remains legible.
export type DistrictId =
  | "downtown"
  | "suc"
  | "spc"
  | "swishahouse"
  | "mrcap_personal"
  | "cap_distributions";

export type District = {
  id: DistrictId;
  name: string; // project/community name shown on the map — NEVER a Houston neighborhood
  center: Point; // world anchor
  radius: number; // approx. district radius in world units
  color: string;
  accent: string;
  communityId: number | null; // loadGraph community id or null (downtown/synthetic)
  landmark: string; // named landmark drawn as focal building
};

export const DISTRICTS: District[] = [
  {
    id: "downtown",
    name: "Downtown · Infinite ISM",
    center: { x: 0, y: 0 },
    radius: 900,
    color: "#3DED97",
    accent: "#8ce9ff",
    communityId: 200,
    landmark: "Infinite ISM Tower",
  },
  {
    id: "suc",
    name: "Screwed Up Click",
    // South/southwest of Downtown, inside Loop 610.
    center: { x: -3400, y: 3800 },
    radius: 1400,
    color: "#b57bff",
    accent: "#c9a2ff",
    communityId: 208,
    landmark: "DJ Screw Memorial",
  },
  {
    id: "spc",
    name: "South Park Coalition",
    // South/southeast, outside 610 but inside Beltway 8.
    center: { x: 2600, y: 5600 },
    radius: 1500,
    color: "#d4433a",
    accent: "#f2b93b",
    communityId: 207,
    landmark: "SPC Cypher House",
  },
  {
    id: "swishahouse",
    name: "Swisha House",
    // Northside, north of I-10, along I-45N.
    center: { x: 400, y: -5400 },
    radius: 1300,
    color: "#5aa9ff",
    accent: "#f4a300",
    communityId: 209,
    landmark: "Swisha House Studio",
  },
  {
    id: "mrcap_personal",
    name: "Mr. CAP · Personal District",
    // Third Ward / McGregor-inspired, SE of Downtown, inside 610.
    center: { x: 3000, y: 2400 },
    radius: 1200,
    color: "#ffd66a",
    accent: "#ffb347",
    communityId: 203,
    landmark: "McGregor Archive",
  },
  {
    id: "cap_distributions",
    name: "CAP Distributions",
    // Warehouse district — west of Downtown along I-10.
    center: { x: -4200, y: -1500 },
    radius: 1300,
    color: "#7dd3fc",
    accent: "#a5f3fc",
    // Business/creative community (PIMPINTUITIONISM / Creative System).
    communityId: 204,
    landmark: "CAP Distributions Warehouse",
  },
];

export const DISTRICT_BY_ID: Record<DistrictId, District> = DISTRICTS.reduce(
  (acc, d) => {
    acc[d.id] = d;
    return acc;
  },
  {} as Record<DistrictId, District>,
);

export const DISTRICT_BY_COMMUNITY = new Map<number, District>(
  DISTRICTS.filter((d) => d.communityId != null).map((d) => [d.communityId as number, d]),
);

export const DOWNTOWN_ID: DistrictId = "downtown";

// City-scale bounds used by the initial camera fit.
export const CITY_BOUNDS = {
  minX: -20000,
  maxX: 20000,
  minY: -20000,
  maxY: 22000,
};