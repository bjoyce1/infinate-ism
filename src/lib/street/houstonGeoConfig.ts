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
    // Third Ward / McGregor Park side, SE of Downtown.
    center: [-95.3520, 29.7220],
    radius: 1600,
    color: "#ffd66a",
    accent: "#ffb347",
    communityId: 203,
    landmark: "McGregor Archive",
    polygon: polyAround([-95.3520, 29.7220], 0.020, 0.016),
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