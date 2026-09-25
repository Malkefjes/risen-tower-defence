import * as THREE from "three";

/**
 * Props of the rift wastes, where the planet is being taken over: violet crystal
 * clusters and dead, bare trees. Built from a few cheap shapes so large fields of
 * them can be merged into chunks (see `bakeStatic`).
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  crystal: std("#8e5cff", { emissive: "#6a3ad8", emissiveIntensity: 0.55, roughness: 0.3 }),
  crystalPale: std("#c2a6ff", { emissive: "#8e5cff", emissiveIntensity: 0.45, roughness: 0.3 }),
  deadWood: std("#4a4052", { roughness: 0.95 }),
  ash: std("#6d6480", { roughness: 1 }),
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shadowed = (m: THREE.Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };

/** A cluster of violet crystal spikes on a small base of ashen rock; `size` about 0.6 to 1.4. */
export function crystalCluster(seed: number, size = 1): THREE.Group {
  M ??= palette();
  const rand = rng(seed), g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 * size, 0), M.ash));
  base.scale.set(1.3, 0.45, 1.2);
  base.position.y = 0.05;
  g.add(base);
  const n = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const h = (0.35 + rand() * 0.55) * size * (i === 0 ? 1.3 : 1);
    const spike = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(0.1 * size, 0), rand() < 0.3 ? M.crystalPale : M.crystal));
    spike.scale.set(1, h / (0.2 * size), 1);
    const a = rand() * Math.PI * 2, d = i === 0 ? 0 : (0.08 + rand() * 0.14) * size;
    spike.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    spike.rotation.set((rand() - 0.5) * 0.7, rand() * 3, (rand() - 0.5) * 0.7);
    g.add(spike);
  }
  return g;
}

/** A dead pine: a bare, dark trunk with a few snapped branches. */
export function deadTree(seed: number, size = 1): THREE.Group {
  M ??= palette();
  const rand = rng(seed), g = new THREE.Group();
  const h = (0.9 + rand() * 0.5) * size;
  const trunk = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035 * size, 0.08 * size, h, 5), M.deadWood));
  trunk.position.y = h / 2;
  trunk.rotation.z = (rand() - 0.5) * 0.25;
  g.add(trunk);
  const branches = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < branches; i++) {
    const len = (0.2 + rand() * 0.25) * size;
    const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.015 * size, 0.03 * size, len, 4), M.deadWood));
    const y = h * (0.35 + rand() * 0.5), a = rand() * Math.PI * 2;
    b.position.set(Math.cos(a) * len * 0.4, y, Math.sin(a) * len * 0.4);
    b.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
    g.add(b);
  }
  return g;
}
