/**
 * Ore nodes: 3×3 deposits of stone or metal that the player mines by hand.
 * Pure logic, no graphics. A node breaks in three stages; each stage drops its
 * ore at once, and the part of the node that blocks movement shrinks with it
 * (3×3, then a plus of 5 cells, then the centre cell).
 */
import type { Cell } from "./types";

export type OreKind = "stone" | "metal";

/** A node on a map: its north-west cell. Nodes are always 3×3. */
export interface OreNodeDef { x: number; y: number; kind: OreKind }

export const NODE_SIZE = 3;
/** Open ground a map keeps between any ore node and the ship, in cells. */
export const SHIP_CLEARANCE = 4;
export const ORE_STAGES = 3;
/** Ore dropped by each stage that breaks off. */
export const STAGE_YIELD: Record<OreKind, number> = { stone: 200, metal: 100 };

export interface OreNode {
  id: number;
  kind: OreKind;
  /** North-west cell. */
  x: number; y: number;
  /** Ore left, from `max` down to 0; continuous while being mined. */
  amount: number;
  max: number;
}

export const nodeMax = (kind: OreKind): number => STAGE_YIELD[kind] * ORE_STAGES;

/** Stages still standing: 3 when full, 0 when mined out. */
export function stagesLeft(n: OreNode): number {
  return Math.max(0, Math.ceil((n.amount / n.max) * ORE_STAGES - 1e-9));
}

/** Cells of the node that block movement, for its current stage. */
export function nodeFootprint(n: OreNode): Cell[] {
  const s = stagesLeft(n), cx = n.x + 1, cy = n.y + 1;
  if (s >= 3) {
    const out: Cell[] = [];
    for (let y = 0; y < NODE_SIZE; y++) for (let x = 0; x < NODE_SIZE; x++) out.push([n.x + x, n.y + y]);
    return out;
  }
  if (s === 2) return [[cx, cy], [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
  if (s === 1) return [[cx, cy]];
  return [];
}

/**
 * How high a node cell is for the avatar: a mound that rises toward its peak,
 * so it can be hopped up. The peak (the core) is just within a jump from the snow.
 */
export function nodeCellTop(n: OreNode, x: number, y: number): number {
  const dx = Math.abs(x - (n.x + 1)), dy = Math.abs(y - (n.y + 1));
  return dx + dy === 0 ? 0.95 : dx + dy === 1 ? 0.78 : 0.6;
}

/** All nine cells of a node, whatever its stage. */
export function nodeArea(n: OreNode): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < NODE_SIZE; y++) for (let x = 0; x < NODE_SIZE; x++) out.push([n.x + x, n.y + y]);
  return out;
}

/**
 * The camera looks down at 30°, so ground distance toward or away from it looks
 * half as long on screen (sin 30°). Reach is measured the way it looks, so it's
 * the same on every side. The camera angle is fixed (a locked decision).
 */
export const VIEW_SQUASH = 0.5;

function toView(x: number, y: number): [number, number] {
  return [(x - y) / Math.SQRT2, ((x + y) / Math.SQRT2) * VIEW_SQUASH];
}

/**
 * Gap between a point and a node's full 3×3 area, as it looks on screen (in
 * cell widths). 0 when the point is over the node.
 */
export function viewGap(px: number, py: number, n: OreNode): number {
  const [ax, ay] = toView(px, py);
  const c = ([[n.x, n.y], [n.x + NODE_SIZE, n.y], [n.x + NODE_SIZE, n.y + NODE_SIZE], [n.x, n.y + NODE_SIZE]] as [number, number][])
    .map(([x, y]) => toView(x, y));
  let pos = 0, neg = 0, best = Infinity;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = c[i]!, [x2, y2] = c[(i + 1) % 4]!;
    const ex = x2 - x1, ey = y2 - y1;
    if (ex * (ay - y1) - ey * (ax - x1) < 0) neg++; else pos++;
    const t = Math.max(0, Math.min(1, ((ax - x1) * ex + (ay - y1) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(ax - (x1 + t * ex), ay - (y1 + t * ey)));
  }
  return pos === 4 || neg === 4 ? 0 : best;
}
