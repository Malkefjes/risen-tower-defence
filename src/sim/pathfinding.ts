import { cellKey, type Cell } from "./types";
import type { Bounds, World } from "./world";

const D = Math.SQRT2;
/** 8 directions: [dx, dy, cost]. */
export const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, D], [1, -1, D], [-1, 1, D], [-1, -1, D],
];

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

  /** Can an enemy step from (x,y) by (dx,dy)? Diagonals may not cut a blocked corner. */
  canStep(x: number, y: number, dx: number, dy: number): boolean {
    const nx = x + dx, ny = y + dy;
    if (!this.inBounds(nx, ny) || this.world.isBlocked(nx, ny, this.extra)) return false;
    if (dx !== 0 && dy !== 0) {
      if (this.world.isBlocked(x + dx, y, this.extra) || this.world.isBlocked(x, y + dy, this.extra)) return false;
    }
    return true;
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

  /** Cells from `from` to the nexus (inclusive). Empty if unreachable. */
  trace(from: Cell): Cell[] {
    if (!isFinite(this.at(from[0], from[1]))) return [];
    const out: Cell[] = [from];
    let [x, y] = from;
    for (let guard = 0; guard < 10000 && !this.world.isNexus(x, y); guard++) {
      const n = this.next(x, y);
      if (!n) break;
      [x, y] = n;
      out.push(n);
    }
    return out;
  }
}

/** Dijkstra outward from the nexus. `extra` adds hypothetical blocked cells (placement preview). */
export function computeField(world: World, extra?: ReadonlySet<string>, extraCells?: Iterable<Cell>): FlowField {
  const bounds = world.bounds(extraCells);
  const w = bounds.x1 - bounds.x0 + 1, h = bounds.y1 - bounds.y0 + 1;
  const dist = new Float64Array(w * h).fill(Infinity);
  const field = new FlowField(world, bounds, dist, extra);
  const idx = (x: number, y: number) => (y - bounds.y0) * w + (x - bounds.x0);
  const heap = new MinHeap();

  for (const k of world.nexus) {
    const [x, y] = k.split(",").map(Number) as [number, number];
    dist[idx(x, y)] = 0;
    heap.push(0, idx(x, y));
  }
  while (heap.size) {
    const [v, i] = heap.pop();
    if (v > dist[i]!) continue;
    const x = (i % w) + bounds.x0, y = Math.floor(i / w) + bounds.y0;
    for (const [dx, dy, c] of DIRS) {
      // Movement is symmetric, so "can a walker step from neighbor to here" == canStep(here -> neighbor).
      if (!field.canStep(x, y, dx, dy)) continue;
      const j = idx(x + dx, y + dy), nv = v + c;
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

class MinHeap {
  private v: number[] = [];
  private i: number[] = [];
  get size(): number { return this.v.length; }
  push(value: number, item: number): void {
    const v = this.v, it = this.i;
    v.push(value); it.push(item);
    let c = v.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (v[p]! <= v[c]!) break;
      [v[p], v[c]] = [v[c]!, v[p]!]; [it[p], it[c]] = [it[c]!, it[p]!];
      c = p;
    }
  }
  pop(): [number, number] {
    const v = this.v, it = this.i;
    const top: [number, number] = [v[0]!, it[0]!];
    const lv = v.pop()!, li = it.pop()!;
    if (v.length) {
      v[0] = lv; it[0] = li;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1;
        let m = c;
        if (l < v.length && v[l]! < v[m]!) m = l;
        if (r < v.length && v[r]! < v[m]!) m = r;
        if (m === c) break;
        [v[m], v[c]] = [v[c]!, v[m]!]; [it[m], it[c]] = [it[c]!, it[m]!];
        c = m;
      }
    }
    return top;
  }
}
