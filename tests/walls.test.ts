import { describe, expect, it } from "vitest";
import { Game, SHIP_SHOOTER } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

const open = (extra: Partial<MapDef> = {}): MapDef => ({
  name: "test", spawners: [[0, 0]], nexus: [[20, 0]], rocks: [], trees: [], start: [2, 12], ...extra,
});
const place = (g: Game, at: [number, number] = [8, 5]) => g.place("T", 0, at).piece!;

describe("stone and metal walls", () => {
  it("walls go down as stone, and towers can't stand on stone", () => {
    const g = new Game(open(), { seed: 1, tuning: { startAlloy: 500 } });
    const p = place(g);
    expect(p.metal).toBe(false);
    const [x, y] = p.cells[0]!;
    const r = g.checkTower("twin", [x, y]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("stone-wall");
  });

  it("metal plating turns the whole piece into the Armored deck, for alloy", () => {
    const g = new Game(open(), { seed: 1, tuning: { startAlloy: 500 } });
    const p = place(g);
    const before = g.routes();
    expect(g.plate(p.id)).toBe(true);
    expect(p.metal).toBe(true);
    expect(g.ore("alloy")).toBe(500 - g.tuning.platingCost);
    expect(g.routes()).toEqual(before); // same shape, same place: the path doesn't change
    const [x, y] = p.cells[0]!;
    expect(g.buildTower("twin", [x, y]).ok).toBe(true);
    expect(g.drainEvents().some(e => e.type === "plated")).toBe(true);
  });

  it("can't plate twice, or without the metal", () => {
    const g = new Game(open(), { seed: 1, tuning: { startAlloy: 120 } });
    const a = place(g, [8, 5]), b = place(g, [8, 9]);
    expect(g.plate(a.id)).toBe(true);
    expect(g.plate(a.id)).toBe(false);
    expect(g.plate(b.id)).toBe(false);
    expect(b.metal).toBe(false);
  });

  it("locked walls can be plated, during a wave too", () => {
    const g = new Game(open(), { seed: 1, tuning: { startAlloy: 500 } });
    const p = place(g);
    g.startWave();
    expect(p.locked).toBe(true);
    expect(g.plate(p.id)).toBe(true);
  });

  it("picking a plated wall back up returns its stone and its metal", () => {
    const g = new Game(open(), { seed: 1, tuning: { startStone: 100, startAlloy: 500 } });
    const p = place(g);
    g.plate(p.id);
    expect(g.pickUp(p.id)).not.toBeNull();
    expect(g.ore("stone")).toBe(100);
    expect(g.ore("alloy")).toBe(500);
  });

});

describe("the ship's gun", () => {
  it("shoots the enemy with the most progress within its range, from the ship's centre", () => {
    const g = new Game(open(), { seed: 1, tuning: { startAlloy: 0 } });
    const c = g.shipCenter(), r = g.tuning.ship.range;
    g.startWave();
    g.walkers = [];
    const w = (id: number, x: number, y: number) => ({ id, x: x + 0.5, y: y + 0.5, cx: x, cy: y, tx: x, ty: y, speed: 0, hp: 5, maxHp: 5, pending: 0, practice: false });
    g.walkers.push(w(801, Math.floor(c.x - r - 2), Math.floor(c.y)));
    g.step();
    expect(g.shots).toHaveLength(0);
    g.walkers.push(w(802, Math.floor(c.x - r + 1), Math.floor(c.y)));
    g.step();
    expect(g.shots).toHaveLength(1);
    expect(g.shots[0]!.targetId).toBe(802);
    expect(g.shots[0]!.towerId).toBe(SHIP_SHOOTER);
  });

  it("is weak: slow fire, a little damage", () => {
    const t = new Game(open(), { seed: 1 }).tuning;
    expect(t.ship.rate).toBeLessThan(t.twin.rate);
    expect(t.ship.damage).toBeLessThanOrEqual(t.twin.damage);
    expect(t.ship.range).toBeGreaterThanOrEqual(5);
  });
});
