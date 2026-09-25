/**
 * The generated world (from the World playground, now the game's map). Pure logic:
 * a seed goes in, a `MapDef` plus the few extra fields the renderer needs come out.
 *
 * Zones around the landing site: a clearing, a pine forest belt, rocky highlands
 * (a bit more metal) and violet-stained wastes to the north-west. Raised ground
 * (plateaus with cliff edges) is most common in the highlands. Snow is pure white;
 * bare patches (ice, the landing scorch, wastes earth, wind-scoured rock) show where
 * it's gone. Enemy spawners are cave exits scattered across the map (never on raised
 * ground), rarer than ore, each facing the ship and always able to reach it.
 */
import type { OreKind, OreNodeDef } from "./ore";
import { cellKey, type Cell } from "./types";
import type { CaveDef, MapDef, TreeDef } from "./world";

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Smooth value noise in 0..1. */
export function noise(seed: number): (x: number, y: number) => number {
  const h = (x: number, y: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
export const smooth = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export interface Zones { clearing: number; forest: number; highlands: number; wastes: number }
export type Bare = "ice" | "scorch" | "rift" | "rock";
export const BARE_KINDS: readonly Bare[] = ["ice", "scorch", "rift", "rock"];
/** Patch levels: at `BARE_RIM` the snow thins, at `BARE_CORE` the ground shows. */
export const BARE_RIM = 0.5, BARE_CORE = 0.6;

export interface GeneratedWorld {
  seed: number;
  /** Half the size of the world, in cells: it spans -radius..radius-1. */
  radius: number;
  map: MapDef;
  zonesAt(x: number, y: number): Zones;
  /** How strongly each kind of bare ground shows at a point (0..1). */
  bareAt(x: number, y: number): Record<Bare, number>;
  /** The bare ground at a point, if any. */
  bareKind(x: number, y: number): Bare | null;
  /** Snow drifts: decoration only. */
  drifts: { x: number; y: number; s: number }[];
}

export interface WorldGenOptions {
  radius?: number;
  /** How many ore nodes to try for, and how many caves. */
  ore?: number;
  caves?: number;
}

const WASTES_DIR = Math.atan2(-1, -1); // north-west on the grid (x east, y south)
/** Caves keep at least this far from the ship (cells). */
/** Chance a node is metal, by zone: about three stone nodes per metal node overall. */
export const METAL_FOREST = 0.17, METAL_HIGHLANDS = 0.27;
export const CAVE_MIN_DIST = 24;
/** And at least this far from each other. */
export const CAVE_SPACING = 20;

export function generateWorld(seed: number, opts: WorldGenOptions = {}): GeneratedWorld {
  const R = opts.radius ?? 112;
  const edgeNoise = noise(seed * 5 + 3);
  const zonesAt = (x: number, y: number): Zones => {
    const wob = (edgeNoise(x / 18, y / 18) - 0.5) * 16;
    const d = Math.hypot(x, y) + wob;
    const clearing = 1 - smooth(9, 13, d);
    const far = smooth(42, 52, d);
    let da = Math.abs(Math.atan2(y, x) - WASTES_DIR);
    if (da > Math.PI) da = 2 * Math.PI - da;
    const toward = 1 - smooth(0.7, 1.05, da + (edgeNoise(x / 25 + 9, y / 25) - 0.5) * 0.5);
    const wastes = far * toward * smooth(58, 70, d);
    const highlands = Math.max(0, far - wastes);
    const forest = Math.max(0, 1 - clearing - highlands - wastes);
    return { clearing, forest, highlands, wastes };
  };

  const rand = rng(seed), grove = noise(seed * 3 + 1), rocky = noise(seed * 7 + 2), detail = noise(seed * 11 + 4);
  const lakes = noise(seed * 13 + 5), ridges = noise(seed * 17 + 6), jitter = noise(seed * 19 + 7);
  const bareAt = (x: number, y: number): Record<Bare, number> => {
    const z = zonesAt(x, y), j = (jitter(x / 2.5, y / 2.5) - 0.5) * 0.25, d = Math.hypot(x, y);
    // Frozen lakes: in the forest belt and clearing, well away from the landing site.
    const ice = smooth(0.66, 0.74, lakes(x / 16, y / 16) + j * 0.3) * (1 - z.highlands - z.wastes) * smooth(16, 22, d);
    // The ship's engines melted and scorched a ring where it came down.
    const scorch = 1 - smooth(2.6, 4.2, d + j * 3);
    // Wastes: patches of stained, heated earth.
    const rift = z.wastes * smooth(0.6, 0.72, detail(x / 5, y / 5) + j);
    // Wind scours the highland ridges down to rock.
    const rock = z.highlands * smooth(0.62, 0.72, ridges(x / 7, y / 7) + j);
    const clear = 1 - Math.min(1, ice * 1.6);
    return { ice, scorch, rift: rift * clear, rock: rock * clear };
  };
  const bareKind = (x: number, y: number): Bare | null => {
    const m = bareAt(x, y);
    for (const k of BARE_KINDS) if (m[k] >= BARE_RIM) return k;
    return null;
  };
  const onIce = (x: number, y: number) => bareAt(x + 0.5, y + 0.5).ice >= BARE_RIM - 0.1;

  // What each cell holds; blocking cells stop enemies and shape the maze.
  type Kind = "tree" | "dead" | "crystal" | "plateau" | "ore" | "cave";
  const cells = new Map<string, Kind>();
  const reserved = new Set<string>();
  const free = (x: number, y: number, pad = 0) => {
    for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
      const k = cellKey(x + dx, y + dy);
      if (cells.has(k) || reserved.has(k) || onIce(x + dx, y + dy)) return false;
    }
    return true;
  };
  const parse = (k: string) => k.split(",").map(Number) as [number, number];

  // --- Raised ground: the edges of higher land (see the World playground notes).
  const elev = noise(seed * 23 + 8), elev2 = noise(seed * 29 + 9);
  const high = new Set<string>();
  for (let y = -R; y < R; y++) for (let x = -R; x < R; x++) {
    if (Math.hypot(x, y) < 24 || onIce(x, y)) continue;
    const z = zonesAt(x + 0.5, y + 0.5);
    const e = elev(x / 22, y / 22) * 0.8 + elev2(x / 9, y / 9) * 0.2;
    const threshold = 0.64 * z.highlands + 0.7 * z.wastes + 0.8 * (z.forest + z.clearing);
    if (e > threshold) high.add(cellKey(x, y));
  }
  const n8 = (set: Set<string>, x: number, y: number) => {
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && set.has(cellKey(x + dx, y + dy))) c++;
    return c;
  };
  for (let pass = 0; pass < 3; pass++) {
    const next = new Set<string>();
    for (let y = -R; y < R; y++) for (let x = -R; x < R; x++) {
      const k = cellKey(x, y), c = n8(high, x, y);
      if (high.has(k) ? c >= 4 : c >= 6) next.add(k);
    }
    high.clear();
    for (const k of next) if (!onIce(...parse(k))) high.add(k);
  }
  const components = (inSet: (x: number, y: number) => boolean): string[][] => {
    const seen = new Set<string>(), out: string[][] = [];
    for (let y = -R; y < R; y++) for (let x = -R; x < R; x++) {
      const k0 = cellKey(x, y);
      if (seen.has(k0) || !inSet(x, y)) continue;
      const comp: string[] = [], stack: [number, number][] = [[x, y]];
      seen.add(k0);
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        comp.push(cellKey(cx, cy));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          const nx = cx + dx, ny = cy + dy, k = cellKey(nx, ny);
          if (nx < -R || ny < -R || nx >= R || ny >= R || seen.has(k) || !inSet(nx, ny)) continue;
          seen.add(k); stack.push([nx, ny]);
        }
      }
      out.push(comp);
    }
    return out;
  };
  // Keep only big plateaus (scraps read as standalone cliffs), and fill small holes.
  for (const comp of components((x, y) => high.has(cellKey(x, y)))) if (comp.length < 40) for (const k of comp) high.delete(k);
  for (const comp of components((x, y) => !high.has(cellKey(x, y)))) {
    if (comp.length >= 30) continue;
    for (const k of comp) if (!onIce(...parse(k))) high.add(k);
  }
  for (const k of high) cells.set(k, "plateau");

  // --- Caves: anywhere except raised ground (and ice), rarer than ore, facing the
  // ship, with a clear lane in front of the mouth. Enemies come out of the mouth cell.
  const caves: CaveDef[] = [];
  const caveTarget = opts.caves ?? 14;
  for (let tries = 0; tries < 6000 && caves.length < caveTarget; tries++) {
    const x = Math.floor((rand() * 2 - 1) * (R - 6)), y = Math.floor((rand() * 2 - 1) * (R - 6));
    if (Math.hypot(x, y) < CAVE_MIN_DIST || caves.some(c => Math.hypot(c.x - x, c.y - y) < CAVE_SPACING)) continue;
    // Face the ship, snapped to one of four directions.
    const dir: Cell = Math.abs(x) > Math.abs(y) ? [x > 0 ? -1 : 1, 0] : [0, y > 0 ? -1 : 1];
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (!free(x + dx, y + dy)) { ok = false; break; }
    for (let i = 2; i <= 5 && ok; i++) if (!free(x + dir[0] * i, y + dir[1] * i, 1)) ok = false;
    if (!ok) continue;
    caves.push({ x, y, dir });
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.set(cellKey(x + dx, y + dy), "cave");
    // Keep the ground around it and the way out clear of scenery.
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!cells.has(cellKey(x + dx, y + dy))) reserved.add(cellKey(x + dx, y + dy));
    for (let i = 2; i <= 5; i++) for (let s = -1; s <= 1; s++) reserved.add(cellKey(x + dir[0] * i + (dir[1] ? s : 0), y + dir[1] * i + (dir[0] ? s : 0)));
  }

  // --- Ore where it belongs: in the forest belt and highland outcrops, mostly stone.
  // The wastes hold none (yet).
  const ore: OreNodeDef[] = [];
  const oreTarget = opts.ore ?? 130;
  for (let tries = 0; tries < 8000 && ore.length < oreTarget; tries++) {
    const x = Math.floor((rand() * 2 - 1) * (R - 4)), y = Math.floor((rand() * 2 - 1) * (R - 4));
    const z = zonesAt(x + 1.5, y + 1.5);
    if (z.clearing > 0.05 || z.wastes > 0.3 || !free(x + 1, y + 1, 2)) continue;
    if (ore.some(n => Math.hypot(n.x - x, n.y - y) < 6)) continue;
    let kind: OreKind;
    // A few stone nodes per metal node: metal turns up in the forest belt too, so a
    // first tower is a short trip, and a bit more often up in the highlands.
    if (z.highlands > 0.6) kind = rand() < METAL_HIGHLANDS ? "metal" : "stone";
    else if (z.forest > 0.6) kind = rand() < METAL_FOREST ? "metal" : "stone";
    else continue;
    ore.push({ x, y, kind });
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) cells.set(cellKey(x + dx, y + dy), "ore");
  }

  // --- Trees, dead pines and crystal by zone.
  const trees: TreeDef[] = [], dead: TreeDef[] = [], crystals: TreeDef[] = [];
  for (let y = -R; y < R; y++) for (let x = -R; x < R; x++) {
    if (!free(x, y)) continue;
    const z = zonesAt(x + 0.5, y + 0.5);
    if (z.clearing > 0.5) continue;
    const g = grove(x / 7, y / 7), r = rocky(x / 5, y / 5), roll = rand();
    if (z.wastes > 0.5) {
      if (r > 0.62 && roll < (r - 0.55) * 0.9 * z.wastes) { crystals.push({ x, y, s: 0.7 + rand() * 0.6 }); cells.set(cellKey(x, y), "crystal"); }
      else if (g > 0.6 && roll < 0.12) { dead.push({ x, y, s: 0.9 + rand() * 0.3 }); cells.set(cellKey(x, y), "dead"); }
    } else if (z.highlands > 0.5) {
      if (g > 0.72 && roll < 0.12) { trees.push({ x, y, s: 0.8 + rand() * 0.25 }); cells.set(cellKey(x, y), "tree"); }
    } else {
      if ((g > 0.5 && roll < (g - 0.42) * 1.5) || roll < 0.01) { trees.push({ x, y, s: 0.85 + rand() * 0.35 }); cells.set(cellKey(x, y), "tree"); }
    }
  }

  // --- Every cave must reach the ship. If terrain cuts one off, carve a pass
  // (through raised ground, trees and crystal, never ore) toward the ship; if that
  // still fails, drop the cave.
  const reachable = (): Set<string> => {
    const seen = new Set<string>(["0,0"]), stack: [number, number][] = [[0, 0]], M = R + 3;
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const nx = x + dx, ny = y + dy, k = cellKey(nx, ny);
        if (Math.abs(nx) > M || Math.abs(ny) > M || seen.has(k) || cells.has(k)) continue;
        seen.add(k); stack.push([nx, ny]);
      }
    }
    return seen;
  };
  const mouth = (c: CaveDef): Cell => [c.x + c.dir[0] * 2, c.y + c.dir[1] * 2];
  const carvable = new Set<Kind>(["plateau", "tree", "dead", "crystal"]);
  for (const c of [...caves]) {
    const [mx, my] = mouth(c);
    for (let tries = 0; tries < 3 && !reachable().has(cellKey(mx, my)); tries++) {
      const steps = Math.ceil(Math.hypot(mx, my));
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(mx * (1 - i / steps)), y = Math.round(my * (1 - i / steps));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const k = cellKey(x + dx, y + dy), kind = cells.get(k);
          if (kind && carvable.has(kind)) cells.delete(k);
        }
      }
    }
    if (!reachable().has(cellKey(mx, my))) {
      caves.splice(caves.indexOf(c), 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.delete(cellKey(c.x + dx, c.y + dy));
    }
  }
  const keep = <T extends { x: number; y: number }>(list: T[], kind: Kind) => list.filter(t => cells.get(cellKey(t.x, t.y)) === kind);

  // --- Snow drifts, mostly in the open snowy parts, never in anyone's way.
  const drifts: GeneratedWorld["drifts"] = [];
  for (let i = 0; i < 1400; i++) {
    const x = (rand() * 2 - 1) * R, y = (rand() * 2 - 1) * R;
    if (!free(Math.floor(x), Math.floor(y), 1)) continue;
    const z = zonesAt(x, y);
    if (bareKind(x, y) || rand() > z.clearing + z.forest + z.highlands * 0.3) continue;
    drifts.push({ x, y, s: 0.3 + rand() * 0.45 });
  }

  const nexus: Cell[] = [];
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) nexus.push([x, y]);
  const map: MapDef = {
    name: "Frostfall",
    nexus,
    start: [2, 3],
    spawners: caves.map(mouth),
    caves,
    rocks: [],
    trees: keep(trees, "tree"),
    deadTrees: keep(dead, "dead"),
    crystals: keep(crystals, "crystal"),
    plateaus: [...cells].filter(([, k]) => k === "plateau").map(([k]) => parse(k)),
    ore,
  };
  return { seed, radius: R, map, zonesAt, bareAt, bareKind, drifts };
}
