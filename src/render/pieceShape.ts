import type { Cell } from "../sim/types";

export type Side = "n" | "s" | "w" | "e";
export const SIDES: readonly Side[] = ["n", "s", "w", "e"];

/** A cell of a piece, with the sides that face outside the piece. */
export interface OutlineCell { x: number; y: number; open: Record<Side, boolean> }

/**
 * Which side of each cell faces open ground. A side fuses (no inset) when the
 * neighbouring cell is part of this piece, or any other wall if `joins` says so,
 * so walls placed side by side snap into one continuous structure.
 */
export function pieceOutline(cells: readonly Cell[], joins?: (x: number, y: number) => boolean): OutlineCell[] {
  const own = new Set(cells.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => own.has(`${x},${y}`) || (joins?.(x, y) ?? false);
  return cells.map(([x, y]) => ({
    x, y,
    open: { n: !has(x, y - 1), s: !has(x, y + 1), w: !has(x - 1, y), e: !has(x + 1, y) },
  }));
}

/** Axis-aligned bounds of a cell, pulled in by `inset` on its open sides only. */
export function cellBounds(c: OutlineCell, inset: number): { x0: number; x1: number; z0: number; z1: number } {
  return {
    x0: c.x + (c.open.w ? inset : 0), x1: c.x + 1 - (c.open.e ? inset : 0),
    z0: c.y + (c.open.n ? inset : 0), z1: c.y + 1 - (c.open.s ? inset : 0),
  };
}
