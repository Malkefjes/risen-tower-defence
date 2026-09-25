import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Cell } from "../sim/types";
import { WALL_DECK } from "../sim/world";
import { cellBounds, pieceOutline, SIDES, type OutlineCell, type Side } from "./pieceShape";

/**
 * The stone wall: the plain wall every piece starts as (built from stone only,
 * towers can't stand on it). Metal plating upgrades it to the Armored deck.
 * Three looks for Erik to pick from (A, B, C). Same outline rules as the
 * armored wall: pieces fuse with neighbouring walls, the top is a walkable deck.
 */
export type StoneLook = "A" | "B" | "C";

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  stone: std("#5d6270"),
  stoneLight: std("#727786"),
  stoneDark: std("#454a57"),
  mortar: std("#3a3e4a"),
  snow: std("#f1f4fa", { roughness: 1 }),
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function stoneWallPiece(look: StoneLook, cells: readonly Cell[], joins?: (x: number, y: number) => boolean, seed = 1): THREE.Object3D {
  M ??= palette();
  const m = M, rand = rng(seed);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  // Boxes are indexed and stones aren't; merging needs them all the same, so store every piece non-indexed.
  const put = (mat: THREE.Material, g: THREE.BufferGeometry) => { let l = parts.get(mat); if (!l) parts.set(mat, l = []); l.push(g.index ? g.toNonIndexed() : g); };
  const add = (mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    put(mat, g);
  };
  const box = (mat: THREE.Material, c: OutlineCell, inset: number, y0: number, y1: number) => {
    const b = cellBounds(c, inset);
    add(mat, b.x0, b.x1, y0, y1, b.z0, b.z1);
  };
  /** A thin strip on one open face of a cell, from `a` to `b` along that face (0..1). */
  const strip = (mat: THREE.Material, c: OutlineCell, side: Side, inset: number, depth: number, y0: number, y1: number, a = 0, b = 1) => {
    const bb = cellBounds(c, inset), d = depth / 2;
    const lx = (t: number) => bb.x0 + (bb.x1 - bb.x0) * t, lz = (t: number) => bb.z0 + (bb.z1 - bb.z0) * t;
    if (side === "n") add(mat, lx(a), lx(b), y0, y1, bb.z0 - d, bb.z0 + d);
    else if (side === "s") add(mat, lx(a), lx(b), y0, y1, bb.z1 - d, bb.z1 + d);
    else if (side === "w") add(mat, bb.x0 - d, bb.x0 + d, y0, y1, lz(a), lz(b));
    else add(mat, bb.x1 - d, bb.x1 + d, y0, y1, lz(a), lz(b));
  };
  /** A rough stone lump on an open face. */
  const lump = (mat: THREE.Material, c: OutlineCell, side: Side, t: number, y: number, r: number) => {
    const bb = cellBounds(c, 0.1);
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(1.3, 0.75, 0.8);
    g.rotateY(side === "n" || side === "s" ? 0 : Math.PI / 2);
    g.rotateX((rand() - 0.5) * 0.4);
    const px = side === "w" ? bb.x0 : side === "e" ? bb.x1 : bb.x0 + (bb.x1 - bb.x0) * t;
    const pz = side === "n" ? bb.z0 : side === "s" ? bb.z1 : bb.z0 + (bb.z1 - bb.z0) * t;
    g.translate(px, y, pz);
    put(mat, g);
  };

  const outline = pieceOutline(cells, joins);
  for (const c of outline) {
    if (look === "A") {
      // Cut blocks: a solid stone body with mortar seams in a brick bond, a flagstone deck, a little snow.
      box(m.stone, c, 0.06, 0, 0.5);
      box(m.stoneLight, c, 0.04, 0.5, WALL_DECK);
      for (const side of SIDES) {
        if (!c.open[side]) continue;
        for (const y of [0.17, 0.34]) strip(m.mortar, c, side, 0.06, 0.012, y, y + 0.018);
        // Vertical joints, offset per course so they read as laid blocks.
        const off = (c.x + c.y) % 2 ? 0.25 : 0.75;
        strip(m.mortar, c, side, 0.06, 0.012, 0, 0.17, off - 0.01, off + 0.01);
        strip(m.mortar, c, side, 0.06, 0.012, 0.188, 0.34, 1 - off - 0.01, 1 - off + 0.01);
        strip(m.mortar, c, side, 0.06, 0.012, 0.358, 0.5, off - 0.01, off + 0.01);
      }
      if (rand() < 0.5) add(m.snow, c.x + 0.2 + rand() * 0.2, c.x + 0.65 + rand() * 0.2, WALL_DECK, WALL_DECK + 0.02, c.y + 0.2 + rand() * 0.2, c.y + 0.6 + rand() * 0.2);
    } else if (look === "B") {
      // Fieldstone: a rough core faced with piled stones, capped with snow.
      box(m.stoneDark, c, 0.1, 0, 0.5);
      box(m.stone, c, 0.06, 0.5, WALL_DECK - 0.02);
      box(m.snow, c, 0.08, WALL_DECK - 0.02, WALL_DECK);
      for (const side of SIDES) {
        if (!c.open[side]) continue;
        for (const [t, y] of [[0.2, 0.12], [0.55, 0.1], [0.85, 0.14], [0.35, 0.33], [0.72, 0.36]] as [number, number][]) {
          lump(rand() < 0.5 ? m.stone : m.stoneLight, c, side, t + (rand() - 0.5) * 0.08, y, 0.1 + rand() * 0.04);
        }
      }
    } else {
      // Terraced: three courses, each stepped in a little, in alternating tones, with a snowy top.
      box(m.stoneDark, c, 0.03, 0, 0.18);
      box(m.stone, c, 0.06, 0.18, 0.36);
      box(m.stoneLight, c, 0.09, 0.36, 0.52);
      box(m.stone, c, 0.1, 0.52, WALL_DECK - 0.015);
      box(m.snow, c, 0.11, WALL_DECK - 0.015, WALL_DECK);
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
