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
    { seed: o.seed ?? 1, tuning: { startAlloy: 0, startStone: 0, ...o.tuning } });
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
    // Each tower's alloy goes into the hand just before it's built (the hotbar only holds so much).
    g.hotbar.add("alloy", g.towerCost(t.kind));
    const r = g.buildTower(t.kind, at), built = r.tower;
    if (!built) throw new Error(`can't build ${t.kind} at ${at}: ${r.ok ? "" : r.reason}`);
    alloy += g.towerCost(t.kind);
    for (let size = 2; size <= (t.size ?? 1); size++) { const c = g.growCost(built); alloy += c; g.hotbar.add("alloy", c); g.growTower(built.id, at); }
  });
  return alloy;
}

/**
 * The balance anchors (design doc, "Balance anchors"). Every number is set against these.
 *
 * - The tower curve: a competent player has 3–4 small towers by raid 1, about 10 (a couple
 *   grown) by raid 5, about 20 (several grown) by raid 10: this much alloy in towers.
 * - The margin: a competent defence of the right towers runs at 80% of what it could hold,
 *   so it holds a raid 1.25 times as big, and leaks when built worse.
 * - The counter ratio: answering a threat with the wrong towers takes about 3 times the alloy.
 */
export const alloyByRaid = (round: number): number => 700 + 510 * (round - 1);
export const MARGIN = 0.8;
export const COUNTER_RATIO = 3;

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
  // Leftover alloy grows towers, first built first; the ones that kill before a Radome.
  const order = [...out.filter(t => TOWER_INFO[t.kind].shot !== "field"), ...out.filter(t => TOWER_INFO[t.kind].shot === "field")];
  for (const t of order) {
    const grow = g.tuning.towers[t.kind][1]!.cost - g.towerCost(t.kind);
    if (grow <= left && TOWER_INFO[t.kind].maxSize >= 2) { t.size = 2; left -= grow; }
  }
  return out;
}

/** A raid on the standard maze: `round` sets the raid (its size, mix and HP); `only` limits the enemy types sent. */
export function mazeRaid(o: { round: number; towers: TowerKind[]; budget?: number; only?: EnemyKind[]; tuning?: TuningPatch; seed?: number; scale?: number }): RaidReport & { alloy: number; sent: number } {
  // `only`: the other types get no share, and these come in from raid 1 (over any tuning given).
  const given = o.tuning?.enemies ?? {};
  const enemies = Object.fromEntries(ENEMY_KINDS.map(k => [k, { ...given[k], ...(o.only ? o.only.includes(k) ? { from: 1 } : { share: 0 } : {}) }]));
  const g = standardMaze({ seed: o.seed, round: o.round, tuning: { ...o.tuning, enemies } });
  if (o.only) for (const k of o.only) if (g.tuning.enemies[k].share === 0) g.tuning.enemies[k].share = 1;
  // `scale`: a raid this many times the size the tuning gives (to find what a defence can hold).
  if (o.scale) { g.tuning.raidBase *= o.scale; g.tuning.raidStep *= o.scale; }
  const alloy = buildInMaze(g, towersFor(o.towers, o.budget ?? alloyByRaid(o.round), g));
  const sent = g.raidMix().reduce((a, m) => a + m.count, 0);
  return { ...runRaid(g), alloy, sent };
}

/**
 * What a defence can hold: the biggest raid, as a multiple of the tuned size, that it
 * holds with the ship losing at most `leak` of its HP (averaged over a few seeds).
 * 1.25 means it holds a raid a quarter bigger than the tuned one: the anchors' margin.
 */
export function capacity(o: { round: number; towers: TowerKind[]; budget?: number; only?: EnemyKind[]; tuning?: TuningPatch; seeds?: number[]; leak?: number }): number {
  const seeds = o.seeds ?? [1, 2], leak = o.leak ?? 0.05;
  const holds = (scale: number) => {
    let dmg = 0, hp = 0;
    for (const seed of seeds) {
      const r = mazeRaid({ ...o, seed, scale });
      dmg += r.shipDamage; hp += standardMaze({ tuning: o.tuning }).tuning.startHp;
    }
    return dmg <= leak * hp;
  };
  let lo = 0, hi = 0.25;
  while (holds(hi) && hi < 64) { lo = hi; hi *= 2; }
  for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (holds(mid)) lo = mid; else hi = mid; }
  return lo;
}

/**
 * The least alloy of these towers (built as `towersFor` does) that holds the raid, with the
 * ship losing at most `leak` of its HP averaged over a few seeds: the anchors' yardstick.
 * The counter ratio is this for the wrong towers over this for the right ones.
 */
export function holdBudget(o: { round: number; towers: TowerKind[]; only?: EnemyKind[]; tuning?: TuningPatch; seeds?: number[]; leak?: number; max?: number }): number {
  const seeds = o.seeds ?? [1, 2], leak = o.leak ?? 0.05, max = o.max ?? 20000;
  const hp = standardMaze({ tuning: o.tuning }).tuning.startHp;
  const holds = (budget: number) => seeds.reduce((a, seed) => a + mazeRaid({ ...o, seed, budget }).shipDamage, 0) <= leak * hp * seeds.length;
  let lo = 0, hi = 400;
  while (!holds(hi)) { lo = hi; hi *= 2; if (hi > max) return Infinity; }
  while (hi - lo > 50) { const mid = Math.round((lo + hi) / 100) * 50; if (mid <= lo || mid >= hi) break; if (holds(mid)) hi = mid; else lo = mid; }
  return hi;
}
