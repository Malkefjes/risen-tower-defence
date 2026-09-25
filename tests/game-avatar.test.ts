import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import { WALL_DECK, type MapDef } from "../src/sim/world";

const open = (extra: Partial<MapDef> = {}): MapDef => ({
  name: "test", spawners: [[0, 0]], nexus: [[20, 0]], rocks: [], trees: [], start: [5, 5], ...extra,
});
const ticks = (g: Game, n: number) => { for (let i = 0; i < n; i++) g.step(); };

describe("avatar in the game", () => {
  it("starts on the map's start cell and moves with input in any phase", () => {
    const g = new Game(open(), { seed: 1 });
    expect(g.avatar.x).toBe(5.5);
    g.avatarInput = { x: 1, y: 0, jump: false };
    ticks(g, 60);
    expect(g.avatar.x).toBeGreaterThan(8);
    g.startWave();
    ticks(g, 30);
    expect(g.avatar.x).toBeGreaterThan(10);
  });

  it("the ship, rocks and towers are solid; walls are decks", () => {
    const g = new Game(open({ rocks: [{ x: 7, y: 5, h: 10 }] }), { seed: 1, tuning: { startCredits: 50 } });
    g.world.walls.set("3,3", 1);
    g.buildTower("twin", [3, 3]);
    g.world.walls.set("4,3", 1);
    expect(g.heightAt(20, 0)).toBe(Infinity);
    expect(g.heightAt(7, 5)).toBe(Infinity);
    expect(g.heightAt(3, 3)).toBe(Infinity);
    expect(g.heightAt(4, 3)).toBe(WALL_DECK);
    expect(g.heightAt(9, 9)).toBe(0);
  });

  it("walls can't be placed on the avatar", () => {
    const g = new Game(open(), { seed: 1 });
    const r = g.checkPlacement("O", 0, [5, 5]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("avatar");
    expect(g.checkPlacement("O", 0, [8, 8]).ok).toBe(true);
  });

  it("towers can't be placed under the avatar standing on a deck", () => {
    const g = new Game(open(), { seed: 1, tuning: { startCredits: 50 } });
    g.world.walls.set("5,5", 1);
    g.avatar.place(5.5, 5.5, WALL_DECK);
    const r = g.checkTower("twin", [5, 5]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("avatar");
  });

  it("jumping onto a wall reports the landing, and the avatar never blocks enemies", () => {
    const g = new Game(open({ start: [2, 0] }), { seed: 1 });
    for (let x = 4; x < 8; x++) g.world.walls.set(`${x},0`, 1);
    g.avatarInput = { x: 1, y: 0, jump: true };
    g.drainEvents();
    ticks(g, 60);
    expect(g.avatar.z).toBeCloseTo(WALL_DECK);
    expect(g.drainEvents().some(e => e.type === "avatar-landed")).toBe(true);
    // Enemies path as if the avatar weren't there.
    g.avatar.place(10.5, 0.5);
    expect(isFinite(g.field.at(0, 1))).toBe(true);
  });

  it("a new run puts the avatar back at the start", () => {
    const g = new Game(open(), { seed: 1 });
    g.avatarInput = { x: 0, y: 1, jump: false };
    ticks(g, 60);
    g.reset();
    expect(g.avatar.x).toBe(5.5);
    expect(g.avatar.y).toBe(5.5);
  });
});
