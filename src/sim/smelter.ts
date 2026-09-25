import { Inventory } from "./inventory";
import type { Cell } from "./types";

/**
 * The smelter: a 2×2 building on open ground that turns raw metal into alloy, 1:1,
 * one piece at a time, like a furnace in Rust. It holds up to two stacks of raw
 * metal and two stacks of alloy. It blocks enemies like a wall. Pure logic.
 */
export const SMELTER_SIZE = 2;
export const SMELTER_SLOTS = 2;

export interface Smelter {
  id: number;
  /** Top-left (north-west) cell of the footprint. */
  at: Cell;
  cells: Cell[];
  /** Footprint centre in continuous cell coordinates. */
  cx: number; cy: number;
  /** Raw metal waiting to be smelted. */
  input: Inventory;
  /** Alloy ready to take. */
  output: Inventory;
  /** How far the current piece is, 0..1. */
  progress: number;
  /** Smelted something this tick (the view lights the window and the chimney). */
  working: boolean;
  /** What it cost, given back in full when it's removed (tuning may change meanwhile). */
  paid: { stone: number; metal: number };
}

export function smelterCells(at: Cell): Cell[] {
  const out: Cell[] = [];
  for (let dy = 0; dy < SMELTER_SIZE; dy++) for (let dx = 0; dx < SMELTER_SIZE; dx++) out.push([at[0] + dx, at[1] + dy]);
  return out;
}

export function newSmelter(id: number, at: Cell, paid = { stone: 0, metal: 0 }): Smelter {
  return {
    id, at: [at[0], at[1]], cells: smelterCells(at), cx: at[0] + SMELTER_SIZE / 2, cy: at[1] + SMELTER_SIZE / 2,
    input: new Inventory(SMELTER_SLOTS), output: new Inventory(SMELTER_SLOTS), progress: 0, working: false, paid,
  };
}

/**
 * Smelt for `dt` seconds at `rate` pieces per second. Works while there is raw metal
 * in and room for alloy out; otherwise it stops and keeps its progress. Returns the
 * number of pieces made.
 */
export function smelt(s: Smelter, dt: number, rate: number): number {
  s.working = s.input.count("metal") > 0 && s.output.room("alloy") > 0 && rate > 0;
  if (!s.working) return 0;
  s.progress += dt * rate;
  let made = 0;
  while (s.progress >= 1 && s.input.count("metal") > 0 && s.output.room("alloy") > 0) {
    s.progress -= 1;
    s.input.remove("metal", 1);
    s.output.add("alloy", 1);
    made++;
  }
  if (!s.input.count("metal") || !s.output.room("alloy")) s.progress = Math.min(s.progress, 0.999);
  return made;
}

/** Gap between a point and the footprint (0 inside it), in cells. */
export function gapTo(s: Smelter, x: number, y: number): number {
  const [x0, y0] = s.at, x1 = x0 + SMELTER_SIZE, y1 = y0 + SMELTER_SIZE;
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
}
