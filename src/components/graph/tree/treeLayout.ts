import {
  CANVAS_W,
  DEPARTMENTS,
  JUNCTION_POS,
  ROOT_POS,
  ZONES,
  type DensityMode,
  type DeptKey,
  type LaidOut,
  type TreeDatum,
  type Zone,
} from "./treeTypes";
import type { Taxonomy } from "./treeTaxonomy";

// Deterministic hash → [0,1)
export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export const DEFAULT_PAGE_SIZE = {
  community: 6,   // communities visible per department before cluster
  subhub: 5,      // subhubs visible per community before cluster
  leaf: 12,       // leaves visible per subhub before cluster
} as const;

/** Progressive-disclosure state kept in the component. */
export type DiscloseState = {
  /** Hub id → how many child pages have been revealed (>=1 means expanded). */
  pages: Map<string, number>;
  /** Explicitly expanded (visible children at all) hubs. */
  expanded: Set<string>;
};

export type LayoutInput = {
  taxonomy: Taxonomy;
  disclose: DiscloseState;
  density: DensityMode;
};

export type LayoutResult = {
  laid: LaidOut[];
  byId: Map<string, LaidOut>;
  links: Array<{ source: LaidOut; target: LaidOut }>;
  rootPos: { x: number; y: number };
  junctionPos: { x: number; y: number };
};

function pageSizeFor(kind: TreeDatum["kind"]): number {
  if (kind === "department") return DEFAULT_PAGE_SIZE.community;
  if (kind === "community") return DEFAULT_PAGE_SIZE.subhub;
  if (kind === "subhub") return DEFAULT_PAGE_SIZE.leaf;
  return 999;
}

/** How many children are currently revealed for a given hub. */
export function visibleCount(hub: TreeDatum, disclose: DiscloseState, density: DensityMode): number {
  const total = hub.children?.length ?? 0;
  if (!total) return 0;
  if (density === "expanded") return total;
  const pages = disclose.pages.get(hub.id) ?? 0;
  if (pages === 0 && density === "overview") return 0;
  if (pages === 0 && density === "standard") {
    // Standard shows first page of communities always, subhubs+leaves only when hub explicitly expanded.
    if (hub.kind === "department") return Math.min(total, pageSizeFor(hub.kind));
    return 0;
  }
  const per = pageSizeFor(hub.kind);
  return Math.min(total, per * Math.max(1, pages));
}

/** Which page a given child index falls on (1-based). */
export function pageOfChild(hub: TreeDatum, childIndex: number): number {
  const per = pageSizeFor(hub.kind);
  return Math.floor(childIndex / per) + 1;
}

/** Deterministically place child hubs inside a bbox with jitter. */
function packInZone(
  parent: LaidOut,
  zone: Zone,
  children: TreeDatum[],
  seedSalt: number,
  outLaid: LaidOut[],
  outById: Map<string, LaidOut>,
  outLinks: LayoutResult["links"],
) {
  const n = children.length;
  if (!n) return;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (zone.w / Math.max(1, zone.h)))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = zone.w / cols;
  const cellH = zone.h / rows;
  children.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jx = (hash01(c.id, seedSalt) - 0.5) * cellW * 0.35;
    const jy = (hash01(c.id, seedSalt + 1) - 0.5) * cellH * 0.35;
    const cx = zone.x + cellW * (col + 0.5) + jx;
    const cy = zone.y + cellH * (row + 0.5) + jy;
    const l: LaidOut = { data: c, x: cx, y: cy, parent };
    outLaid.push(l);
    outById.set(c.id, l);
    outLinks.push({ source: parent, target: l });
  });
}

/** Fan children radially around a parent, aimed outward from canvas center. */
function fanAroundParent(
  parent: LaidOut,
  children: TreeDatum[],
  radius: number,
  arc: number,
  seedSalt: number,
  outLaid: LaidOut[],
  outById: Map<string, LaidOut>,
  outLinks: LayoutResult["links"],
) {
  const n = children.length;
  if (!n) return;
  // Point arc outward from canvas center of gravity for that quadrant.
  const cx = CANVAS_W / 2;
  const cy = 900; // rough canvas midline
  const outward = Math.atan2(parent.y - cy, parent.x - cx);
  const start = outward - arc / 2;
  const step = n === 1 ? 0 : arc / (n - 1);
  children.forEach((c, i) => {
    const angle = start + step * i + (hash01(c.id, seedSalt) - 0.5) * 0.05;
    const lx = parent.x + Math.cos(angle) * radius;
    const ly = parent.y + Math.sin(angle) * radius;
    const l: LaidOut = { data: c, x: lx, y: ly, parent };
    outLaid.push(l);
    outById.set(c.id, l);
    outLinks.push({ source: parent, target: l });
  });
}

/**
 * Poster-inspired anchored layout.
 *   root (600,1690) → junction (600,1560) → 5 department anchors → sub-zones.
 *
 * Departments live in fixed macro-zones matching the reference silhouette.
 * Progressive disclosure is applied here — hidden children remain in the
 * taxonomy but are not laid out. Each hub that has hidden children gains a
 * synthetic "+N more" cluster laid out beside its last visible child.
 */
export function layoutTree({ taxonomy, disclose, density }: LayoutInput): LayoutResult {
  const laid: LaidOut[] = [];
  const byId = new Map<string, LaidOut>();
  const links: LayoutResult["links"] = [];

  const root = taxonomy.root;
  const rootLaid: LaidOut = { data: root, x: ROOT_POS.x, y: ROOT_POS.y };
  laid.push(rootLaid);
  byId.set(root.id, rootLaid);

  const junction: TreeDatum = {
    id: "junction:main",
    label: "",
    kind: "cluster",
    dept: "PRODUCT",
    color: "#8fa8a2",
  };
  const junctionLaid: LaidOut = { data: junction, x: JUNCTION_POS.x, y: JUNCTION_POS.y, parent: rootLaid };
  laid.push(junctionLaid);
  byId.set(junction.id, junctionLaid);
  links.push({ source: rootLaid, target: junctionLaid });

  const emitCluster = (parent: LaidOut, hidden: number, hiddenTotal: number) => {
    const c: TreeDatum = {
      id: `cluster:${parent.data.id}`,
      label: `+${hidden} more`,
      kind: "cluster",
      dept: parent.data.dept,
      color: parent.data.color,
      count: hiddenTotal,
    };
    // Place cluster near parent, offset by hash.
    const angle = hash01(parent.data.id, 42) * Math.PI * 2;
    const r = 42;
    const lx = parent.x + Math.cos(angle) * r;
    const ly = parent.y + Math.sin(angle) * r;
    const l: LaidOut = { data: c, x: lx, y: ly, parent };
    laid.push(l);
    byId.set(c.id, l);
    links.push({ source: parent, target: l });
  };

  for (const spec of DEPARTMENTS) {
    const deptDatum = taxonomy.index.get(`dept:${spec.key}`)!;
    const anchor = ZONES[spec.key].anchor;
    const deptLaid: LaidOut = { data: deptDatum, x: anchor.x, y: anchor.y, parent: junctionLaid };
    laid.push(deptLaid);
    byId.set(deptDatum.id, deptLaid);
    links.push({ source: junctionLaid, target: deptLaid });

    const commTotal = deptDatum.children?.length ?? 0;
    const commVisible = visibleCount(deptDatum, disclose, density);
    if (!commVisible) continue;
    const commList = (deptDatum.children ?? []).slice(0, commVisible);

    // Communities packed inside the department zone (minus space at the anchor edge).
    const zone = ZONES[spec.key];
    const isUpper = zone.y < 500;
    const packZone: Zone = isUpper
      ? { x: zone.x, y: zone.y, w: zone.w, h: Math.max(120, zone.h - 120), anchor: zone.anchor }
      : { x: zone.x, y: zone.y, w: zone.w, h: Math.max(120, zone.h - 120), anchor: zone.anchor };
    packInZone(deptLaid, packZone, commList, hashSalt(spec.key, "comm"), laid, byId, links);
    if (commVisible < commTotal) {
      emitCluster(deptLaid, commTotal - commVisible, commTotal);
    }

    for (const comm of commList) {
      const commLaid = byId.get(comm.id)!;
      const subTotal = comm.children?.length ?? 0;
      const subVisible = visibleCount(comm, disclose, density);
      if (!subVisible) continue;
      const subs = (comm.children ?? []).slice(0, subVisible);
      // Subhubs fan around the community, radius scaled by zone.
      const subRadius = Math.min(120, Math.max(60, Math.min(zone.w, zone.h) / 6));
      const arc = Math.min(Math.PI * 1.4, Math.max(Math.PI * 0.6, subs.length * 0.35));
      fanAroundParent(commLaid, subs, subRadius, arc, hashSaltStr(comm.id, "sub"), laid, byId, links);
      if (subVisible < subTotal) emitCluster(commLaid, subTotal - subVisible, subTotal);

      for (const sub of subs) {
        const subLaid = byId.get(sub.id)!;
        const leafTotal = sub.children?.length ?? 0;
        const leafVisible = visibleCount(sub, disclose, density);
        if (!leafVisible) continue;
        const leaves = (sub.children ?? []).slice(0, leafVisible);
        const leafRadius = 55 + Math.min(30, leaves.length * 2);
        const leafArc = Math.min(Math.PI * 1.6, Math.max(Math.PI * 0.7, leaves.length * 0.28));
        fanAroundParent(subLaid, leaves, leafRadius, leafArc, hashSaltStr(sub.id, "leaf"), laid, byId, links);
        if (leafVisible < leafTotal) emitCluster(subLaid, leafTotal - leafVisible, leafTotal);
      }
    }
  }

  return { laid, byId, links, rootPos: { ...ROOT_POS }, junctionPos: { ...JUNCTION_POS } };
}

function hashSalt(k: DeptKey, tag: string): number {
  let h = 0;
  const s = k + ":" + tag;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
function hashSaltStr(id: string, tag: string): number {
  return hashSalt("PRODUCT", id + ":" + tag);
}

/** Return the pages required so a specific descendant becomes visible. */
export function pagesToReveal(
  taxonomy: Taxonomy,
  targetId: string,
): Map<string, number> {
  const need = new Map<string, number>();
  let cur = taxonomy.parentOf.get(targetId);
  let child = targetId;
  while (cur) {
    const kids = taxonomy.childrenOf.get(cur) ?? [];
    const idx = kids.indexOf(child);
    if (idx >= 0) {
      const parent = taxonomy.index.get(cur)!;
      const per = pageSizeFor(parent.kind);
      const needed = Math.floor(idx / per) + 1;
      need.set(cur, Math.max(need.get(cur) ?? 0, needed));
    }
    child = cur;
    cur = taxonomy.parentOf.get(cur);
  }
  return need;
}