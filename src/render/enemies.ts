import type { Walker } from "../sim/game";
import { GOLEM_LOOKS, golemEnemy, type Enemy } from "./golem";

export type { Enemy } from "./golem";

/** A new model for a walker: the golem in its type's size and colour, striding at its speed. */
export function enemyModel(w: Walker): Enemy {
  return golemEnemy(GOLEM_LOOKS[w.kind], w.speed);
}

/** Height of a walker's HP bar: just over its head. */
export function enemyBarHeight(w: Walker): number {
  return GOLEM_LOOKS[w.kind].height + 0.08;
}

/** Width of a walker's HP bar (1 = the normal half-cell bar). */
export function enemyBarWidth(w: Walker): number {
  return GOLEM_LOOKS[w.kind].bar;
}
