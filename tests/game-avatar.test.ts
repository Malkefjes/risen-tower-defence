import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import { rockTop, TREE_HURDLE, WALL_DECK, type MapDef } from "../src/sim/world";
import { metalWall } from "./helpers";

const open = (extra: Partial<MapDef> = {}): MapDef => ({
  name: "test", spawners: [[0, 0]], ship: [[20, 0]], rocks: [], trees: [], start: [5, 5], ...extra,
});
const ticks = (g: Game, n: number) => { for (let i = 0; i < n; i++) { g.stepAvatar(); g.step(); } };

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

  it("the ship is solid; rocks, walls and towers have tops; trees are hurdles", () => {
    const g = new Game(open({ rocks: [{ x: 7, y: 5, h: 10 }], trees: [{ x: 8, y: 5, s: 1 }] }), { seed: 1, tuning: { startAlloy: 500 } });
    metalWall(g, [[3, 3]]);
    g.buildTower("gun", [3, 3]);
    metalWall(g, [[4, 3]]);
    expect(g.heightAt(20, 0)).toBe(Infinity);
    expect(g.heightAt(7, 5)).toBeCloseTo(rockTop(10));
    expect(g.heightAt(8, 5)).toBe(TREE_HURDLE);
    expect(g.standable(8, 5)).toBe(false);
    expect(g.standable(7, 5)).toBe(true);
    expect(g.heightAt(3, 3)).toBeCloseTo(WALL_DECK + 0.45);
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
    const g = new Game(open(), { seed: 1, tuning: { startAlloy: 500 } });
    metalWall(g, [[5, 5]]);
    g.avatar.place(5.5, 5.5, WALL_DECK);
    const r = g.checkTower("gun", [5, 5]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("avatar");
  });

  it("jumping onto a wall reports the landing, and the avatar never blocks enemies", () => {
    const g = new Game(open({ start: [2, 0] }), { seed: 1 });
    metalWall(g, [4, 5, 6, 7].map(x => [x, 0] as [number, number]));
    g.avatarInput = { x: 1, y: 0, jump: true };
    g.drainEvents();
    ticks(g, 60);
    expect(g.avatar.z).toBeCloseTo(WALL_DECK);
    expect(g.drainEvents().some(e => e.type === "avatar-landed")).toBe(true);
    // Enemies path as if the avatar weren't there.
    g.avatar.place(10.5, 0.5);
    expect(isFinite(g.field.at(0, 1))).toBe(true);
  });

  it("can climb from a wall deck onto a tower, but not from the snow", () => {
    const g = new Game(open({ start: [2, 0] }), { seed: 1, tuning: { startAlloy: 500 } });
    metalWall(g, [4, 5, 6, 7, 8].map(x => [x, 0] as [number, number]));
    g.buildTower("gun", [7, 0]);
    // From the snow straight at the tower's wall: lands on the deck in front of it.
    g.avatarInput = { x: 1, y: 0, jump: true };
    ticks(g, 40);
    g.avatarInput = { x: 0, y: 0, jump: false };
    expect(g.avatar.z).toBeCloseTo(WALL_DECK);
    expect(g.avatar.x).toBeLessThan(7);
    // A second jump from the deck, steering until over the tower, lands on it.
    ticks(g, 30);
    g.avatarInput = { x: 0.6, y: 0, jump: true };
    for (let i = 0; i < 60; i++) { if (g.avatar.x > 7.4) g.avatarInput.x = 0; ticks(g, 1); }
    g.avatarInput = { x: 0, y: 0, jump: false };
    ticks(g, 40);
    expect(g.avatar.z).toBeCloseTo(WALL_DECK + 0.45);
    expect(g.avatar.x + g.avatarTuning.radius).toBeGreaterThan(7);
  });

  it("a tower leaves a rim of wall around it: jump onto the rim from the snow, then onto the tower", () => {
    const g = new Game(open({ start: [3, 5] }), { seed: 1, tuning: { startAlloy: 500 } });
    metalWall(g, [[6, 5]]);
    g.buildTower("gun", [6, 5]);
    // The tower is out of reach from the snow...
    expect(WALL_DECK + 0.45).toBeGreaterThan(g.avatarTuning.jumpHeight + g.avatarTuning.stepUp);
    // ...but a jump lands on the rim in front of it.
    g.avatarInput = { x: 1, y: 0, jump: true };
    for (let i = 0; i < 60; i++) { g.stepAvatar(); if (g.avatar.grounded && g.avatar.z > 0) g.avatarInput.x = 0; }
    expect(g.avatar.z).toBeCloseTo(WALL_DECK);
    // From the rim, a short hop gets on top of the tower.
    g.avatarInput = { x: 1, y: 0, jump: true };
    for (let i = 0; i < 60; i++) { g.stepAvatar(); if (g.avatar.x > 6.5) g.avatarInput.x = 0; }
    expect(g.avatar.z).toBeCloseTo(WALL_DECK + 0.45);
  });

  it("walking beside a wall with a tower on it is unchanged: the wall still blocks at ground level", () => {
    const g = new Game(open({ start: [3, 4] }), { seed: 1, tuning: { startAlloy: 500 } });
    metalWall(g, [[6, 5]]);
    g.buildTower("gun", [6, 5]);
    // Run past along the row above it, then into it from the side.
    g.avatarInput = { x: 1, y: 0, jump: false };
    for (let i = 0; i < 90; i++) g.stepAvatar();
    expect(g.avatar.x).toBeGreaterThan(8);
    expect(g.avatar.z).toBe(0);
    const h = new Game(open({ start: [3, 5] }), { seed: 1, tuning: { startAlloy: 500 } });
    metalWall(h, [[6, 5]]);
    h.buildTower("gun", [6, 5]);
    h.avatarInput = { x: 1, y: 0, jump: false };
    for (let i = 0; i < 90; i++) h.stepAvatar();
    expect(h.avatar.x + h.avatarTuning.radius).toBeLessThanOrEqual(6);
    expect(h.avatar.z).toBe(0);
  });

  it("a new run puts the avatar back at the start", () => {
    const g = new Game(open(), { seed: 1 });
    g.avatarInput = { x: 0, y: 1, jump: false };
    ticks(g, 60);
    g.reset();
    expect(g.avatar.x).toBe(5.5);
    expect(g.avatar.y).toBe(5.5);
  });

  /** Run toward +x and jump when the avatar reaches `jumpAt`; returns the highest it stood. */
  const hop = (g: Game, jumpAt: number, seconds: number) => {
    let jumped = false, stood = 0;
    for (let i = 0; i < seconds * 60; i++) {
      g.avatarInput.x = 1; g.avatarInput.y = 0;
      if (!jumped && g.avatar.x >= jumpAt) { g.avatarInput.jump = true; jumped = true; }
      g.stepAvatar();
      if (g.avatar.grounded) stood = Math.max(stood, g.avatar.z);
    }
    return stood;
  };

  it("can jump onto a rock", () => {
    const g = new Game(open({ start: [3, 5], rocks: [{ x: 6, y: 5, h: 13 }] }), { seed: 1 });
    g.avatarInput = { x: 1, y: 0, jump: false };
    // Stop on top of it: run, jump, then let go once over the rock.
    for (let i = 0; i < 120; i++) {
      g.avatarInput.x = g.avatar.x > 6.5 ? 0 : 1;
      if (g.avatar.x >= 5.3 && g.avatar.grounded && g.avatar.z === 0) g.avatarInput.jump = true;
      g.stepAvatar();
    }
    expect(g.avatar.z).toBeCloseTo(rockTop(13));
    expect(Math.floor(g.avatar.x)).toBe(6);
  });

  it("can hop onto an ore node and up to its peak", () => {
    const g = new Game(open({ start: [2, 6], ore: [{ x: 6, y: 5, kind: "stone" }] }), { seed: 1 });
    expect(hop(g, 5.2, 2)).toBeGreaterThan(0.5);
  });

  it("clears a tree with a jump but never lands on it", () => {
    const g = new Game(open({ start: [3, 5], trees: [{ x: 6, y: 5, s: 1 }] }), { seed: 1 });
    let onTree = false;
    let jumped = false;
    for (let i = 0; i < 120; i++) {
      g.avatarInput.x = 1;
      if (!jumped && g.avatar.x >= 5.0) { g.avatarInput.jump = true; jumped = true; }
      g.stepAvatar();
      if (g.avatar.grounded && Math.floor(g.avatar.x) === 6 && g.avatar.z > 0) onTree = true;
    }
    expect(onTree).toBe(false);
    expect(g.avatar.x).toBeGreaterThan(7.5);
    // Without jumping, it blocks.
    const h = new Game(open({ start: [3, 5], trees: [{ x: 6, y: 5, s: 1 }] }), { seed: 1 });
    h.avatarInput = { x: 1, y: 0, jump: false };
    for (let i = 0; i < 120; i++) h.stepAvatar();
    // (only the trunk blocks: the middle half of the cell)
    expect(h.avatar.x + h.avatarTuning.radius).toBeLessThanOrEqual(6.25 + 1e-3);
  });

  it("slides off a tree trunk it comes down on", () => {
    const g = new Game(open({ start: [6, 5], trees: [{ x: 6, y: 5, s: 1 }] }), { seed: 1 });
    g.avatar.place(6.4, 5.5, 2);
    g.avatar.grounded = false;
    for (let i = 0; i < 90; i++) g.stepAvatar();
    expect(g.avatar.grounded).toBe(true);
    expect(g.avatar.z).toBe(0);
    // Out of the trunk (the middle half of the cell), not on top of it.
    const inTrunk = (v: number, c: number) => v + g.avatarTuning.radius > c + 0.25 && v - g.avatarTuning.radius < c + 0.75;
    expect(inTrunk(g.avatar.x, 6) && inTrunk(g.avatar.y, 5)).toBe(false);
  });
});
