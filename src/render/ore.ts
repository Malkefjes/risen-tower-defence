import * as THREE from "three";

/**
 * An ore node (Erik's pick: the B1 ore body from mockups/ore-b, without the
 * crater): a mound of grey stone streaked with silver ore, sitting on the snow.
 * `setAmount(0..1)` shrinks it as it's mined out.
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  // Grey stone with silver ore. The silver glows a little so it reads cool against the warm evening light.
  body: std("#4a4f5c"),
  bodyWarm: std("#555a67"),
  gold: std("#dfe7f0", { metalness: 0.5, roughness: 0.3, emissive: "#9fb1c6", emissiveIntensity: 0.45 }),
  goldBright: std("#f6faff", { metalness: 0.5, roughness: 0.25, emissive: "#c3d2e4", emissiveIntensity: 0.55 }),
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function lump(r: number, rand: () => number, x: number, z: number, sink: number, rich: boolean): THREE.Group {
  const m = M!;
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rich ? m.gold : rand() < 0.5 ? m.body : m.bodyWarm);
  rock.scale.set(1.15, 0.7 + rand() * 0.3, 1);
  rock.rotation.set(rand(), rand() * 6, rand());
  g.add(rock);
  const flecks = rich ? 0 : 5 + Math.floor(rand() * 4);
  for (let i = 0; i < flecks; i++) {
    const th = rand() * Math.PI * 2, ph = 0.3 + rand() * 1.1;
    const n = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const f = new THREE.Mesh(new THREE.BoxGeometry(r * (0.45 + rand() * 0.45), r * 0.1, r * (0.25 + rand() * 0.3)), rand() < 0.35 ? m.goldBright : m.gold);
    f.position.copy(n).multiplyScalar(r * 0.78);
    f.position.y *= rock.scale.y;
    f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    f.rotateY(rand() * 3);
    g.add(f);
  }
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
}

/** An n×n ore node, centred on its footprint, built in three layers that break off in turn. */
export function createOreNode(n: number, seed: number): OreNodeModel {
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
    layer.add(lump(size, rand, Math.cos(a) * d, Math.sin(a) * d, 0.3, false));
    if (rand() < 0.6) layer.add(lump(size * 0.35, rand, Math.cos(a) * d + (rand() - 0.5) * 0.2, Math.sin(a) * d + (rand() - 0.5) * 0.2, 0.1, true));
  }
  // Every layer must have something to break.
  for (const [i, l] of layers.entries()) if (!l.children.length) l.add(lump(0.25 * (n / 2.2 + 0.3), rand, (rand() - 0.5) * R * (0.3 + i * 0.2), (rand() - 0.5) * R * 0.3, 0.3, false));
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
  };
}
