import { describe, expect, it } from "vitest";
import { alloyByRaid, holdBudget } from "../src/sim/balance";
import type { TowerKind } from "../src/sim/towers";

/**
 * The balance anchors (design doc, "Balance anchors"), played out headless on the
 * standard maze: the least alloy of some towers that holds a raid, with the ship
 * losing at most 5% of its HP.
 */

/** The right towers for what a raid brings: missiles for swarms, a Radome with guns for runners, lasers for brutes. */
const right = (round: number): TowerKind[] =>
  round < 2 ? ["explosive", "gun"] : round < 3 ? ["explosive", "support", "gun", "gun", "gun"] : ["explosive", "laser", "support", "gun", "gun", "laser"];

describe("the balance anchors hold for the default numbers", () => {
  it("the margin: the right towers hold each raid with about 80% of the tower curve's alloy (between half and all of it)", () => {
    for (const n of [1, 2, 3, 5]) {
      const need = holdBudget({ round: n, towers: right(n) }), curve = alloyByRaid(n);
      expect(need, `raid ${n}`).toBeLessThanOrEqual(curve);
      expect(need, `raid ${n}`).toBeGreaterThanOrEqual(0.5 * curve);
    }
  });

  it("the counter ratio: Guns alone need well over twice the alloy against a Swarm raid", () => {
    const racks = holdBudget({ round: 3, towers: ["explosive"], only: ["swarm"] });
    const guns = holdBudget({ round: 3, towers: ["gun"], only: ["swarm"] });
    expect(guns / racks).toBeGreaterThanOrEqual(2.5);
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
