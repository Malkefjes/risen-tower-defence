import * as THREE from "three";

/**
 * The new basic enemy: three Tyranid-inspired designs (first in ice blue, now deep purple) for Erik to pick
 * from (mockups/enemies). Chitin plates over a pale body, bladed forelimbs, a tail.
 * All face +z, stand on y = 0, and animate a walk from `update(t, walking)`.
 *   A: a gaunt, a hunched biped on digitigrade legs with two scything blades.
 *   B: a crawler, low and six-legged, a segmented back and mantis blades held high.
 *   C: a leaper, long springing hind legs and two blades (Erik's pick: no eyes, horns or chest claws).
 */
export type EnemyLook = "A" | "B" | "C";

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
// One very dark red for the whole creature (Erik; was dark purple), soft and matte with smooth shading
// so it reads as living tissue, not ice or glass; a faint glow keeps the red at dusk.
const palette = () => {
  const flesh = new THREE.MeshStandardMaterial({ color: "#1e0406", roughness: 0.8, metalness: 0, emissive: "#0c0102", emissiveIntensity: 0.3 });
  // Blades and the stinger are bone white (Erik), matte like the body.
  const bone = new THREE.MeshStandardMaterial({ color: "#e9e1cf", roughness: 0.7, metalness: 0 });
  return { chitin: flesh, chitinDark: flesh, hide: flesh, bone, eye: new THREE.MeshBasicMaterial({ color: "#0d1a2a" }) };
};
void std;

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};
/** A tapered limb segment hanging down from its pivot (length along -y). */
const seg = (len: number, r0: number, r1: number, m: THREE.Material) => {
  // Round, with rounded ends, so limbs read as flesh, not cut rods.
  const g = new THREE.CapsuleGeometry((r0 + r1) / 2, Math.max(0.001, len - (r0 + r1) / 2), 3, 8);
  g.translate(0, -len / 2, 0);
  return mesh(g, m);
};
/** A chitin plate: a flattened, faceted shell. */
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

/** A digitigrade leg: thigh forward, shin back, a long foot bone forward again. */
function legChain(parent: THREE.Object3D, x: number, y: number, z: number, thigh: number, shin: number, foot: number, r: number, phase: number, m: { chitin: THREE.Material; chitinDark: THREE.Material }): Leg {
  const hip = joint(parent, x, y, z);
  const t = seg(thigh, r, r * 0.8, m.chitin); hip.add(t);
  hip.rotation.x = -0.6;
  const knee = joint(hip, 0, -thigh, 0);
  knee.add(seg(shin, r * 0.75, r * 0.5, m.chitinDark));
  knee.rotation.x = 1.3;
  const ankle = joint(knee, 0, -shin, 0);
  ankle.add(seg(foot, r * 0.5, r * 0.3, m.chitinDark));
  ankle.rotation.x = -1.0;
  const tip = joint(ankle, 0, -foot, 0);
  return { hip, knee, phase, lift: 0.35, swing: 0.45, tip };
}

export function enemyLook(look: EnemyLook): Enemy {
  M ??= palette();
  // Each creature gets its own body material, so a hit flashes only the one that was hit.
  const flesh = (M.chitin as THREE.MeshStandardMaterial).clone();
  const baseEmissive = flesh.emissive.clone(), baseIntensity = flesh.emissiveIntensity;
  const m = { ...M, chitin: flesh, chitinDark: flesh, hide: flesh };
  const root = new THREE.Group();
  const body = joint(root, 0, 0, 0);
  const legs: Leg[] = [];
  const arms: { j: THREE.Group; rest: number; phase: number }[] = [];
  let tail: THREE.Group | null = null, head: THREE.Group | null = null;

  if (look === "A") {
    // Gaunt: hunched biped, torso pitched forward, a crested head low and ahead.
    body.position.y = 0.46;
    const torso = plate(0.34, 0.28, 0.5, m.hide); body.add(torso);
    for (let i = 0; i < 3; i++) { const p = plate(0.36 - i * 0.04, 0.12, 0.2, i % 2 ? m.chitin : m.chitinDark); p.position.set(0, 0.12, 0.14 - i * 0.14); p.rotation.x = -0.25; body.add(p); }
    head = joint(body, 0, 0.06, 0.3);
    const skull = plate(0.2, 0.16, 0.3, m.chitin); skull.position.z = 0.08; head.add(skull);
    const crest = plate(0.22, 0.08, 0.34, m.chitinDark); crest.position.set(0, 0.08, 0.02); crest.rotation.x = -0.35; head.add(crest);
    for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.025, 5, 4), m.eye, s * 0.06, 0.02, 0.2));
    const jaw = plate(0.12, 0.06, 0.18, m.bone); jaw.position.set(0, -0.06, 0.16); head.add(jaw);
    for (const s of [-1, 1]) {
      legs.push(legChain(body, s * 0.13, -0.04, -0.08, 0.2, 0.22, 0.14, 0.045, s > 0 ? 0 : Math.PI, m));
      const sh = joint(body, s * 0.17, 0.02, 0.18);
      sh.add(seg(0.14, 0.035, 0.03, m.chitin));
      const el = joint(sh, 0, -0.14, 0); sh.rotation.set(0.9, 0, s * 0.2);
      const b = blade(0.34, m.bone); el.add(b); el.rotation.x = -0.4;
      arms.push({ j: sh, rest: 0.9, phase: s > 0 ? Math.PI : 0 });
    }
    tail = joint(body, 0, 0.0, -0.25);
    let t: THREE.Object3D = tail;
    for (let i = 0; i < 4; i++) { const s = seg(0.14, 0.05 - i * 0.01, 0.04 - i * 0.01, i % 2 ? m.chitinDark : m.chitin); s.rotation.x = Math.PI / 2 - 0.2; const j = joint(t, 0, 0, i ? -0.13 : 0); j.add(s); t = j; }
  } else if (look === "B") {
    // Crawler: low and long, six short legs, a segmented arched back, mantis blades held up.
    body.position.y = 0.26;
    for (let i = 0; i < 4; i++) {
      const p = plate(0.42 - Math.abs(i - 1.2) * 0.05, 0.2, 0.26, i % 2 ? m.chitinDark : m.chitin);
      p.position.set(0, 0.06 + (i === 1 || i === 2 ? 0.04 : 0), 0.24 - i * 0.2); body.add(p);
    }
    const belly = plate(0.34, 0.12, 0.8, m.hide); belly.position.set(0, -0.04, 0); body.add(belly);
    head = joint(body, 0, 0.05, 0.38);
    const skull = plate(0.24, 0.18, 0.22, m.chitin); head.add(skull);
    for (const s of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.028, 5, 4), m.eye, s * 0.07, 0.03, 0.09));
      const mand = new THREE.ConeGeometry(0.02, 0.12, 4); mand.rotateX(Math.PI / 2); mand.rotateY(-s * 0.4);
      head.add(mesh(mand, m.bone, s * 0.05, -0.05, 0.14));
    }
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const hip = joint(body, s * 0.18, -0.02, 0.16 - i * 0.2);
      hip.add(seg(0.16, 0.03, 0.025, m.chitinDark));
      hip.rotation.set(0, 0, s * 1.1);
      const knee = joint(hip, 0, -0.16, 0);
      knee.add(seg(0.22, 0.022, 0.012, m.chitinDark));
      knee.rotation.z = -s * 1.5;
      const tip = joint(knee, 0, -0.22, 0);
      legs.push({ hip, knee, phase: (i % 2 === 0) === (s > 0) ? 0 : Math.PI, lift: 0.25, swing: 0.35, tip });
    }
    for (const s of [-1, 1]) {
      const sh = joint(body, s * 0.14, 0.14, 0.3);
      sh.add(seg(0.2, 0.035, 0.03, m.chitin));
      sh.rotation.set(-0.9, 0, s * 0.15);
      const el = joint(sh, 0, -0.2, 0);
      el.add(blade(0.36, m.bone)); el.rotation.x = 2.4;
      arms.push({ j: sh, rest: -0.9, phase: s > 0 ? 0 : Math.PI });
    }
  } else {
    // Leaper: long springing hind legs, torso leaning forward, spines down the back, a long tail.
    body.position.y = 0.52;
    const torso = plate(0.28, 0.26, 0.46, m.hide); torso.rotation.x = 0.3; body.add(torso);
    const back = plate(0.3, 0.1, 0.46, m.chitin); back.position.set(0, 0.1, 0); back.rotation.x = 0.25; body.add(back);
    // The head carries on the downward slope of the back.
    head = joint(body, 0, 0.06, 0.29);
    head.rotation.x = 0.45;
    const skull = plate(0.17, 0.14, 0.3, m.chitin); skull.position.z = 0.08; head.add(skull);
    for (const s of [-1, 1]) {
      const l = legChain(body, s * 0.12, -0.08, -0.14, 0.26, 0.3, 0.2, 0.05, s > 0 ? 0 : Math.PI, m);
      // Long, unhurried strides (Erik).
      l.lift = 0.26; l.swing = 0.62;
      legs.push(l);
      const sh = joint(body, s * 0.15, 0.08, 0.2);
      sh.add(seg(0.16, 0.03, 0.025, m.chitin));
      sh.rotation.set(0.7, 0, s * 0.25);
      const el = joint(sh, 0, -0.16, 0); el.add(blade(0.3, m.bone)); el.rotation.x = -0.3;
      arms.push({ j: sh, rest: 0.7, phase: s > 0 ? Math.PI : 0 });
    }
    tail = joint(body, 0, 0.0, -0.22);
    let t: THREE.Object3D = tail;
    for (let i = 0; i < 6; i++) { const s = seg(0.13, 0.045 - i * 0.006, 0.04 - i * 0.006, i % 2 ? m.chitinDark : m.chitin); s.rotation.x = Math.PI / 2 - 0.12; const j = joint(t, 0, 0, i ? -0.12 : 0); j.add(s); t = j; }
    const sting = new THREE.ConeGeometry(0.03, 0.12, 10); sting.rotateX(-Math.PI / 2);
    t.add(mesh(sting, m.bone, 0, 0, -0.18));
  }

  // The leaper is smaller than it was modelled at (Erik: half, then a little bigger).
  if (look === "C") root.scale.setScalar(0.6);
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
    update(t: number, walking: boolean) {
      const w = walking ? 1 : 0, f = t * (look === "B" ? 11 : look === "C" ? 5.5 : 9);
      for (const l of legs) {
        const s = Math.sin(f + l.phase);
        if (look === "B") { l.hip.rotation.y = s * l.swing * w; l.knee.rotation.x = Math.max(0, Math.cos(f + l.phase)) * l.lift * w; }
        else { l.hip.rotation.x = -0.6 + s * l.swing * w; l.knee.rotation.x = 1.3 + Math.max(0, -Math.cos(f + l.phase)) * l.lift * w; }
      }
      for (const a of arms) a.j.rotation.x = a.rest + Math.sin(f + a.phase) * 0.18 * w + Math.sin(t * 1.7 + a.phase) * 0.05;
      if (head) head.rotation.y = Math.sin(t * 0.9) * 0.2;
      // Keep the lowest foot on the snow: raise or lower the body to meet it, so feet
      // never sink in and the stride's natural rise and fall shows in the body.
      // The body glides toward that height rather than snapping, so the stride reads as
      // a smooth prowl; it never lets a foot sink more than a sliver.
      body.position.y = baseY;
      root.updateMatrixWorld(true);
      let low = Infinity;
      // In the creature's own units, so it works at any scale.
      for (const l of legs) low = Math.min(low, root.worldToLocal(l.tip.getWorldPosition(tipPos)).y);
      const want = isFinite(low) ? baseY + FOOT_R - low : baseY;
      const dt = lastT < 0 ? 1 : Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      smoothY = smoothY < 0 ? want : smoothY + (want - smoothY) * Math.min(1, dt * 8);
      body.position.y = Math.max(smoothY, want - 0.012);
      if (tail) { tail.rotation.y = Math.sin(f * 0.5) * 0.35 * w + Math.sin(t * 1.3) * 0.1; tail.rotation.x = Math.sin(t * 1.1) * 0.06; }
    },
  };
}
