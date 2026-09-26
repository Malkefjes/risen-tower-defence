import { describe, expect, it } from "vitest";
import { Game, type Walker } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";
import { gruntsOnly, metalWall } from "./helpers";

const open = (extra: Partial<MapDef> = {}): MapDef => ({
  name: "test", spawners: [[0, 0]], ship: [[20, 0]], rocks: [], trees: [], ...extra,
});

/** A game with walls set directly (piece ids given), plenty of metal. */
function withWalls(cells: [number, number, number][], metal = 1000): Game {
  const g = new Game(open(), { seed: 1, tuning: { startAlloy: metal } });
  const byId = new Map<number, [number, number][]>();
  for (const [x, y, id] of cells) byId.set(id, [...(byId.get(id) ?? []), [x, y]]);
  for (const [id, cs] of byId) metalWall(g, cs, id);
  return g;
}

/** Run the current wave to its end (or the end of the run). */
function finishWave(g: Game): void {
  let guard = 0;
  while (g.phase === "wave" && guard++ < 60 * 300) g.step();
}

const walker = (id: number, x: number, y: number, hp = 5): Walker => ({
  id, x: x + 0.5, y: y + 0.5, cx: x, cy: y, tx: x, ty: y, kind: "grunt", speed: 0, hp, maxHp: hp, pending: 0, practice: false,
});

describe("tower placement", () => {
  it("needs walls under every cell of the footprint", () => {
    const g = withWalls([[5, 5, 1]]);
    expect(g.checkTower("gun", [5, 5]).ok).toBe(true);
    const r = g.checkTower("gun", [6, 5]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-wall");
  });


  it("refuses terrain, overlapping towers, and building without alloy", () => {
    const g = withWalls([[5, 5, 1], [6, 5, 1]], 300);
    expect(g.checkTower("gun", [3, 3]).ok).toBe(false);
    expect(g.buildTower("gun", [5, 5]).ok).toBe(true);
    const again = g.checkTower("gun", [5, 5]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("tower-there");
    expect(g.ore("alloy")).toBe(300 - g.towerCost("gun"));
    const broke = g.checkTower("gun", [6, 5]);
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reason).toBe("alloy");
  });

  it("a wall carrying a tower can't be picked up until the tower is sold", () => {
    const g = new Game(open(), { seed: 1, tuning: { startAlloy: 500 } });
    const piece = g.place("T", 0, [8, 5]).piece!;
    g.plate(piece.id);
    const [x, y] = piece.cells[0]!;
    const t = g.buildTower("gun", [x, y]).tower!;
    expect(g.canPickUp(piece)).toBe(false);
    expect(g.pickUp(piece.id)).toBeNull();
    g.sellTower(t.id);
    expect(g.canPickUp(piece)).toBe(true);
  });
});

describe("selling", () => {
  it("refunds in full in the calm it was built, a share after", () => {
    const g = withWalls([[5, 5, 1], [7, 5, 1]]);
    const cost = g.towerCost("gun");
    const a = g.buildTower("gun", [5, 5]).tower!;
    expect(g.sellTower(a.id)).toBe(cost);
    expect(g.ore("alloy")).toBe(1000);

    const b = g.buildTower("gun", [7, 5]).tower!;
    g.startWave();
    expect(b.paidNow).toBe(0);
    expect(g.sellValue(b)).toBe(Math.floor(cost * g.tuning.sellRefund));
    // Selling mid-wave is allowed.
    expect(g.sellTower(b.id)).toBe(Math.floor(cost * g.tuning.sellRefund));
    expect(g.towers).toHaveLength(0);
  });

  it("towers built mid-raid sell at the share straight away", () => {
    const g = withWalls([[5, 5, 1]]);
    g.startWave();
    const t = g.buildTower("gun", [5, 5]).tower!;
    expect(g.sellValue(t)).toBe(Math.floor(g.towerCost("gun") * g.tuning.sellRefund));
  });
});

describe("combat", () => {
  it("shoots the walker with the most progress toward the ship", () => {
    const g = withWalls([[10, 2, 1]]);
    const t = g.buildTower("gun", [10, 2]).tower!;
    g.startWave();
    // Both in range; the one at x=12 is closer to the ship at (20,0).
    g.walkers.push(walker(901, 9, 1), walker(902, 12, 1));
    expect(g.pickTarget(t)?.id).toBe(902);
  });

  it("ignores walkers out of range", () => {
    const g = withWalls([[10, 5, 1]]);
    const t = g.buildTower("gun", [10, 5]).tower!;
    g.walkers.push(walker(901, 10, 0));
    expect(g.pickTarget(t)).toBeNull();
  });

  it("damage lands after the bolt flies, and kills remove the walker", () => {
    const g = withWalls([[10, 2, 1]]);
    g.tuning.towers.gun[0]!.damage = 5;
    g.buildTower("gun", [10, 2]);
    g.startWave();
    g.walkers.push(walker(901, 11, 1, 5));
    g.step();
    expect(g.shots).toHaveLength(1);
    expect(g.walkers[0]!.hp).toBe(5);
    for (let i = 0; i < 30; i++) g.step();
    expect(g.walkers.find(w => w.id === 901)).toBeUndefined();
    expect(g.drainEvents().some(e => e.type === "killed")).toBe(true);
  });

  it("doesn't overkill: a doomed walker is not targeted again", () => {
    const g = withWalls([[10, 2, 1]]);
    g.tuning.towers.gun[0]!.damage = 5;
    const t = g.buildTower("gun", [10, 2]).tower!;
    g.walkers.push(walker(901, 11, 1, 5));
    g.step();
    expect(g.pickTarget(t)).toBeNull();
  });
});

describe("hp and the run", () => {
  it("enemies stop beside the ship and claw it; practice walkers do no damage", () => {
    const noGun = { cost: 0, damage: 0, range: 5.5, rate: 1 };
    const g = new Game(open({ ship: [[4, 0]] }), { seed: 1, waveSize: () => 3, tuning: { enemies: { ...gruntsOnly, grunt: { damage: 2 } }, ship: noGun } });
    g.setTestWalkers(true);
    for (let i = 0; i < 60 * 8; i++) g.step();
    expect(g.hp).toBe(g.tuning.startHp);
    g.setTestWalkers(false);
    g.startWave();
    for (let i = 0; i < 60 * 12; i++) g.step();
    const clawing = g.walkers.filter(w => w.attacking === "4,0");
    expect(clawing.length).toBe(3);
    for (const w of clawing) expect(Math.max(Math.abs(w.cx - 4), Math.abs(w.cy))).toBe(1);
    const hp = g.hp;
    for (let i = 0; i < 60; i++) g.step();
    expect(hp - g.hp).toBeCloseTo(3 * 2, 1);
  });

  it("enemies go for the nearest target, and walk on when it's destroyed", () => {
    const noGun = { cost: 0, damage: 0, range: 5.5, rate: 1 };
    const g = new Game(open({ ship: [[20, 0]] }), { seed: 1, waveSize: () => 1, tuning: { startStone: 1000, startMetal: 1000, smelterHp: 40, enemies: { ...gruntsOnly, grunt: { damage: 5 } }, ship: noGun } });
    const s = g.buildSmelter([6, -1]).smelter!;
    g.startWave();
    for (let i = 0; i < 60 * 6; i++) g.step();
    expect(g.walkers[0]!.attacking).toMatch(/^[67],-?[01]$/);
    for (let i = 0; i < 60 * 9; i++) g.step();
    expect(g.smelters).not.toContain(s);
    expect(g.drainEvents().some(e => e.type === "smelter-destroyed")).toBe(true);
    for (let i = 0; i < 60 * 15; i++) g.step();
    expect(g.walkers[0]!.attacking).toBe("20,0");
  });

  it("the ship can be destroyed and the run goes on; enemies with nothing left burrow; reset starts fresh", () => {
    const g = new Game(open({ ship: [[4, 0]] }), { seed: 1, waveSize: () => 5, tuning: { startHp: 2 } });
    g.place("T", 0, [10, 10]);
    g.startWave();
    finishWave(g);
    expect(g.shipDown).toBe(true);
    expect(g.hp).toBe(0);
    expect(g.drainEvents().some(e => e.type === "ship-destroyed")).toBe(true);
    // Nothing left to attack: they burrowed, the raid is over, and you can still build.
    expect(g.phase).toBe("planning");
    expect(g.walkers).toHaveLength(0);
    expect(g.place("T", 0, [10, -10]).ok).toBe(true);
    g.reset();
    expect(g.shipDown).toBe(false);
    expect(g.phase).toBe("planning");
    expect(g.hp).toBe(2);
    expect(g.round).toBe(1);
    expect(g.pieces).toHaveLength(0);
    expect(g.world.walls.size).toBe(0);
    expect(g.ore("stone")).toBe(g.tuning.startStone);
  });

  it("enemy HP grows each raid", () => {
    const g = new Game(open(), { seed: 1 });
    expect(g.enemyHp("grunt", 1)).toBe(g.tuning.enemies.grunt.hp);
    expect(g.enemyHp("grunt", 5)).toBeGreaterThan(g.enemyHp("grunt", 1));
  });
});
