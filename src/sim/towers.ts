import type { Cell } from "./types";

/** Tower types. Each has one fixed footprint; the Twin's 2×2 form is the Gatling. */
export type TowerKind = "twin" | "gatling";
export const TOWER_KINDS: readonly TowerKind[] = ["twin", "gatling"];

/** `top` is how high the tower stands above its wall deck, in cells (the avatar can stand on it). */
export const TOWER_INFO: Record<TowerKind, { name: string; size: number; top: number }> = {
  twin: { name: "Twin", size: 1, top: 0.45 },
  gatling: { name: "Gatling", size: 2, top: 0.81 },
};

export interface TowerStats {
  /** Metal. */
  cost: number;
  damage: number;
  /** Reach in cells, measured from the footprint's center. */
  range: number;
  /** Shots per second. */
  rate: number;
}

/** Every number the tuning panel can change. The game reads these live. */
export interface Tuning {
  /** Stone per wall cell (a 4-cell wall costs four times this). */
  wallCost: number;
  /** Metal to plate a whole wall piece (the Armored deck, which towers need). */
  platingCost: number;
  /** Ore in the hotbar at the start of a run. */
  startStone: number;
  startMetal: number;
  /** Seconds to mine a whole node (three stages). */
  mineTime: number;
  /** Mining reach: the gap between you and a node, as it looks on screen, in cells. */
  reach: number;
  /** Top speed multiplier while sprinting. */
  sprint: number;
  /** How many caves (the nearest to the ship) send enemies each wave. */
  activeCaves: number;
  startHp: number;
  enemyHp: number;
  /** Enemy HP multiplier per round after the first. */
  enemyHpGrowth: number;
  /** Multiplier on enemy walking speed. */
  enemySpeed: number;
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
  twin: TowerStats;
  /** The ship's own weak gun, fired from its core (no cost; range from the ship's centre). */
  ship: TowerStats;
  gatling: TowerStats;
}

export const defaultTuning = (): Tuning => ({
  wallCost: 25,
  platingCost: 100,
  startStone: 400,
  startMetal: 150,
  mineTime: 25 / 3,
  reach: 1.5,
  sprint: 1.4,
  activeCaves: 3,
  startHp: 20,
  enemyHp: 6,
  enemyHpGrowth: 1.15,
  enemySpeed: 1,
  speedSpread: 0.12,
  packMin: 3,
  packMax: 5,
  packGap: 4,
  laneSpread: 0.2,
  sellRefund: 0.75,
  twin: { cost: 200, damage: 1, range: 2.5, rate: 3 },
  gatling: { cost: 500, damage: 1, range: 3.5, rate: 9 },
  ship: { cost: 0, damage: 1, range: 5.5, rate: 1 },
});

export interface Tower {
  id: number;
  kind: TowerKind;
  /** Top-left (north-west) cell of the footprint. */
  at: Cell;
  cells: Cell[];
  /** Footprint center in continuous cell coordinates. */
  cx: number; cy: number;
  /** Metal paid, so refunds don't move when tuning changes. */
  paid: number;
  /** Placed this planning phase: sells back for the full price. */
  fresh: boolean;
  cooldown: number;
  targetId: number | null;
}

export function towerCells(kind: TowerKind, at: Cell): Cell[] {
  const n = TOWER_INFO[kind].size, out: Cell[] = [];
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) out.push([at[0] + dx, at[1] + dy]);
  return out;
}

/** Bolt speed in cells per second; hits land after the bolt's travel time. */
export const BOLT_SPEED = 14;
