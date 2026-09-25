import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

// Ship is the 3×3 at -1..1; supply radius 10 for these tests.
const map = (): MapDef => ({
  name: "test", spawners: [[30, 0]], nexus: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  rocks: [], trees: [], start: [-6, -6],
});
const game = () => new Game(map(), { seed: 1, supply: true, tuning: { supplyRadius: 10, startStone: 2000, startMetal: 1000 } });

describe("supply: walls and buildings must be in range and connected", () => {
  it("the first wall must touch the ship; a loose wall in the open can't go down", () => {
    const g = game();
    const loose = g.checkPlacement("I", 0, [5, 5]);
    expect(loose.ok).toBe(false);
    if (!loose.ok) expect(loose.reason).toBe("unconnected");
    expect(g.place("I", 0, [3, 0]).ok).toBe(true); // (2..5, 0), touching the ship at (1,0)
    expect(g.supplied.has("5,0")).toBe(true);
  });

  it("walls touching at a corner are connected", () => {
    const g = game();
    g.place("I", 0, [3, 0]); // (2..5, 0)
    expect(g.place("O", 0, [6, 1]).ok).toBe(true); // (6,1) touches (5,0) at a corner
    expect(g.supplied.has("7,2")).toBe(true);
  });

  it("nothing goes down beyond the radius, even connected", () => {
    const g = game();
    g.place("I", 0, [3, 0]); // (2..5, 0)
    g.place("I", 0, [7, 0]); // (6..9, 0)
    const far = g.checkPlacement("I", 0, [11, 0]); // (10..13, 0): past radius 10
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.reason).toBe("out-of-range");
  });

  it("a smelter must touch the network; picking up a link cuts supply beyond it", () => {
    const g = game();
    const a = g.place("I", 0, [3, 0]).piece!; // (2..5, 0)
    const b = g.place("I", 0, [7, 0]).piece!; // (6..9, 0)
    expect(g.checkSmelter([4, 4]).ok).toBe(false);
    const sm = g.buildSmelter([7, 1]);
    expect(sm.ok ? "ok" : sm.reason).toBe("ok"); // touches the second piece
    expect(g.pieceSupplied(b)).toBe(true);
    g.pickUp(a.id);
    expect(g.pieceSupplied(b)).toBe(false);
    expect(g.supplied.has("7,1")).toBe(false);
  });

  it("with the ship destroyed nothing is supplied", () => {
    const g = game();
    const a = g.place("I", 0, [3, 0]).piece!;
    g.hp = 1;
    (g as unknown as { damageTarget(k: string, n: number): void }).damageTarget("0,0", 5);
    expect(g.shipDown).toBe(true);
    expect(g.pieceSupplied(a)).toBe(false);
    expect(g.checkPlacement("I", 0, [3, 2]).ok).toBe(false);
  });
});
