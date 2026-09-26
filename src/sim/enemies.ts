/**
 * Enemy types: the threats from the design doc's list, each with its own numbers in
 * `Tuning.enemies`. The leaper is the Grunt, the yardstick the others are measured
 * against. The Runner (stone wolves) and the Brute (the stone Colossus) have their
 * looks and base numbers; raids don't send them yet. Pure data, no graphics.
 */
export type EnemyKind = "grunt" | "runner" | "brute";
export const ENEMY_KINDS: readonly EnemyKind[] = ["grunt", "runner", "brute"];

export const ENEMY_INFO: Record<EnemyKind, { name: string }> = {
  grunt: { name: "Grunt" },
  runner: { name: "Runner" },
  brute: { name: "Brute" },
};

export interface EnemyStats {
  /** HP in raid 1; it grows by `Tuning.enemyHpGrowth` per raid after that. */
  hp: number;
  /** Walking speed, cells per second (packs vary around it by `Tuning.speedSpread`). */
  speed: number;
  /** Damage per second to the building or wall piece it's clawing. */
  damage: number;
}
