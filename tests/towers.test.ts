import { describe, expect, it } from "vitest";
import { Game, type Walker } from "../src/sim/game";
import type { MapDef } from "../src/sim/world";

const open = (extra: Partial<MapDef> = {}): MapDef => ({
  name: "test", spawners: [[0, 0]], nexus: [[20, 0]], rocks: [], trees: [], ...extra,
});

/** A game with walls set directly (piece ids given), plenty of credits. */
function withWalls(cells: [number, number, number][], credits = 100): Game {
  const g = new Game(open(), { seed: 1, tuning: { startCredits: credits } });
  for (const [x, y, id] of cells) g.world.walls.set(`${x},${y}`, id);
  return g;
}

/** Run the current wave to its end (or the end of the run). */
function finishWave(g: Game): void {
  let guard = 0;
  while (g.phase === "wave" && guard++ < 60 * 300) g.step();
}

const walker = (id: number, x: number, y: number, hp = 5): Walker => ({
  id, x: x + 0.5, y: y + 0.5, cx: x, cy: y, tx: x, ty: y, speed: 0, hp, maxHp: hp, pending: 0, practice: false,
});

describe("tower placement", () => {
  it("needs walls under every cell of the footprint", () => {
    const g = withWalls([[5, 5, 1]]);
    expect(g.checkTower("twin", [5, 5]).ok).toBe(true);
    const r = g.checkTower("twin", [6, 5]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-wall");
    const big = g.checkTower("gatling", [5, 5]);
    expect(big.ok).toBe(false);
  });

  it("a 2x2 may span walls from different pieces", () => {
    const g = withWalls([[5, 5, 1], [6, 5, 1], [5, 6, 2], [6, 6, 2]]);
    const r = g.buildTower("gatling", [5, 5]);
    expect(r.ok).toBe(true);
    expect(g.towers[0]!.cells).toHaveLength(4);
    expect(g.towers[0]!.cx).toBe(6);
    expect(g.towers[0]!.cy).toBe(6);
  });

  it("refuses terrain, overlapping towers, and building without credits", () => {
    const g = withWalls([[5, 5, 1], [6, 5, 1]], 5);
    expect(g.checkTower("twin", [3, 3]).ok).toBe(false);
    expect(g.buildTower("twin", [5, 5]).ok).toBe(true);
    const again = g.checkTower("twin", [5, 5]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("tower-there");
    expect(g.credits).toBe(1);
    const broke = g.checkTower("twin", [6, 5]);
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reason).toBe("credits");
  });

  it("a wall carrying a tower can't be picked up until the tower is sold", () => {
    const g = new Game(open(), { seed: 1, tuning: { startCredits: 50 } });
    const piece = g.place(g.hand[0]!.uid, 0, [8, 5]).piece!;
    const [x, y] = piece.cells[0]!;
    const t = g.buildTower("twin", [x, y]).tower!;
    expect(g.canPickUp(piece)).toBe(false);
    expect(g.pickUp(piece.id)).toBeNull();
    g.sellTower(t.id);
    expect(g.canPickUp(piece)).toBe(true);
  });
});

describe("selling", () => {
  it("refunds in full in the planning phase it was built, a share after", () => {
    const g = withWalls([[5, 5, 1], [7, 5, 1]]);
    const cost = g.towerCost("twin");
    const a = g.buildTower("twin", [5, 5]).tower!;
    expect(g.sellTower(a.id)).toBe(cost);
    expect(g.credits).toBe(100);

    const b = g.buildTower("twin", [7, 5]).tower!;
    g.startWave();
    expect(b.fresh).toBe(false);
    expect(g.sellValue(b)).toBe(Math.floor(cost * g.tuning.sellRefund));
    // Selling mid-wave is allowed.
    expect(g.sellTower(b.id)).toBe(Math.floor(cost * g.tuning.sellRefund));
    expect(g.towers).toHaveLength(0);
  });

  it("towers built mid-wave are not fresh", () => {
    const g = withWalls([[5, 5, 1]]);
    g.startWave();
    const t = g.buildTower("twin", [5, 5]).tower!;
    expect(t.fresh).toBe(false);
  });
});

describe("combat", () => {
  it("shoots the walker with the most progress toward the nexus", () => {
    const g = withWalls([[10, 2, 1]]);
    const t = g.buildTower("twin", [10, 2]).tower!;
    g.startWave();
    // Both in range; the one at x=12 is closer to the nexus at (20,0).
    g.walkers.push(walker(901, 9, 1), walker(902, 12, 1));
    expect(g.pickTarget(t)?.id).toBe(902);
  });

  it("ignores walkers out of range", () => {
    const g = withWalls([[10, 5, 1]]);
    const t = g.buildTower("twin", [10, 5]).tower!;
    g.walkers.push(walker(901, 10, 0));
    expect(g.pickTarget(t)).toBeNull();
  });

  it("damage lands after the bolt flies, and kills remove the walker", () => {
    const g = withWalls([[10, 2, 1]], 100);
    g.tuning.twin.damage = 5;
    g.buildTower("twin", [10, 2]);
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
    g.tuning.twin.damage = 5;
    const t = g.buildTower("twin", [10, 2]).tower!;
    g.walkers.push(walker(901, 11, 1, 5));
    g.step();
    expect(g.pickTarget(t)).toBeNull();
  });
});

describe("hp, income and the run", () => {
  it("each leaked enemy costs 1 HP; practice walkers cost nothing", () => {
    const g = new Game(open({ nexus: [[4, 0]] }), { seed: 1, waveSize: () => 3 });
    g.setTestWalkers(true);
    for (let i = 0; i < 60 * 8; i++) g.step();
    expect(g.hp).toBe(g.tuning.startHp);
    g.setTestWalkers(false);
    g.startWave();
    finishWave(g);
    expect(g.hp).toBe(g.tuning.startHp - 3);
  });

  it("pays flat income after each wave", () => {
    const g = new Game(open({ nexus: [[4, 0]] }), { seed: 1, waveSize: () => 1 });
    const start = g.credits;
    g.startWave();
    finishWave(g);
    expect(g.phase).toBe("planning");
    expect(g.credits).toBe(start + g.tuning.income);
  });

  it("the run ends at 0 HP, and reset starts a fresh run", () => {
    const g = new Game(open({ nexus: [[4, 0]] }), { seed: 1, waveSize: () => 5, tuning: { startHp: 2 } });
    g.place(g.hand[0]!.uid, 0, [10, 10]);
    g.startWave();
    finishWave(g);
    expect(g.phase).toBe("over");
    expect(g.hp).toBe(0);
    expect(g.canPlaceNow()).toBe(false);
    g.reset();
    expect(g.phase).toBe("planning");
    expect(g.hp).toBe(2);
    expect(g.round).toBe(1);
    expect(g.pieces).toHaveLength(0);
    expect(g.world.walls.size).toBe(0);
    expect(g.hand).toHaveLength(g.tuning.supplyPerRound);
  });

  it("enemy HP grows each round", () => {
    const g = new Game(open(), { seed: 1 });
    expect(g.enemyHp(1)).toBe(g.tuning.enemyHp);
    expect(g.enemyHp(5)).toBeGreaterThan(g.enemyHp(1));
  });
});
