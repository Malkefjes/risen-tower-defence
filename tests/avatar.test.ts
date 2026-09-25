import { describe, expect, it } from "vitest";
import { Avatar, defaultAvatarTuning, type AvatarInput, type HeightAt } from "../src/sim/avatar";

const DT = 1 / 60;
const T = defaultAvatarTuning();
const DECK = 0.58;

/** A world from a map of "x,y" -> height; everything else is snow. */
const world = (cells: Record<string, number>): HeightAt => (x, y) => cells[`${x},${y}`] ?? 0;
const run = (a: Avatar, input: AvatarInput, h: HeightAt, seconds: number, jumpFirst = false) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) a.step(DT, { ...input, jump: jumpFirst && i === 0 }, h, T);
};

describe("avatar movement", () => {
  it("accelerates to top speed and stops when input stops", () => {
    const a = new Avatar(0.5, 0.5);
    run(a, { x: 1, y: 0, jump: false }, world({}), 1);
    expect(a.speed).toBeCloseTo(T.speed);
    run(a, { x: 0, y: 0, jump: false }, world({}), 1);
    expect(a.speed).toBe(0);
  });

  it("is blocked by rocks and slides along them", () => {
    const rocks: Record<string, number> = {};
    for (let y = -2; y < 12; y++) rocks[`3,${y}`] = Infinity;
    const h = world(rocks);
    const a = new Avatar(0.5, 0.5);
    run(a, { x: 1, y: 1, jump: false }, h, 1.5);
    expect(a.x).toBeLessThanOrEqual(3 - T.radius);
    expect(a.y).toBeGreaterThan(2);
  });

  it("can't walk onto a wall from the ground", () => {
    const h = world({ "3,0": DECK });
    const a = new Avatar(0.5, 0.5);
    run(a, { x: 1, y: 0, jump: false }, h, 2);
    expect(a.x).toBeLessThan(3);
    expect(a.z).toBe(0);
  });

  it("jumps onto a wall deck, runs along it, and falls off the end", () => {
    const deck: Record<string, number> = {};
    for (let x = 3; x < 7; x++) deck[`${x},0`] = DECK;
    const h = world(deck);
    const a = new Avatar(2.3, 0.5);
    run(a, { x: 1, y: 0, jump: false }, h, 0.3, true);
    run(a, { x: 1, y: 0, jump: false }, h, 0.5);
    expect(a.grounded).toBe(true);
    expect(a.z).toBeCloseTo(DECK);
    expect(a.x).toBeGreaterThan(3);
    run(a, { x: 1, y: 0, jump: false }, h, 1.5);
    expect(a.x).toBeGreaterThan(7);
    expect(a.z).toBe(0);
  });

  it("reports take-off and landing", () => {
    const a = new Avatar(0.5, 0.5);
    let landed = false;
    a.step(DT, { x: 0, y: 0, jump: true }, world({}), T);
    expect(a.jumped).toBe(true);
    expect(a.grounded).toBe(false);
    for (let i = 0; i < 120 && !landed; i++) { a.step(DT, { x: 0, y: 0, jump: false }, world({}), T); landed = a.landed; }
    expect(landed).toBe(true);
    expect(a.z).toBe(0);
  });

  it("jump height matches the tuning", () => {
    const a = new Avatar(0.5, 0.5);
    let peak = 0;
    a.step(DT, { x: 0, y: 0, jump: true }, world({}), T);
    for (let i = 0; i < 120; i++) { a.step(DT, { x: 0, y: 0, jump: false }, world({}), T); peak = Math.max(peak, a.z); }
    expect(peak).toBeGreaterThan(T.jumpHeight * 0.93);
    expect(peak).toBeLessThan(T.jumpHeight * 1.05);
  });

  it("turns to face the direction of travel", () => {
    const a = new Avatar(0.5, 0.5);
    run(a, { x: 1, y: 0, jump: false }, world({}), 1);
    expect(a.facing).toBeCloseTo(Math.PI / 2, 2);
  });
});
