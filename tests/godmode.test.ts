import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

const open = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[20, 0]], rocks: [], trees: [] });

describe("god mode", () => {
  it("builds, plates and puts towers down without resources, and takes nothing", () => {
    const g = new Game(open(), { seed: 1, tuning: { startStone: 0, startAlloy: 0 } });
    expect(g.place("O", 0, [8, 5]).ok).toBe(false);
    g.god = true;
    const piece = g.place("O", 0, [8, 5]).piece!;
    expect(piece).toBeDefined();
    expect(g.plate(piece.id)).toBeTruthy();
    const t = g.buildTower("laser", [8, 5]).tower!;
    expect(t).toBeDefined();
    expect(g.growTower(t.id, [8, 5]).ok).toBe(true);
    expect(g.hotbar.count("stone")).toBe(0);
    expect(g.hotbar.count("alloy")).toBe(0);
    // Free things sell for nothing, so god mode can't make alloy.
    expect(g.sellTower(t.id)).toBe(0);
  });

  it("starts the next raid whenever asked, in calm", () => {
    const g = new Game(open(), { seed: 1 });
    g.god = true;
    expect(g.startWave()).toBe(true);
    expect(g.phase).toBe("wave");
    expect(g.startWave()).toBe(false);
  });

  it("the raid's mix is known before it starts", () => {
    const g = new Game(open(), { seed: 4 });
    const mix = g.raidMix();
    expect(mix.length).toBeGreaterThan(0);
    g.startWave();
    expect(g.waveRemaining).toBe(mix.reduce((a, m) => a + m.count, 0));
  });
});
