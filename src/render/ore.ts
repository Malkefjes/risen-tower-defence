import * as THREE from "three";

/**
 * A resource node (Erik's pick: the B1 ore body, without the crater): a mound of rock sitting on the snow. Two kinds share the shape:
 * stone (grey) and metal (all silver). Mining breaks it off in three stages.
 */
export type NodeKind = "stone" | "metal";

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  stone: std("#4a4f5c"),
  stoneAlt: std("#555a67"),
  // Metal glows a little so it reads cool against the warm evening light.
  metal: std("#9aa6b6", { metalness: 0.7, roughness: 0.28, emissive: "#5d6e86", emissiveIntensity: 0.25 }),
  metalAlt: std("#adb8c6", { metalness: 0.7, roughness: 0.25, emissive: "#6e7f97", emissiveIntensity: 0.3 }),
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function lump(r: number, rand: () => number, x: number, z: number, sink: number, kind: NodeKind): THREE.Group {
  const m = M!;
  const g = new THREE.Group();
  const a = kind === "metal" ? [m.metal, m.metalAlt] : [m.stone, m.stoneAlt];
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rand() < 0.5 ? a[0]! : a[1]!);
  rock.scale.set(1.15, 0.7 + rand() * 0.3, 1);
  rock.rotation.set(rand(), rand() * 6, rand());
  g.add(rock);
  g.position.set(x, r * (0.7 - sink), z);
  return g;
}

export interface OreNodeModel {
  object: THREE.Group;
  /**
   * Set how much ore is left (0..1). The node breaks in three stages: the outer
   * rocks at 2/3, the middle at 1/3, the core at 0. Returns the world-space
   * centres of rocks that just broke off, for chunk effects.
   */
  setAmount(frac: number): THREE.Vector3[];
  /** Points on top of the rocks that are still there, in world space (for the mining hotspot). */
  surfacePoints(): THREE.Vector3[];
}

/** An n×n node, centred on its footprint, built in three layers that break off in turn. */
export function createOreNode(n: number, seed: number, kind: NodeKind = "stone"): OreNodeModel {
  M ??= palette();
  const rand = rng(seed);
  const object = new THREE.Group();
  // Layer 0 breaks first (outer ring), layer 2 last (the core).
  const layers = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  object.add(...layers);
  const R = n / 2 - 0.08;
  const count = Math.round(6 + n * 5);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, d = i === 0 ? 0 : Math.sqrt(rand()) * R * 0.78;
    const size = (0.3 + rand() * 0.14) * (1 - 0.55 * d / R) * (n / 2.2 + 0.3);
    const layer = layers[d < R * 0.25 ? 2 : d < R * 0.5 ? 1 : 0]!;
    layer.add(lump(size, rand, Math.cos(a) * d, Math.sin(a) * d, 0.3, kind));
    if (rand() < 0.6) layer.add(lump(size * 0.35, rand, Math.cos(a) * d + (rand() - 0.5) * 0.2, Math.sin(a) * d + (rand() - 0.5) * 0.2, 0.1, kind));
  }
  // Every layer must have something to break.
  for (const [i, l] of layers.entries()) if (!l.children.length) l.add(lump(0.25 * (n / 2.2 + 0.3), rand, (rand() - 0.5) * R * (0.3 + i * 0.2), (rand() - 0.5) * R * 0.3, 0.3, kind));
  object.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return {
    object,
    setAmount(frac: number) {
      const broke: THREE.Vector3[] = [];
      const keep = frac <= 0 ? 0 : frac <= 1 / 3 ? 1 : frac <= 2 / 3 ? 2 : 3;
      layers.forEach((l, i) => {
        const visible = i >= 3 - keep;
        if (l.visible && !visible) l.children.forEach(c => broke.push(c.getWorldPosition(new THREE.Vector3())));
        l.visible = visible;
      });
      return broke;
    },
    surfacePoints() {
      object.updateMatrixWorld(true);
      const out: THREE.Vector3[] = [], box = new THREE.Box3();
      for (const l of layers) {
        if (!l.visible) continue;
        for (const c of l.children) {
          box.setFromObject(c);
          const p = box.getCenter(new THREE.Vector3());
          p.y = box.max.y;
          out.push(p);
        }
      }
      return out;
    },
  };
}
