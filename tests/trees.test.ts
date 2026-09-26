import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

/** The avatar starts at (1, 0); a tree stands two cells on, just in reach, and another far off. */
const map = (): MapDef => ({ name: "test", spawners: [[-10, 0]], start: [1, 0], ship: [[20, 0]], rocks: [], trees: [{ x: 3, y: 0, s: 1 }, { x: 9, y: 0, s: 1 }] });
const hold = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.stepAvatar(); };

describe("cutting trees with the multitool", () => {
  it("a tree in reach falls after chopTime of the tool, and its cell is open ground", () => {
    const g = new Game(map(), { seed: 1 });
    expect(g.world.isOccupied(3, 0)).toBe(true);
    g.mineInput = { firing: true, onSpot: false, aim: [3, 0] };
    hold(g, g.tuning.chopTime * 0.8);
    expect(g.world.isTree(3, 0)).toBe(true);
    expect(g.chop?.progress).toBeGreaterThan(0.7);
    hold(g, g.tuning.chopTime * 0.3);
    expect(g.world.isTree(3, 0)).toBe(false);
    expect(g.world.isOccupied(3, 0)).toBe(false);
    expect(g.drainEvents().some(e => e.type === "tree-felled" && e.x === 3 && e.y === 0)).toBe(true);
    // Something can be built there now.
    expect(g.checkPlacement("O", 0, [3, 0]).ok || g.checkPlacement("O", 0, [3, -1]).ok).toBe(true);
  });

  it("only trees in reach, and only while the tool fires", () => {
    const g = new Game(map(), { seed: 1 });
    g.mineInput = { firing: true, onSpot: false, aim: [9, 0] };
    hold(g, 5);
    expect(g.world.isTree(9, 0)).toBe(true);
    g.mineInput = { firing: false, onSpot: false, aim: [3, 0] };
    hold(g, 5);
    expect(g.world.isTree(3, 0)).toBe(true);
  });

  it("a new run brings every cut tree back", () => {
    const g = new Game(map(), { seed: 1 });
    g.mineInput = { firing: true, onSpot: false, aim: [3, 0] };
    hold(g, g.tuning.chopTime + 0.2);
    expect(g.world.isTree(3, 0)).toBe(false);
    g.reset();
    expect(g.world.isTree(3, 0)).toBe(true);
    expect(g.world.isOccupied(3, 0)).toBe(true);
  });
});
