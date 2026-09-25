import * as THREE from "three";

/**
 * The basic enemy: the leaper (Erik's pick, look C from the enemy round). Tyranid-
 * inspired: long springing hind legs, torso leaning forward, the head carrying on the
 * slope of the back, two scything blades and a long tail with a stinger. No eyes,
 * horns or chest claws. Faces +z, stands on y = 0, walks from `update(t, walking)`.
 */

let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
// One very dark red for the whole creature (Erik), soft and matte with smooth shading so
// it reads as living tissue, not ice or glass; a faint glow keeps the red at dusk.
// The blades and the stinger are bone white (Erik), matte like the body.
const palette = () => ({
  flesh: new THREE.MeshStandardMaterial({ color: "#1e0406", roughness: 0.8, metalness: 0, emissive: "#0c0102", emissiveIntensity: 0.3 }),
  bone: new THREE.MeshStandardMaterial({ color: "#e9e1cf", roughness: 0.7, metalness: 0 }),
});

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};
/** A tapered limb segment hanging down from its pivot (length along -y), round so it reads as flesh. */
const seg = (len: number, r0: number, r1: number, m: THREE.Material) => {
  const g = new THREE.CapsuleGeometry((r0 + r1) / 2, Math.max(0.001, len - (r0 + r1) / 2), 3, 8);
  g.translate(0, -len / 2, 0);
  return mesh(g, m);
};
/** A body plate: a flattened, rounded shell. */
const plate = (sx: number, sy: number, sz: number, m: THREE.Material) => {
  const g = new THREE.IcosahedronGeometry(0.5, 2);
  g.scale(sx, sy, sz);
  return mesh(g, m);
};
/** A curved scything blade, pointing down from its pivot and sweeping forward. */
const blade = (len: number, m: THREE.Material) => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(len * 0.55, -len * 0.35, len * 0.25, -len);
  s.quadraticCurveTo(len * 0.25, -len * 0.45, -len * 0.08, -len * 0.05);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3 });
  g.translate(0, 0, -0.01);
  g.rotateY(-Math.PI / 2); // curve sweeps toward +z
  return mesh(g, m);
};
/** A pivot group at a point. */
const joint = (parent: THREE.Object3D, x: number, y: number, z: number) => {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  return j;
};

const FLASH = new THREE.Color("#ffffff");

export interface Enemy {
  object: THREE.Group;
  update(t: number, walking: boolean): void;
  /** Light the body up when hit (0 = normal, 1 = full flash). */
  flash(k: number): void;
}

interface Leg { hip: THREE.Group; knee: THREE.Group; phase: number; lift: number; swing: number; /** The foot's tip, for keeping it on the ground. */ tip: THREE.Object3D }

/** A digitigrade leg: thigh forward, shin back, a long foot bone forward again. Long, unhurried strides (Erik). */
function legChain(parent: THREE.Object3D, x: number, y: number, z: number, phase: number, m: THREE.Material): Leg {
  const thigh = 0.26, shin = 0.3, foot = 0.2, r = 0.05;
  const hip = joint(parent, x, y, z);
  hip.add(seg(thigh, r, r * 0.8, m));
  hip.rotation.x = -0.6;
  const knee = joint(hip, 0, -thigh, 0);
  knee.add(seg(shin, r * 0.75, r * 0.5, m));
  knee.rotation.x = 1.3;
  const ankle = joint(knee, 0, -shin, 0);
  ankle.add(seg(foot, r * 0.5, r * 0.3, m));
  ankle.rotation.x = -1.0;
  const tip = joint(ankle, 0, -foot, 0);
  return { hip, knee, phase, lift: 0.26, swing: 0.62, tip };
}

export function leaperModel(): Enemy {
  M ??= palette();
  // Each creature gets its own body material, so a hit flashes only the one that was hit.
  const flesh = M.flesh.clone(), bone = M.bone;
  const baseEmissive = flesh.emissive.clone(), baseIntensity = flesh.emissiveIntensity;
  const root = new THREE.Group();
  const body = joint(root, 0, 0.52, 0);
  const legs: Leg[] = [];
  const arms: { j: THREE.Group; rest: number; phase: number }[] = [];

  const torso = plate(0.28, 0.26, 0.46, flesh); torso.rotation.x = 0.3; body.add(torso);
  const back = plate(0.3, 0.1, 0.46, flesh); back.position.set(0, 0.1, 0); back.rotation.x = 0.25; body.add(back);
  const head = joint(body, 0, 0.06, 0.29);
  head.rotation.x = 0.45;
  const skull = plate(0.17, 0.14, 0.3, flesh); skull.position.z = 0.08; head.add(skull);
  for (const s of [-1, 1]) {
    legs.push(legChain(body, s * 0.12, -0.08, -0.14, s > 0 ? 0 : Math.PI, flesh));
    const sh = joint(body, s * 0.15, 0.08, 0.2);
    sh.add(seg(0.16, 0.03, 0.025, flesh));
    sh.rotation.set(0.7, 0, s * 0.25);
    const el = joint(sh, 0, -0.16, 0); el.add(blade(0.3, bone)); el.rotation.x = -0.3;
    arms.push({ j: sh, rest: 0.7, phase: s > 0 ? Math.PI : 0 });
  }
  const tail = joint(body, 0, 0.0, -0.22);
  let t: THREE.Object3D = tail;
  for (let i = 0; i < 6; i++) { const s = seg(0.13, 0.045 - i * 0.006, 0.04 - i * 0.006, flesh); s.rotation.x = Math.PI / 2 - 0.12; const j = joint(t, 0, 0, i ? -0.12 : 0); j.add(s); t = j; }
  const sting = new THREE.ConeGeometry(0.03, 0.12, 10); sting.rotateX(-Math.PI / 2);
  t.add(mesh(sting, bone, 0, 0, -0.18));

  // Smaller than it was modelled at (Erik: half, then a little bigger).
  root.scale.setScalar(0.6);
  const baseY = body.position.y;
  const tipPos = new THREE.Vector3();
  /** Half the foot's thickness: the tip sits this far above the snow. */
  const FOOT_R = 0.015;
  let smoothY = -1, lastT = -1;
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = true; });
  return {
    object: root,
    flash(k: number) {
      flesh.emissive.copy(baseEmissive).lerp(FLASH, k);
      flesh.emissiveIntensity = baseIntensity + (0.9 - baseIntensity) * k;
    },
    update(time: number, walking: boolean) {
      const w = walking ? 1 : 0, f = time * 5.5;
      for (const l of legs) {
        const s = Math.sin(f + l.phase);
        l.hip.rotation.x = -0.6 + s * l.swing * w;
        l.knee.rotation.x = 1.3 + Math.max(0, -Math.cos(f + l.phase)) * l.lift * w;
      }
      for (const a of arms) a.j.rotation.x = a.rest + Math.sin(f + a.phase) * 0.18 * w + Math.sin(time * 1.7 + a.phase) * 0.05;
      head.rotation.y = Math.sin(time * 0.9) * 0.2;
      // Keep the lowest foot on the snow: raise or lower the body to meet it, eased so the
      // stride reads as a smooth prowl, never letting a foot sink more than a sliver.
      // Measured in the creature's own units, so it works at any scale.
      body.position.y = baseY;
      root.updateMatrixWorld(true);
      let low = Infinity;
      for (const l of legs) low = Math.min(low, root.worldToLocal(l.tip.getWorldPosition(tipPos)).y);
      const want = isFinite(low) ? baseY + FOOT_R - low : baseY;
      const dt = lastT < 0 ? 1 : Math.min(0.1, Math.max(0, time - lastT));
      lastT = time;
      smoothY = smoothY < 0 ? want : smoothY + (want - smoothY) * Math.min(1, dt * 8);
      body.position.y = Math.max(smoothY, want - 0.012);
      tail.rotation.y = Math.sin(f * 0.5) * 0.35 * w + Math.sin(time * 1.3) * 0.1;
      tail.rotation.x = Math.sin(time * 1.1) * 0.06;
    },
  };
}
