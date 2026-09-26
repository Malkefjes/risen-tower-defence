import * as THREE from "three";
import type { MapDef } from "../sim/world";
import { PLATEAU_TOP } from "../sim/world";
import { cellKey } from "../sim/types";
import { BARE_CORE, BARE_KINDS, BARE_RIM, type Bare, type GeneratedWorld } from "../sim/worldgen";
import { crystalCluster, deadTree } from "./alien";
import { bakeStatic, type BakedPart } from "./bake";
import { cliffModel } from "./cliff";
import type { ModelLibrary } from "./models";

/**
 * The world's scenery, which never moves: pines, dead pines, crystal, rocks, raised
 * ground (slab cliffs at the edges, a flat snow top inside), snow drifts and bare
 * patches. Built per chunk and merged (`bakeStatic`), so only chunks on screen are
 * drawn and each costs a few draws.
 */
export const CHUNK = 16;

const BARE_COLORS: Record<Bare, { core: THREE.Color; rim: THREE.Color }> = {
  ice: { core: new THREE.Color("#9fc8e2"), rim: new THREE.Color("#d8eaf5") },
  scorch: { core: new THREE.Color("#6a6572"), rim: new THREE.Color("#b3afbb") },
  rock: { core: new THREE.Color("#6e717e"), rim: new THREE.Color("#b3b6c1") },
};

let mats: { bare: THREE.MeshStandardMaterial; plateau: THREE.MeshStandardMaterial } | undefined;
// Created on first use, after colour management is switched off.
const materials = () => (mats ??= {
  bare: new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }),
  plateau: new THREE.MeshStandardMaterial({ color: "#f1f4fa", roughness: 1 }),
});
/** Inside a plateau: just its snowy top (the edge cliffs hide what's below). */
let plateauGeo: THREE.BufferGeometry | undefined;

/**
 * Bare patches for one chunk, as one mesh: marching squares over each kind's
 * strength at half-cell steps, the rim colour above BARE_RIM and the ground colour
 * above BARE_CORE. Low-poly, crisp edges.
 */
function bareChunk(bareAt: GeneratedWorld["bareAt"], cx: number, cy: number): THREE.Mesh | null {
  const STEP = 0.5, n = CHUNK / STEP + 1;
  const pos: number[] = [], col: number[] = [];
  const grid: Record<Bare, number>[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) grid.push(bareAt(cx + i * STEP, cy + j * STEP));
  const poly = (vals: number[], xs: number[], zs: number[], t: number) => {
    const out: [number, number][] = [];
    for (let e = 0; e < 4; e++) {
      const a = e, b = (e + 1) % 4;
      if (vals[a]! >= t) out.push([xs[a]!, zs[a]!]);
      if ((vals[a]! >= t) !== (vals[b]! >= t)) {
        const f = (t - vals[a]!) / (vals[b]! - vals[a]!);
        out.push([xs[a]! + (xs[b]! - xs[a]!) * f, zs[a]! + (zs[b]! - zs[a]!) * f]);
      }
    }
    return out;
  };
  for (const kind of BARE_KINDS) {
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const v = [grid[j * n + i]![kind], grid[j * n + i + 1]![kind], grid[(j + 1) * n + i + 1]![kind], grid[(j + 1) * n + i]![kind]];
      if (Math.max(...v) < BARE_RIM) continue;
      const x0 = cx + i * STEP, z0 = cy + j * STEP;
      const xs = [x0, x0 + STEP, x0 + STEP, x0], zs = [z0, z0, z0 + STEP, z0 + STEP];
      for (const [t, c, y] of [[BARE_RIM, BARE_COLORS[kind].rim, 0.004], [BARE_CORE, BARE_COLORS[kind].core, 0.007]] as [number, THREE.Color, number][]) {
        const p = poly(v, xs, zs, t);
        for (let k = 1; k + 1 < p.length; k++) for (const q of [p[0]!, p[k + 1]!, p[k]!]) { pos.push(q[0], y, q[1]); col.push(c.r, c.g, c.b); }
      }
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, materials().bare);
  m.receiveShadow = true;
  return m;
}

/**
 * Build the scenery for a map. `gen` adds what only a generated world has (bare
 * patches and drifts). Returns one group per chunk, already merged.
 */
/** `parts`: filled with where each tree ended up in the baked chunks (by cell key), so a cut tree can be hidden. */
export function buildScenery(map: MapDef, models: ModelLibrary, gen?: GeneratedWorld, seed = 1, parts?: Map<string, BakedPart>): THREE.Group[] {
  plateauGeo ??= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, PLATEAU_TOP, 0);
  const chunks = new Map<string, { g: THREE.Group; cx: number; cy: number }>();
  const chunkOf = (x: number, y: number) => {
    const cx = Math.floor(x / CHUNK) * CHUNK, cy = Math.floor(y / CHUNK) * CHUNK, k = `${cx},${cy}`;
    let c = chunks.get(k);
    if (!c) chunks.set(k, c = { g: new THREE.Group(), cx, cy });
    return c;
  };
  const put = (o: THREE.Object3D, x: number, y: number) => { o.position.set(x, 0, y); chunkOf(x, y).g.add(o); };

  for (const r of map.rocks) put(models.create("rock", { scale: r.h, seed: r.x * 31 + r.y }), r.x + 0.5, r.y + 0.5);
  const tree = (o: THREE.Object3D, x: number, y: number) => { o.userData.bakeKey = `${x},${y}`; put(o, x + 0.5, y + 0.5); };
  for (const t of map.trees) tree(models.create("tree", { scale: t.s, seed: t.x * 17 + t.y + seed }), t.x, t.y);
  for (const t of map.deadTrees ?? []) tree(deadTree(t.x * 7 + t.y + seed, t.s), t.x, t.y);
  for (const t of map.crystals ?? []) tree(crystalCluster(t.x * 13 + t.y + seed, t.s), t.x, t.y);
  for (const d of gen?.drifts ?? []) put(models.create("snowMound", { scale: d.s }), d.x, d.y);

  // Raised ground, per chunk: slab cliffs at the edges, a flat snow top inside.
  const high = new Set((map.plateaus ?? []).map(([x, y]) => cellKey(x, y)));
  const isHigh = (x: number, y: number) => high.has(cellKey(x, y));
  const byChunk = new Map<{ g: THREE.Group; cx: number; cy: number }, [number, number][]>();
  for (const [x, y] of map.plateaus ?? []) {
    const c = chunkOf(x + 0.5, y + 0.5);
    let l = byChunk.get(c); if (!l) byChunk.set(c, l = []); l.push([x, y]);
  }
  for (const [c, cells] of byChunk) {
    const edge = cells.filter(([x, y]) => !isHigh(x + 1, y) || !isHigh(x - 1, y) || !isHigh(x, y + 1) || !isHigh(x, y - 1));
    const inner = cells.filter(([x, y]) => isHigh(x + 1, y) && isHigh(x - 1, y) && isHigh(x, y + 1) && isHigh(x, y - 1));
    if (edge.length) c.g.add(cliffModel(edge, isHigh, c.cx * 31 + c.cy + seed));
    for (const [x, y] of inner) {
      const top = new THREE.Mesh(plateauGeo, materials().plateau);
      top.position.set(x + 0.5, 0, y + 0.5);
      top.receiveShadow = true;
      c.g.add(top);
    }
  }

  // Bare patches cover the generated world, including chunks with nothing else in them.
  if (gen) for (let cy = -gen.radius; cy < gen.radius; cy += CHUNK) for (let cx = -gen.radius; cx < gen.radius; cx += CHUNK) chunkOf(cx, cy);
  const out: THREE.Group[] = [];
  for (const c of chunks.values()) {
    bakeStatic(c.g, parts);
    if (gen) { const bare = bareChunk(gen.bareAt, c.cx, c.cy); if (bare) c.g.add(bare); }
    out.push(c.g);
  }
  return out;
}
