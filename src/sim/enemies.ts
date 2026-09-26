/**
 * Enemy types: the threats from the design doc's list, each with its own numbers in
 * `Tuning.enemies`. Raids send packs of the Grunt (the pack, the missiles' job), the
 * Runner (few, tough and fast) and the Brute (big, slow, armoured), picked by their
 * shares. The Swarm was dropped (2026-09-26): with Erik's detailed golem for every type,
 * endless small bodies were never feasible. Pure data, no graphics.
 */
export type EnemyKind = "grunt" | "runner" | "brute";
export const ENEMY_KINDS: readonly EnemyKind[] = ["grunt", "runner", "brute"];

/**
 * `length`: how long one is along its path, in cells (its look, nose to tail): a pack
 * climbs out one body length apart at least, so its enemies don't start inside each other.
 */
export const ENEMY_INFO: Record<EnemyKind, { name: string; length: number }> = {
  grunt: { name: "Grunt", length: 0.5 },
  runner: { name: "Runner", length: 1.7 },
  brute: { name: "Brute", length: 1 },
};

export interface EnemyStats {
  /** HP in raid 1; each raid after adds `Tuning.enemyHpStep` of it. */
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
  /** The first raid this type comes in (the raid schedule brings in one new threat at a time). */
  from: number;
  /** Flat armour: taken off every hit, down to `ARMOUR_FLOOR` of it. Many small hits do little; big hits go through. */
  armour: number;
}

/** However thick the armour, a hit always does at least this share of its damage (never immune). */
export const ARMOUR_FLOOR = 0.1;

/** What a hit of `damage` does through `armour`. */
export const throughArmour = (damage: number, armour: number): number => Math.max(damage * ARMOUR_FLOOR, damage - armour);
