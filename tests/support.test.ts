import { describe, expect, it } from "vitest";
import { Game, type Walker } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";
import { metalWall } from "./helpers";

const open = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[20, 0]], rocks: [], trees: [] });

/** A game with a 1×1 Radome at (10, 2) (field centre 10.5, 2.5) when `radome`, and room for a second at (11, 2). */
function field(radome = true): Game {
  const g = new Game(open(), { seed: 1, tuning: { startAlloy: 5000 } });
  metalWall(g, [[10, 2], [11, 2]], 1);
  if (radome) g.buildTower("support", [10, 2]);
  return g;
}

/** An enemy walking along row 0 toward the ship at 1 cell a second. */
const walker = (x: number): Walker => ({
  id: 901, x: x + 0.5, y: 0.5, cx: x, cy: 0, tx: x, ty: 0, kind: "runner", speed: 1, hp: 50, maxHp: 50, pending: 0, practice: false,
});

/** How far it walks in `seconds`. */
function walked(g: Game, w: Walker, seconds: number): number {
  const x0 = w.x;
  for (let i = 0; i < Math.round(seconds * 60); i++) g.step();
  return w.x - x0;
}

describe("the Radome's Heavy field", () => {
  it("makes enemies inside it Heavy: they walk heavySlow slower", () => {
    const plain = field(false), w0 = walker(9);
    plain.walkers.push(w0);
    const g = field(), w = walker(9);
    g.walkers.push(w);
    const free = walked(plain, w0, 0.5), slowed = walked(g, w, 0.5);
    expect(w.heavy).toBeGreaterThan(0);
    expect(slowed).toBeCloseTo(free * (1 - g.tuning.heavySlow), 1);
  });

  it("leaves enemies outside its range alone", () => {
    const g = field(), w = walker(2);
    g.walkers.push(w);
    walked(g, w, 1);
    expect(w.heavy ?? 0).toBe(0);
  });

  it("keeps them Heavy for its linger time after they leave, then lets go", () => {
    const g = field(), w = walker(9);
    g.walkers.push(w);
    walked(g, w, 0.2);
    // Carried far out of the field: still Heavy for the 1×1's linger time, then not.
    w.x = 16.5; w.cx = w.tx = 16;
    const linger = g.tuning.towers.support[0]!.heavy;
    walked(g, w, linger * 0.8);
    expect(w.heavy).toBeGreaterThan(0);
    walked(g, w, linger * 0.4);
    expect(w.heavy).toBe(0);
  });

  it("never stacks: two fields slow no more than one", () => {
    const one = field(), a = walker(9);
    one.walkers.push(a);
    const two = field(), b = walker(9);
    two.buildTower("support", [11, 2]);
    two.walkers.push(b);
    expect(walked(two, b, 0.5)).toBeCloseTo(walked(one, a, 0.5), 5);
  });

  it("fires nothing and deals no damage", () => {
    const g = field(), w = walker(9);
    g.walkers.push(w);
    walked(g, w, 2);
    expect(g.shots).toHaveLength(0);
    expect(w.hp).toBe(50);
    expect(g.towers[0]!.targetId).toBeNull();
  });
});
