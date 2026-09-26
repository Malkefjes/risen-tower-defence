import { describe, expect, it } from "vitest";
import { alloyPerDps, dps, runRaid } from "../src/sim/balance";
import { ENEMY_KINDS } from "../src/sim/enemies";
import { Game } from "../src/sim/game";
import { MAX_TOWER_SIZE, TOWER_INFO, TOWER_KINDS } from "../src/sim/towers";
import { defaultTuning, mergeTuning } from "../src/sim/tuning";
import type { MapDef } from "../src/sim/world";
import { metalWall } from "./helpers";

describe("the design's balance rules hold for the default numbers", () => {
  const t = defaultTuning();

  it("every tower type has numbers for every size", () => {
    for (const kind of TOWER_KINDS) expect(t.towers[kind]).toHaveLength(MAX_TOWER_SIZE);
  });

  /** Towers that deal damage (a Radome's field slows and deals none). */
  const shooters = TOWER_KINDS.filter(k => TOWER_INFO[k].shot !== "field");

  it("bigger is investment, not a better deal: alloy per DPS stays within 25% of the 1×1's", () => {
    for (const kind of shooters) {
      const base = alloyPerDps(t.towers[kind][0]!);
      for (const s of t.towers[kind]) expect(Math.abs(alloyPerDps(s) / base - 1)).toBeLessThanOrEqual(0.25);
    }
  });

  it("bigger costs more, reaches further and hits harder per second (or, for a field, holds enemies Heavy longer)", () => {
    for (const kind of TOWER_KINDS) {
      const sizes = t.towers[kind];
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i]!.cost).toBeGreaterThan(sizes[i - 1]!.cost);
        expect(sizes[i]!.range).toBeGreaterThan(sizes[i - 1]!.range);
        if (TOWER_INFO[kind].shot === "field") expect(sizes[i]!.heavy).toBeGreaterThan(sizes[i - 1]!.heavy);
        else expect(dps(sizes[i]!)).toBeGreaterThan(dps(sizes[i - 1]!));
      }
    }
  });

  it("every enemy type has positive numbers", () => {
    for (const kind of ENEMY_KINDS) {
      const e = t.enemies[kind];
      expect(e.hp).toBeGreaterThan(0);
      expect(e.speed).toBeGreaterThan(0);
      expect(e.damage).toBeGreaterThan(0);
    }
  });
});

describe("saved tuning", () => {
  it("lays saved numbers over the defaults at any depth, and drops what no longer exists", () => {
    const m = mergeTuning({
      wallCost: 40, enemyHp: 99, twin: { cost: 1 },
      enemies: { grunt: { hp: 12 } }, towers: { gun: [{ range: 3 }, null] }, ship: { rate: "fast" },
    });
    const d = defaultTuning();
    expect(m.wallCost).toBe(40);
    expect(m.enemies.grunt).toEqual({ ...d.enemies.grunt, hp: 12 });
    expect(m.towers.gun[0]).toEqual({ ...d.towers.gun[0]!, range: 3 });
    expect(m.towers.gun[1]).toEqual(d.towers.gun[1]);
    expect(m.towers.gun).toHaveLength(MAX_TOWER_SIZE);
    expect(m.ship.rate).toBe(d.ship.rate);
    expect("enemyHp" in m).toBe(false);
    expect("twin" in m).toBe(false);
  });

  it("falls back to the defaults for nothing or junk", () => {
    expect(mergeTuning(undefined)).toEqual(defaultTuning());
    expect(mergeTuning("junk")).toEqual(defaultTuning());
  });
});

describe("playing a raid out headless", () => {
  const map = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[12, 0]], rocks: [], trees: [] });

  it("reports kills, the ship's damage and what each tower dealt", () => {
    const g = new Game(map(), { seed: 3, waveSize: () => 6, tuning: { startAlloy: 5000 } });
    metalWall(g, [[6, 1], [7, 1]], 801);
    const t = g.buildTower("gun", [6, 1]).tower!;
    const r = runRaid(g);
    expect(r.cleared).toBe(true);
    expect(r.killed).toBeGreaterThan(0);
    expect(r.dealt.get(t.id)).toBeGreaterThan(0);
    expect(r.seconds).toBeGreaterThan(0);
    expect(r.shipDamage).toBeGreaterThanOrEqual(0);
    expect(g.phase).toBe("planning");
  });

  it("a stronger gun lets less through (the same raid, the same seed)", () => {
    const play = (damage: number) => {
      const g = new Game(map(), { seed: 7, waveSize: () => 10, tuning: { startAlloy: 5000, towers: { gun: [{ damage }] }, ship: { damage: 0 } } });
      metalWall(g, [[6, 1], [7, 1]], 801);
      g.buildTower("gun", [6, 1]);
      return runRaid(g).shipDamage;
    };
    expect(play(10)).toBeLessThan(play(0.5));
  });
});
