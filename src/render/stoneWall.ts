import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Cell } from "../sim/types";
import { WALL_DECK } from "../sim/world";
import { cellBounds, pieceOutline, SIDES, type OutlineCell, type Side } from "./pieceShape";

/**
 * The stone wall: the plain wall every piece starts as (built from stone only,
 * towers can't stand on it). Metal plating upgrades it to the Armored deck.
 * Erik liked C (layered courses); C1 and C2 keep the courses with straight sides. Same outline rules as the
 * armored wall: pieces fuse with neighbouring walls, the top is a walkable deck.
 */
export type StoneLook = "C" | "C1" | "C2";

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

export function stoneWallPiece(look: StoneLook, cells: readonly Cell[], joins?: (x: number, y: number) => boolean): THREE.Object3D {
  M ??= palette();
  const m = M;
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
  const outline = pieceOutline(cells, joins);
  for (const c of outline) {
    if (look === "C1") {
      // Straight courses: three layers flush on the outside, split by thin dark grooves, snow on top.
      box(m.stoneDark, c, 0.05, 0, 0.18);
      box(m.stone, c, 0.05, 0.18, 0.36);
      box(m.stoneLight, c, 0.05, 0.36, 0.52);
      box(m.stone, c, 0.05, 0.52, WALL_DECK - 0.015);
      for (const y of [0.18, 0.36, 0.52]) box(m.mortar, c, 0.045, y - 0.008, y + 0.008);
      box(m.snow, c, 0.07, WALL_DECK - 0.015, WALL_DECK);
    } else if (look === "C2") {
      // Big blocks: two thick courses with a joint at every cell edge, and a cap course that overhangs a little.
      box(m.stoneDark, c, 0.07, 0, 0.24);
      box(m.stone, c, 0.07, 0.24, 0.46);
      box(m.mortar, c, 0.065, 0.235, 0.245);
      for (const side of SIDES) {
        if (!c.open[side]) continue;
        // A vertical joint at the cell's end, offset between the two courses so they read as laid blocks.
        const t = (c.x + c.y) % 2 ? 0.5 : 0.02;
        strip(m.mortar, c, side, 0.07, 0.012, 0, 0.24, t, t + 0.02);
        strip(m.mortar, c, side, 0.07, 0.012, 0.24, 0.46, (t + 0.5) % 1, (t + 0.5) % 1 + 0.02);
      }
      box(m.stoneLight, c, 0.04, 0.46, WALL_DECK - 0.015);
      box(m.snow, c, 0.06, WALL_DECK - 0.015, WALL_DECK);
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
