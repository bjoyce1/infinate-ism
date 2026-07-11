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
  { key: "PERSONAL",  name: "PERSONAL",              short: "PER", color: "#F5D33F", ink: "#1a1408", glow: "rgba(245,211,63,0.35)" },
  { key: "PRODUCT",   name: "PRODUCT / TECHNOLOGY",  short: "PRD", color: "#3DE0C7", ink: "#04211e", glow: "rgba(61,224,199,0.35)" },
  { key: "COMMUNITY", name: "COMMUNITY",             short: "COM", color: "#4A9BFF", ink: "#04162b", glow: "rgba(74,155,255,0.35)" },
  { key: "CONTENT",   name: "CONTENT / CREATIVE",    short: "CNT", color: "#E840D3", ink: "#2a052a", glow: "rgba(232,64,211,0.35)" },
  { key: "BUSINESS",  name: "BUSINESS / VENTURES",   short: "BIZ", color: "#8B7BFF", ink: "#0d0930", glow: "rgba(139,123,255,0.35)" },
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