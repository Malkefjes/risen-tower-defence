import { afterEach, describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import { growAt, TOWER_INFO } from "../src/sim/towers";
import type { MapDef } from "../src/sim/world";
import { metalWall } from "./helpers";

const open = (): MapDef => ({ name: "test", spawners: [[0, 0]], ship: [[20, 0]], rocks: [], trees: [] });

/** A game with a 3×3 block of plated wall at (4..6, 4..6) as one piece, a gun in its middle, and plenty of alloy. */
function withGun(alloy = 5000) {
  const g = new Game(open(), { seed: 1, tuning: { startAlloy: alloy } });
  metalWall(g, [[4, 4], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5], [4, 6], [5, 6], [6, 6]], 801);
  const t = g.buildTower("gun", [5, 5]).tower!;
  return { g, t };
}

const maxSize = TOWER_INFO.gun.maxSize;
afterEach(() => { TOWER_INFO.gun.maxSize = maxSize; });

describe("growing a tower in place", () => {
  it("grows toward the point: the bigger footprint holds the old one, on that side", () => {
    const { t } = withGun();
    expect(growAt(t, 5.2, 5.2)).toEqual([4, 4]);
    expect(growAt(t, 5.8, 5.2)).toEqual([5, 4]);
    expect(growAt(t, 5.2, 5.8)).toEqual([4, 5]);
    expect(growAt(t, 5.8, 5.8)).toEqual([5, 5]);
  });

  it("keeps the tower, pays the difference in price, and moves its centre", () => {
    const { g, t } = withGun();
    const alloy = g.ore("alloy"), cost = g.growCost(t);
    expect(cost).toBe(g.tuning.towers.gun[1]!.cost - g.tuning.towers.gun[0]!.cost);
    t.dealt = 42;
    const r = g.growTower(t.id, [4, 4]);
    expect(r.ok).toBe(true);
    expect(g.towers).toHaveLength(1);
    expect(t.size).toBe(2);
    expect(t.cells).toHaveLength(4);
    expect([t.cx, t.cy]).toEqual([5, 5]);
    expect(t.dealt).toBe(42);
    expect(t.paid).toBe(g.tuning.towers.gun[1]!.cost);
    expect(g.ore("alloy")).toBe(alloy - cost);
    for (const [x, y] of t.cells) expect(g.towerAt(x, y)).toBe(t);
    expect(g.towerStats(t)).toBe(g.tuning.towers.gun[1]);
    expect(g.drainEvents().some(e => e.type === "tower-grown")).toBe(true);
  });

  it("needs plated wall with no other tower under the new cells, and the alloy", () => {
    const { g, t } = withGun();
    // Not holding the old footprint.
    expect(g.checkGrow(t.id, [3, 3]).ok).toBe(false);
    // Off the wall.
    const g2 = new Game(open(), { seed: 1, tuning: { startAlloy: 5000 } });
    metalWall(g2, [[5, 5], [6, 5]], 801);
    const lone = g2.buildTower("gun", [5, 5]).tower!;
    const r = g2.checkGrow(lone.id, [5, 5]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-wall");
    // Another tower in the way.
    g.buildTower("gun", [4, 4]);
    const blocked = g.checkGrow(t.id, [4, 4]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("tower-there");
    // Stone wall.
    const g3 = new Game(open(), { seed: 1, tuning: { startAlloy: 5000 } });
    metalWall(g3, [[5, 5]], 801);
    g3.pieces.push({ id: 802, shape: "O", rot: 0, at: [6, 5], cells: [[6, 5], [7, 5], [6, 6], [7, 6]], locked: false, paid: 0, metal: false, plated: 0 });
    for (const k of ["6,5", "7,5", "6,6", "7,6"]) g3.world.walls.set(k, 802);
    metalWall(g3, [[5, 6]], 803);
    const s = g3.buildTower("gun", [5, 5]).tower!;
    const stone = g3.checkGrow(s.id, [5, 5]);
    expect(stone.ok).toBe(false);
    if (!stone.ok) expect(stone.reason).toBe("stone-wall");
  });

  it("refuses without the alloy, and past the largest size on offer", () => {
    const { g, t } = withGun();
    g.hotbar.remove("alloy", g.ore("alloy"));
    const poor = g.checkGrow(t.id, [4, 4]);
    expect(poor.ok).toBe(false);
    if (!poor.ok) expect(poor.reason).toBe("alloy");
    g.hotbar.add("alloy", 5000);
    expect(g.growTower(t.id, [4, 4]).ok).toBe(true);
    const max = g.checkGrow(t.id, [4, 4]);
    expect(max.ok).toBe(false);
    if (!max.ok) expect(max.reason).toBe("max-size");
    // Once a 3×3 is on offer, it grows again.
    TOWER_INFO.gun.maxSize = 3;
    expect(g.growTower(t.id, [4, 4]).ok).toBe(true);
    expect(t.cells).toHaveLength(9);
    expect(t.paid).toBe(g.tuning.towers.gun[2]!.cost);
  });

  it("sells back what was spent this calm in full, and the share of the rest", () => {
    const { g, t } = withGun();
    g.growTower(t.id, [4, 4]);
    expect(g.sellValue(t)).toBe(t.paid);
    g.startWave();
    const share = g.tuning.sellRefund;
    expect(g.sellValue(t)).toBe(Math.floor(t.paid * share));
    TOWER_INFO.gun.maxSize = 3;
    const before = t.paid;
    g.growTower(t.id, [4, 4]);
    // Growing mid-raid pays at the share too: nothing of it was spent in a calm.
    expect(g.sellValue(t)).toBe(Math.floor(t.paid * share));
    expect(t.paid).toBeGreaterThan(before);
    const alloy = g.ore("alloy"), value = g.sellValue(t);
    g.sellTower(t.id);
    expect(g.ore("alloy")).toBe(alloy + value);
    for (let x = 4; x <= 6; x++) for (let y = 4; y <= 6; y++) expect(g.towerAt(x, y)).toBeUndefined();
  });

  it("a grown tower reaches further", () => {
    const { g, t } = withGun();
    const before = g.towerStats(t).range;
    g.growTower(t.id, [4, 4]);
    expect(g.towerStats(t).range).toBeGreaterThan(before);
  });
});
