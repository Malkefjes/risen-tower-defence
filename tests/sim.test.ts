import { describe, expect, it } from "vitest";
import { Game, SUPPLY_PER_ROUND } from "../src/sim/game";
import { computeField } from "../src/sim/pathfinding";
import { pieceCells, shapeOffsets, SHAPE_IDS } from "../src/sim/pieces";
import { World, type MapDef } from "../src/sim/world";

const open = (extra: Partial<MapDef> = {}): MapDef => ({
  name: "test", spawners: [[0, 0]], nexus: [[10, 0]], rocks: [], trees: [], ...extra,
});

/** A fresh game: planning phase, holding the first supply drop. */
function planningGame(map: MapDef, seed = 1): Game {
  const g = new Game(map, { seed });
  expect(g.phase).toBe("planning");
  return g;
}

describe("pieces", () => {
  it("every shape has 4 cells and 4 rotations bring it back", () => {
    for (const s of SHAPE_IDS) {
      expect(shapeOffsets(s, 0)).toHaveLength(4);
      expect(shapeOffsets(s, 4)).toEqual(shapeOffsets(s, 0));
    }
  });
  it("rotates around the pivot cell", () => {
    for (const s of SHAPE_IDS) if (s !== "O") {
      for (let r = 0; r < 4; r++) expect(pieceCells(s, r, [5, 5]).some(([x, y]) => x === 5 && y === 5)).toBe(true);
    }
  });
});

describe("pathfinding", () => {
  it("walks straight across open ground", () => {
    const f = computeField(new World(open()));
    expect(f.at(0, 0)).toBeCloseTo(10);
  });

  it("uses diagonals", () => {
    const f = computeField(new World(open({ nexus: [[3, 3]] })));
    expect(f.at(0, 0)).toBeCloseTo(3 * Math.SQRT2);
  });

  it("never cuts between two diagonal walls", () => {
    // Walls at (1,0) and (0,1): the diagonal step (0,0)->(1,1) must be refused.
    const w = new World(open({ nexus: [[1, 1]] }));
    w.walls.set("1,0", 1); w.walls.set("0,1", 1);
    const f = computeField(w);
    expect(f.canStep(0, 0, 1, 1)).toBe(false);
    expect(f.at(0, 0)).toBeGreaterThan(Math.SQRT2 + 0.01);
  });

  it("never cuts past a single wall corner", () => {
    const w = new World(open({ nexus: [[1, 1]] }));
    w.walls.set("1,0", 1);
    expect(computeField(w).canStep(0, 0, 1, 1)).toBe(false);
  });

  it("the world has no edge: enemies walk around a long wall", () => {
    const w = new World(open({ nexus: [[0, 5]] }));
    for (let x = -30; x <= 30; x++) w.walls.set(`${x},2`, 1);
    const f = computeField(w);
    expect(isFinite(f.at(0, 0))).toBe(true);
    expect(f.trace([0, 0]).length).toBeGreaterThan(30);
  });

  it("route ends on the nexus", () => {
    const g = new Game(open(), { seed: 1 });
    const route = g.routes()[0]!;
    expect(route[0]).toEqual([0, 0]);
    expect(route[route.length - 1]).toEqual([10, 0]);
  });
});

describe("supply", () => {
  it("starts in planning with one supply drop in hand", () => {
    const g = new Game(open(), { seed: 3 });
    expect(g.phase).toBe("planning");
    expect(g.hand).toHaveLength(SUPPLY_PER_ROUND);
    expect(g.drainEvents().some(e => e.type === "supply")).toBe(true);
  });

  it("delivers three more walls each round, and unused walls carry over", () => {
    const g = planningGame(open());
    g.place(g.hand[0]!.uid, 0, [5, 5]);
    expect(g.hand).toHaveLength(SUPPLY_PER_ROUND - 1);
    g.startWave();
    let guard = 0;
    while (g.phase === "wave" && guard++ < 60 * 120) g.step();
    expect(g.phase).toBe("planning");
    expect(g.round).toBe(2);
    expect(g.hand).toHaveLength(SUPPLY_PER_ROUND * 2 - 1);
  });
});

describe("placement", () => {
  it("places, then undo returns the piece to the hand", () => {
    const g = planningGame(open());
    const held = g.hand[0]!;
    const r = g.place(held.uid, 0, [5, 4]);
    expect(r.ok).toBe(true);
    expect(g.hand).toHaveLength(SUPPLY_PER_ROUND - 1);
    expect(g.pieces).toHaveLength(1);
    expect(g.undo()).not.toBeNull();
    expect(g.pieces).toHaveLength(0);
    expect(g.hand).toHaveLength(SUPPLY_PER_ROUND);
    expect(g.hand[SUPPLY_PER_ROUND - 1]!.shape).toBe(held.shape);
  });

  it("refuses overlapping terrain, nexus and rift", () => {
    const g = planningGame(open({ rocks: [{ x: 5, y: 5, h: 10 }] }));
    const s = g.hand[0]!.shape;
    for (const at of [[5, 5], [10, 0], [0, 0]] as const) {
      // Find a rotation whose cells include the target, pivot sits on it.
      const r = g.checkPlacement(s, 0, at);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("occupied");
    }
  });

  it("refuses to fully enclose the nexus", () => {
    const g = planningGame(open({ spawners: [[6, 0]], nexus: [[0, 0]] }));
    // Ring around the nexus, leaving (1,-1) and (1,0) open.
    [[-1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]].forEach(([x, y], i) => g.world.walls.set(`${x},${y}`, 900 + i));
    g.field = computeField(g.world);
    expect(isFinite(g.field.at(6, 0))).toBe(true);
    const r = g.checkPlacement("O", 0, [1, -1]); // covers (1,-1) (2,-1) (1,0) (2,0)
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cuts-off-rift");
  });

  it("refuses placing on an enemy and trapping one", () => {
    const g = planningGame(open({ spawners: [[0, 0]], nexus: [[20, 0]] }));
    g.startWave();
    g.walkers.push({ id: 999, x: 5.5, y: 0.5, cx: 5, cy: 0, tx: 5, ty: 0, speed: 1 });
    const onWalker = g.checkPlacement("O", 0, [5, 0]);
    expect(onWalker.ok).toBe(false);
    if (!onWalker.ok) expect(onWalker.reason).toBe("walker");
    // Walls all around (5,0) except the west side (4,0).
    [[4, -1], [5, -1], [6, -1], [6, 0], [6, 1], [5, 1], [4, 1]].forEach(([x, y], i) => g.world.walls.set(`${x},${y}`, 900 + i));
    g.field = computeField(g.world);
    const trap = g.checkPlacement("I", 0, [2, 0]); // covers (1,0)..(4,0)
    expect(trap.ok).toBe(false);
    if (!trap.ok) expect(trap.reason).toBe("traps-walker");
  });

  it("pieces placed in planning lock when the wave starts; mid-wave placements lock at once", () => {
    const g = planningGame(open({ nexus: [[20, 0]] }));
    const p1 = g.place(g.hand[0]!.uid, 0, [5, 5]).piece!;
    expect(p1.locked).toBe(false);
    g.startWave();
    expect(p1.locked).toBe(true);
    expect(g.undo()).toBeNull();
    const p2 = g.place(g.hand[0]!.uid, 0, [5, -5]).piece!;
    expect(p2.locked).toBe(true);
  });

  it("enemies reroute when a wall appears on their route", () => {
    const g = planningGame(open({ spawners: [[0, 0]], nexus: [[12, 0]] }));
    g.startWave();
    for (let i = 0; i < 40; i++) g.step();
    const before = g.field.at(0, 0);
    const r = g.place(g.hand[0]!.uid, 1, [7, 0]);
    expect(r.ok).toBe(true);
    expect(g.field.at(0, 0)).toBeGreaterThan(before);
    // Everyone still arrives and the next round begins.
    let guard = 0;
    while (g.phase === "wave" && guard++ < 60 * 120) g.step();
    expect(g.phase).toBe("planning");
    expect(g.round).toBe(2);
  });
});
