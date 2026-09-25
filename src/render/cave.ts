import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng, roughBox } from "./rock";

/**
 * Enemy spawner: a cave exit where the aliens climb up out of the ground (Erik's
 * pick, look A from the cave round). An outcrop of rough stacked slabs with snow on
 * every ledge, a dark mouth under an icicled overhang. Plain and dark (no violet, no
 * glow). Centred on its cell, mouth facing +z, about 3 cells across.
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  rock: std("#5d6379"),
  rockDark: std("#4b5064"),
  rockLight: std("#707690"),
  snow: std("#f1f4fa", { roughness: 1 }),
  ice: std("#cfe3f1", { roughness: 0.3 }),
});

/**
 * A dark opening with fake depth: rings that get darker toward the middle, so a
 * flat shape reads as a hole going down.
 */
function hole(rx: number, rz: number, y = 0.012): THREE.Group {
  const g = new THREE.Group();
  const shades = ["#3a3e4c", "#262934", "#16181f", "#0a0b0f"];
  shades.forEach((c, i) => {
    const k = 1 - i * 0.2;
    const d = new THREE.Mesh(new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c }));
    d.scale.set(rx * k, 1, rz * k);
    d.position.set(0, y + i * 0.002, -(1 - k) * rz * 0.35); // deeper part sits toward the back wall
    g.add(d);
  });
  return g;
}

export function caveModel(seed = 1): THREE.Group {
  M ??= palette();
  const m = M, rand = rng(seed);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (mat: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
    g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z);
    const n = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(n.attributes)) if (a !== "position" && a !== "normal") n.deleteAttribute(a);
    let l = parts.get(mat); if (!l) parts.set(mat, l = []); l.push(n);
  };
  const rockMat = () => { const r = rand(); return r < 0.4 ? m.rock : r < 0.75 ? m.rockDark : m.rockLight; };
  const root = new THREE.Group();

  // A low hill of stacked slabs, snow settled on every ledge.
  for (let i = 0; i < 4; i++) {
    const t = 0.26 + rand() * 0.08, w = 2.3 - i * 0.32 + rand() * 0.15, d = 1.9 - i * 0.28;
    const z = -0.35 - i * 0.05;
    put(i % 2 ? m.rock : m.rockDark, roughBox(w, t, d, rand, 0.12), (rand() - 0.5) * 0.15, i * t * 0.92 + t / 2, z, (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1);
    put(m.snow, roughBox(w - 0.1, 0.05, d - 0.1, rand, 0.02), 0, i * t * 0.92 + t + 0.01, z, (rand() - 0.5) * 0.25);
  }
  // The overhang: a thick slab jutting out over the mouth.
  put(m.rockLight, roughBox(1.7, 0.26, 0.55, rand, 0.1), 0, 0.98, 0.52, 0, -0.08);
  put(m.snow, roughBox(1.55, 0.06, 0.48, rand, 0.02), 0, 1.13, 0.5, 0, -0.08);
  // The dark mouth under it: a black face set back into the rock, and a dark floor in front.
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.62, 8), new THREE.MeshBasicMaterial({ color: "#0a0b0f" }));
  mouth.scale.set(1.2, 1.25, 1); mouth.position.set(0, 0.42, 0.64);
  root.add(mouth);
  const floor = hole(0.72, 0.42); floor.position.z = 0.78;
  root.add(floor);
  // Icicles on the lip, rubble in front.
  for (let i = 0; i < 6; i++) {
    const ic = new THREE.ConeGeometry(0.035, 0.14 + rand() * 0.14, 4); ic.rotateX(Math.PI);
    put(m.ice, ic, -0.6 + i * 0.24 + (rand() - 0.5) * 0.06, 0.82, 0.78);
  }
  for (let i = 0; i < 5; i++) put(rockMat(), roughBox(0.2 + rand() * 0.15, 0.14, 0.2, rand, 0.08), (rand() - 0.5) * 2.4, 0.06, 0.9 + rand() * 0.5, rand() * 3);

  for (const [mat, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    for (const l of list) l.dispose();
  }
  return root;
}
