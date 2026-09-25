import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng, roughBox } from "./terrain";

/**
 * Enemy spawners: cave exits where the aliens climb up out of the ground. Three
 * looks for Erik to pick from (mockups/caves). Each is centred on its cell, with
 * its mouth facing +z (toward the camera side), about 3 cells across.
 * Plain and dark: grey rock, snow, and a black mouth (Erik: no violet, no glow).
 *   A: an outcrop with a low cave mouth under an overhang, icicles on the lip.
 *   B: a sinkhole, a dark shaft in the snow with a broken rock rim.
 *   C: a fissure, a long dark crack torn open between tilted slabs.
 */
export type CaveLook = "A" | "B" | "C";

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




export interface Cave { object: THREE.Group; update(t: number): void }

/**
 * A dark opening with fake depth: rings that get darker toward the middle, so a
 * flat shape reads as a hole going down. `sx`/`sz` stretch it.
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

export function caveLook(look: CaveLook, seed = 1): Cave {
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

  if (look === "A") {
    // Outcrop: a low hill of stacked slabs with a cave mouth under an overhang at the front,
    // snow settled on every ledge, icicles hanging from the lip.
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
    for (let i = 0; i < 6; i++) {
      const ic = new THREE.ConeGeometry(0.035, 0.14 + rand() * 0.14, 4); ic.rotateX(Math.PI);
      put(m.ice, ic, -0.6 + i * 0.24 + (rand() - 0.5) * 0.06, 0.82, 0.78);
    }
    for (let i = 0; i < 5; i++) put(rockMat(), roughBox(0.2 + rand() * 0.15, 0.14, 0.2, rand, 0.08), (rand() - 0.5) * 2.4, 0.06, 0.9 + rand() * 0.5, rand() * 3);
  } else if (look === "B") {
    // Sinkhole: a dark shaft dropping straight down through the snow, a broken rim of
    // slabs around it, lower at the front so you can see in.
    root.add(hole(1.0, 1.0));
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.15, back = 0.5 - Math.sin(a) * 0.5;
      const w = 0.5 + rand() * 0.2, h = 0.18 + (1 - back) * 0.12 + back * 0.35 + rand() * 0.1, t = 0.3;
      const r = 1.1;
      put(rockMat(), roughBox(w, h, t, rand, 0.1), Math.cos(a) * r, h / 2 - 0.03, Math.sin(a) * r, Math.PI / 2 - a, -0.25);
      put(m.snow, roughBox(w * 0.85, 0.05, t * 0.8, rand, 0.02), Math.cos(a) * (r - 0.02), h - 0.02, Math.sin(a) * (r - 0.02), Math.PI / 2 - a, -0.25);
    }
    // Snow slumped toward the edge, and a few slabs that fell in part way.
    const bank = new THREE.RingGeometry(1.2, 1.9, 12).rotateX(-Math.PI / 2);
    put(m.snow, bank, 0, 0.02, 0);
    for (let i = 0; i < 3; i++) {
      const a = rand() * Math.PI * 2;
      put(m.rockDark, roughBox(0.4, 0.1, 0.25, rand, 0.06), Math.cos(a) * 0.75, 0.04, Math.sin(a) * 0.75, rand() * 3, 0.5);
    }
  } else {
    // Fissure: the ground torn open in a long dark crack, slabs tipped up along both lips.
    const crack = hole(0.45, 1.5); crack.rotation.y = 0;
    root.add(crack);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const z = -1.2 + i * 0.6 + (rand() - 0.5) * 0.15, along = 1 - Math.abs(z) / 1.6;
        const w = 0.55 + rand() * 0.15, h = 0.22 + along * 0.4 + rand() * 0.12;
        const x = side * (0.5 + (1 - along) * 0.1 + rand() * 0.06);
        put(rockMat(), roughBox(0.32, h, w, rand, 0.1), x, h / 2 - 0.04, z, (rand() - 0.5) * 0.3, 0, side * 0.35);
        put(m.snow, roughBox(0.28, 0.05, w * 0.85, rand, 0.02), x + side * 0.06, h - 0.02, z, (rand() - 0.5) * 0.3, 0, side * 0.35);
      }
    }
    for (let i = 0; i < 8; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      put(rockMat(), roughBox(0.14 + rand() * 0.12, 0.1, 0.16, rand, 0.06), side * (0.9 + rand() * 0.5), 0.05, (rand() - 0.5) * 2.8, rand() * 3);
    }
  }

  for (const [mat, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    for (const l of list) l.dispose();
  }
  return { object: root, update() { /* no animation: a plain dark exit */ } };
}
