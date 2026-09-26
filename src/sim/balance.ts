import { ENEMY_KINDS, type EnemyKind } from "./enemies";
import { Game, TICK } from "./game";
import { TOWER_INFO, type TowerKind, type TowerStats } from "./towers";
import type { TuningPatch } from "./tuning";
import type { Cell } from "./types";

/**
 * Numbers for reading and testing balance. Pure logic: the tuning panel shows the
 * derived numbers, and tests use `runRaid` to play a raid out headless.
 */

/** Damage per second of a tower at some size. */
export const dps = (s: TowerStats): number => s.damage * s.rate;

/**
 * Alloy per point of damage per second. The design wants it about equal at every
 * size: a bigger tower is more investment and depth, not a better deal.
 */
export const alloyPerDps = (s: TowerStats): number => dps(s) > 0 ? s.cost / dps(s) : Infinity;

export interface RaidReport {
  /** The raid ended (every enemy killed or burrowed) within the time allowed. */
  cleared: boolean;
  /** Game seconds it took. */
  seconds: number;
  killed: number;
  /** HP the ship lost. */
  shipDamage: number;
  /** Wall pieces chewed through, and towers lost with them. */
  wallsBroken: number;
  towersLost: number;
  /** Damage each tower dealt during the raid, by tower id. */
  dealt: Map<number, number>;
}

/**
 * Start a raid now and play it out headless (up to `maxSeconds` of game time), then
 * report how it went. Takes the game's events as it goes.
 */
export function runRaid(g: Game, maxSeconds = 900): RaidReport {
  const hp = g.hp, before = new Map(g.towers.map(t => [t.id, t.dealt]));
  const r: RaidReport = { cleared: false, seconds: 0, killed: 0, shipDamage: 0, wallsBroken: 0, towersLost: 0, dealt: new Map() };
  const count = () => {
    for (const e of g.drainEvents()) {
      if (e.type === "killed") r.killed++;
      else if (e.type === "wall-broken") r.wallsBroken++;
      else if (e.type === "tower-destroyed") r.towersLost++;
    }
  };
  g.startWave();
  count();
  while (g.phase === "wave" && r.seconds < maxSeconds) {
    g.step(TICK);
    r.seconds += TICK;
    count();
  }
  r.cleared = g.phase !== "wave";
  r.shipDamage = hp - g.hp;
  for (const t of g.towers) r.dealt.set(t.id, t.dealt - (before.get(t.id) ?? 0));
  return r;
}

// ------------------------------------------------------------------ the standard maze

/**
 * The standard maze the balance rules are tested on: the kind a player builds against
 * the ship. Three caves on the left feed one entrance; inside a walled box, five
 * single-cell lanes snake between two-wide plated columns (about 85 cells of path)
 * into a room with the ship. Towers stand on the columns, in 2×2 slots.
 *
 *   x:  3 | 4 | 5 6 | 7 | 8 9 | 10 | 11 12 | 13 | 14 15 | 16 | 17 18 | 19..22 room | 23
 */
export const MAZE_SHIP: Cell = [21, 0];
const COLUMNS: number[][] = [[3], [5, 6], [8, 9], [11, 12], [14, 15], [17, 18]];
/** Slot corners (2×2 top-left) on the columns, best first: the middle of the maze, then outward. */
export const MAZE_SLOTS: Cell[] = [
  [11, -1], [8, -1], [14, -1], [11, -4], [11, 2], [8, -4], [8, 2], [14, -4], [14, 2],
  [5, -1], [17, -1], [5, -4], [5, 2], [17, -4], [17, 2],
];

export function standardMaze(o: { seed?: number; tuning?: TuningPatch; round?: number } = {}): Game {
  const g = new Game({ name: "standard maze", spawners: [[-2, 3], [-2, 6], [-2, 9]], ship: [MAZE_SHIP], rocks: [], trees: [] },
    { seed: o.seed ?? 1, tuning: { startAlloy: 1e6, ...o.tuning } });
  const span = (x0: number, x1: number, y: number) => Array.from({ length: x1 - x0 + 1 }, (_, i): Cell => [x0 + i, y]);
  // The box: top and bottom rows, and the right side.
  g.putWall(span(3, 23, -7));
  g.putWall(span(3, 23, 7));
  g.putWall(Array.from({ length: 13 }, (_, i): Cell => [23, i - 6]));
  // Columns from y -6 to 6, each with a one-cell gap, alternating bottom and top (the first is the entrance).
  COLUMNS.forEach((xs, i) => {
    const gap = i % 2 === 0 ? 6 : -6, cells: Cell[] = [];
    for (let y = -6; y <= 6; y++) if (y !== gap) for (const x of xs) cells.push([x, y]);
    g.putWall(cells);
  });
  if (o.round) g.round = o.round;
  return g;
}

/** A tower for the maze: its kind and size, placed in the next free slot. */
export interface MazeTower { kind: TowerKind; size?: number }

/** Build towers into the maze's slots in order; returns the alloy they cost. */
export function buildInMaze(g: Game, towers: MazeTower[]): number {
  let alloy = 0;
  towers.forEach((t, i) => {
    const at = MAZE_SLOTS[i];
    if (!at) throw new Error("the standard maze has no more slots");
    const built = g.buildTower(t.kind, at).tower;
    if (!built) throw new Error(`can't build ${t.kind} at ${at}`);
    alloy += g.towerCost(t.kind);
    for (let size = 2; size <= (t.size ?? 1); size++) { alloy += g.growCost(built); g.growTower(built.id, at); }
  });
  return alloy;
}

/**
 * Alloy of towers a player has built by a raid, if they keep smelting: 600 by the first,
 * growing about a third a raid (an assumption about the economy, to be checked in play).
 * Enemy HP grows at the same pace by default, so a defence of the right towers keeps up.
 */
export const ECONOMY_GROWTH = 1.35;
export const alloyByRaid = (round: number): number => Math.round(600 * ECONOMY_GROWTH ** (round - 1) / 50) * 50;

/** Towers for a budget: as many of the list as fit, cycling through it, all 1×1; the rest grows them in turn. */
export function towersFor(kinds: TowerKind[], budget: number, g: Game): MazeTower[] {
  const out: MazeTower[] = [];
  let left = budget;
  for (let i = 0; out.length < MAZE_SLOTS.length; i++) {
    const kind = kinds[i % kinds.length]!, cost = g.towerCost(kind);
    if (cost > left) break;
    out.push({ kind, size: 1 });
    left -= cost;
  }
  // Leftover alloy grows towers, first built first.
  for (const t of out) {
    const grow = g.tuning.towers[t.kind][1]!.cost - g.towerCost(t.kind);
    if (grow <= left && TOWER_INFO[t.kind].maxSize >= 2) { t.size = 2; left -= grow; }
  }
  return out;
}

/** A raid on the standard maze: `round` sets the raid (its size, mix and HP); `only` limits the enemy types sent. */
export function mazeRaid(o: { round: number; towers: TowerKind[]; budget?: number; only?: EnemyKind[]; tuning?: TuningPatch; seed?: number }): RaidReport & { alloy: number; sent: number } {
  // `only`: the other types get no share, and these come in from raid 1 (over any tuning given).
  const given = o.tuning?.enemies ?? {};
  const enemies = Object.fromEntries(ENEMY_KINDS.map(k => [k, { ...given[k], ...(o.only ? o.only.includes(k) ? { from: 1 } : { share: 0 } : {}) }]));
  const g = standardMaze({ seed: o.seed, round: o.round, tuning: { ...o.tuning, enemies } });
  if (o.only) for (const k of o.only) if (g.tuning.enemies[k].share === 0) g.tuning.enemies[k].share = 1;
  const alloy = buildInMaze(g, towersFor(o.towers, o.budget ?? alloyByRaid(o.round), g));
  const sent = g.raidMix().reduce((a, m) => a + m.count, 0);
  return { ...runRaid(g), alloy, sent };
}
