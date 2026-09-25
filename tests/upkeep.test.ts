import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

const map = (): MapDef => ({
  name: "test", spawners: [[30, 0]], ship: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
  rocks: [], trees: [], start: [-3, 0],
});
const game = (t = {}) => new Game(map(), { seed: 1, supply: true, tuning: { supplyRadius: 12, startStone: 2000, startAlloy: 500, shipStartStone: 0, upkeepRate: 0.03, decayTime: 100, wallCost: 25, ...t } });
const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };

describe("the ship's inventory", () => {
  it("takes hotbar stacks and gives them back, only when you're next to it", () => {
    const g = game();
    const slot = g.hotbar.slots.findIndex(s => s?.kind === "stone");
    expect(g.shipPut(0)).toBe(0); // not the multitool
    expect(g.shipPut(slot)).toBe(1000);
    expect(g.shipStore.count("stone")).toBe(1000);
    g.avatar.place(20.5, 0.5);
    expect(g.shipTake(0)).toBe(0);
    g.avatar.place(-2.5, 0.5);
    expect(g.shipTake(0)).toBe(1000);
  });

  it("is lost when the ship is destroyed", () => {
    const g = game();
    g.shipPut(g.hotbar.slots.findIndex(s => s?.kind === "stone"));
    g.hp = 1;
    (g as unknown as { damageTarget(k: string, n: number): void }).damageTarget("0,0", 5);
    expect(g.shipStore.count("stone")).toBe(0);
  });
});

describe("upkeep and decay", () => {
  it("takes a share of each supplied thing's price per minute from the ship's stock", () => {
    const g = game();
    g.place("I", 0, [3, 0]); // 100 stone
    g.place("I", 0, [7, 0]);
    expect(g.upkeepPerMinute()).toEqual({ stone: 6, alloy: 0 });
    g.shipStore.add("stone", 60);
    expect(g.upkeepLasts()).toBeCloseTo(600, 5);
    run(g, 60);
    expect(g.shipStore.count("stone")).toBe(54);
    expect(g.upkeepPaid).toBe(true);
  });

  it("unpaid upkeep decays what the ship supplies; paying stops it", () => {
    const g = game();
    const p = g.place("I", 0, [3, 0]).piece!;
    run(g, 30); // 3 stone/min owed, nothing in the ship
    expect(g.upkeepPaid).toBe(false);
    const hp = g.pieceHp(p).hp;
    expect(hp).toBeLessThan(g.pieceHp(p).max);
    g.shipStore.add("stone", 100);
    run(g, 21);
    expect(g.upkeepPaid).toBe(true);
    const later = g.pieceHp(p).hp;
    run(g, 10);
    expect(g.pieceHp(p).hp).toBe(later);
  });

  it("walls cut off from supply decay to broken; supplied ones don't", () => {
    const g = game();
    const a = g.place("I", 0, [3, 0]).piece!;
    const b = g.place("I", 0, [7, 0]).piece!;
    g.shipStore.add("stone", 500);
    // Lock them (a raid came), then break the link: b is cut off.
    a.locked = b.locked = true;
    (g as unknown as { breakPiece(id: number): void }).breakPiece(a.id);
    expect(g.pieceSupplied(b)).toBe(false);
    run(g, 101);
    expect(g.pieces).not.toContain(b);
  });
});
