import { describe, expect, it } from "vitest";
import { alloyByRaid, holdBudget } from "../src/sim/balance";
import { Game } from "../src/sim/game";
import { generateWorld } from "../src/sim/worldgen";
import type { TowerKind } from "../src/sim/towers";

/**
 * The balance anchors (design doc, "Balance anchors"), played out headless on the
 * standard maze: the least alloy of some towers that holds a raid, with the ship
 * losing at most 5% of its HP.
 */

/** The right towers for what a raid brings: missiles for Grunt packs, a Radome with guns for runners, lasers for brutes. */
const right = (round: number): TowerKind[] =>
  round < 2 ? ["explosive", "gun"] : round < 3 ? ["explosive", "support", "gun", "gun", "gun"] : ["explosive", "laser", "support", "gun", "gun", "laser"];

describe("the balance anchors hold for the default numbers", () => {
  it("the margin: raids 1–3 are gentle (learning, then a second cave and the first Brutes); from raid 4 the right towers need about 80% of the tower curve's alloy (between 45% and all of it)", () => {
    for (const n of [1, 2, 3]) expect(holdBudget({ round: n, towers: right(n) }), `raid ${n}`).toBeLessThanOrEqual(alloyByRaid(n));
    for (const n of [4, 6, 8]) {
      const need = holdBudget({ round: n, towers: right(n) }), curve = alloyByRaid(n);
      expect(need, `raid ${n}`).toBeLessThanOrEqual(curve);
      expect(need, `raid ${n}`).toBeGreaterThanOrEqual(0.45 * curve);
    }
  });

  it("raids stay readable: one pack of Grunts from one cave in raid 1, growing steadily, about a hundred by raid 10", () => {
    const g = new Game(generateWorld(1).map, { seed: 7, supply: true });
    const count = (r: number) => g.raidMix(r).reduce((a, m) => a + m.count, 0);
    expect(g.activeSpawners(1)).toHaveLength(1);
    expect(count(1)).toBeGreaterThanOrEqual(4);
    expect(count(1)).toBeLessThanOrEqual(10);
    for (let r = 2; r <= 10; r++) expect(count(r), `raid ${r}`).toBeGreaterThanOrEqual(count(r - 1));
    expect(count(10)).toBeLessThanOrEqual(120);
  });

  it("the counter ratio: Guns alone need at least twice the alloy against a raid of Grunt packs (it takes AOE)", () => {
    const racks = holdBudget({ round: 3, towers: ["explosive"], only: ["grunt"] });
    const guns = holdBudget({ round: 3, towers: ["gun"], only: ["grunt"] });
    expect(guns / racks).toBeGreaterThanOrEqual(2);
  });

  it("the laser cannon is the cheap answer to Brutes (about 3x), but Guns alone can still hold them", () => {
    const lasers = holdBudget({ round: 4, towers: ["laser"], only: ["brute"] });
    const guns = holdBudget({ round: 4, towers: ["gun"], only: ["brute"] });
    expect(Number.isFinite(guns)).toBe(true);
    expect(guns / lasers).toBeGreaterThanOrEqual(2);
    expect(guns / lasers).toBeLessThanOrEqual(6);
  });

  it("a Radome among Guns never costs more than Guns alone against Runners (a soft counter: the maze does the rest)", () => {
    const withRadome = holdBudget({ round: 3, towers: ["support", "gun", "gun", "gun", "gun", "gun", "gun", "gun", "gun"], only: ["runner"] });
    const guns = holdBudget({ round: 3, towers: ["gun"], only: ["runner"] });
    expect(withRadome).toBeLessThanOrEqual(guns);
  });
}, 600000);
