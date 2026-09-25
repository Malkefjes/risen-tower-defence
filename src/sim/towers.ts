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
  cost: number;
  damage: number;
  /** Reach in cells, measured from the footprint's center. */
  range: number;
  /** Shots per second. */
  rate: number;
}

/** Every number the tuning panel can change. The game reads these live. */
export interface Tuning {
  supplyPerRound: number;
  income: number;
  startCredits: number;
  startHp: number;
  enemyHp: number;
  /** Enemy HP multiplier per round after the first. */
  enemyHpGrowth: number;
  /** Multiplier on enemy walking speed. */
  enemySpeed: number;
  /** Share of the price returned when selling a tower placed in an earlier phase. */
  sellRefund: number;
  twin: TowerStats;
  gatling: TowerStats;
}

export const defaultTuning = (): Tuning => ({
  supplyPerRound: 3,
  income: 5,
  startCredits: 10,
  startHp: 20,
  enemyHp: 6,
  enemyHpGrowth: 1.15,
  enemySpeed: 1,
  sellRefund: 0.75,
  twin: { cost: 4, damage: 1, range: 2.5, rate: 3 },
  gatling: { cost: 10, damage: 1, range: 3.5, rate: 9 },
});

export interface Tower {
  id: number;
  kind: TowerKind;
  /** Top-left (north-west) cell of the footprint. */
  at: Cell;
  cells: Cell[];
  /** Footprint center in continuous cell coordinates. */
  cx: number; cy: number;
  /** Credits paid, so refunds don't move when tuning changes. */
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
