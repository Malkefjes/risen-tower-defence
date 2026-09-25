import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import { computeField } from "../src/sim/pathfinding";
import type { MapDef } from "../src/sim/world";
import { metalWall } from "./helpers";

const open = (extra: Partial<MapDef> = {}): MapDef => ({ name: "test", spawners: [[0, 0]], nexus: [[10, 0]], rocks: [], trees: [], start: [3, 8], ...extra });
const run = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };
const noGun = { cost: 0, damage: 0, range: 5.5, rate: 1 };
/** A column of stone walls at x, from y0 to y1 (whole pieces of one cell each). */
const column = (g: Game, x: number, y0: number, y1: number) => {
  for (let y = y0; y <= y1; y++) {
    g.pieces.push({ id: 500 + y, shape: "O", rot: 0, at: [x, y], cells: [[x, y]], locked: true, paid: 0, metal: false, plated: 0 });
    g.world.walls.set(`${x},${y}`, 500 + y);
    g.world.wallHp.set(`${x},${y}`, g.tuning.wallHp);
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

  it("a full block gets chewed through, slowly, by at most two at a time", () => {
    const g = new Game(open(), { seed: 1, waveSize: () => 5, tuning: { ship: noGun, wallHp: 300, enemyDamage: 2, wallClawers: 2, packMin: 5, packMax: 5 } });
    column(g, 5, -60, 60);
    g.field = computeField(g.world);
    const route = g.routes()[0]!;
    expect(route.some(([x]) => x === 5)).toBe(true);
    g.startWave();
    run(g, 8);
    const at = g.walkers.map(w => w.attacking).filter(Boolean);
    expect(at.length).toBe(5);
    expect(new Set(at).size).toBe(1);
    const k = at[0]!;
    // 300 HP at 2 clawers × 2 dps = 75 s; after 30 s it's still standing.
    run(g, 30);
    expect(g.world.walls.has(k)).toBe(true);
    expect(g.world.wallHp.get(k)).toBeLessThan(300);
    expect(g.world.wallHp.get(k)).toBeGreaterThan(300 - 4 * 38);
    run(g, 50);
    expect(g.world.walls.has(k)).toBe(false);
    expect(g.drainEvents().some(e => e.type === "wall-broken")).toBe(true);
  });

  it("a tower breaks with the wall under it; a 2×2 breaks if any of its walls do", () => {
    const g = new Game(open({ nexus: [[20, 0]] }), { seed: 1, tuning: { startAlloy: 2000 } });
    metalWall(g, [[4, 4], [5, 4], [4, 5], [5, 5]]);
    expect(g.buildTower("gatling", [4, 4]).ok).toBe(true);
    (g as unknown as { breakWall(k: string): void }).breakWall("5,5");
    expect(g.towers).toHaveLength(0);
    expect(g.pieceAt(4, 4)?.cells).toHaveLength(3);
    expect(g.drainEvents().some(e => e.type === "tower-destroyed")).toBe(true);
  });

  it("plating makes a wall tougher; repair costs stone for the HP missing", () => {
    const g = new Game(open({ nexus: [[20, 0]] }), { seed: 1, tuning: { startStone: 1000, startAlloy: 1000, wallCost: 25 } });
    const p = g.place("I", 0, [5, 5]).piece!;
    expect(g.pieceHp(p)).toEqual({ hp: 1200, max: 1200 });
    g.world.wallHp.set("5,5", 150);
    expect(g.repairCost(p)).toBe(Math.ceil((150 / 1200) * 100));
    g.plate(p.id);
    expect(g.pieceHp(p).max).toBe(3600);
    expect(g.world.wallHp.get("5,5")).toBe(450);
    const stone = g.ore("stone");
    expect(g.repair(p.id)).toBe(true);
    expect(g.pieceHp(p)).toEqual({ hp: 3600, max: 3600 });
    expect(stone - g.ore("stone")).toBeGreaterThan(0);
    expect(g.repair(p.id)).toBe(false);
  });
});
