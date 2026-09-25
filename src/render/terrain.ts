import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Cell } from "../sim/types";
import { cellBounds, pieceOutline, SIDES } from "./pieceShape";

/**
 * Big terrain pieces that shape paths: cliffs, built like walls so neighbouring
 * cells fuse into one continuous rock mass with a snowy top.
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  rock: std("#5d6379"),
  rockDark: std("#4b5064"),
  rockLight: std("#6c7288"),
  snow: std("#f1f4fa", { roughness: 1 }),
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A box whose corners are nudged about, so it reads as broken rock, not a crate. */
function roughBox(w: number, h: number, d: number, rand: () => number, jitter: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position!, moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let off = moved.get(k);
    // The same corner moves the same way on every face, so the block stays closed.
    if (!off) moved.set(k, off = [(rand() - 0.5) * jitter, (rand() - 0.5) * jitter * 0.6, (rand() - 0.5) * jitter]);
    p.setXYZ(i, p.getX(i) + off[0], p.getY(i) + off[1], p.getZ(i) + off[2]);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A stretch of cliff built like a wall: neighbouring cliff cells fuse into one
 * continuous mass (see `pieceOutline`), with rock strata stepping in a little on
 * the open faces only, a few loose blocks on those faces for texture, and one snow
 * top across the whole run. `heightOf` gives each cell's height; `joins` says
 * which neighbours are cliff too.
 */
export function cliffRun(cells: readonly Cell[], heightOf: (x: number, y: number) => number, joins: (x: number, y: number) => boolean, seed = 1): THREE.Group {
  M ??= palette();
  const m = M, rand = rng(seed);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (mat: THREE.Material, g: THREE.BufferGeometry) => { let l = parts.get(mat); if (!l) parts.set(mat, l = []); l.push(g.index ? g.toNonIndexed() : g); };
  const box = (mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    put(mat, g);
  };
  for (const c of pieceOutline(cells, joins)) {
    const h = heightOf(c.x, c.y);
    // Strata: each course steps in a little on the open sides (never where cells fuse).
    const courses: [THREE.Material, number, number, number][] = [
      [m.rockDark, 0.0, h * 0.34, 0.02],
      [m.rock, h * 0.34, h * 0.7, 0.06 + rand() * 0.03],
      [m.rockLight, h * 0.7, h - 0.06, 0.1 + rand() * 0.03],
    ];
    for (const [mat, y0, y1, inset] of courses) {
      const b = cellBounds(c, inset);
      box(mat, b.x0, b.x1, y0, y1, b.z0, b.z1);
    }
    const top = cellBounds(c, 0.08);
    box(m.snow, top.x0, top.x1, h - 0.06, h + 0.02, top.z0, top.z1);
    // Loose blocks set into the open faces, so the wall reads as rock, not masonry.
    for (const side of SIDES) {
      if (!c.open[side] || rand() < 0.35) continue;
      const s = 0.14 + rand() * 0.14, t = 0.2 + rand() * 0.6, y = h * (0.15 + rand() * 0.6);
      const b = cellBounds(c, 0.03);
      const x = side === "w" ? b.x0 : side === "e" ? b.x1 : b.x0 + (b.x1 - b.x0) * t;
      const z = side === "n" ? b.z0 : side === "s" ? b.z1 : b.z0 + (b.z1 - b.z0) * t;
      const g = roughBox(s, s * 0.8, s, rand, s * 0.5);
      g.rotateY(rand() * 1.5);
      g.translate(x, y, z);
      put(rand() < 0.5 ? m.rock : m.rockDark, g);
    }
  }
  const g = new THREE.Group();
  for (const [mat, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    for (const l of list) l.dispose();
  }
  return g;
}
