import { describe, expect, it } from "vitest";
import { Game } from "../src/sim/game";
import { nodeArea, SHIP_CLEARANCE } from "../src/sim/ore";
import { cellKey } from "../src/sim/types";
import { CAVE_MIN_DIST, generateWorld } from "../src/sim/worldgen";

describe("generated world", () => {
  const gen = generateWorld(1);
  const map = gen.map;
  const plateau = new Set((map.plateaus ?? []).map(([x, y]) => cellKey(x, y)));

  it("is the same for the same seed", () => {
    const again = generateWorld(1);
    expect(again.map.caves).toEqual(map.caves);
    expect(again.map.ore).toEqual(map.ore);
  });

  it("has caves, rarer than ore, never on raised ground and away from the ship", () => {
    const caves = map.caves ?? [];
    expect(caves.length).toBeGreaterThanOrEqual(6);
    expect(caves.length).toBeLessThan((map.ore ?? []).length / 4);
    expect(map.spawners).toHaveLength(caves.length);
    for (const c of caves) {
      expect(Math.hypot(c.x, c.y)).toBeGreaterThanOrEqual(CAVE_MIN_DIST);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(plateau.has(cellKey(c.x + dx, c.y + dy))).toBe(false);
    }
  });

  it("keeps ore out of the zone around the ship", () => {
    for (const o of map.ore ?? []) for (const [x, y] of nodeArea({ id: 0, kind: o.kind, x: o.x, y: o.y, amount: 1, max: 1 })) {
      for (const [sx, sy] of map.nexus) expect(Math.max(Math.abs(x - sx), Math.abs(y - sy)) - 1).toBeGreaterThanOrEqual(SHIP_CLEARANCE);
    }
  });

  it("has a few stone nodes per metal node, with metal within reach of the ship", () => {
    const ore = map.ore ?? [];
    const stone = ore.filter(o => o.kind === "stone").length, metal = ore.length - stone;
    expect(stone / metal).toBeGreaterThanOrEqual(2);
    expect(stone / metal).toBeLessThanOrEqual(4.5);
    expect(ore.some(o => o.kind === "metal" && Math.hypot(o.x + 1, o.y + 1) < 30)).toBe(true);
  });

  it("never puts trees in touching cells", () => {
    const at = new Set([...map.trees, ...(map.deadTrees ?? [])].map(t => cellKey(t.x, t.y)));
    for (const t of [...map.trees, ...(map.deadTrees ?? [])]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) expect(at.has(cellKey(t.x + dx, t.y + dy))).toBe(false);
    }
  });

  it("lets enemies from every cave reach the ship", () => {
    const g = new Game(map, { seed: 1 });
    for (const [x, y] of g.world.spawners) expect(isFinite(g.field.at(x, y))).toBe(true);
  });

  it("only the nearest caves send enemies", () => {
    const g = new Game(map, { seed: 1, tuning: { activeCaves: 2 } });
    const active = g.activeSpawners();
    expect(active).toHaveLength(2);
    const d = (c: readonly [number, number]) => g.field.at(c[0], c[1]);
    const far = g.world.spawners.filter(s => !active.includes(s));
    for (const f of far) for (const a of active) expect(d(a)).toBeLessThanOrEqual(d(f));
  });

  it("starts the player on open ground", () => {
    const g = new Game(map, { seed: 1 });
    expect(g.heightAt(map.start![0], map.start![1])).toBe(0);
  });
});
