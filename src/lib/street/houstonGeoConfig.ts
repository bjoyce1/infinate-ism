// Real-world geographic anchors for the Street View map.
// All coordinates are [longitude, latitude] in WGS84.
// Downtown Houston reference: -95.3698, 29.7604.

export type LngLat = [number, number];

export type DistrictId =
  | "downtown"
  | "suc"
  | "spc"
  | "swishahouse"
  | "mrcap_personal"
  | "cap_distributions";

export type GeoDistrict = {
  id: DistrictId;
  name: string; // Infinite ISM project name — never a real Houston neighborhood
  center: LngLat;
  /** rough parcel radius in metres */
  radius: number;
  color: string;
  accent: string;
  communityId: number | null;
  landmark: string;
  /** GeoJSON polygon (single ring) enclosing the district */
  polygon: LngLat[];
};

function polyAround(center: LngLat, halfW: number, halfH: number): LngLat[] {
  const [lon, lat] = center;
  return [
    [lon - halfW, lat - halfH],
    [lon + halfW, lat - halfH],
    [lon + halfW, lat + halfH],
    [lon - halfW, lat + halfH],
    [lon - halfW, lat - halfH],
  ];
}

export const DOWNTOWN_ID: DistrictId = "downtown";

export const HOUSTON_CENTER: LngLat = [-95.3698, 29.7604];

export const CITY_BOUNDS: [LngLat, LngLat] = [
  [-95.75, 29.55], // SW
  [-95.05, 29.95], // NE
];

// Mr. CAP Personal District: real street-bounded block enclosed by
// Calhoun Rd (W), Old Spanish Trail (N), MLK Blvd (E) and Griggs Rd (S).
// Ring traced from OpenStreetMap way geometry for all four boundary roads
// (WGS84, closed, CCW). Corridor corners:
//   SW = Calhoun ∩ Griggs   (~-95.3460, 29.7009)
//   NW = Calhoun ∩ OST      (~-95.3435, 29.7060)
//   NE = OST     ∩ MLK      (~-95.3367, 29.7089)
//   SE = MLK     ∩ Griggs   (~-95.3367, 29.6980)
export const MRCAP_PERSONAL_POLYGON: LngLat[] = [
  [-95.346040, 29.700900],
  [-95.345795, 29.700892],
  [-95.345490, 29.700795],
  [-95.345197, 29.700704],
  [-95.344861, 29.700614],
  [-95.344476, 29.700514],
  [-95.343450, 29.700163],
  [-95.343008, 29.699955],
  [-95.342178, 29.699792],
  [-95.341841, 29.699735],
  [-95.341531, 29.699568],
  [-95.341139, 29.699422],
  [-95.340773, 29.699399],
  [-95.340411, 29.699232],
  [-95.340144, 29.699115],
  [-95.339693, 29.698953],
  [-95.339419, 29.698811],
  [-95.339040, 29.698619],
  [-95.338516, 29.698537],
  [-95.338174, 29.698425],
  [-95.337784, 29.698248],
  [-95.337634, 29.698098],
  [-95.337374, 29.698166],
  [-95.336813, 29.697909],
  [-95.336670, 29.697950],
  [-95.336610, 29.698102],
  [-95.336475, 29.698543],
  [-95.336387, 29.698855],
  [-95.336138, 29.699548],
  [-95.335818, 29.700268],
  [-95.335571, 29.700624],
  [-95.335440, 29.700991],
  [-95.335539, 29.701082],
  [-95.335439, 29.701524],
  [-95.335146, 29.701893],
  [-95.334992, 29.702357],
  [-95.334875, 29.702649],
  [-95.334785, 29.702872],
  [-95.334631, 29.703255],
  [-95.334410, 29.704043],
  [-95.334226, 29.704268],
  [-95.334267, 29.704580],
  [-95.334288, 29.704963],
  [-95.334457, 29.705336],
  [-95.334423, 29.705522],
  [-95.334950, 29.706348],
  [-95.335115, 29.706665],
  [-95.335281, 29.707048],
  [-95.335442, 29.707509],
  [-95.335849, 29.708046],
  [-95.336008, 29.708358],
  [-95.336193, 29.708725],
  [-95.336720, 29.708880],
  [-95.336826, 29.708717],
  [-95.337348, 29.708659],
  [-95.337447, 29.708399],
  [-95.337885, 29.708396],
  [-95.338143, 29.708271],
  [-95.338408, 29.708156],
  [-95.338606, 29.708070],
  [-95.338972, 29.707852],
  [-95.340370, 29.707391],
  [-95.340459, 29.707285],
  [-95.341106, 29.707020],
  [-95.342772, 29.706318],
  [-95.343138, 29.706296],
  [-95.343436, 29.706182],
  [-95.343560, 29.706010],
  [-95.343588, 29.705949],
  [-95.343722, 29.705611],
  [-95.343841, 29.705316],
  [-95.343915, 29.705129],
  [-95.344238, 29.704373],
  [-95.344354, 29.704088],
  [-95.344459, 29.703827],
  [-95.344573, 29.703513],
  [-95.344926, 29.702646],
  [-95.345190, 29.702014],
  [-95.345277, 29.701794],
  [-95.345467, 29.701359],
  [-95.345499, 29.701280],
  [-95.345656, 29.700906],
  [-95.346040, 29.700900],
];

/** Shoelace centroid of a closed ring (first == last). */
function ringCentroid(ring: LngLat[]): LngLat {
  let A = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cr = x0 * y1 - x1 * y0;
    A += cr;
    cx += (x0 + x1) * cr;
    cy += (y0 + y1) * cr;
  }
  A /= 2;
  return [cx / (6 * A), cy / (6 * A)];
}

export const MRCAP_PERSONAL_CENTROID: LngLat = ringCentroid(MRCAP_PERSONAL_POLYGON);

export const GEO_DISTRICTS: GeoDistrict[] = [
  {
    id: "downtown",
    name: "Downtown · Infinite ISM",
    center: [-95.3630, 29.7605],
    radius: 900,
    color: "#3DED97",
    accent: "#8ce9ff",
    communityId: 200,
    landmark: "Infinite ISM Tower",
    polygon: polyAround([-95.3630, 29.7605], 0.013, 0.010),
  },
  {
    id: "suc",
    name: "Screwed Up Click",
    // South/southwest — near Screwed Up Records & Tapes territory (S. Main / Fuqua).
    center: [-95.4380, 29.6420],
    radius: 2200,
    color: "#b57bff",
    accent: "#c9a2ff",
    communityId: 208,
    landmark: "DJ Screw Memorial",
    polygon: polyAround([-95.4380, 29.6420], 0.028, 0.020),
  },
  {
    id: "spc",
    name: "South Park Coalition",
    // South/southeast — Sunnyside / South Park side.
    center: [-95.3480, 29.6580],
    radius: 2200,
    color: "#d4433a",
    accent: "#f2b93b",
    communityId: 207,
    landmark: "SPC Cypher House",
    polygon: polyAround([-95.3480, 29.6580], 0.028, 0.020),
  },
  {
    id: "swishahouse",
    name: "Swisha House",
    // Northside — along I-45 N.
    center: [-95.4010, 29.8620],
    radius: 2400,
    color: "#5aa9ff",
    accent: "#f4a300",
    communityId: 209,
    landmark: "Swisha House Studio",
    polygon: polyAround([-95.4010, 29.8620], 0.030, 0.022),
  },
  {
    id: "mrcap_personal",
    name: "Mr. CAP · Personal District",
    // Real street-bounded block: Calhoun (W), OST (N), MLK (E), Griggs (S).
    // Center is the polygon's shoelace centroid so labels / focus sit inside it.
    center: MRCAP_PERSONAL_CENTROID,
    radius: 700,
    color: "#ffd66a",
    accent: "#ffb347",
    communityId: 203,
    landmark: "McGregor Archive",
    polygon: MRCAP_PERSONAL_POLYGON,
  },
  {
    id: "cap_distributions",
    name: "CAP Distributions",
    // Warehouse belt west of Downtown along I-10.
    center: [-95.4200, 29.7780],
    radius: 1800,
    color: "#7dd3fc",
    accent: "#a5f3fc",
    communityId: 204,
    landmark: "CAP Distributions Warehouse",
    polygon: polyAround([-95.4200, 29.7780], 0.024, 0.016),
  },
];

export const DISTRICT_BY_ID: Record<DistrictId, GeoDistrict> = GEO_DISTRICTS.reduce(
  (acc, d) => {
    acc[d.id] = d;
    return acc;
  },
  {} as Record<DistrictId, GeoDistrict>,
);

export const DISTRICT_BY_COMMUNITY = new Map<number, GeoDistrict>(
  GEO_DISTRICTS.filter((d) => d.communityId != null).map(
    (d) => [d.communityId as number, d],
  ),
);

// --- Downtown skyline — real-ish downtown lots ---
export type DowntownBuilding = {
  id: string;
  label: string;
  coord: LngLat;
  height: number; // metres
  color: string;
  landmark?: boolean;
};

export const DOWNTOWN_BUILDINGS: DowntownBuilding[] = [
  { id: "dt_infinite_ism_tower", label: "Infinite ISM Tower", coord: [-95.3620, 29.7605], height: 340, color: "#8ce9ff", landmark: true },
  { id: "dt_mrcap1_plaza",       label: "mrcap1.com Plaza",   coord: [-95.3665, 29.7620], height: 220, color: "#3DED97" },
  { id: "dt_ism_command",        label: "ISM Command Center", coord: [-95.3595, 29.7593], height: 180, color: "#a78bfa" },
  { id: "dt_mrcap_tower",        label: "Mr. CAP Tower",      coord: [-95.3644, 29.7581], height: 280, color: "#ffd66a" },
  { id: "dt_capism_center",      label: "CAPISM Center",      coord: [-95.3608, 29.7638], height: 210, color: "#ff8fa3" },
  { id: "dt_cap_dist_hq",        label: "CAP Distributions HQ", coord: [-95.3676, 29.7590], height: 190, color: "#7dd3fc" },
];