import * as THREE from "three";

/**
 * An ore node (Erik's pick: the B1 ore body from mockups/ore-b, without the
 * crater): a mound of dark rock streaked with dull gold, sitting on the snow.
 * `setAmount(0..1)` shrinks it as it's mined out.
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  body: std("#3f3a36"),
  bodyWarm: std("#4d4238"),
  gold: std("#d9a441", { metalness: 0.4, roughness: 0.45, emissive: "#8a5a14", emissiveIntensity: 0.4 }),
  goldBright: std("#efc25c", { metalness: 0.45, roughness: 0.35, emissive: "#a36b18", emissiveIntensity: 0.45 }),
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

export interface OreNodeModel { object: THREE.Group; setAmount(frac: number): void }

/** An n×n ore node, centred on its footprint. */
export function createOreNode(n: number, seed: number): OreNodeModel {
  M ??= palette();
  const rand = rng(seed);
  const object = new THREE.Group(), mound = new THREE.Group();
  object.add(mound);
  const R = n / 2 - 0.08;
  // A big core in the middle, then lumps out to the edges so the mound fills its footprint.
  const count = Math.round(6 + n * 5);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, d = i === 0 ? 0 : Math.sqrt(rand()) * R * 0.78;
    const size = (0.3 + rand() * 0.14) * (1 - 0.55 * d / R) * (n / 2.2 + 0.3);
    mound.add(lump(size, rand, Math.cos(a) * d, Math.sin(a) * d, 0.3, false));
    if (rand() < 0.6) mound.add(lump(size * 0.35, rand, Math.cos(a) * d + (rand() - 0.5) * 0.2, Math.sin(a) * d + (rand() - 0.5) * 0.2, 0.1, true));
  }
  object.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return {
    object,
    // Shrinks down into the snow as it's mined; never quite flat until it's gone.
    setAmount(frac: number) {
      const k = 0.35 + 0.65 * Math.max(0, Math.min(1, frac));
      mound.scale.set(0.6 + 0.4 * k, k, 0.6 + 0.4 * k);
      object.visible = frac > 0;
    },
  };
}
