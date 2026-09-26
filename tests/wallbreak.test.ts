import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import { computeField } from "../src/sim/pathfinding";
import type { MapDef } from "../src/sim/world";
import { gruntsOnly, metalWall } from "./helpers";

const open = (extra: Partial<MapDef> = {}): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[10, 0]], rocks: [], trees: [], start: [3, 8], ...extra });
const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };
const noGun = { cost: 0, damage: 0, range: 5.5, rate: 1 };
/** A column of stone walls at x, from y0 to y1 (whole pieces of one cell each). */
const column = (g: Game, x: number, y0: number, y1: number) => {
  for (let y = y0; y <= y1; y++) {
    g.pieces.push({ id: 500 + y, shape: "O", rot: 0, at: [x, y], cells: [[x, y]], locked: true, paid: 0, metal: false, plated: 0 });
    g.world.walls.set(`${x},${y}`, 500 + y);
    g.world.pieceHp.set(500 + y, g.tuning.wallHp);
  }
};

describe("walls are slow obstacles", () => {
  it("enemies walk round a wall when that's quicker than chewing through", () => {
    const g = new Game(open(), { seed: 1, tuning: { ship: noGun } });
    column(g, 5, -3, 3);
    g.field = computeField(g.world);
    const route = g.routes()[0]!;
    expect(route.some(([x, y]) => x === 5 && y >= -3 && y <= 3)).toBe(false);
  });

  it("the end of a wall gets walked round, not chewed: a wall costs its chew time to step into", () => {
    // The ship is beyond the wall and up: the quickest way curls round the wall's end,
    // where the end cell itself is nearer the ship than the open cell beside it.
    const g = new Game(open({ ship: [[10, -5]] }), { seed: 1, waveSize: () => 3, tuning: { ship: noGun } });
    column(g, 5, -8, 0);
    g.field = computeField(g.world);
    expect(g.routes()[0]!.some(([x, y]) => g.world.walls.has(`${x},${y}`))).toBe(false);
    g.startWave();
    let chewed = false;
    for (let i = 0; i < 60 * 20; i++) { g.step(); if (g.walkers.some(w => w.attacking && g.world.walls.has(w.attacking))) chewed = true; }
    expect(chewed).toBe(false);
  });

  it("a full block gets chewed through, slowly, by at most two at a time", () => {
    const g = new Game(open(), { seed: 1, waveSize: () => 5, tuning: { ship: noGun, wallHp: 300, enemies: { ...gruntsOnly, grunt: { ...gruntsOnly.grunt, damage: 2 } }, wallClawers: 2, packMin: 5, packMax: 5 } });
    column(g, 5, -60, 60);
    g.field = computeField(g.world);
    const route = g.routes()[0]!;
    expect(route.some(([x]) => x === 5)).toBe(true);
    g.startWave();
    run(g, 8);
    const at = g.walkers.map(w => w.attacking).filter(Boolean);
    expect(at.length).toBe(5);
    expect(new Set(at).size).toBe(1);
    const k = at[0]!, id = g.world.walls.get(k)!;
    // 300 HP at 2 clawers × 2 dps = 75 s; after 30 s it's still standing.
    run(g, 30);
    expect(g.world.walls.has(k)).toBe(true);
    expect(g.world.pieceHp.get(id)).toBeLessThan(300);
    expect(g.world.pieceHp.get(id)).toBeGreaterThan(300 - 4 * 38);
    run(g, 50);
    expect(g.world.walls.has(k)).toBe(false);
    expect(g.drainEvents().some(e => e.type === "wall-broken")).toBe(true);
  });

  it("a piece breaks as a whole shape, with any tower on it; a 2×2 on two pieces goes if either does", () => {
    const g = new Game(open({ ship: [[20, 0]] }), { seed: 1, tuning: { startAlloy: 2000 } });
    metalWall(g, [[4, 4], [5, 4]], 801);
    metalWall(g, [[4, 5], [5, 5], [6, 5], [7, 5]], 802);
    const big = g.buildTower("gun", [4, 4]).tower!;
    expect(g.growTower(big.id, [4, 4]).ok).toBe(true);
    expect(g.buildTower("gun", [7, 5]).ok).toBe(true);
    (g as unknown as { breakPiece(id: number): void }).breakPiece(802);
    expect(g.towers).toHaveLength(0);
    for (const [x, y] of [[4, 5], [5, 5], [6, 5], [7, 5]]) expect(g.world.walls.has(`${x},${y}`)).toBe(false);
    expect(g.pieceAt(4, 4)).toBeDefined();
    expect(g.drainEvents().filter(e => e.type === "tower-destroyed")).toHaveLength(2);
  });

  it("plating makes a wall tougher; repair costs stone for the HP missing", () => {
    const g = new Game(open({ ship: [[20, 0]] }), { seed: 1, tuning: { startStone: 1000, startAlloy: 1000, wallCost: 25 } });
    const p = g.place("I", 0, [5, 5]).piece!;
    expect(g.pieceHp(p)).toEqual({ hp: 600, max: 600 });
    g.world.pieceHp.set(p.id, 150);
    expect(g.repairCost(p)).toBe(Math.ceil((450 / 600) * 100));
    g.plate(p.id);
    expect(g.pieceHp(p)).toEqual({ hp: 450, max: 1800 });
    const stone = g.ore("stone");
    expect(g.repair(p.id)).toBe(true);
    expect(g.pieceHp(p)).toEqual({ hp: 1800, max: 1800 });
    expect(stone - g.ore("stone")).toBeGreaterThan(0);
    expect(g.repair(p.id)).toBe(false);
  });
});
