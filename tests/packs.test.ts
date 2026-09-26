import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";
import { gruntsOnly } from "./helpers";

const map = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[40, 0]], rocks: [], trees: [] });
const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };

describe("enemy packs", () => {
  it("a cave sends a pack, one enemy after another, then waits before the next", () => {
    // Grunts half a second apart (longer than a body length at their speed).
    const g = new Game(map(), { seed: 2, waveSize: () => 8, tuning: { packMin: 4, packMax: 4, packGap: 4, enemies: { ...gruntsOnly, grunt: { ...gruntsOnly.grunt, gap: 0.5 } } } });
    g.startWave();
    run(g, 4 * 0.5);
    expect(g.walkers).toHaveLength(4);
    run(g, 2);
    expect(g.walkers).toHaveLength(4);
    run(g, 4);
    expect(g.walkers).toHaveLength(8);
    expect(g.waveRemaining).toBe(8);
  });

  it("the last pack is only what is left, and the raid counts it", () => {
    const g = new Game(map(), { seed: 2, waveSize: () => 5, tuning: { packMin: 4, packMax: 4, packGap: 1, enemies: gruntsOnly } });
    g.startWave();
    expect(g.waveRemaining).toBe(5);
    run(g, 3);
    expect(g.walkers).toHaveLength(5);
  });

  it("a pack moves at one speed, packs differ a little, and each enemy has its own line", () => {
    const g = new Game(map(), { seed: 5, waveSize: () => 60, tuning: { packMin: 5, packMax: 5, packGap: 0.5, speedSpread: 0.12, enemies: { ...gruntsOnly, grunt: { ...gruntsOnly.grunt, gap: 0.5 } } } });
    g.startWave();
    const packs: number[][] = [];
    for (let p = 0; p < 12; p++) {
      const before = new Set(g.walkers.map(w => w.id));
      run(g, 5 * 0.5 + 0.5);
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

describe("raids mix enemy types", () => {
  const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };
  /** Play for a while and count every enemy that came out, by type (they may be killed or burrow before the end). */
  const sent = (g: Game, seconds: number) => {
    const seen = new Map<string, number>(), ids = new Set<number>();
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      g.step();
      for (const w of g.walkers) if (!ids.has(w.id)) { ids.add(w.id); seen.set(w.kind, (seen.get(w.kind) ?? 0) + 1); }
    }
    return seen;
  };

  it("send only types with a share, each in its own pack size, until the raid's size is spent", () => {
    const g = new Game(map(), { seed: 4, waveSize: () => 30, tuning: { ship: { damage: 0 }, packGap: 0.2, startHp: 1e9, enemies: { runner: { share: 0 } } } });
    g.startWave();
    const seen = sent(g, 120);
    expect(seen.has("runner")).toBe(false);
    const cost = [...seen].reduce((a, [k, n]) => a + n * g.tuning.enemies[k as "grunt"].cost, 0);
    // The raid's size is spent (a last pack may overshoot it by at most one enemy's cost).
    expect(cost).toBeGreaterThanOrEqual(30 - 1e-6);
    expect(cost).toBeLessThanOrEqual(30 + g.tuning.enemies.brute.cost);
  });

  it("a pack is one type, as many as its pack size, spaced by its gap (or a body length)", () => {
    const g = new Game(map(), { seed: 1, waveSize: () => 100, tuning: { enemies: { grunt: { share: 1 }, runner: { share: 0 }, brute: { share: 0 } } } });
    g.startWave();
    const e = g.tuning.enemies.grunt;
    g.step();
    run(g, g.packSpacing("grunt", g.walkers[0]!.speed) * (e.pack - 1) + 0.02);
    expect(g.walkers).toHaveLength(e.pack);
    expect(g.walkers.every(w => w.kind === "grunt")).toBe(true);
    expect(new Set(g.walkers.map(w => w.speed)).size).toBe(1);
  });

  it("a raid is shared between the types by their shares; one whose share doesn't make a whole enemy isn't sent", () => {
    const enemies = (share: Record<string, number>) => ({ enemies: {
      // All in before raid 1 (from 0), so no first-raid pack is added.
      grunt: { share: share.grunt ?? 0, cost: 0.25, pack: 8, from: 0 }, runner: { share: share.runner ?? 0, cost: 1, pack: 3, from: 0 }, brute: { share: share.brute ?? 0, cost: 6, pack: 1, from: 0 },
    } });
    // 12 in raid size, half each: 24 Grunts and 6 Runners.
    const g = new Game(map(), { seed: 3, waveSize: () => 12, tuning: enemies({ grunt: 1, runner: 1 }) });
    expect(g.raidMix()).toEqual([{ kind: "grunt", count: 24 }, { kind: "runner", count: 6 }]);
    // A Brute's share of 2 is a third of one: none come.
    const h = new Game(map(), { seed: 3, waveSize: () => 4, tuning: enemies({ runner: 1, brute: 1 }) });
    expect(h.raidMix()).toEqual([{ kind: "runner", count: 2 }]);
  });

  it("a type's first raid brings at least a whole pack of it", () => {
    const g = new Game(map(), { seed: 3, waveSize: () => 2, tuning: { enemies: { grunt: { share: 10, cost: 0.25, from: 1 }, runner: { share: 1, cost: 6, pack: 3, from: 2 }, brute: { share: 0 } } } });
    expect(g.raidMix(1).map(m => m.kind)).toEqual(["grunt"]);
    expect(g.raidMix(2).find(m => m.kind === "runner")?.count).toBe(3);
  });
});

describe("packs climb out a body length apart", () => {
  it("no enemy of a pack starts inside the one before it, even when the type's gap is shorter", () => {
    const g = new Game(map(), { seed: 2, waveSize: () => 3, tuning: { enemies: { grunt: { share: 1, gap: 0.01, pack: 12, from: 1, cost: 0.25 }, runner: { share: 0 }, brute: { share: 0 } } } });
    g.startWave();
    const seen: number[] = [];
    for (let i = 0; i < 60 * 8; i++) {
      g.step();
      const ws = [...g.walkers].sort((a, b) => b.x - a.x);
      for (let k = 1; k < ws.length; k++) seen.push(Math.hypot(ws[k - 1]!.x - ws[k]!.x, ws[k - 1]!.y - ws[k]!.y));
    }
    expect(g.walkers.length).toBe(12);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0.55 * 0.95);
  });
});
