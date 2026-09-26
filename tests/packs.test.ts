import { describe, expect, it } from "vitest";
import { Game, PACK_STAGGER } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

const map = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[40, 0]], rocks: [], trees: [] });
const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };

describe("enemy packs", () => {
  it("a cave sends a pack, one enemy after another, then waits before the next", () => {
    const g = new Game(map(), { seed: 2, waveSize: () => 8, tuning: { packMin: 4, packMax: 4, packGap: 4 } });
    g.startWave();
    run(g, 4 * PACK_STAGGER);
    expect(g.walkers).toHaveLength(4);
    run(g, 2);
    expect(g.walkers).toHaveLength(4);
    run(g, 3);
    expect(g.walkers).toHaveLength(8);
    expect(g.waveRemaining).toBe(8);
  });

  it("the last pack is only what is left, and the raid counts it", () => {
    const g = new Game(map(), { seed: 2, waveSize: () => 5, tuning: { packMin: 4, packMax: 4, packGap: 1 } });
    g.startWave();
    expect(g.waveRemaining).toBe(5);
    run(g, 3);
    expect(g.walkers).toHaveLength(5);
  });

  it("a pack moves at one speed, packs differ a little, and each enemy has its own line", () => {
    const g = new Game(map(), { seed: 5, waveSize: () => 60, tuning: { packMin: 5, packMax: 5, packGap: 0.5, speedSpread: 0.12 } });
    g.startWave();
    const packs: number[][] = [];
    for (let p = 0; p < 12; p++) {
      const before = new Set(g.walkers.map(w => w.id));
      run(g, 5 * PACK_STAGGER + 0.5);
      packs.push(g.walkers.filter(w => !before.has(w.id)).map(w => w.speed / g.tuning.enemies.grunt.speed));
    }
    for (const pack of packs) {
      expect(pack).toHaveLength(5);
      expect(new Set(pack).size).toBe(1);
      expect(pack[0]!).toBeGreaterThanOrEqual(0.88);
      expect(pack[0]!).toBeLessThanOrEqual(1.12);
    }
    expect(new Set(packs.map(p => p[0])).size).toBeGreaterThan(1);
    for (const w of g.walkers) expect(Math.abs(w.lane!)).toBeLessThanOrEqual(1);
    expect(new Set(g.walkers.map(w => w.lane)).size).toBe(g.walkers.length);
  });
});
