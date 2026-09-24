import { cellKey, parseKey, type Cell } from "./types";

export interface RockDef { x: number; y: number; h: number }
export interface TreeDef { x: number; y: number; s: number }

export interface MapDef {
  name: string;
  spawners: Cell[];
  /** Cells covered by the nexus. Enemies path to any of them. */
  nexus: Cell[];
  rocks: RockDef[];
  trees: TreeDef[];
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
  readonly nexus = new Set<string>();
  readonly spawners: Cell[];
  /** cell key -> id of the placed piece occupying it */
  readonly walls = new Map<string, number>();
  private staticBounds: Bounds;

  constructor(map: MapDef) {
    this.map = map;
    this.spawners = map.spawners.map(c => [c[0], c[1]] as Cell);
    for (const r of map.rocks) this.terrain.add(cellKey(r.x, r.y));
    for (const t of map.trees) this.terrain.add(cellKey(t.x, t.y));
    for (const [x, y] of map.nexus) this.nexus.add(cellKey(x, y));
    const all: Cell[] = [...map.spawners, ...map.nexus, ...[...this.terrain].map(parseKey)];
    this.staticBounds = boundsOf(all);
  }

  isTerrain(x: number, y: number): boolean { return this.terrain.has(cellKey(x, y)); }
  isNexus(x: number, y: number): boolean { return this.nexus.has(cellKey(x, y)); }
  isSpawner(x: number, y: number): boolean { return this.spawners.some(s => s[0] === x && s[1] === y); }

  /** Blocks movement (terrain, walls, or extra hypothetical cells). */
  isBlocked(x: number, y: number, extra?: ReadonlySet<string>): boolean {
    const k = cellKey(x, y);
    return this.terrain.has(k) || this.walls.has(k) || (extra ? extra.has(k) : false);
  }

  /** Can't be built on. */
  isOccupied(x: number, y: number): boolean {
    return this.isBlocked(x, y) || this.isNexus(x, y) || this.isSpawner(x, y);
  }

  /** Walkable area: everything that exists, plus a margin. */
  bounds(extra?: Iterable<Cell>): Bounds {
    const b = { ...this.staticBounds };
    const grow = ([x, y]: Cell) => {
      if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y;
      if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y;
    };
    for (const k of this.walls.keys()) grow(parseKey(k));
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
