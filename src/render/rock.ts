import * as THREE from "three";

/** Shared helpers for natural rock (caves, cliffs): a seeded random and a rough box. */

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A box whose corners are nudged about, so it reads as broken rock, not a crate. */
export function roughBox(w: number, h: number, d: number, rand: () => number, jitter: number): THREE.BufferGeometry {
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
