import { TICK, type Game } from "./game";
import type { TowerStats } from "./towers";

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
