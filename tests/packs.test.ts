import { describe, expect, it } from "vitest";
import { ENEMY_SPEED, Game, PACK_STAGGER } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

const map = (): MapDef => ({ name: "test", spawners: [[0, 0]], nexus: [[40, 0]], rocks: [], trees: [] });
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

  it("the last pack is only what is left, and the wave counts it", () => {
    const g = new Game(map(), { seed: 2, waveSize: () => 5, tuning: { packMin: 4, packMax: 4, packGap: 1 } });
    g.startWave();
    expect(g.waveRemaining).toBe(5);
    run(g, 3);
    expect(g.walkers).toHaveLength(5);
  });

  it("enemies differ a little in speed and line", () => {
    const g = new Game(map(), { seed: 5, waveSize: () => 40, tuning: { packMin: 40, packMax: 40, speedSpread: 0.12 } });
    g.startWave();
    run(g, 40 * PACK_STAGGER + 0.1);
    const speeds = g.walkers.map(w => w.speed / ENEMY_SPEED);
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(0.88);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(1.12);
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(0.1);
    for (const w of g.walkers) expect(Math.abs(w.lane!)).toBeLessThanOrEqual(1);
    expect(new Set(g.walkers.map(w => w.lane)).size).toBe(40);
  });
});
