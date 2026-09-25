import type { Game } from "../src/sim/game";

/**
 * Put down a plated (metal) wall piece directly, without the hand or costs, so
 * towers can be built on it. Cells sharing an id form one piece.
 */
export function metalWall(g: Game, cells: [number, number][], id = 900 + g.pieces.length): void {
  g.pieces.push({ id, shape: "O", rot: 0, at: cells[0]!, cells, locked: false, paid: 0, metal: true, plated: 0 });
  for (const [x, y] of cells) g.world.walls.set(`${x},${y}`, id);
}
