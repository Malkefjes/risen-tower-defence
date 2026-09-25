import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

const open = (extra: Partial<MapDef> = {}): MapDef => ({
  name: "test", spawners: [[0, 0]], nexus: [[10, 0]], rocks: [], trees: [], start: [5, 6],
  ore: [{ x: 3, y: 8, kind: "stone" }], ...extra,
});
const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };
const tuning = { raidGrace: 100, raidInterval: 50, raidWarning: 20, noiseStone: 4, noiseMetal: 6, noiseWall: 2, noiseBuild: 5, smeltNoise: 0.5 };

describe("the raid clock", () => {
  it("starts the first raid on its own after the grace period, warning first", () => {
    const g = new Game(open(), { seed: 1, tuning });
    expect(g.raidIn).toBe(100);
    run(g, 79);
    expect(g.raidWarned).toBe(false);
    g.drainEvents();
    run(g, 2);
    expect(g.raidWarned).toBe(true);
    expect(g.drainEvents().some(e => e.type === "raid-warning")).toBe(true);
    expect(g.phase).toBe("planning");
    run(g, 20);
    expect(g.phase).toBe("wave");
  });

  it("gives the set time between a cleared raid and the next", () => {
    const g = new Game(open(), { seed: 1, waveSize: () => 1, tuning });
    g.startWave();
    let guard = 0;
    while (g.phase === "wave" && guard++ < 60 * 60) g.step();
    expect(g.phase).toBe("planning");
    expect(g.raidIn).toBe(50);
  });

  it("activity pulls it closer, but never into the warning", () => {
    const g = new Game(open(), { seed: 1, tuning });
    expect(g.place("I", 0, [5, -4]).ok).toBe(true);
    expect(g.raidIn).toBe(98);
    g.noise(1000);
    expect(g.raidIn).toBe(20);
    g.noise(5);
    expect(g.raidIn).toBe(20);
  });

  it("mining a stage makes noise", () => {
    const g = new Game(open(), { seed: 1, tuning });
    g.avatar.place(4.5, 7.2);
    g.mineInput = { firing: true, onSpot: false };
    const before = g.raidIn;
    for (let i = 0; i < 60 * 4; i++) g.stepAvatar();
    expect(g.raidIn).toBeCloseTo(before - 4, 5);
  });

  it("a working smelter runs the clock faster", () => {
    const g = new Game(open(), { seed: 1, tuning: { ...tuning, startStone: 1000, startMetal: 1000 } });
    const s = g.buildSmelter([6, 2]).smelter!;
    const afterBuild = g.raidIn;
    s.input.add("metal", 500);
    run(g, 10);
    expect(g.raidIn).toBeCloseTo(afterBuild - 15, 1);
  });
});
