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
// Ring traced from OpenStreetMap way geometry (WGS84, closed, CCW).
export const MRCAP_PERSONAL_POLYGON: LngLat[] = [
  [-95.343242, 29.706404],
  [-95.344104, 29.703563],
  [-95.343450, 29.700163],
  [-95.343008, 29.699955],
  [-95.342249, 29.699789],
  [-95.341937, 29.699766],
  [-95.341560, 29.699591],
  [-95.341200, 29.699429],
  [-95.340773, 29.699399],
  [-95.340411, 29.699232],
  [-95.340051, 29.699103],
  [-95.339579, 29.698904],
  [-95.339168, 29.698680],
  [-95.338988, 29.698564],
  [-95.338516, 29.698537],
  [-95.338174, 29.698425],
  [-95.337766, 29.698292],
  [-95.335964, 29.701615],
  [-95.334163, 29.704938],
  [-95.334323, 29.705201],
  [-95.334403, 29.705481],
  [-95.334946, 29.706414],
  [-95.335218, 29.706858],
  [-95.335349, 29.707108],
  [-95.335442, 29.707509],
  [-95.335849, 29.708046],
  [-95.336087, 29.708402],
  [-95.336189, 29.708820],
  [-95.336262, 29.708862],
  [-95.336334, 29.708904],
  [-95.336775, 29.708736],
  [-95.337348, 29.708659],
  [-95.337447, 29.708399],
  [-95.338014, 29.708334],
  [-95.338408, 29.708156],
  [-95.338769, 29.708005],
  [-95.339011, 29.707766],
  [-95.340429, 29.707320],
  [-95.341106, 29.707020],
  [-95.342772, 29.706318],
  [-95.343138, 29.706296],
  [-95.343242, 29.706404],
];

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
    // Centroid of MRCAP_PERSONAL_POLYGON.
    center: [-95.339223, 29.703617],
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