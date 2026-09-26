import { describe, expect, it } from "vitest";
import { RESIST_MAX, resistance, resistsText } from "../src/sim/enemies";
import { Game, type Walker } from "../src/sim/game";
import { defaultTuning } from "../src/sim/tuning";
import type { MapDef } from "../src/sim/world";

const open = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[20, 0]], rocks: [], trees: [] });
const walker = (kind: Walker["kind"]): Walker => ({
  id: 901, x: 5.5, y: 1.5, cx: 5, cy: 1, tx: 5, ty: 1, kind, speed: 0, hp: 100, maxHp: 100, pending: 0, practice: false,
});

describe("resistances", () => {
  it("the Elite takes half of a missile's damage and all of a Gun's or laser's", () => {
    const g = new Game(open(), { seed: 1 }), e = walker("elite");
    expect(g.hitFor(e, 12, "explosive")).toBe(6);
    expect(g.hitFor(e, 1, "piercing")).toBe(1);
    expect(g.hitFor(e, 12, "laser")).toBe(12);
  });

  it("the other types resist nothing", () => {
    const g = new Game(open(), { seed: 1 });
    for (const kind of ["grunt", "runner", "brute"] as const) {
      const e = g.enemyStats(kind);
      expect(resistsText(e)).toBe("");
      expect(resistance(e, "explosive")).toBe(0);
    }
    expect(resistsText(defaultTuning().enemies.elite)).toBe("explosive");
  });

  it("never makes an enemy immune", () => {
    const g = new Game(open(), { seed: 1, tuning: { enemies: { elite: { resistExplosive: 5 } } } });
    expect(g.hitFor(walker("elite"), 10, "explosive")).toBeCloseTo(10 * (1 - RESIST_MAX));
  });

  it("the Elite comes in small packs from raid 6", () => {
    const g = new Game(open(), { seed: 1 });
    expect(g.raidMix(5).some(m => m.kind === "elite")).toBe(false);
    expect(g.raidMix(6).find(m => m.kind === "elite")?.count).toBeGreaterThanOrEqual(g.enemyStats("elite").pack);
  });
});
