/**
 * Enemy types: the threats from the design doc's list, each with its own numbers in
 * `Tuning.enemies`. Raids send packs of the Grunt (the pack, the missiles' job), the
 * Runner (few, tough and fast) and the Brute (big, slow, armoured), picked by their
 * shares. The Swarm was dropped (2026-09-26): with Erik's detailed golem for every type,
 * endless small bodies were never feasible. Pure data, no graphics.
 */
export type EnemyKind = "grunt" | "runner" | "brute" | "elite";
export const ENEMY_KINDS: readonly EnemyKind[] = ["grunt", "runner", "brute", "elite"];

/**
 * `length`: how long one is along its path, in cells (its look, nose to tail): a pack
 * climbs out one body length apart at least, so its enemies don't start inside each other.
 */
export const ENEMY_INFO: Record<EnemyKind, { name: string; length: number }> = {
  // The golem is about half as deep as it is tall (render/golem.ts has the heights).
  grunt: { name: "Grunt", length: 0.7 },
  runner: { name: "Runner", length: 0.95 },
  brute: { name: "Brute", length: 1.3 },
  elite: { name: "Elite", length: 0.8 },
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
  /**
   * Resistances: the share of each damage type's hits it shrugs off (0.5 = half damage; never
   * immune). Only the Elite (and later Bosses and the Titan) has any: at most one or two.
   */
  resistPiercing: number;
  resistLaser: number;
  resistExplosive: number;
}

/** However thick the armour, a hit always does at least this share of its damage (never immune). */
export const ARMOUR_FLOOR = 0.1;

/** The kinds of damage: Guns (and the ship's gun) pierce, the laser cannon burns through, missiles explode. */
export type DamageKind = "piercing" | "laser" | "explosive";

/** A resistance never takes off more than this share of a hit (never immune). */
export const RESIST_MAX = 0.75;

/** The share of a damage type's hits an enemy of these stats shrugs off. */
export function resistance(e: EnemyStats, kind: DamageKind): number {
  const r = kind === "piercing" ? e.resistPiercing : kind === "laser" ? e.resistLaser : e.resistExplosive;
  return Math.min(RESIST_MAX, Math.max(0, r ?? 0));
}

/** What an enemy type resists, for the raid warning ("explosive", or "" for nothing). */
export function resistsText(e: EnemyStats): string {
  return (["piercing", "laser", "explosive"] as DamageKind[]).filter(k => resistance(e, k) > 0).join(", ");
}

/** What a hit of `damage` does through `armour`. */
export const throughArmour = (damage: number, armour: number): number => Math.max(damage * ARMOUR_FLOOR, damage - armour);
