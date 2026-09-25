import * as THREE from "three";
import { roundedBox } from "./models";
import { colonyOrange } from "./palette";

/**
 * The refinery: takes raw metal in and puts metal alloy out. Erik picked A, trimmed to
 * just the furnace on a 2×2 footprint (B and C stay 3×3 for reference). Three looks for
 * Erik to pick from (mockups/refinery), all in the colony palette: deck greys, dark
 * steel, colony orange, cyan power, with a warm molten glow where the metal melts.
 *   A  Smelter stack (picked, 2×2): a round furnace with a molten window and a tall chimney.
 *   B  Arc line: a low hall with a snowy roof and a conveyor in front of it; raw
 *      chunks ride in, pass under a cyan arc gantry and come out as bars.
 *   C  Crucible tanks: three tanks round a caged crucible of molten metal with a
 *      spinning cyan ring; pipes feed it, a chute drops bars at the front.
 * Built facing +z (the front), standing on y = 0, centred on its footprint.
 */
export type RefineryLook = "A" | "B" | "C";

export interface Refinery {
  object: THREE.Group;
  /** Animate: `t` in seconds. */
  update(t: number): void;
}

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true, ...o });

let M: ReturnType<typeof makeMaterials> | undefined;
// Created on first use, after colour management is switched off.
function makeMaterials() {
  return {
    hull: std("#4a5266", { roughness: 0.6 }),
    hullShade: std("#3d4457", { roughness: 0.6 }),
    steelDark: std("#2c3142", { roughness: 0.6 }),
    steelLight: std("#8a94ab", { roughness: 0.5 }),
    orange: colonyOrange(),
    power: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.6, roughness: 0.4 }),
    arc: new THREE.MeshBasicMaterial({ color: "#b8fff6", transparent: true, opacity: 0.85 }),
    /** Molten metal: a hot yellow-orange that glows through windows and pours. */
    molten: std("#ffb347", { emissive: "#ff8a2a", emissiveIntensity: 1.1, roughness: 0.4 }),
    /** Raw metal, like the metal ore node. */
    raw: std("#9aa6b6", { metalness: 0.7, roughness: 0.28, emissive: "#5d6e86", emissiveIntensity: 0.25 }),
    /** Metal alloy bars: brighter and cooler than raw metal, with a faint cyan sheen. */
    alloy: std("#d4ddec", { metalness: 0.6, roughness: 0.22, emissive: "#6fb6c4", emissiveIntensity: 0.28 }),
    snow: std("#f1f4fa", { roughness: 1 }),
    smoke: new THREE.MeshStandardMaterial({ color: "#e9ecf5", roughness: 1, transparent: true, opacity: 0.7, depthWrite: false }),
    belt: std("#23273a", { roughness: 0.9 }),
  };
}
const mats = () => (M ??= makeMaterials());

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
/** Box standing on y (y is its bottom). */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(roundedBox(w, h, d, r), m, x, y + h / 2, z);
/** Upright cylinder standing on y. */
const cyl = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 20, rTop = r) => mesh(new THREE.CylinderGeometry(rTop, r, h, seg), m, x, y + h / 2, z);

/** A few raw metal chunks heaped around (x, y, z). */
function chunks(n: number, x: number, y: number, z: number, spread: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const r = 0.06 + rnd() * 0.05;
    const c = mesh(new THREE.DodecahedronGeometry(r, 0), mats().raw, x + (rnd() - 0.5) * spread, y + r * 0.7 + rnd() * 0.04, z + (rnd() - 0.5) * spread);
    c.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(c);
  }
  return g;
}

/** One alloy bar (a trapezoid ingot), long along x. */
function ingot(): THREE.Mesh {
  const g = new THREE.CylinderGeometry(0.075, 0.1, 0.07, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(1.9, 1, 1);
  return new THREE.Mesh(g, mats().alloy);
}

/** A neat stack of bars: rows of 3, 2, 1. */
function ingotStack(x: number, y: number, z: number, rows = [3, 2, 1]): THREE.Group {
  const g = new THREE.Group();
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const b = ingot();
      b.position.set(0, y + 0.035 + r * 0.07, (i - (n - 1) / 2) * 0.17);
      g.add(b);
    }
  });
  g.position.set(x, 0, z);
  return g;
}

/** A flat snow cap sitting on a top surface. */
const snowCap = (w: number, d: number, x: number, y: number, z: number) => rbox(w, 0.05, d, 0.02, mats().snow, x, y, z);

/** The 3×3 base every look stands on: a dark steel plinth with a cyan power line round it. */
function plinth(g: THREE.Group): void {
  const m = mats();
  g.add(rbox(2.94, 0.14, 2.94, 0.04, m.steelDark, 0, 0, 0));
  for (const [w, d, x, z] of [[2.7, 0.03, 0, 1.455], [2.7, 0.03, 0, -1.455], [0.03, 2.7, 1.455, 0], [0.03, 2.7, -1.455, 0]] as const) {
    g.add(box(w, 0.03, d, m.power, x, 0.06, z));
  }
}

/** Smoke puffs that rise from (x, y, z), grow and fade; returns their animator. */
function smoke(g: THREE.Group, x: number, y: number, z: number): (t: number) => void {
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const p = mesh(new THREE.IcosahedronGeometry(0.12, 0), mats().smoke.clone(), x, y, z);
    g.add(p); puffs.push(p);
  }
  return t => puffs.forEach((p, i) => {
    const k = (t * 0.35 + i / puffs.length) % 1;
    p.position.set(x + k * 0.35, y + k * 1.1, z - k * 0.2);
    p.scale.setScalar(0.6 + k * 1.6);
    (p.material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - k) * Math.min(1, k * 6);
  });
}

// ------------------------------------------------------------------ A: smelter stack

function lookA(): Refinery {
  const m = mats(), g = new THREE.Group();
  // Just the building, standing on the snow in the middle of its 2×2: a round furnace
  // with an orange band, a hot window at the front, and a chimney puffing smoke.
  g.add(cyl(0.86, 0.3, m.hullShade, 0, 0, 0, 24));
  g.add(cyl(0.77, 1.2, m.hull, 0, 0.3, 0, 24));
  g.add(cyl(0.79, 0.14, m.orange, 0, 0.93, 0, 24));
  g.add(cyl(0.6, 0.26, m.hullShade, 0, 1.5, 0, 24, 0.43));
  // A proper window into the furnace: the molten glow set back inside a frame of dark
  // bars, top and bottom running the full width, the sides fitted between them.
  const W = 0.5, H = 0.32, T = 0.07, D = 0.18, wy = 0.5, wz = 0.78;
  g.add(box(W, H, 0.02, m.molten, 0, wy, wz + 0.02));
  for (const y of [wy - T, wy + H]) g.add(box(W + 2 * T, T, D, m.steelDark, 0, y, wz));
  for (const x of [-(W + T) / 2, (W + T) / 2]) g.add(box(T, H, D, m.steelDark, x, wy, wz));
  g.add(cyl(0.19, 1.1, m.hullShade, 0.12, 1.76, -0.12, 14));
  g.add(cyl(0.21, 0.12, m.orange, 0.12, 2.8, -0.12, 14));
  const puff = smoke(g, 0.12, 3.0, -0.12);
  // Snow settled on the furnace's shoulder, round the chimney.
  g.add(mesh(new THREE.TorusGeometry(0.56, 0.08, 6, 24).rotateX(Math.PI / 2), m.snow, 0, 1.52, 0));
  shadowAll(g);
  return {
    object: g,
    update(t) {
      m.molten.emissiveIntensity = 1.0 + Math.sin(t * 3.1) * 0.15 + Math.sin(t * 7.3) * 0.08;
      puff(t);
    },
  };
}

// ------------------------------------------------------------------ B: arc line

function lookB(): Refinery {
  const m = mats(), g = new THREE.Group();
  plinth(g);
  // Low hall across the back, with a pitched roof carrying settled snow.
  g.add(box(2.6, 0.78, 1.2, m.hull, 0, 0.14, -0.72));
  g.add(box(2.64, 0.08, 1.24, m.orange, 0, 0.62, -0.72));
  const roof = new THREE.CylinderGeometry(0.7, 0.7, 2.7, 3, 1);
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 0.45, 1);
  const r = mesh(roof, m.hullShade, 0, 1.08, -0.72);
  g.add(r);
  const snowRoof = new THREE.CylinderGeometry(0.66, 0.66, 2.66, 3, 1);
  snowRoof.rotateZ(Math.PI / 2);
  snowRoof.scale(1, 0.45, 1);
  g.add(mesh(snowRoof, m.snow, 0, 1.12, -0.72));
  // Glowing furnace doorway in the hall's front, where the melt happens.
  g.add(rbox(0.6, 0.46, 0.06, 0.03, m.steelDark, 0, 0.14, -0.1));
  g.add(rbox(0.46, 0.36, 0.05, 0.03, m.molten, 0, 0.16, -0.07));
  // Conveyor along the front.
  const bz = 0.62;
  g.add(box(2.8, 0.2, 0.46, m.steelDark, 0, 0.14, bz));
  g.add(box(2.8, 0.03, 0.38, m.belt, 0, 0.34, bz));
  for (const s of [-1, 1]) g.add(box(2.8, 0.06, 0.04, m.orange, 0, 0.34, bz + s * 0.21));
  // Belt slats that slide along.
  const slats: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) { const sl = box(0.03, 0.012, 0.36, m.hullShade, 0, 0.37, bz); g.add(sl); slats.push(sl); }
  // Arc gantry over the middle: two cyan coils and a crackling arc between them.
  for (const s of [-1, 1]) {
    g.add(box(0.1, 0.9, 0.1, m.hull, s * 0.32, 0.14, bz));
    const coil = cyl(0.09, 0.3, m.power, s * 0.32, 0.62, bz, 12);
    g.add(coil);
  }
  g.add(box(0.8, 0.1, 0.16, m.hullShade, 0, 1.04, bz));
  const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 6), m.arc);
  arc.rotation.z = Math.PI / 2;
  arc.position.set(0, 0.78, bz);
  g.add(arc);
  // Input bin (left) and output stack (right).
  g.add(rbox(0.46, 0.34, 0.5, 0.04, m.hullShade, -1.18, 0.14, 1.1));
  g.add(chunks(8, -1.18, 0.48, 1.1, 0.34, 3));
  g.add(ingotStack(1.15, 0.14, 1.1, [3, 2]));
  // Items riding the belt: raw chunks left of the arc, bars to the right.
  const riders: { raw: THREE.Mesh; bar: THREE.Mesh; phase: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const raw = mesh(new THREE.DodecahedronGeometry(0.08, 0), m.raw, 0, 0.44, bz);
    const bar = ingot(); bar.position.set(0, 0.4, bz); bar.rotation.y = Math.PI / 2; bar.scale.setScalar(0.8);
    g.add(raw, bar); riders.push({ raw, bar, phase: i / 4 });
  }
  shadowAll(g);
  arc.castShadow = false;
  return {
    object: g,
    update(t) {
      const speed = 0.28;
      slats.forEach((sl, i) => { sl.position.x = -1.35 + (((i / slats.length) * 2.7 + t * speed * 2.7) % 2.7); });
      for (const r of riders) {
        const k = (t * speed + r.phase) % 1, x = -1.3 + k * 2.6;
        r.raw.visible = x < 0; r.bar.visible = x >= 0;
        r.raw.position.x = x; r.bar.position.x = x;
        r.raw.rotation.y = t;
      }
      const flick = 0.5 + 0.5 * Math.sin(t * 37) * Math.sin(t * 13);
      arc.visible = flick > 0.15;
      arc.scale.set(1, 0.8 + flick * 0.4, 1);
      m.power.emissiveIntensity = 0.5 + flick * 0.5;
      m.molten.emissiveIntensity = 1.0 + Math.sin(t * 2.7) * 0.15;
    },
  };
}

// ------------------------------------------------------------------ C: crucible tanks

function lookC(): Refinery {
  const m = mats(), g = new THREE.Group();
  plinth(g);
  // Three tanks round the middle: two at the back corners, one front-left.
  const tanks: [number, number][] = [[-0.85, -0.85], [0.85, -0.85], [-0.95, 0.75]];
  for (const [x, z] of tanks) {
    g.add(cyl(0.44, 1.2, m.hull, x, 0.14, z, 18));
    g.add(cyl(0.46, 0.1, m.orange, x, 0.9, z, 18));
    const dome = mesh(new THREE.SphereGeometry(0.44, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.hullShade, x, 1.34, z);
    g.add(dome);
    g.add(mesh(new THREE.SphereGeometry(0.45, 18, 6, 0, Math.PI * 2, 0, Math.PI / 3.2), m.snow, x, 1.35, z));
    // Pipe from the tank into the crucible.
    const dx = -x, dz = -z, len = Math.hypot(dx, dz) - 0.7;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), m.steelLight);
    pipe.rotation.z = Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.set(x, 1.05, z);
    holder.rotation.y = Math.atan2(-dz, dx);
    pipe.position.x = 0.44 + len / 2 - 0.2;
    holder.add(pipe);
    g.add(holder);
  }
  // Raw metal heaped in an open intake on the front-left tank.
  g.add(cyl(0.3, 0.12, m.steelDark, -0.95, 1.42, 0.75, 16));
  g.add(chunks(7, -0.95, 1.5, 0.75, 0.32, 11));
  // Central crucible: a cage of posts round a bowl of molten metal, a spinning ring.
  const cx = 0.1, cz = 0.05;
  g.add(cyl(0.5, 0.3, m.hullShade, cx, 0.14, cz, 20));
  g.add(cyl(0.44, 0.12, m.orange, cx, 0.44, cz, 20));
  g.add(cyl(0.34, 0.06, m.molten, cx, 0.54, cz, 20));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(rbox(0.07, 1.1, 0.07, 0.02, m.steelDark, cx + Math.cos(a) * 0.46, 0.44, cz + Math.sin(a) * 0.46));
  }
  g.add(cyl(0.52, 0.1, m.hull, cx, 1.54, cz, 20));
  g.add(snowCap(0.62, 0.62, cx, 1.64, cz));
  const orb = mesh(new THREE.IcosahedronGeometry(0.2, 1), m.molten, cx, 0.9, cz);
  g.add(orb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 32), m.power);
  ring.position.set(cx, 0.95, cz);
  g.add(ring);
  // Chute at the front dropping bars onto a tray.
  const chute = box(0.2, 0.06, 0.62, m.steelDark, cx + 0.45, 0.5, cz + 0.55);
  chute.rotation.x = 0.35;
  g.add(chute);
  g.add(rbox(0.7, 0.1, 0.56, 0.03, m.steelDark, 0.75, 0.14, 1.0));
  g.add(ingotStack(0.75, 0.24, 1.0));
  shadowAll(g);
  ring.castShadow = false;
  return {
    object: g,
    update(t) {
      orb.position.y = 0.92 + Math.sin(t * 1.6) * 0.05;
      orb.rotation.y = t * 0.6;
      ring.rotation.set(Math.PI / 2 + Math.sin(t * 0.9) * 0.35, t * 1.4, 0);
      m.molten.emissiveIntensity = 1.0 + Math.sin(t * 3.3) * 0.15;
      m.power.emissiveIntensity = 0.55 + Math.sin(t * 2.2) * 0.12;
    },
  };
}

function shadowAll<T extends THREE.Object3D>(o: T): T {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
}

export function refineryLook(look: RefineryLook): Refinery {
  return look === "A" ? lookA() : look === "B" ? lookB() : lookC();
}
