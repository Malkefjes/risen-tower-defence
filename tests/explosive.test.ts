import { describe, expect, it } from "vitest";
import { alloyPerDps } from "../src/sim/balance";
import { Game, type Walker } from "../src/sim/game";
import { missileTime } from "../src/sim/towers";
import type { MapDef } from "../src/sim/world";
import { metalWall } from "./helpers";

const open = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[20, 0]], rocks: [], trees: [] });

function rack(): Game {
  const g = new Game(open(), { seed: 1, tuning: { startAlloy: 5000 } });
  metalWall(g, [[10, 2], [11, 2], [10, 3], [11, 3]], 1);
  g.buildTower("explosive", [10, 2]);
  // One missile per test: the next would be long in coming.
  g.tuning.towers.explosive[0]!.rate = 0.01;
  return g;
}

const walker = (id: number, x: number, y: number, hp = 10): Walker => ({
  id, x, y, cx: Math.floor(x), cy: Math.floor(y), tx: Math.floor(x), ty: Math.floor(y), kind: "swarm", speed: 0, hp, maxHp: hp, pending: 0, practice: false,
});

const hpOf = (g: Game, id: number) => g.walkers.find(w => w.id === id)?.hp;

describe("the explosive tower (missile rack)", () => {
  it("hits everything within its blast radius where the missile lands, and nothing further", () => {
    const g = rack();
    const s = g.tuning.towers.explosive[0]!;
    // The one furthest along (x 11.6) is the target; one 0.6 behind it is in the blast, one 3 back is not.
    g.walkers.push(walker(1, 11, 1.5), walker(2, 11.6, 1.5), walker(3, 8.6, 1.5));
    g.step();
    expect(g.shots).toHaveLength(1);
    expect(g.shots[0]!.targetId).toBe(2);
    for (let i = 0; i < 60 * 3; i++) g.step();
    expect(hpOf(g, 2)).toBe(10 - s.damage);
    expect(hpOf(g, 1)).toBe(10 - s.damage);
    expect(hpOf(g, 3)).toBe(10);
    expect(g.drainEvents().some(e => e.type === "blast")).toBe(true);
  });

  it("takes a missile's flight time to land", () => {
    const g = rack();
    g.walkers.push(walker(1, 11.5, 1.5));
    g.step();
    const dur = g.shots[0]!.dur;
    expect(dur).toBeCloseTo(missileTime(Math.hypot(11.5 - 10.5, 1.5 - 2.5)), 5);
    for (let i = 0; i < Math.floor(dur * 60) - 2; i++) g.step();
    expect(hpOf(g, 1)).toBe(10);
    for (let i = 0; i < 4; i++) g.step();
    expect(hpOf(g, 1)).toBeLessThan(10);
  });

  it("homes in: it bursts where the target has got to, not where it was aimed", () => {
    const g = rack();
    g.walkers.push(walker(1, 11.5, 1.5));
    g.step();
    // The target moves 2 cells on; another stands where it was.
    g.walkers[0]!.x = 13.5;
    g.walkers.push(walker(2, 11.5, 1.5));
    for (let i = 0; i < 60 * 3; i++) g.step();
    expect(hpOf(g, 1)).toBeLessThan(10);
    expect(hpOf(g, 2)).toBe(10);
  });

  it("counts the damage it deals to every enemy it hits", () => {
    const g = rack();
    const s = g.tuning.towers.explosive[0]!;
    g.walkers.push(walker(1, 11, 1.5), walker(2, 11.4, 1.5), walker(3, 11.2, 1.8));
    for (let i = 0; i < 60 * 3; i++) g.step();
    expect(g.towers[0]!.dealt).toBe(3 * s.damage);
  });

  it("is worse than the Gun per alloy on one target (a pack is where it pays)", () => {
    const t = new Game(open()).tuning;
    expect(alloyPerDps(t.towers.explosive[0]!)).toBeGreaterThan(alloyPerDps(t.towers.gun[0]!));
    for (const s of t.towers.explosive) expect(s.radius).toBeGreaterThan(0);
  });
});
