import type { GraphNode } from "@/lib/graph/types";

export type DeptKey =
  | "PERSONAL"
  | "PRODUCT"
  | "COMMUNITY"
  | "CONTENT"
  | "BUSINESS";

export type DeptSpec = {
  key: DeptKey;
  name: string;
  short: string;
  color: string;      // trunk & pill color
  ink: string;        // text on pill
  glow: string;       // soft glow ring
};

export const DEPARTMENTS: DeptSpec[] = [
  { key: "PERSONAL",  name: "PERSONAL",              short: "PER", color: "#F5D33F", ink: "#2a1e00", glow: "rgba(245,211,63,0.35)" },
  { key: "PRODUCT",   name: "PRODUCT / TECHNOLOGY",  short: "PRD", color: "#3DE0C7", ink: "#032822", glow: "rgba(61,224,199,0.35)" },
  { key: "COMMUNITY", name: "COMMUNITY",             short: "COM", color: "#4A9BFF", ink: "#04162b", glow: "rgba(74,155,255,0.35)" },
  { key: "CONTENT",   name: "CONTENT / CREATIVE",    short: "CNT", color: "#E840D3", ink: "#f7dbf3", glow: "rgba(232,64,211,0.35)" },
  { key: "BUSINESS",  name: "BUSINESS / VENTURES",   short: "BIZ", color: "#8B7BFF", ink: "#e7e2ff", glow: "rgba(139,123,255,0.35)" },
];

export const DEPT_COLOR: Record<DeptKey, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.key, d.color]),
) as Record<DeptKey, string>;

export type TreeKind =
  | "root"
  | "department"
  | "community"
  | "subhub"
  | "leaf"
  | "cluster";

export type TreeDatum = {
  id: string;
  label: string;
  kind: TreeKind;
  dept: DeptKey;
  color: string;
  depth?: number;
  count?: number;             // for cluster placeholders
  weight?: number;            // importance
  node?: GraphNode;           // leaf backing node
  meta?: { community?: number; source?: string; category?: string };
  children?: TreeDatum[];
};

export type LaidOut = {
  data: TreeDatum;
  x: number;
  y: number;
  parent?: LaidOut;
};

export type DensityMode = "overview" | "standard" | "expanded";

/** Fixed poster-inspired anchor zones on the 1200×1800 logical canvas. */
export type Zone = { x: number; y: number; w: number; h: number; anchor: { x: number; y: number } };

export const ROOT_POS = { x: 600, y: 1690 };
export const JUNCTION_POS = { x: 600, y: 1560 };

export const ZONES: Record<DeptKey, Zone> = {
  PRODUCT:   { x: 80,  y: 650,  w: 420, h: 850, anchor: { x: 300,  y: 1490 } },
  COMMUNITY: { x: 520, y: 650,  w: 410, h: 850, anchor: { x: 720,  y: 1490 } },
  BUSINESS:  { x: 880, y: 720,  w: 260, h: 790, anchor: { x: 1010, y: 1500 } },
  PERSONAL:  { x: 40,  y: 120,  w: 610, h: 730, anchor: { x: 340,  y: 830  } },
  CONTENT:   { x: 650, y: 120,  w: 510, h: 730, anchor: { x: 900,  y: 830  } },
};

export const CANVAS_W = 1200;
export const CANVAS_H = 1800;