import type { DensityMode, LaidOut, TreeDatum } from "./treeTypes";
import { DEPARTMENTS } from "./treeTypes";

// Deterministic hash → [0,1)
function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

type LayoutInput = {
  root: TreeDatum;
  width: number;
  height: number;
  expanded: Set<string>;       // hub ids user has expanded
  density: DensityMode;
};

export type LayoutResult = {
  laid: LaidOut[];
  byId: Map<string, LaidOut>;
  links: Array<{ source: LaidOut; target: LaidOut }>;
  rootPos: { x: number; y: number };
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

/**
 * Anchored dendrogram, bottom-up. Departments occupy horizontal bands whose
 * widths scale with member count. Each subtree is laid out in-band with a
 * seeded jitter so the silhouette feels organic instead of gridded.
 */
export function layoutTree({ root, width, height, expanded, density }: LayoutInput): LayoutResult {
  const laid: LaidOut[] = [];
  const byId = new Map<string, LaidOut>();
  const links: Array<{ source: LaidOut; target: LaidOut }> = [];

  // Layered vertical positions (bottom-up).
  const rootY = height - 90;
  const deptY = Math.max(rootY - 220, height * 0.62);
  const commY = Math.max(deptY - 210, height * 0.42);
  const subhubY0 = Math.max(commY - 180, height * 0.26);
  const leafY0 = Math.max(subhubY0 - 160, height * 0.13);

  const rootPos = { x: width / 2, y: rootY };

  // Show subhubs/leaves based on density + explicit expansion.
  const showSubhubs = density !== "overview";
  const showLeavesAll = density === "expanded";

  // Compute weighted widths per department.
  const totalWeight = (root.children ?? []).reduce((s, d) => s + Math.max(1, d.count ?? 1), 0) || 1;
  const padX = 40;
  const usableW = width - padX * 2;

  const rootLaid: LaidOut = { data: root, x: rootPos.x, y: rootPos.y };
  laid.push(rootLaid);
  byId.set(root.id, rootLaid);

  let cursorX = padX;
  const depts = root.children ?? [];

  depts.forEach((dept, di) => {
    const w = usableW * (Math.max(1, dept.count ?? 1) / totalWeight);
    const bandCenter = cursorX + w / 2;
    cursorX += w;

    // Small seeded offset for organic dept placement.
    const jitter = (hash01(dept.id, 1) - 0.5) * Math.min(30, w * 0.05);
    const deptLaid: LaidOut = {
      data: dept,
      x: bandCenter + jitter,
      y: deptY + (hash01(dept.id, 2) - 0.5) * 20,
      parent: rootLaid,
    };
    laid.push(deptLaid);
    byId.set(dept.id, deptLaid);
    links.push({ source: rootLaid, target: deptLaid });

    // Community children (spread across the band).
    const comms = dept.children ?? [];
    if (!comms.length) return;
    const commPadX = Math.min(40, w * 0.08);
    const commUsable = Math.max(120, w - commPadX * 2);
    const commStep = commUsable / Math.max(1, comms.length);

    comms.forEach((comm, ci) => {
      const cx = cursorX - w + commPadX + commStep * (ci + 0.5);
      const cy = commY + (hash01(comm.id, 3) - 0.5) * 40;
      const commLaid: LaidOut = { data: comm, x: cx, y: cy, parent: deptLaid };
      laid.push(commLaid);
      byId.set(comm.id, commLaid);
      links.push({ source: deptLaid, target: commLaid });

      const isCommExpanded = showSubhubs || expanded.has(comm.id);
      if (!isCommExpanded) return;

      const subs = comm.children ?? [];
      if (!subs.length) return;

      // Sub-branch horizontal spread within the community's slice.
      const subSpread = Math.min(commStep * 0.9, 220);
      const subStep = subSpread / Math.max(1, subs.length);
      subs.forEach((sub, si) => {
        const sx = cx - subSpread / 2 + subStep * (si + 0.5) + (hash01(sub.id, 4) - 0.5) * 14;
        const sy = subhubY0 + (hash01(sub.id, 5) - 0.5) * 40;
        const subLaid: LaidOut = { data: sub, x: sx, y: sy, parent: commLaid };
        laid.push(subLaid);
        byId.set(sub.id, subLaid);
        links.push({ source: commLaid, target: subLaid });

        if (sub.data === undefined && sub.kind === "cluster") return;

        const showLeaves = showLeavesAll || expanded.has(sub.id);
        if (!showLeaves) return;
        const leaves = sub.children ?? [];
        if (!leaves.length) return;

        // Leaves fan out around subhub in an arc.
        const arcSpan = Math.min(160, Math.PI * 0.75);
        const leafRadius = 90 + Math.min(40, leaves.length * 3);
        const step = leaves.length > 1 ? arcSpan / (leaves.length - 1) : 0;
        const arcStart = -arcSpan / 2;
        leaves.forEach((leaf, li) => {
          const angle = -Math.PI / 2 + arcStart + step * li + (hash01(leaf.id, 6) - 0.5) * 0.06;
          const lx = sx + Math.cos(angle) * leafRadius;
          const ly = sy + Math.sin(angle) * leafRadius - 10;
          const leafLaid: LaidOut = { data: leaf, x: lx, y: ly, parent: subLaid };
          laid.push(leafLaid);
          byId.set(leaf.id, leafLaid);
          links.push({ source: subLaid, target: leafLaid });
        });
      });
    });
  });

  const xs = laid.map((l) => l.x);
  const ys = laid.map((l) => l.y);
  const bounds = {
    minX: Math.min(...xs, 0),
    maxX: Math.max(...xs, width),
    minY: Math.min(...ys, 0),
    maxY: Math.max(...ys, height),
  };

  return { laid, byId, links, rootPos, bounds };
}

export { hash01 };
export const _departments = DEPARTMENTS;