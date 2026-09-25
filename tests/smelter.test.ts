import { describe, expect, it } from "vitest";
import { Game, SMELTER_REACH } from "../src/sim/game";
import { gapTo, newSmelter, smelt } from "../src/sim/smelter";
import type { MapDef } from "../src/sim/world";

const open = (extra: Partial<MapDef> = {}): MapDef => ({ name: "test", spawners: [[0, 0]], nexus: [[20, 0]], rocks: [], trees: [], start: [6, 6], ...extra });
const rich = { startStone: 1000, startMetal: 1000, startAlloy: 0 };
const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };

describe("smelting", () => {
  it("turns raw metal into alloy 1:1, one piece at a time", () => {
    const s = newSmelter(1, [0, 0]);
    s.input.add("metal", 10);
    expect(smelt(s, 1, 5)).toBe(5);
    expect(s.input.count("metal")).toBe(5);
    expect(s.output.count("alloy")).toBe(5);
    expect(smelt(s, 10, 5)).toBe(5);
    expect(s.output.count("alloy")).toBe(10);
    expect(s.working).toBe(true);
    expect(smelt(s, 1, 5)).toBe(0);
    expect(s.working).toBe(false);
  });

  it("holds two stacks in and stops when its two output stacks are full", () => {
    const s = newSmelter(1, [0, 0]);
    expect(s.input.add("metal", 5000)).toBe(2000);
    s.output.add("alloy", 1999);
    expect(smelt(s, 10, 5)).toBe(1);
    expect(s.output.count("alloy")).toBe(2000);
    expect(s.working).toBe(true);
    expect(smelt(s, 1, 5)).toBe(0);
    expect(s.working).toBe(false);
    expect(s.input.count("metal")).toBe(1999);
  });
});

describe("the smelter in the game", () => {
  it("costs stone and raw metal, blocks like a wall, and becomes a target", () => {
    const g = new Game(open(), { seed: 1, tuning: rich });
    const before = g.field.at(0, 0);
    const r = g.buildSmelter([10, -1]);
    expect(r.ok).toBe(true);
    expect(g.ore("stone")).toBe(1000 - g.tuning.smelterStone);
    expect(g.ore("metal")).toBe(1000 - g.tuning.smelterMetal);
    expect(g.world.isBlocked(11, 0)).toBe(true);
    // It's nearer the cave than the ship, so enemies now head for it.
    expect(g.field.at(0, 0)).toBeLessThan(before);
    const end = g.routes()[0]!.at(-1)!;
    expect(g.smelterAt(...(g.world.targetNextTo(end[0], end[1])!.split(",").map(Number) as [number, number]))).toBe(r.smelter);
    expect(g.heightAt(10, -1)).toBe(Infinity);
  });

  it("can't be built without the stone and metal, on something, or across the only path", () => {
    const poor = new Game(open(), { seed: 1, tuning: { startStone: 1000, startMetal: 100 } });
    const a = poor.checkSmelter([10, 3]);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("metal");
    const g = new Game(open({ rocks: [{ x: 10, y: 3, h: 10 }] }), { seed: 1, tuning: rich });
    const b = g.checkSmelter([10, 3]);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe("occupied");
    // A ring of rock round the ship with a 2-wide gap: a smelter can't plug it (walls
    // could be chewed through, rock can't).
    const rocks: { x: number; y: number; h: number }[] = [];
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      if (Math.max(Math.abs(x), Math.abs(y)) === 2 && !(x === 2 && (y === 0 || y === 1))) rocks.push({ x, y, h: 10 });
    }
    const ring = new Game(open({ nexus: [[0, 0]], spawners: [[12, 0]], rocks }), { seed: 1, tuning: rich });
    const c = ring.checkSmelter([2, 0]);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe("cuts-off-rift");
    expect(ring.checkSmelter([5, -6]).ok).toBe(true);
  });

  it("takes raw metal from the hotbar, only when you're next to it, and gives alloy back", () => {
    const g = new Game(open(), { seed: 1, tuning: rich });
    const s = g.buildSmelter([8, 6]).smelter!;
    const slot = g.hotbar.slots.findIndex(x => x?.kind === "metal");
    const stoneSlot = g.hotbar.slots.findIndex(x => x?.kind === "stone");
    g.avatar.place(20.5, 20.5);
    expect(g.canUseSmelter(s)).toBe(false);
    expect(g.smelterPut(s.id, slot)).toBe(0);
    g.avatar.place(7.5, 6.5);
    expect(gapTo(s, g.avatar.x, g.avatar.y)).toBeLessThanOrEqual(SMELTER_REACH);
    expect(g.smelterPut(s.id, stoneSlot)).toBe(0);
    expect(g.smelterPut(s.id, slot)).toBe(700);
    expect(g.ore("metal")).toBe(0);
    run(g, 10);
    expect(s.output.count("alloy")).toBe(10 * g.tuning.smeltRate);
    expect(g.smelterTake(s.id, "output", 0)).toBe(50);
    expect(g.ore("alloy")).toBe(50);
    expect(g.smelterTake(s.id, "input", 0)).toBe(650);
    expect(g.ore("metal")).toBe(650);
  });

  it("can be removed for its full price and everything in it, only when you're next to it", () => {
    const g = new Game(open(), { seed: 1, tuning: rich });
    const s = g.buildSmelter([8, 6]).smelter!;
    g.avatar.place(7.5, 6.5);
    g.smelterPut(s.id, g.hotbar.slots.findIndex(x => x?.kind === "metal"));
    run(g, 4);
    g.tuning.smelterStone = 1; // a price change later doesn't change the refund
    g.avatar.place(20.5, 20.5);
    expect(g.removeSmelter(s.id)).toBe("far");
    g.avatar.place(7.5, 6.5);
    expect(g.removeSmelter(s.id)).toBe("ok");
    expect(g.smelters).toHaveLength(0);
    expect(g.world.isBlocked(8, 6)).toBe(false);
    expect(g.ore("stone")).toBe(1000);
    expect(g.ore("metal") + g.ore("alloy")).toBe(1000);
    expect(g.ore("alloy")).toBeGreaterThan(0);
  });

  it("won't be removed if the hotbar can't hold what it gives back", () => {
    const g = new Game(open(), { seed: 1, tuning: rich });
    const s = g.buildSmelter([8, 6]).smelter!;
    g.avatar.place(7.5, 6.5);
    for (let i = 1; i < g.hotbar.slots.length; i++) g.hotbar.slots[i] = { kind: "alloy", count: 1000 };
    expect(g.removeSmelter(s.id)).toBe("full");
    expect(g.smelters).toHaveLength(1);
  });
});
