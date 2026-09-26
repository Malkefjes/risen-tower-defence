/**
 * Enemy types: the threats from the design doc's list, each with its own numbers in
 * `Tuning.enemies`. The leaper is the Grunt, the yardstick the others are measured
 * against. Pure data, no graphics.
 */
export type EnemyKind = "grunt";
export const ENEMY_KINDS: readonly EnemyKind[] = ["grunt"];

export const ENEMY_INFO: Record<EnemyKind, { name: string }> = {
  grunt: { name: "Grunt" },
};

export interface EnemyStats {
  /** HP in raid 1; it grows by `Tuning.enemyHpGrowth` per raid after that. */
  hp: number;
  /** Walking speed, cells per second (packs vary around it by `Tuning.speedSpread`). */
  speed: number;
  /** Damage per second to the building or wall piece it's clawing. */
  damage: number;
}
