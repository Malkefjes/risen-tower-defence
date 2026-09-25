import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Cell } from "../sim/types";
import { WALL_DECK } from "../sim/world";
import { cellBounds, pieceOutline, type OutlineCell } from "./pieceShape";

/**
 * The stone wall: the plain wall every piece starts as (built from stone only,
 * towers can't stand on it). Metal plating upgrades it to the Armored deck.
 * Erik's pick (look C from the wall playground): terraced courses. Same outline rules as the
 * armored wall: pieces fuse with neighbouring walls, the top is a walkable deck.
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  stone: std("#5d6270"),
  stoneLight: std("#727786"),
  stoneDark: std("#454a57"),
  snow: std("#f1f4fa", { roughness: 1 }),
});

export function stoneWallPiece(cells: readonly Cell[], joins?: (x: number, y: number) => boolean): THREE.Object3D {
  M ??= palette();
  const m = M;
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (mat: THREE.Material, g: THREE.BufferGeometry) => { let l = parts.get(mat); if (!l) parts.set(mat, l = []); l.push(g); };
  const add = (mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    put(mat, g);
  };
  const box = (mat: THREE.Material, c: OutlineCell, inset: number, y0: number, y1: number) => {
    const b = cellBounds(c, inset);
    add(mat, b.x0, b.x1, y0, y1, b.z0, b.z1);
  };
  const outline = pieceOutline(cells, joins);
  for (const c of outline) {
    // Terraced: three courses, each stepped in a little, in alternating tones, with a snowy top.
    box(m.stoneDark, c, 0.03, 0, 0.18);
    box(m.stone, c, 0.06, 0.18, 0.36);
    box(m.stoneLight, c, 0.09, 0.36, 0.52);
    box(m.stone, c, 0.1, 0.52, WALL_DECK - 0.015);
    box(m.snow, c, 0.11, WALL_DECK - 0.015, WALL_DECK);
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
