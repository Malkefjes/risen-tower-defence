import { cellKey, type Cell } from "./types";
import type { Bounds, World } from "./world";

const D = Math.SQRT2;
/** 8 directions: [dx, dy, cost]. */
export const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, D], [1, -1, D], [-1, 1, D], [-1, -1, D],
];

const DX = DIRS.map(d => d[0]), DY = DIRS.map(d => d[1]), DC = DIRS.map(d => d[2]);

/**
 * Distance-to-nexus for every walkable cell. Enemies at any cell step to the
 * neighbor that minimises step cost + distance, so the field doubles as the
 * route for every enemy at once and handles rerouting for free.
 */
export class FlowField {
  constructor(
    readonly world: World,
    readonly bounds: Bounds,
    readonly dist: Float64Array,
    readonly extra?: ReadonlySet<string>,
    /** Cells over `bounds` as they were when the field was made: 0 open, 1 solid, 2 wall (crossable at a cost). */
    readonly blocked?: Uint8Array,
  ) {}

  get width(): number { return this.bounds.x1 - this.bounds.x0 + 1; }

  inBounds(x: number, y: number): boolean {
    const b = this.bounds;
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }

  /** Distance from cell to the nexus; Infinity when unreachable or outside the world. */
  at(x: number, y: number): number {
    if (!this.inBounds(x, y)) return Infinity;
    return this.dist[(y - this.bounds.y0) * this.width + (x - this.bounds.x0)]!;
  }

  /**
   * Can an enemy step from (x,y) by (dx,dy)? Solid cells never; a wall cell yes (by
   * chewing through it). Diagonals may not cut the corner of a wall or anything solid.
   */
  canStep(x: number, y: number, dx: number, dy: number): boolean {
    const nx = x + dx, ny = y + dy;
    if (!this.inBounds(nx, ny) || this.kind(nx, ny) === 1) return false;
    if (dx !== 0 && dy !== 0) {
      if (this.kind(x + dx, y) !== 0 || this.kind(x, y + dy) !== 0) return false;
    }
    return true;
  }

  /** 0 open, 1 solid, 2 wall. */
  private kind(x: number, y: number): number {
    if (this.blocked && this.inBounds(x, y)) return this.blocked[(y - this.bounds.y0) * this.width + (x - this.bounds.x0)]!;
    return this.world.isBlocked(x, y, this.extra) ? 1 : 0;
  }

  /** The next cell on the fastest route from (x,y), or null if none. */
  next(x: number, y: number): Cell | null {
    let best: Cell | null = null;
    let bestV = Infinity;
    for (const [dx, dy, c] of DIRS) {
      if (!this.canStep(x, y, dx, dy)) continue;
      const v = c + this.at(x + dx, y + dy);
      if (v < bestV - 1e-9) { bestV = v; best = [x + dx, y + dy]; }
    }
    return best;
  }

  /** Cells from `from` to beside the nearest target (inclusive). Empty if unreachable. */
  trace(from: Cell): Cell[] {
    if (!isFinite(this.at(from[0], from[1]))) return [];
    const out: Cell[] = [from];
    let [x, y] = from;
    for (let guard = 0; guard < 10000 && !this.world.targetNextTo(x, y); guard++) {
      const n = this.next(x, y);
      if (!n) break;
      [x, y] = n;
      out.push(n);
    }
    return out;
  }
}

/** Dijkstra outward from the nexus. `extra` adds hypothetical blocked cells (placement preview). */
/**
 * The flow field to the nearest target. Walls count as the time it takes to chew
 * through them, so a maze that's quicker to walk gets walked and a full block gets
 * chewed. `extraWallHp`: treat `extra` as a new wall with that HP (else as solid).
 */
export function computeField(world: World, extra?: ReadonlySet<string>, extraCells?: Iterable<Cell>, extraWallHp?: number): FlowField {
  const bounds = world.bounds(extraCells);
  const w = bounds.x1 - bounds.x0 + 1, h = bounds.y1 - bounds.y0 + 1;
  const dist = new Float64Array(w * h).fill(Infinity);
  // A number grid of blocked cells: building it once is far cheaper than looking up
  // text keys for every step of the search (big worlds have ~50,000 cells).
  const { grid: blocked, cost } = world.blockedGrid(bounds, extra, extraWallHp);
  const field = new FlowField(world, bounds, dist, extra, blocked);
  const heap = new MinHeap();

  // Paths lead to the nearest target: the ship and every smelter.
  for (const k of world.targets) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    const i = (y - bounds.y0) * w + (x - bounds.x0);
    dist[i] = 0;
    heap.push(0, i);
  }
  while (heap.size) {
    const i = heap.pop(), v = heap.lastValue;
    if (v > dist[i]!) continue;
    const x = i % w, y = (i - x) / w;
    for (let d = 0; d < 8; d++) {
      const dx = DX[d]!, dy = DY[d]!, c = DC[d]!;
      // Movement is symmetric, so "can a walker step from neighbor to here" == canStep(here -> neighbor).
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (blocked[j] === 1) continue;
      if (dx !== 0 && dy !== 0 && (blocked[y * w + nx] || blocked[ny * w + x])) continue;
      // Stepping from the neighbour into here: if here is a wall, chewing it costs time.
      const nv = v + c + (blocked[i] === 2 ? cost[i]! : 0);
      if (nv < dist[j]!) { dist[j] = nv; heap.push(nv, j); }
    }
  }
  return field;
}

export const keysOf = (cells: Iterable<Cell>): Set<string> => {
  const s = new Set<string>();
  for (const [x, y] of cells) s.add(cellKey(x, y));
  return s;
};

/** A binary min-heap of (value, item) in typed arrays: no allocation per push or pop. */
class MinHeap {
  private v = new Float64Array(1024);
  private i = new Int32Array(1024);
  private n = 0;
  /** The value of the item last returned by `pop`. */
  lastValue = 0;
  get size(): number { return this.n; }
  push(value: number, item: number): void {
    if (this.n === this.v.length) {
      const v = new Float64Array(this.n * 2), i = new Int32Array(this.n * 2);
      v.set(this.v); i.set(this.i); this.v = v; this.i = i;
    }
    const v = this.v, it = this.i;
    let c = this.n++;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (v[p]! <= value) break;
      v[c] = v[p]!; it[c] = it[p]!;
      c = p;
    }
    v[c] = value; it[c] = item;
  }
  /** Remove the smallest; returns its item (its value is in `lastValue`). */
  pop(): number {
    const v = this.v, it = this.i;
    const top = it[0]!;
    this.lastValue = v[0]!;
    const n = --this.n;
    if (n > 0) {
      const lv = v[n]!, li = it[n]!;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        if (l >= n) break;
        const r = l + 1, m = r < n && v[r]! < v[l]! ? r : l;
        if (v[m]! >= lv) break;
        v[c] = v[m]!; it[c] = it[m]!;
        c = m;
      }
      v[c] = lv; it[c] = li;
    }
    return top;
  }
}
