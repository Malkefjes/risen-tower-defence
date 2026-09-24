import type { Cell } from "./types";

export type ShapeId = "I" | "O" | "T" | "S" | "Z" | "L" | "J";
export const SHAPE_IDS: readonly ShapeId[] = ["I", "O", "T", "S", "Z", "L", "J"];

/**
 * Cell offsets relative to the pivot cell (0,0), which sits under the cursor.
 * Rotation happens around the pivot so a piece doesn't jump when rotated.
 */
const BASE: Record<ShapeId, readonly Cell[]> = {
  I: [[-1, 0], [0, 0], [1, 0], [2, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[-1, 0], [0, 0], [1, 0], [0, 1]],
  S: [[0, 0], [1, 0], [-1, 1], [0, 1]],
  Z: [[-1, 0], [0, 0], [0, 1], [1, 1]],
  L: [[0, -1], [0, 0], [0, 1], [1, 1]],
  J: [[0, -1], [0, 0], [0, 1], [-1, 1]],
};

/** Offsets for a shape after `rot` quarter turns clockwise (on screen, y pointing south). */
export function shapeOffsets(shape: ShapeId, rot: number): Cell[] {
  const r = ((rot % 4) + 4) % 4;
  return BASE[shape].map(([x, y]) => {
    let cx = x, cy = y;
    for (let i = 0; i < r; i++) [cx, cy] = [-cy, cx];
    return [cx, cy] as Cell;
  });
}

/** Absolute cells for a shape placed with its pivot at `at`. */
export function pieceCells(shape: ShapeId, rot: number, at: Cell): Cell[] {
  return shapeOffsets(shape, rot).map(([x, y]) => [x + at[0], y + at[1]] as Cell);
}
