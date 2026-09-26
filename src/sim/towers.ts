import type { Cell } from "./types";

/**
 * Tower types, one per purpose. Every type is first built as a 1×1 and can be grown
 * in place to 2×2 and 3×3: bigger is more investment (range, damage for its price,
 * later mod slots), not a different tower. Numbers per size live in `Tuning.towers`.
 */
export type TowerKind = "gun" | "explosive" | "support";
export const TOWER_KINDS: readonly TowerKind[] = ["gun", "explosive", "support"];

/** The largest footprint any tower can grow to. */
export const MAX_TOWER_SIZE = 3;

/**
 * `maxSize`: the sizes on offer now (a size is offered once it has a model).
 * `shot`: bolts fly straight at `BOLT_SPEED`; missiles climb, turn and dive
 * (`missileTime`), following their target, and burst over `radius`. A field tower
 * fires nothing: every enemy within its range is Heavy (`Tuning.heavySlow`).
 */
export const TOWER_INFO: Record<TowerKind, { name: string; maxSize: number; shot: "bolt" | "missile" | "field" }> = {
  gun: { name: "Gun", maxSize: 2, shot: "bolt" },
  explosive: { name: "Missile rack", maxSize: 2, shot: "missile" },
  support: { name: "Radome", maxSize: 2, shot: "field" },
};

/** How high a tower stands above its wall deck per size, in cells (the avatar can stand on it). */
export const TOWER_TOP = [0.45, 0.81, 1.1] as const;

export interface TowerStats {
  /** Total alloy for a tower of this size (growing pays the difference). */
  cost: number;
  damage: number;
  /** Reach in cells, measured from the footprint's center. */
  range: number;
  /** Shots per second. */
  rate: number;
  /** Blast radius in cells: every enemy this close to where the shot lands is hit (0 = only its target). */
  radius: number;
  /** Field towers: seconds an enemy stays Heavy after it leaves the field (0 for the rest). */
  heavy: number;
}

export interface Tower {
  id: number;
  kind: TowerKind;
  /** Footprint side: 1, 2 or 3. */
  size: number;
  /** Top-left (north-west) cell of the footprint. */
  at: Cell;
  cells: Cell[];
  /** Footprint center in continuous cell coordinates. */
  cx: number; cy: number;
  /** All the alloy put in (building and growing), so refunds don't move when tuning changes. */
  paid: number;
  /** The part of `paid` spent this calm: it sells back in full. */
  paidNow: number;
  /** Damage it has dealt this run (for reading balance in play). */
  dealt: number;
  cooldown: number;
  targetId: number | null;
}

export function footprint(at: Cell, size: number): Cell[] {
  const out: Cell[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push([at[0] + dx, at[1] + dy]);
  return out;
}

/**
 * Where a tower grows to toward a point (x, y): the one-bigger footprint that still
 * holds the old one, on the side of the point. Four choices, one per diagonal.
 */
export function growAt(t: Pick<Tower, "at" | "cx" | "cy">, x: number, y: number): Cell {
  return [t.at[0] - (x < t.cx ? 1 : 0), t.at[1] - (y < t.cy ? 1 : 0)];
}

/** Bolt speed in cells per second; hits land after the bolt's travel time. */
export const BOLT_SPEED = 14;

/** A missile's flight in seconds over `dist` cells: the climb and dive take most of it, so it is slow even close by. */
export const missileTime = (dist: number): number => 1.05 + dist * 0.09;
