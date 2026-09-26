import { describe, expect, it } from "vitest";
import { ARMOUR_FLOOR, throughArmour } from "../src/sim/enemies";
import { Game, type Walker } from "../src/sim/game";
import { SLUG_SPEED } from "../src/sim/towers";
import { defaultTuning } from "../src/sim/tuning";
import type { MapDef } from "../src/sim/world";
import { metalWall } from "./helpers";

const open = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[20, 0]], rocks: [], trees: [] });

function withTower(kind: "laser" | "gun" | "explosive"): Game {
  const g = new Game(open(), { seed: 1, tuning: { startAlloy: 5000 } });
  metalWall(g, [[10, 2], [11, 2]], 1);
  g.buildTower(kind, [10, 2]);
  return g;
}

const brute = (x: number, y = 1.5, hp = 80): Walker => ({
  id: 901, x, y, cx: Math.floor(x), cy: Math.floor(y), tx: Math.floor(x), ty: Math.floor(y), kind: "brute", speed: 0, hp, maxHp: hp, pending: 0, practice: false,
});

describe("armour", () => {
  it("takes a flat amount off every hit, never below the floor", () => {
    expect(throughArmour(12, 0.75)).toBe(11.25);
    expect(throughArmour(1, 0.75)).toBe(0.25);
    expect(throughArmour(1, 5)).toBe(ARMOUR_FLOOR);
  });

  it("the Brute takes a quarter of the Gun's hits and nearly all of the laser cannon's", () => {
    const gun = withTower("gun"), b1 = brute(11.5);
    gun.walkers.push(b1);
    for (let i = 0; i < 20; i++) gun.step();
    const lostToGun = 80 - b1.hp, hits = Math.round(lostToGun / 0.25);
    expect(hits).toBeGreaterThan(0);
    expect(lostToGun).toBeCloseTo(hits * throughArmour(1, 0.75), 5);

    const laser = withTower("laser"), b2 = brute(11.5);
    laser.walkers.push(b2);
    for (let i = 0; i < 60; i++) laser.step();
    expect(b2.hp).toBeCloseTo(80 - throughArmour(laser.tuning.towers.laser[0]!.damage, 0.75), 5);
  });

  it("counts on every enemy a blast hits", () => {
    const g = withTower("explosive"), b = brute(11.5);
    g.tuning.towers.explosive[0]!.rate = 0.01; // one missile
    g.walkers.push(b);
    for (let i = 0; i < 60 * 3; i++) g.step();
    expect(80 - b.hp).toBeCloseTo(throughArmour(g.tuning.towers.explosive[0]!.damage, 0.75), 5);
  });
});

describe("the laser cannon", () => {
  it("fires one slug that crosses the gap at SLUG_SPEED", () => {
    const g = withTower("laser"), b = brute(14.5, 2.5);
    g.walkers.push(b);
    g.step();
    expect(g.shots).toHaveLength(1);
    expect(g.shots[0]!.dur).toBeCloseTo(4 / SLUG_SPEED, 5);
    expect(g.shots[0]!.radius).toBe(0);
  });

  it("beats the Gun per alloy against an armoured Brute; the Gun is the better deal on bare targets", () => {
    const t = defaultTuning(), armour = t.enemies.brute.armour;
    const perAlloy = (s: { damage: number; rate: number; cost: number }, a: number) => throughArmour(s.damage, a) * s.rate / s.cost;
    for (let i = 0; i < 2; i++) {
      expect(perAlloy(t.towers.laser[i]!, armour)).toBeGreaterThan(2 * perAlloy(t.towers.gun[i]!, armour));
      expect(perAlloy(t.towers.gun[i]!, 0)).toBeGreaterThan(perAlloy(t.towers.laser[i]!, 0));
    }
  });
});
