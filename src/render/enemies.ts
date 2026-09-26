import type { EnemyKind } from "../sim/enemies";
import type { Walker } from "../sim/game";
import { COLOSSUS_HEIGHT, colossusModel } from "./colossus";
import { GRUMTOOTH_HEIGHT, grumtoothModel } from "./grumtooth";
import type { Enemy, Marks } from "./stoneCreature";
import { wolfModel } from "./wolf";

/**
 * How each enemy type looks in the game: Erik's stone creatures, sized from the
 * playground. The Grunt has no look of its own yet and borrows the Grumtooth.
 */
export const ENEMY_LOOKS: Record<EnemyKind, { model: "colossus" | "wolf" | "grumtooth"; size: number; bar: number }> = {
  grunt: { model: "grumtooth", size: 1.3, bar: 0.5 },
  swarm: { model: "grumtooth", size: 1.7, bar: 0.35 },
  runner: { model: "wolf", size: 1.7, bar: 0.5 },
  brute: { model: "colossus", size: 2, bar: 1 },
};

/** A new model for a walker. Strides keep pace with its speed; bigger bodies take longer strides. */
export function enemyModel(w: Walker, marks: Marks): Enemy {
  const look = ENEMY_LOOKS[w.kind], scale = look.size;
  switch (look.model) {
    case "colossus": return colossusModel({ scale, strideRate: (w.speed * 0.75) / scale, marks });
    case "wolf": return wolfModel({ scale, strideRate: (w.speed * 1.1) / scale, marks });
    case "grumtooth": return grumtoothModel({ scale, strideRate: (w.speed * 1.6) / scale, marks });
  }
}

/** Height of a walker's HP bar: just over its head. */
export function enemyBarHeight(w: Walker): number {
  const look = ENEMY_LOOKS[w.kind];
  const tall = look.model === "colossus" ? COLOSSUS_HEIGHT : look.model === "wolf" ? 0.45 : GRUMTOOTH_HEIGHT;
  return tall * look.size + 0.08;
}
