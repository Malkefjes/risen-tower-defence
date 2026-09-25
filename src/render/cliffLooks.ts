import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Cell } from "../sim/types";
import { rng, roughBox } from "./terrain";

/**
 * Three cliff looks for Erik to pick from (mockups/cliffs). Each fills its cells
 * (so it still reads as a barrier on the grid) but is made of natural rock, not
 * courses: A boulders, B tilted slabs, C crags. All have snow on top and drifts
 * at the foot, and spill a little past their cells so the outline isn't a staircase.
 */
export type CliffLook = "A" | "B" | "C";

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  rock: std("#5d6379"),
  rockDark: std("#4b5064"),
  rockLight: std("#707690"),
  snow: std("#f1f4fa", { roughness: 1 }),
});

/** A faceted lump (a dodecahedron with its corners nudged). */
function lump(r: number, rand: () => number, jitter = 0.25): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(r, 0);
  const p = g.attributes.position!, moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = moved.get(k);
    if (!o) moved.set(k, o = [(rand() - 0.5) * r * jitter, (rand() - 0.5) * r * jitter, (rand() - 0.5) * r * jitter]);
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  g.computeVertexNormals();
  return g;
}

/** A leaning, five-sided rock spire. */
function spire(r: number, h: number, rand: () => number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * (0.35 + rand() * 0.3), r, h, 5);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + (rand() - 0.5) * r * 0.25);
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}

export function cliffLook(look: CliffLook, cells: readonly Cell[], isCliff: (x: number, y: number) => boolean, seed = 1): THREE.Group {
  M ??= palette();
  const m = M, rand = rng(seed);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (mat: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
    g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry);
    g.translate(x, y, z);
    let l = parts.get(mat); if (!l) parts.set(mat, l = []);
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) if (name !== "position" && name !== "normal") n.deleteAttribute(name);
    l.push(n);
  };
  const rockMat = () => { const r = rand(); return r < 0.4 ? m.rock : r < 0.75 ? m.rockDark : m.rockLight; };

  for (const [cx, cy] of cells) {
    const x0 = cx + 0.5, z0 = cy + 0.5;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !isCliff(cx + dx!, cy + dy!)) as [number, number][];
    if (look === "A") {
      // Boulders: a big low rock, one or two stacked on it, a snow cap on the highest.
      const base = 0.55 + rand() * 0.12;
      const g1 = lump(base, rand); g1.scale(1.1, 0.8, 1.1);
      put(rockMat(), g1, x0 + (rand() - 0.5) * 0.2, base * 0.55, z0 + (rand() - 0.5) * 0.2, rand() * 6);
      const r2 = 0.38 + rand() * 0.14, y2 = base * 1.05 + r2 * 0.5;
      const ox = (rand() - 0.5) * 0.3, oz = (rand() - 0.5) * 0.3;
      put(rockMat(), lump(r2, rand), x0 + ox, y2, z0 + oz, rand() * 6);
      if (rand() < 0.6) put(rockMat(), lump(0.26 + rand() * 0.1, rand), x0 - ox * 1.4, y2 + r2 * 0.6, z0 - oz * 1.4, rand() * 6);
      const cap = lump(r2 * 0.8, rand, 0.15); cap.scale(1.05, 0.3, 1.05);
      put(m.snow, cap, x0 + ox, y2 + r2 * 0.72, z0 + oz, rand() * 6);
    } else if (look === "B") {
      // Tilted slabs: flat rock sheets stacked at slight angles, like frost-split strata.
      // Snow settles evenly on every slab's upper face, following its tilt, so the
      // ledges that stick out are white and the top slab wears a full, even blanket.
      let y = 0;
      const n = 3 + Math.floor(rand() * 2);
      for (let i = 0; i < n; i++) {
        const t = 0.3 + rand() * 0.14, w = 1.15 - i * 0.08 + rand() * 0.12, d = w * (0.85 + rand() * 0.2);
        const px = x0 + (rand() - 0.5) * 0.2, pz = z0 + (rand() - 0.5) * 0.2;
        const ry = rand() * 0.8, rx = (rand() - 0.5) * 0.2, rz = (rand() - 0.5) * 0.2;
        put(i % 2 ? m.rock : m.rockDark, roughBox(w, t, d, rand, 0.06), px, y + t / 2, pz, ry, rx, rz);
        const top = i === n - 1, st = top ? 0.09 : 0.05;
        const snow = roughBox(w - 0.05, st, d - 0.05, rand, 0.02);
        snow.translate(0, t / 2 + st / 2 - 0.01, 0);
        put(m.snow, snow, px, y + t / 2, pz, ry, rx, rz);
        y += t * 0.92;
      }
    } else {
      // Crags: tight clusters of leaning rock spires of mixed heights, snow on the tallest tips.
      const n = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const r = 0.25 + rand() * 0.12, h = 1.0 + rand() * 0.95;
        const a = rand() * Math.PI * 2, d = i === 0 ? 0 : 0.18 + rand() * 0.2;
        const px = x0 + Math.cos(a) * d, pz = z0 + Math.sin(a) * d;
        put(rockMat(), spire(r, h, rand), px, 0, pz, rand() * 6, (rand() - 0.5) * 0.18, (rand() - 0.5) * 0.18);
        if (h > 1.45) { const s = lump(r * 0.55, rand, 0.1); s.scale(1, 0.45, 1); put(m.snow, s, px, h - 0.02, pz); }
      }
    }
    // Snow drifted against the open faces, and a little rubble at the foot.
    for (const [dx, dy] of open) {
      if (rand() < 0.5) {
        const d = lump(0.32 + rand() * 0.12, rand, 0.2); d.scale(1.3, 0.35, 1.3);
        put(m.snow, d, x0 + dx * 0.55 + (rand() - 0.5) * 0.3, 0.02, z0 + dy * 0.55 + (rand() - 0.5) * 0.3, rand() * 6);
      }
      if (rand() < 0.3) put(rockMat(), lump(0.1 + rand() * 0.07, rand), x0 + dx * 0.62, 0.06, z0 + dy * 0.62, rand() * 6);
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
