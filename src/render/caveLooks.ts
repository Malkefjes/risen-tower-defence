import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
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
 * Erik picked A as the best; A1–A3 build on it. Their rock is natural stone: each
 * piece an irregular convex chunk (a hull of random points, so no two faces are
 * alike and no edge is straight across), in mixed sizes, with snow settled on top.
 *   A1: a mouth cut into the face of a small slab cliff.
 *   A2: two great slabs leaning together over the mouth, stacked slabs behind.
 *   A3: slab terraces stepping up and back, a wide low mouth under the first step.
 */
export type CaveLook = "A" | "B" | "C" | "A1" | "A2" | "A3";

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

  /**
   * A natural stone: the hull of random points inside a w×h×d box, pushed toward
   * its surface and with the corners pulled in, so it's a faceted chunk, never a block.
   */
  const chunk = (w: number, h: number, d: number): THREE.BufferGeometry => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 18; i++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      // Toward the surface of a rounded box: big on the flat faces, pulled in at the corners.
      const k = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) || 1;
      v.divideScalar(k).multiplyScalar(0.82 + rand() * 0.18);
      const corner = (Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z)) / 3;
      v.multiplyScalar(1 - Math.max(0, corner - 0.55) * 0.55);
      pts.push(new THREE.Vector3(v.x * w / 2, v.y * h / 2, v.z * d / 2));
    }
    const g = new ConvexGeometry(pts);
    g.computeVertexNormals();
    return g;
  };
  /** A stone with a snow cap settled on its top, sharing its tilt. */
  const slab = (w: number, t: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, snow = 0.05, mat?: THREE.Material) => {
    put(mat ?? (rand() < 0.5 ? m.rock : rand() < 0.6 ? m.rockDark : m.rockLight), chunk(w, t, d), x, y, z, ry, rx, rz);
    if (snow <= 0) return;
    const cap = chunk(w * 0.82, snow * 2.2, d * 0.82);
    cap.translate(0, t / 2 - snow * 0.35, 0);
    put(m.snow, cap, x, y, z, ry, rx, rz);
  };
  const darkMouth = (w: number, h: number, x: number, y: number, z: number) => {
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.5, 8), new THREE.MeshBasicMaterial({ color: "#0a0b0f" }));
    mouth.scale.set(w, h, 1); mouth.position.set(x, y, z);
    root.add(mouth);
  };
  const icicles = (x0: number, x1: number, y: number, z: number) => {
    for (let x = x0; x <= x1; x += 0.2 + rand() * 0.08) {
      const ic = new THREE.ConeGeometry(0.03, 0.12 + rand() * 0.16, 4); ic.rotateX(Math.PI);
      put(m.ice, ic, x, y, z);
    }
  };

  if (look === "A1") {
    // A small slab cliff (stacked, tilted sheets, snow on each) with a mouth cut into its face.
    let y = 0;
    for (let i = 0; i < 5; i++) {
      const t = 0.24 + rand() * 0.08, w = 2.5 - i * 0.12 + rand() * 0.15, d = 1.7 - i * 0.12;
      // The lower courses are split to leave the opening; the upper ones bridge over it.
      if (i < 3) {
        for (const side of [-1, 1]) slab(0.8 + rand() * 0.1, t, d, side * (0.8 + rand() * 0.06), y + t / 2, -0.3, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.12, side * (rand() * 0.08), 0.05);
      } else {
        slab(w, t, d, (rand() - 0.5) * 0.12, y + t / 2, -0.3 - (i - 3) * 0.08, (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08, i === 4 ? 0.09 : 0.05);
      }
      y += t * 0.94;
    }
    darkMouth(1.0, 0.95, 0, 0.42, 0.42);
    icicles(-0.45, 0.45, 0.78, 0.52);
    const floor = hole(0.6, 0.38); floor.position.z = 0.7;
    root.add(floor);
    for (let i = 0; i < 4; i++) slab(0.28 + rand() * 0.15, 0.12, 0.25, (rand() - 0.5) * 2.4, 0.05, 0.75 + rand() * 0.5, rand() * 3, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4, 0.03);
  } else if (look === "A2") {
    // Two great slabs leaning together over the mouth, like a split in the rock; stacked slabs behind.
    // Steep, tops meeting over the middle; their upper faces point up and out, so snow settles there.
    for (const side of [-1, 1]) slab(1.5, 0.3, 1.25, side * 0.42, 0.6, 0.15, side * 0.05, 0, -side * 1.0, 0.06);
    let y = 0;
    for (let i = 0; i < 4; i++) {
      const t = 0.26 + rand() * 0.06;
      slab(2.3 - i * 0.28, t, 1.0 - i * 0.1, (rand() - 0.5) * 0.15, y + t / 2, -0.75 - i * 0.05, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.1, i === 3 ? 0.09 : 0.05);
      y += t * 0.94;
    }
    darkMouth(0.8, 1.05, 0, 0.42, 0.62);
    const floor = hole(0.5, 0.4); floor.position.z = 0.85;
    root.add(floor);
    icicles(-0.15, 0.15, 0.95, 0.66);
    for (let i = 0; i < 5; i++) slab(0.25 + rand() * 0.15, 0.12, 0.22, (rand() - 0.5) * 2.4, 0.05, 0.8 + rand() * 0.6, rand() * 3, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4, 0.03);
  } else if (look === "A3") {
    // Slab terraces stepping up and back; the first step overhangs a wide, low mouth.
    const steps = [
      { w: 2.6, d: 1.0, z: 0.35, y: 0.62, t: 0.24 },
      { w: 2.3, d: 1.0, z: -0.3, y: 0.95, t: 0.28 },
      { w: 1.9, d: 0.9, z: -0.85, y: 1.28, t: 0.28 },
    ];
    // The walls under each step.
    for (const st of steps.slice(1)) {
      let y = 0;
      while (y < st.y - st.t / 2 - 0.05) {
        const t = 0.26 + rand() * 0.06;
        slab(st.w - 0.1 + rand() * 0.1, t, st.d, (rand() - 0.5) * 0.1, y + t / 2, st.z, (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08, 0);
        y += t * 0.94;
      }
    }
    for (const side of [-1, 1]) slab(0.55, 0.5, 0.9, side * 1.02, 0.25, 0.35, 0, 0, 0, 0);
    for (const st of steps) slab(st.w, st.t, st.d, (rand() - 0.5) * 0.1, st.y, st.z, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.06, 0.07);
    darkMouth(1.55, 0.72, 0, 0.26, 0.62);
    icicles(-0.7, 0.7, 0.5, 0.82);
    const floor = hole(0.85, 0.35); floor.position.z = 0.95;
    root.add(floor);
    for (let i = 0; i < 4; i++) slab(0.28 + rand() * 0.15, 0.12, 0.25, (rand() - 0.5) * 2.6, 0.05, 1.05 + rand() * 0.5, rand() * 3, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4, 0.03);
  } else if (look === "A") {
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
