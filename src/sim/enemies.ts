/**
 * Enemy types: the threats from the design doc's list, each with its own numbers in
 * `Tuning.enemies`. The leaper is the Grunt, the yardstick the others are measured
 * against. Raids send packs of the Swarm (stone Grumtooths), the Runner (stone wolves)
 * and the Brute (the stone Colossus), picked by their shares; the Grunt has no look
 * of its own yet and isn't sent. Pure data, no graphics.
 */
export type EnemyKind = "grunt" | "swarm" | "runner" | "brute";
export const ENEMY_KINDS: readonly EnemyKind[] = ["grunt", "swarm", "runner", "brute"];

export const ENEMY_INFO: Record<EnemyKind, { name: string }> = {
  grunt: { name: "Grunt" },
  swarm: { name: "Swarm" },
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
  /** Enemies per pack (0: a random size from `Tuning.packMin` to `packMax`). */
  pack: number;
  /** Seconds between the enemies of a pack climbing out. */
  gap: number;
  /** How much of a raid's size one of these takes (a Grunt is 1). */
  cost: number;
  /** How often a pack is this type, against the other types' shares (0: never in raids). */
  share: number;
}
