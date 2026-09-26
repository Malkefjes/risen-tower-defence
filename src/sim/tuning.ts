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
  /** Seconds of the multitool to cut down a tree. */
  chopTime: number;
  /** Seconds to mine a whole node (three stages). */
  mineTime: number;
  /** Mining reach: the gap between you and a node, as it looks on screen, in cells. */
  reach: number;
  /** Top speed multiplier while sprinting. */
  sprint: number;
  /** How many caves (the nearest to the ship) send enemies at most. */
  activeCaves: number;
  /** Caves open up over a run: one in the first raids, another every `caveEvery` raids (0: all from the start). */
  caveEvery: number;
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
  /**
   * Raid size (in Grunts; each type takes its `cost`) sent from each active cave in raid 1,
   * and what each raid after adds. Raids grow in a straight line, like the towers a player
   * can afford (the balance anchors in the design doc), not by making enemies tougher.
   */
  raidBase: number;
  raidStep: number;
  /** Seconds a raid's packs are spread over: a bigger raid comes denser, not longer. Packs never come closer than one after another. */
  raidSpread: number;
  /**
   * Enemy HP grows in a straight line: each raid after the first adds this share of a
   * type's raid-1 HP (0.1: raid 5 has 1.4 times the HP). Raids grow in numbers too, but the
   * counts stay readable (the lesson in CLAUDE.md), so toughness carries the rest.
   */
  enemyHpStep: number;
  /** Each pack's speed varies by up to this share either way (0.12 = ±12%); a pack moves as one. */
  speedSpread: number;
  /** Enemies leave a cave in packs of packMin to packMax, packGap seconds apart. */
  packMin: number;
  packMax: number;
  packGap: number;
  /** How far an enemy walks off its tile's centre line, in cells (looks only; the path is per tile). */
  laneSpread: number;
  /** Heavy (brown): the share of its speed an enemy loses inside a Radome's field. Never stacks. */
  heavySlow: number;
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
  chopTime: 1.5,
  reach: 1.5,
  sprint: 1.4,
  activeCaves: 3,
  caveEvery: 2,
  startHp: 400,
  smelterHp: 150,
  supplyRadius: 40,
  upkeepRate: 0.03,
  shipStartStone: 200,
  decayTime: 300,
  wallHp: 600,
  platedHpMult: 3,
  wallClawers: 2,
  raidBase: 3,
  raidStep: 7,
  raidSpread: 45,
  enemyHpStep: 0.25,
  speedSpread: 0.12,
  packMin: 3,
  packMax: 5,
  packGap: 4,
  laneSpread: 0.2,
  heavySlow: 0.4,
  sellRefund: 0.75,
  // Set from the balance anchors (design doc): HP in Gun passes, cost by what it takes to hold.
  enemies: {
    // One Gun pass: a 1×1 Gun's reach covers about 8 cells of a single-lane maze.
    grunt: { hp: 16, speed: 1.475, damage: 2, pack: 0, gap: 0.25, cost: 1, share: 0, from: 1, armour: 0 },
    // Dies to one missile; comes in swarms that bunch up in a lane.
    swarm: { hp: 4, speed: 1.5, damage: 1, pack: 8, gap: 0.15, cost: 0.25, share: 4, from: 1, armour: 0 },
    // Few and tough: three Gun passes at full speed, so it outruns a short killzone unless it's Heavy.
    runner: { hp: 24, speed: 3, damage: 1, pack: 3, gap: 1.2, cost: 6, share: 14, from: 2, armour: 0 },
    // Armoured: the Gun's rounds do half; the laser cannon's go through.
    brute: { hp: 80, speed: 1, damage: 4, pack: 1, gap: 3, cost: 4, share: 5, from: 3, armour: 0.5 },
  },
  towers: {
    // The workhorse: the unit everything is measured in.
    gun: [
      { cost: 200, damage: 1, range: 2.5, rate: 3, radius: 0, heavy: 0 },
      { cost: 500, damage: 1, range: 3.5, rate: 9, radius: 0, heavy: 0 },
      { cost: 1000, damage: 1, range: 4.5, rate: 18, radius: 0, heavy: 0 },
    ],
    // The missile rack: worse than the Gun per alloy on one target, far better on a pack.
    explosive: [
      // Big, slow missiles: one kills a Swarm while its HP grows (a 1×1 rack to raid 5, a 2×2 to raid 9, a 3×3 to 13).
      { cost: 250, damage: 8, range: 4, rate: 0.45, radius: 0.9, heavy: 0 },
      { cost: 625, damage: 12, range: 5, rate: 0.833, radius: 1.15, heavy: 0 },
      { cost: 1250, damage: 16, range: 6, rate: 1.25, radius: 1.4, heavy: 0 },
    ],
    // The laser cannon, a sniper: the longest reach, slow, big shots that armour barely dents.
    laser: [
      { cost: 300, damage: 12, range: 7, rate: 1 / 3.5, radius: 0, heavy: 0 },
      { cost: 750, damage: 24, range: 8.5, rate: 1 / 2.8, radius: 0, heavy: 0 },
      { cost: 1500, damage: 40, range: 10, rate: 3 / 7, radius: 0, heavy: 0 },
    ],
    // The Radome: no damage; everything in its wide field is Heavy, and stays so a little after.
    support: [
      { cost: 100, damage: 0, range: 4.5, rate: 0, radius: 0, heavy: 2 },
      { cost: 300, damage: 0, range: 5.5, rate: 0, radius: 0, heavy: 3 },
      { cost: 700, damage: 0, range: 6.5, rate: 0, radius: 0, heavy: 4 },
    ],
  },
  ship: { cost: 0, damage: 1, range: 5.5, rate: 1, radius: 0, heavy: 0 },
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
