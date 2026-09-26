import type { EnemyKind, EnemyStats } from "./enemies";
import type { TowerKind, TowerStats } from "./towers";

/**
 * Every number in the game's balance, in one place. The tuning panel (K) edits
 * these live; tests start from `defaultTuning()`.
 */
/** Every number the tuning panel can change. The game reads these live. */
export interface Tuning {
  /** Stone per wall cell (a 4-cell wall costs four times this). */
  wallCost: number;
  /** Alloy to plate a whole wall piece (the Armored deck, which towers need). */
  platingCost: number;
  /** Ore in the hotbar at the start of a run. */
  startStone: number;
  /** Raw metal (only good for a smelter) and alloy at the start. */
  startMetal: number;
  startAlloy: number;
  /** What a smelter costs to build: stone and raw metal. */
  smelterStone: number;
  smelterMetal: number;
  /** Alloy a smelter makes per second (1 raw metal each). */
  smeltRate: number;
  /** Raid clock, in seconds: before the first raid, between a cleared raid and the next, and the fixed warning at the end. */
  raidGrace: number;
  raidInterval: number;
  raidWarning: number;
  /** Noise: seconds your activity takes off the raid clock (never into the warning). A smelter at work runs the clock `smeltNoise` faster. */
  noiseStone: number;
  noiseMetal: number;
  noiseWall: number;
  noiseBuild: number;
  smeltNoise: number;
  /** Seconds to mine a whole node (three stages). */
  mineTime: number;
  /** Mining reach: the gap between you and a node, as it looks on screen, in cells. */
  reach: number;
  /** Top speed multiplier while sprinting. */
  sprint: number;
  /** How many caves (the nearest to the ship) send enemies each raid. */
  activeCaves: number;
  /** The ship's HP; enemies claw it down. */
  startHp: number;
  /** A smelter's HP. */
  smelterHp: number;
  /** How far the ship's supply reaches, in cells from its centre. Walls and buildings need it (and a wall connection). */
  supplyRadius: number;
  /** Upkeep: the share of each supplied thing's build price the ship takes per minute (0.03 = 3%). */
  upkeepRate: number;
  /** Stone the ship's inventory starts a run with, so the first walls don't decay straight away. */
  shipStartStone: number;
  /** Seconds for something unsupplied or unpaid to decay from full HP to broken. */
  decayTime: number;
  /** HP of a stone wall piece (it breaks as a whole); plating multiplies it. At most `wallClawers` enemies claw one piece at a time. */
  wallHp: number;
  platedHpMult: number;
  wallClawers: number;
  /** Enemy HP multiplier per raid after the first (all types). */
  enemyHpGrowth: number;
  /** Each pack's speed varies by up to this share either way (0.12 = ±12%); a pack moves as one. */
  speedSpread: number;
  /** Enemies leave a cave in packs of packMin to packMax, packGap seconds apart. */
  packMin: number;
  packMax: number;
  packGap: number;
  /** How far an enemy walks off its tile's centre line, in cells (looks only; the path is per tile). */
  laneSpread: number;
  /** Share of the price returned when selling a tower placed in an earlier phase. */
  sellRefund: number;
  /** Each enemy type's own numbers. */
  enemies: Record<EnemyKind, EnemyStats>;
  /** Each tower type's numbers per size: index 0 is 1×1, 1 is 2×2, 2 is 3×3. `cost` is the total alloy at that size. */
  towers: Record<TowerKind, TowerStats[]>;
  /** The ship's own weak gun, fired from its core (no cost; range from the ship's centre). */
  ship: TowerStats;
}

export const defaultTuning = (): Tuning => ({
  wallCost: 25,
  platingCost: 100,
  startStone: 400,
  startMetal: 0,
  startAlloy: 150,
  smelterStone: 500,
  smelterMetal: 300,
  smeltRate: 5,
  raidGrace: 600,
  raidInterval: 180,
  raidWarning: 60,
  noiseStone: 4,
  noiseMetal: 6,
  noiseWall: 2,
  noiseBuild: 5,
  smeltNoise: 0.5,
  mineTime: 25 / 3,
  reach: 1.5,
  sprint: 1.4,
  activeCaves: 3,
  startHp: 400,
  smelterHp: 150,
  supplyRadius: 40,
  upkeepRate: 0.03,
  shipStartStone: 200,
  decayTime: 300,
  wallHp: 600,
  platedHpMult: 3,
  wallClawers: 2,
  enemyHpGrowth: 1.15,
  speedSpread: 0.12,
  packMin: 3,
  packMax: 5,
  packGap: 4,
  laneSpread: 0.2,
  sellRefund: 0.75,
  enemies: {
    grunt: { hp: 6, speed: 1.475, damage: 2, pack: 0, gap: 0.25, cost: 1, share: 0 },
    // From the playground (2026-09-26); HP still to be tuned.
    swarm: { hp: 2, speed: 1.5, damage: 1, pack: 12, gap: 0.15, cost: 0.35, share: 4 },
    runner: { hp: 4, speed: 3, damage: 1, pack: 5, gap: 0.65, cost: 1, share: 3 },
    brute: { hp: 80, speed: 1, damage: 4, pack: 1, gap: 3, cost: 6, share: 1 },
  },
  towers: {
    gun: [
      { cost: 200, damage: 1, range: 2.5, rate: 3 },
      { cost: 500, damage: 1, range: 3.5, rate: 9 },
      { cost: 1000, damage: 1, range: 4.5, rate: 18 },
    ],
  },
  ship: { cost: 0, damage: 1, range: 5.5, rate: 1 },
});

/** Some of the numbers, at any depth (for tests and saved tuning). */
export type TuningPatch = { [K in keyof Tuning]?: DeepPartial<Tuning[K]> };
type DeepPartial<T> = T extends number ? T : T extends (infer U)[] ? (DeepPartial<U> | undefined)[] : { [K in keyof T]?: DeepPartial<T[K]> };

/**
 * Saved tuning laid over the defaults: only numbers whose place still exists in the
 * defaults are taken, so a save from an older build never breaks a newer one (new
 * numbers get their defaults, removed ones are dropped).
 */
export function mergeTuning(saved: unknown): Tuning {
  const merge = (d: unknown, s: unknown): unknown => {
    if (typeof d === "number") return typeof s === "number" && Number.isFinite(s) ? s : d;
    if (Array.isArray(d)) return d.map((v, i) => merge(v, Array.isArray(s) ? s[i] : undefined));
    if (d && typeof d === "object") {
      const src = s && typeof s === "object" ? s as Record<string, unknown> : {};
      return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, merge(v, src[k])]));
    }
    return d;
  };
  return merge(defaultTuning(), saved) as Tuning;
}
