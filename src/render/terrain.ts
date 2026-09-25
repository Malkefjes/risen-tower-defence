import * as THREE from "three";

/**
 * Big terrain pieces that shape paths. A cliff is built one cell at a time from
 * rough, faceted rock blocks with a snow cap on top; neighbouring cells overlap a
 * little so a line of them reads as one continuous rock wall.
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  rock: std("#5d6379"),
  rockDark: std("#4b5064"),
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

const shadowed = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };

/** One cell of cliff, `height` tall (cells), centred on the cell. */
export function cliffCell(seed: number, height: number): THREE.Group {
  M ??= palette();
  const rand = rng(seed), g = new THREE.Group();
  // Two or three stacked blocks, each a little narrower, turned slightly.
  const layers = height > 1.3 ? 3 : 2;
  let y = 0;
  for (let i = 0; i < layers; i++) {
    const h = height / layers, w = 1.12 - i * 0.1;
    const b = shadowed(new THREE.Mesh(roughBox(w, h * 1.05, w, rand, 0.18), i === 0 ? M.rockDark : M.rock));
    b.position.set((rand() - 0.5) * 0.08, y + h / 2, (rand() - 0.5) * 0.08);
    b.rotation.y = (rand() - 0.5) * 0.3;
    g.add(b);
    y += h;
  }
  const cap = shadowed(new THREE.Mesh(roughBox(0.95, 0.1, 0.95, rand, 0.12), M.snow));
  cap.position.y = height + 0.03;
  cap.rotation.y = (rand() - 0.5) * 0.3;
  g.add(cap);
  // Now and then a fallen block at the foot.
  if (rand() < 0.25) {
    const s = 0.2 + rand() * 0.15;
    const r = shadowed(new THREE.Mesh(roughBox(s, s * 0.7, s, rand, 0.08), M.rock));
    const a = rand() * Math.PI * 2;
    r.position.set(Math.cos(a) * 0.55, s * 0.3, Math.sin(a) * 0.55);
    g.add(r);
  }
  return g;
}
