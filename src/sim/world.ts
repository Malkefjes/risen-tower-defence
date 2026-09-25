import { nodeArea, nodeMax, type OreNodeDef } from "./ore";
import { cellKey, parseKey, type Cell } from "./types";

export interface RockDef { x: number; y: number; h: number }
export interface TreeDef { x: number; y: number; s: number }

/** Height of a wall's deck, in cells: where towers stand and the avatar can run. */
export const WALL_DECK = 0.58;

/** Top of a rock of map height `h` (the rock model grows with h): 0.64 to 0.96 cells, all within a jump. */
export const rockTop = (h: number): number => 0.64 + (h - 10) * 0.053;
/**
 * Trees are taller than a jump, but the avatar can clear them as if they were
 * this high (through the thin top of the crown). They can't be stood on.
 */
export const TREE_HURDLE = 0.7;
/** Raised ground (plateaus) and cave rock: out of jumping reach. */
export const PLATEAU_TOP = 1.35;

/**
 * A cave exit (an enemy spawner): its rock fills the 3×3 around (x, y), and the
 * mouth faces `dir`; enemies come out two cells that way.
 */
export interface CaveDef { x: number; y: number; dir: Cell }

export interface MapDef {
  name: string;
  spawners: Cell[];
  /** Where the avatar starts (cell). Defaults to the first spawner. */
  start?: Cell;
  /** Cells covered by the nexus. Enemies path to any of them. */
  nexus: Cell[];
  rocks: RockDef[];
  trees: TreeDef[];
  /** Ore nodes (3×3), by north-west cell. */
  ore?: OreNodeDef[];
  /** Raised ground: blocks, too high to jump onto. */
  plateaus?: Cell[];
  /** Cave exits; their mouths should also be listed as spawners. */
  caves?: CaveDef[];
  /** Hurdles like trees (jump over, can't stand on). */
  deadTrees?: TreeDef[];
  crystals?: TreeDef[];
}

export interface Bounds { x0: number; y0: number; x1: number; y1: number }

/** How far past everything that exists the world is considered walkable. */
export const WORLD_MARGIN = 3;

/**
 * The static and built state of the map. The world has no edge: the walkable
 * area is the bounding box of everything that exists, plus a margin, so
 * enemies can always walk around the outside of any structure.
 */
export class World {
  readonly map: MapDef;
  readonly terrain = new Set<string>();
  /** How high each terrain cell is for the avatar (rocks: their top; trees: a hurdle). */
  readonly terrainTop = new Map<string, number>();
  readonly trees = new Set<string>();
  readonly nexus = new Set<string>();
  readonly spawners: Cell[];
  /** cell key -> id of the placed piece occupying it */
  readonly walls = new Map<string, number>();
  /** cell key -> id of the ore node blocking it (its footprint shrinks as it's mined) */
  readonly ore = new Map<string, number>();
  /** cell key -> id of the building (a smelter) standing on it */
  readonly buildings = new Map<string, number>();
  /**
   * What enemies go for, by cell: the ship (until it's destroyed) and every smelter.
   * Enemies path to the nearest one and attack it from a neighbouring cell.
   */
  readonly targets = new Set<string>();
  private staticBounds: Bounds;

  constructor(map: MapDef) {
    this.map = map;
    this.spawners = map.spawners.map(c => [c[0], c[1]] as Cell);
    for (const r of map.rocks) { const k = cellKey(r.x, r.y); this.terrain.add(k); this.terrainTop.set(k, rockTop(r.h)); }
    for (const t of [...map.trees, ...(map.deadTrees ?? []), ...(map.crystals ?? [])]) { const k = cellKey(t.x, t.y); this.terrain.add(k); this.trees.add(k); this.terrainTop.set(k, TREE_HURDLE); }
    for (const [x, y] of map.plateaus ?? []) { const k = cellKey(x, y); this.terrain.add(k); this.terrainTop.set(k, PLATEAU_TOP); }
    for (const c of map.caves ?? []) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const k = cellKey(c.x + dx, c.y + dy);
      this.terrain.add(k); this.terrainTop.set(k, PLATEAU_TOP);
    }
    for (const [x, y] of map.nexus) { this.nexus.add(cellKey(x, y)); this.targets.add(cellKey(x, y)); }
    const oreCells = (map.ore ?? []).flatMap(o => nodeArea({ id: 0, kind: o.kind, x: o.x, y: o.y, amount: 0, max: nodeMax(o.kind) }));
    const all: Cell[] = [...map.spawners, ...map.nexus, ...[...this.terrain].map(parseKey), ...oreCells];
    this.staticBounds = boundsOf(all);
  }

  isTerrain(x: number, y: number): boolean { return this.terrain.has(cellKey(x, y)); }
  isNexus(x: number, y: number): boolean { return this.nexus.has(cellKey(x, y)); }
  isSpawner(x: number, y: number): boolean { return this.spawners.some(s => s[0] === x && s[1] === y); }

  isOre(x: number, y: number): boolean { return this.ore.has(cellKey(x, y)); }

  /** A target cell next to (x, y) (8 ways), if any: an enemy there attacks it. */
  targetNextTo(x: number, y: number): string | null {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const k = cellKey(x + dx, y + dy);
      if ((dx || dy) && this.targets.has(k)) return k;
    }
    return null;
  }
  isTree(x: number, y: number): boolean { return this.trees.has(cellKey(x, y)); }

  /** Blocks movement (terrain, walls, ore, buildings, the ship or its wreck, or extra hypothetical cells). */
  isBlocked(x: number, y: number, extra?: ReadonlySet<string>): boolean {
    const k = cellKey(x, y);
    return this.terrain.has(k) || this.walls.has(k) || this.ore.has(k) || this.buildings.has(k) || this.nexus.has(k) || (extra ? extra.has(k) : false);
  }

  /** Can't be built on. */
  isOccupied(x: number, y: number): boolean {
    return this.isBlocked(x, y) || this.isNexus(x, y) || this.isSpawner(x, y);
  }

  /** Static terrain as a number grid, cached per bounds (terrain never changes). */
  private terrainCache: { key: string; grid: Uint8Array } | null = null;

  /**
   * Blocked cells over `b` as a grid (row-major, 1 = blocked): terrain, walls, ore, buildings
   * and any `extra` cells. What pathfinding searches over.
   */
  blockedGrid(b: Bounds, extra?: ReadonlySet<string>): Uint8Array {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, key = `${b.x0},${b.y0},${b.x1},${b.y1}`;
    if (this.terrainCache?.key !== key) {
      const grid = new Uint8Array(w * h);
      for (const k of this.terrain) {
        const [x, y] = parseKey(k);
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) grid[(y - b.y0) * w + (x - b.x0)] = 1;
      }
      this.terrainCache = { key, grid };
    }
    const grid = this.terrainCache.grid.slice();
    const mark = (keys: Iterable<string>) => {
      for (const k of keys) {
        const [x, y] = parseKey(k);
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) grid[(y - b.y0) * w + (x - b.x0)] = 1;
      }
    };
    mark(this.walls.keys());
    mark(this.ore.keys());
    mark(this.buildings.keys());
    mark(this.nexus);
    if (extra) mark(extra);
    return grid;
  }

  /** Walkable area: everything that exists, plus a margin. */
  bounds(extra?: Iterable<Cell>): Bounds {
    const b = { ...this.staticBounds };
    const grow = ([x, y]: Cell) => {
      if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y;
      if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y;
    };
    for (const k of this.walls.keys()) grow(parseKey(k));
    for (const k of this.buildings.keys()) grow(parseKey(k));
    if (extra) for (const c of extra) grow(c);
    return { x0: b.x0 - WORLD_MARGIN, y0: b.y0 - WORLD_MARGIN, x1: b.x1 + WORLD_MARGIN, y1: b.y1 + WORLD_MARGIN };
  }
}

function boundsOf(cells: Cell[]): Bounds {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of cells) {
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  }
  return b;
}
