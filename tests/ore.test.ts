import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import { nodeFootprint, STAGE_YIELD, stagesLeft, viewGap, type OreNode } from "../src/sim/ore";
import type { MapDef } from "../src/sim/world";
import { metalWall } from "./helpers";

const map = (extra: Partial<MapDef> = {}): MapDef => ({
  name: "test", spawners: [[0, 0]], nexus: [[20, 0]], rocks: [], trees: [],
  ore: [{ x: 8, y: 4, kind: "stone" }, { x: 14, y: 4, kind: "metal" }], start: [9, 8], ...extra,
});
const node = (amountFrac: number): OreNode => ({ id: 1, kind: "stone", x: 0, y: 0, amount: 600 * amountFrac, max: 600 });

/** Hold the tool on for a while. */
function mine(g: Game, seconds: number, onSpot = false): void {
  g.mineInput = { firing: true, onSpot };
  for (let i = 0; i < Math.round(seconds * 60); i++) g.stepAvatar();
  g.mineInput = { firing: false, onSpot: false };
}

describe("ore nodes", () => {
  it("the blocking footprint shrinks by stage: 3×3, a plus, the centre, nothing", () => {
    expect(nodeFootprint(node(1))).toHaveLength(9);
    expect(nodeFootprint(node(0.6))).toHaveLength(5);
    expect(nodeFootprint(node(0.3))).toEqual([[1, 1]]);
    expect(nodeFootprint(node(0))).toEqual([]);
    expect(stagesLeft(node(2 / 3))).toBe(2);
  });

  it("block enemies, can be climbed by the avatar, and can't be built on", () => {
    const g = new Game(map(), { seed: 1 });
    expect(g.world.isBlocked(9, 5)).toBe(true);
    // The avatar can climb it: a mound, highest in the middle.
    expect(g.heightAt(9, 5)).toBeGreaterThan(g.heightAt(8, 4));
    expect(g.heightAt(9, 5)).toBeLessThan(1);
    const check = g.checkPlacement("O", 0, [9, 5]);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("occupied");
    // The route goes around the node, not through it.
    for (const [x, y] of g.routes()[0]!) expect(g.world.isOre(x, y)).toBe(false);
  });

  it("reach is measured as it looks on screen: further toward the camera than to the side", () => {
    const n: OreNode = { id: 1, kind: "stone", x: 0, y: 0, amount: 600, max: 600 };
    expect(viewGap(1.5, 1.5, n)).toBe(0);
    // Straight toward the camera (+x +y) a world step looks half as long as one to the side (+x -y).
    const toward = viewGap(3 + 1, 3 + 1, n), side = viewGap(3 + 1, 0 - 1, n);
    expect(toward).toBeLessThan(side);
  });
});

describe("mining", () => {
  it("each stage drops its ore at once into the hotbar", () => {
    const g = new Game(map(), { seed: 1, tuning: { startStone: 0, startMetal: 0 } });
    const n = g.nodes[0]!;
    expect(g.nodeInReach()).toBe(n);
    mine(g, g.tuning.mineTime / 3 - 0.2);
    expect(g.ore("stone")).toBe(0);
    mine(g, 0.3);
    expect(g.ore("stone")).toBe(STAGE_YIELD.stone);
    expect(stagesLeft(n)).toBe(2);
    expect(g.drainEvents().some(e => e.type === "node-broke" && e.added === STAGE_YIELD.stone)).toBe(true);
    // Its footprint shrank to the plus: the corners are free again.
    expect(g.world.isOre(8, 4)).toBe(false);
    expect(g.world.isOre(9, 5)).toBe(true);
  });

  it("mines a whole node out, and the hotspot is faster", () => {
    const g = new Game(map(), { seed: 1, tuning: { startStone: 0 } });
    mine(g, g.tuning.mineTime / Game.HOTSPOT_BONUS + 0.1, true);
    expect(g.nodes[0]!.amount).toBe(0);
    expect(g.ore("stone")).toBe(600);
    expect(g.world.isOre(9, 5)).toBe(false);
  });

  it("does nothing out of reach, or without the tool", () => {
    const g = new Game(map({ start: [2, 12] }), { seed: 1, tuning: { startStone: 0 } });
    expect(g.nodeInReach()).toBeNull();
    mine(g, 5);
    expect(g.ore("stone")).toBe(0);
    const h = new Game(map(), { seed: 1, tuning: { startStone: 0 } });
    h.hotbar.select(2);
    mine(h, 5);
    expect(h.ore("stone")).toBe(0);
  });

  it("a full hotbar mines nothing and the node keeps its ore", () => {
    const g = new Game(map(), { seed: 1, tuning: { startStone: 0, startMetal: 0 } });
    g.hotbar.add("metal", 5000);
    g.mineInput = { firing: true, onSpot: false };
    for (let i = 0; i < 300; i++) g.stepAvatar();
    expect(g.mining.full).toBe(true);
    expect(g.nodes[0]!.amount).toBe(g.nodes[0]!.max);
  });
});

describe("ore pays for building", () => {
  it("walls cost stone per cell and give it back when picked up", () => {
    const g = new Game(map(), { seed: 1, tuning: { startStone: 100 } });
    const r = g.place("T", 0, [2, 10]);
    expect(r.ok).toBe(true);
    expect(g.ore("stone")).toBe(0);
    const again = g.checkPlacement("T", 0, [2, 14]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe("stone");
    g.pickUp(r.piece!.id);
    expect(g.ore("stone")).toBe(100);
  });

  it("towers cost metal", () => {
    const g = new Game(map(), { seed: 1, tuning: { startMetal: 200 } });
    metalWall(g, [[2, 10]]);
    expect(g.buildTower("twin", [2, 10]).ok).toBe(true);
    expect(g.ore("metal")).toBe(0);
  });
});

describe("regrowth", () => {
  const minedOut = () => {
    const g = new Game(map(), { seed: 1, waveSize: () => 1, tuning: { startStone: 0 } });
    mine(g, g.tuning.mineTime + 0.2);
    expect(g.nodes[0]!.amount).toBe(0);
    g.avatar.place(2.5, 12.5);
    return g;
  };
  const endWave = (g: Game) => {
    g.startWave();
    let guard = 0;
    while (g.phase === "wave" && guard++ < 60 * 120) g.step();
  };

  it("a mined-out node grows back at the next planning phase", () => {
    const g = minedOut();
    endWave(g);
    expect(g.phase).toBe("planning");
    expect(g.nodes[0]!.amount).toBe(g.nodes[0]!.max);
    expect(g.world.isOre(8, 4)).toBe(true);
  });

  it("but not while a wall stands on its ground", () => {
    const g = minedOut();
    g.world.walls.set("8,4", 99);
    endWave(g);
    expect(g.nodes[0]!.amount).toBe(0);
  });
});

describe("Frostfall", () => {
  it("its nodes sit on clear ground and the rift still reaches the ship", async () => {
    const { FROSTFALL } = await import("../src/sim/maps");
    const { nodeArea } = await import("../src/sim/ore");
    const g = new Game(FROSTFALL, { seed: 1 });
    expect(g.nodes.length).toBeGreaterThan(0);
    for (const n of g.nodes) for (const [x, y] of nodeArea(n)) {
      expect(g.world.isTerrain(x, y) || g.world.isNexus(x, y) || g.world.isSpawner(x, y)).toBe(false);
    }
    expect(g.routes()[0]!.length).toBeGreaterThan(0);
  });

  it("keeps its nodes out of the zone around the ship", async () => {
    const { FROSTFALL } = await import("../src/sim/maps");
    const { nodeArea, SHIP_CLEARANCE } = await import("../src/sim/ore");
    const g = new Game(FROSTFALL, { seed: 1 });
    for (const n of g.nodes) for (const [x, y] of nodeArea(n)) for (const [sx, sy] of FROSTFALL.nexus) {
      expect(Math.max(Math.abs(x - sx), Math.abs(y - sy)) - 1).toBeGreaterThanOrEqual(SHIP_CLEARANCE);
    }
  });
});
