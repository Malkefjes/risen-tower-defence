import * as THREE from "three";
import { createDefaultModels, createMaterials, DECK_TOP, EVENING, roundedBox } from "../../src/render/models";
import type { Cell } from "../../src/sim/types";
import "./style.css";

// The explosive tower, three looks: A rocket pod, B grenade launcher, C missile rack.
// Each stands at 1×1 and grown to 2×2 on a plated wall, built from the game's own
// materials in the style of the Gun, and fires at the snow in front of it.

THREE.ColorManagement.enabled = false;

const mat = createMaterials();
const models = createDefaultModels(mat);
const hole = new THREE.MeshStandardMaterial({ color: "#14161d", roughness: 0.9 });

const shadowed = <T extends THREE.Mesh>(o: T): T => { o.castShadow = true; o.receiveShadow = true; return o; };
const m = (g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = shadowed(new THREE.Mesh(g, material));
  o.position.set(x, y, z);
  return o;
};
const cyl = (rt: number, rb: number, h: number, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** Cylinder lying along +z, starting at the origin. */
function barrel(r: number, len: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
}
/** Cone pointing along +z, its base at the origin. */
function nose(r: number, len: number, seg = 6): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
}

// ------------------------------------------------------------------ the towers

type Look = "rocket" | "grenade" | "missile";

interface Muzzle {
  /** Where shots leave, in pitch space. */
  at: THREE.Vector3;
  /** A missile sitting on the rack (hidden while it reloads). */
  load?: THREE.Object3D;
  reloadAt?: number;
  /** Slides back along z when it fires. */
  kick?: THREE.Object3D;
}

interface Tower {
  look: Look; big: boolean; root: THREE.Group; yaw: THREE.Group; pitch: THREE.Group; pitchRest: number;
  muzzles: Muzzle[]; next: number; shot: number; cooldown: number; salvoLeft: number; aim: THREE.Vector3;
  spinner?: THREE.Object3D; zone: { c: THREE.Vector3 };
}

/** The Gun's hex mount, shared by all three so they read as one family. */
function mount(root: THREE.Group, k: number): THREE.Group {
  root.add(m(cyl(0.32 * k, 0.36 * k, 0.12 * k), mat.gun, 0, 0.06 * k, 0));
  root.add(m(cyl(0.2 * k, 0.24 * k, 0.08 * k), mat.gunDark, 0, 0.16 * k, 0));
  const yaw = new THREE.Group();
  yaw.position.y = 0.2 * k;
  root.add(yaw);
  return yaw;
}

/** A: a boxy orange pod of launch tubes, 2×2 at 1×1 and 3×3 grown. Fires salvos on a flat arc. */
function rocketPod(big: boolean): Omit<Tower, "next" | "shot" | "cooldown" | "salvoLeft" | "aim" | "zone"> {
  const k = big ? 1.8 : 1, root = new THREE.Group(), yaw = mount(root, k);
  yaw.add(m(cyl(0.18 * k, 0.2 * k, 0.05 * k), mat.gunDark, 0, 0.025 * k, 0));
  for (const sx of [-1, 1]) yaw.add(m(box(0.05 * k, 0.24 * k, 0.2 * k), mat.gun, sx * 0.26 * k, 0.14 * k, 0));
  const pitch = new THREE.Group();
  pitch.position.y = 0.21 * k;
  yaw.add(pitch);
  const w = 0.44 * k, h = 0.3 * k, d = 0.42 * k;
  pitch.add(m(roundedBox(w, h, d, 0.03 * k), mat.accent, 0, 0, 0));
  pitch.add(m(box(w * 0.7, 0.012 * k, d * 0.6), mat.plate, 0, h / 2 + 0.004, -0.02 * k));
  pitch.add(m(box(w * 0.92, h * 0.86, 0.02), mat.gunDark, 0, 0, d / 2 + 0.003));
  const n = big ? 3 : 2, r = big ? 0.055 : 0.045;
  const sx = big ? 0.24 : 0.095, sy = big ? 0.155 : 0.065;
  const muzzles: Muzzle[] = [];
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    const x = n === 2 ? (ix ? sx : -sx) : (ix - 1) * sx, y = n === 2 ? (iy ? sy : -sy) : (iy - 1) * sy;
    pitch.add(m(barrel(r * 1.3, 0.02, 8), mat.plate, x, y, d / 2));
    pitch.add(m(barrel(r, 0.03, 8), hole, x, y, d / 2 + 0.002));
    muzzles.push({ at: new THREE.Vector3(x, y, d / 2 + 0.05) });
  }
  if (big) {
    // Armour cheeks and a sensor box with a cyan lens.
    for (const s of [-1, 1]) pitch.add(m(roundedBox(0.06 * k, h * 0.8, d * 0.8, 0.015 * k), mat.gun, s * (w / 2 + 0.03 * k), 0, -0.02 * k));
    pitch.add(m(roundedBox(0.14 * k, 0.08 * k, 0.14 * k, 0.02 * k), mat.gunDark, 0.1 * k, h / 2 + 0.04 * k, -0.06 * k));
    pitch.add(m(barrel(0.025 * k, 0.02), mat.power, 0.1 * k, h / 2 + 0.04 * k, 0.01 * k));
  }
  // Fire the tubes crosswise so a salvo ripples over the face.
  const order = big ? [0, 8, 2, 6, 4, 1, 7, 3, 5] : [0, 3, 1, 2];
  return { look: "rocket", big, root, yaw, pitch, pitchRest: -0.12, muzzles: order.map(i => muzzles[i]!) };
}

/** B: a fat short barrel on a drum magazine (two grown). Lobs grenades on a high arc. */
function grenadeLauncher(big: boolean): Omit<Tower, "next" | "shot" | "cooldown" | "salvoLeft" | "aim" | "zone"> {
  const k = big ? 1.8 : 1, root = new THREE.Group(), yaw = mount(root, k);
  const head = cyl(0.22 * k, 0.28 * k, 0.2 * k);
  head.scale(1, 1, 1.1);
  yaw.add(m(head, mat.accent, 0, 0.1 * k, -0.04 * k));
  yaw.add(m(cyl(0.16 * k, 0.22 * k, 0.05 * k), mat.plate, 0, 0.225 * k, -0.04 * k));
  const pitch = new THREE.Group();
  pitch.position.set(0, 0.14 * k, 0.1 * k);
  yaw.add(pitch);
  const muzzles: Muzzle[] = [];
  const xs = big ? [-0.2, 0.2] : [0];
  const r = big ? 0.1 : 0.075, len = big ? 0.5 : 0.34;
  for (const x of xs) {
    const g = new THREE.Group();
    g.position.x = x;
    g.add(m(barrel(r * 1.35, len * 0.4, 8), mat.gun, 0, 0, -0.04));
    g.add(m(barrel(r, len, 8), mat.gunDark, 0, 0, 0));
    g.add(m(barrel(r * 1.2, 0.04, 8), mat.plate, 0, 0, len - 0.05));
    g.add(m(barrel(r * 0.7, 0.01, 8), hole, 0, 0, len - 0.005));
    // The drum magazine under the barrel.
    const drum = cyl(r * 1.55, r * 1.55, r * 1.2, 10);
    drum.rotateZ(Math.PI / 2);
    g.add(m(drum, mat.gun, 0, -r * 1.6, len * 0.25));
    g.add(m(box(r * 1.25, r * 0.3, r * 0.5), mat.accent, 0, -r * 1.6 - r * 1.5, len * 0.25));
    pitch.add(g);
    muzzles.push({ at: new THREE.Vector3(x, 0, len + 0.03), kick: g });
  }
  if (big) pitch.add(m(roundedBox(0.12, 0.1, 0.22, 0.02), mat.gunDark, 0, 0.08, 0.05));
  return { look: "grenade", big, root, yaw, pitch, pitchRest: -0.6, muzzles };
}

/** A missile lying along +z, its tail at z = -len/2. */
function missileMesh(s: number): THREE.Group {
  const g = new THREE.Group(), len = 0.3 * s, r = 0.038 * s;
  g.add(m(barrel(r, len * 0.78, 8), mat.plate, 0, 0, -len / 2));
  g.add(m(nose(r, len * 0.22, 8), mat.accent, 0, 0, -len / 2 + len * 0.78));
  g.add(m(box(r * 3.2, r * 0.25, len * 0.18), mat.gunDark, 0, 0, -len / 2 + len * 0.09));
  g.add(m(box(r * 0.25, r * 3.2, len * 0.18), mat.gunDark, 0, 0, -len / 2 + len * 0.09));
  return g;
}

/** C: a rack of missiles tilted up (two at 1×1, four and a radar grown). They climb, turn and dive. */
function missileRack(big: boolean): Omit<Tower, "next" | "shot" | "cooldown" | "salvoLeft" | "aim" | "zone"> {
  const k = big ? 1.8 : 1, root = new THREE.Group(), yaw = mount(root, k);
  yaw.add(m(cyl(0.18 * k, 0.2 * k, 0.05 * k), mat.gunDark, 0, 0.025 * k, 0));
  yaw.add(m(box(0.12 * k, 0.16 * k, 0.12 * k), mat.gun, 0, 0.1 * k, -0.02 * k));
  const pitch = new THREE.Group();
  pitch.position.set(0, 0.2 * k, 0);
  yaw.add(pitch);
  const s = big ? 1.7 : 1.15;
  const cols = big ? [-0.15, 0.15] : [-0.085, 0.085];
  const rows = big ? [0.07, 0.22] : [0.06];
  const w = cols[1]! * 2 + 0.1 * s, len = 0.3 * s;
  // A cradle: a floor under the missiles, low orange cheeks, a back plate; the missiles stay in view.
  pitch.add(m(roundedBox(w, 0.04 * s, len * 0.9, 0.01), mat.gunDark, 0, 0, -0.02 * s));
  for (const sx of [-1, 1]) pitch.add(m(roundedBox(0.035 * s, 0.1 * s, len * 0.75, 0.01), mat.accent, sx * (w / 2 + 0.01 * s), 0.04 * s, -0.03 * s));
  pitch.add(m(box(w, rows.at(-1)! + 0.05 * s, 0.03 * s), mat.gun, 0, rows.at(-1)! / 2, -len / 2 - 0.03 * s));
  if (big) {
    pitch.add(m(box(w * 0.9, 0.02, len * 0.5), mat.gunDark, 0, 0.145, -0.06));
    for (const sx of [-1, 1]) pitch.add(m(box(0.02, 0.15, 0.04), mat.gunDark, sx * (w / 2 - 0.01), 0.13, -0.06));
  }
  const muzzles: Muzzle[] = [];
  for (const y of rows) for (const x of cols) {
    const load = missileMesh(s);
    load.position.set(x, y, 0);
    pitch.add(load);
    muzzles.push({ at: new THREE.Vector3(x, y, 0), load });
  }
  let spinner: THREE.Object3D | undefined;
  if (big) {
    // A little radar on a mast at the back.
    yaw.add(m(cyl(0.02, 0.025, 0.4, 6), mat.gunDark, 0.34, 0.2, -0.26));
    spinner = new THREE.Group();
    spinner.position.set(0.34, 0.42, -0.26);
    const dish = new THREE.SphereGeometry(0.13, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.32);
    dish.rotateX(Math.PI / 2);
    const d = m(dish, mat.plate);
    d.rotation.x = -0.4;
    spinner.add(d, m(box(0.02, 0.02, 0.1), mat.accent, 0, 0, 0.05));
    yaw.add(spinner);
  }
  return { look: "missile", big, root, yaw, pitch, pitchRest: -0.5, muzzles, spinner };
}

// ------------------------------------------------------------------ scene

const CAM_DIR = new THREE.Vector3(20, 16.33, 20).normalize();
const container = document.getElementById("view")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.position.set(...EVENING.sunOffset);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 0.5, far: 60 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: EVENING.snow, roughness: 1, emissive: "#d8cfe6", emissiveIntensity: 0.45 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0xb9bfd6, 0xb9bfd6);
grid.position.y = 0.004;
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
scene.add(grid);

// A few lights kept for explosions; the count never changes, so shaders never recompile.
const blasts = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight("#ffb46a", 0, 3.5, 2); scene.add(l); return { light: l, t: 1, max: 0 }; });

/** Screen right in the world, and the ground direction toward the camera. */
const SIDE = new THREE.Vector3(1, 0, -1).normalize();
const FRONT = new THREE.Vector3(1, 0, 1).normalize();

const tagsEl = document.getElementById("tags")!;
const towers: Tower[] = [];
const groups: { c: THREE.Vector3; tag: HTMLElement }[] = [];
const LOOKS: { name: string; make: (big: boolean) => ReturnType<typeof rocketPod> }[] = [
  { name: "Rocket pod", make: rocketPod },
  { name: "Grenade launcher", make: grenadeLauncher },
  { name: "Missile rack", make: missileRack },
];
LOOKS.forEach((look, i) => {
  const ox = (i - 1) * 4, oz = -(i - 1) * 4;
  const cells: Cell[] = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) cells.push([ox + x, oz + y]);
  scene.add(models.create("wallPiece", { cells }));
  const zone = { c: new THREE.Vector3(ox + 1.5, 0, oz + 1) };
  const place = (big: boolean, x: number, z: number, delay: number) => {
    const t = look.make(big);
    t.root.position.set(x, DECK_TOP, z);
    t.pitch.rotation.x = t.pitchRest;
    scene.add(t.root);
    towers.push({ ...t, next: delay, shot: 0, cooldown: 0, salvoLeft: 0, aim: pickAim(zone.c), zone });
  };
  place(false, ox + 0.5, oz + 1.5, 0.8 + i * 0.4);
  place(true, ox + 2, oz + 1, 1.6 + i * 0.5);
  const tag = document.createElement("div");
  tag.className = "tag";
  tag.innerHTML = `<b>${"ABC"[i]} &middot; ${look.name}</b><span>1&times;1 and grown to 2&times;2</span>`;
  tagsEl.appendChild(tag);
  groups.push({ c: zone.c, tag });
});

function pickAim(c: THREE.Vector3): THREE.Vector3 {
  return c.clone().addScaledVector(FRONT, 3.2 + Math.random() * 2).addScaledVector(SIDE, (Math.random() - 0.5) * 3.2);
}

// ------------------------------------------------------------------ shots and blasts

interface Shot { obj: THREE.Object3D; t: number; dur: number; at: (u: number) => THREE.Vector3; trail: number; trailT: number; blast: number; spin?: boolean }
interface Puff { obj: THREE.Mesh; t: number; life: number; vel: THREE.Vector3; grow: number; fade: number }
const shots: Shot[] = [];
const puffs: Puff[] = [];
const puffGeo = new THREE.IcosahedronGeometry(1, 0);
const ringGeo = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
const snowMat = new THREE.MeshStandardMaterial({ color: EVENING.snow, roughness: 1, emissive: "#d8cfe6", emissiveIntensity: 0.3 });

function puff(at: THREE.Vector3, o: { color: string; size: number; life: number; vel?: THREE.Vector3; grow?: number; additive?: boolean; opacity?: number; geo?: THREE.BufferGeometry; lit?: boolean }): Puff {
  const material = o.lit
    ? new THREE.MeshStandardMaterial({ color: o.color, roughness: 1, flatShading: true, transparent: true, opacity: o.opacity ?? 0.8, depthWrite: false, emissive: o.color, emissiveIntensity: 0.35 })
    : new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: o.opacity ?? 1, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const obj = new THREE.Mesh(o.geo ?? puffGeo, material);
  obj.position.copy(at);
  obj.scale.setScalar(o.size);
  obj.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  scene.add(obj);
  const p = { obj, t: 0, life: o.life, vel: o.vel ?? new THREE.Vector3(), grow: o.grow ?? 0, fade: material.opacity };
  puffs.push(p);
  return p;
}

const chunks: { obj: THREE.Mesh; vel: THREE.Vector3; t: number }[] = [];
function explode(at: THREE.Vector3, r: number): void {
  const g = at.clone().setY(0.02);
  puff(g.clone().setY(0.15 * r), { color: "#ffd49a", size: 0.18 * r, life: 0.14, grow: 2 * r, additive: true, opacity: 0.85 });
  puff(g.clone().setY(0.2 * r), { color: "#ff9a3c", size: 0.25 * r, life: 0.3, grow: 1.4 * r, additive: true, opacity: 0.9 });
  const ring = puff(g.clone().setY(0.03), { color: "#ffd9a0", size: 0.2, life: 0.35, grow: 2.6 * r, opacity: 0.7, geo: ringGeo });
  ring.obj.rotation.set(0, 0, 0);
  const scorch = puff(g.clone().setY(0.006 + Math.random() * 0.002), { color: "#4f475e", size: r * (0.42 + Math.random() * 0.12), life: 6, opacity: 0.4, geo: discGeo });
  scorch.obj.rotation.set(0, Math.random() * 6, 0);
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2, s = 0.3 + Math.random() * 0.5;
    puff(g.clone().add(new THREE.Vector3(Math.cos(a) * 0.2 * r, 0.15 * r, Math.sin(a) * 0.2 * r)),
      { color: i % 2 ? "#8a8598" : "#a9a4b7", size: 0.08 * r, life: 1 + Math.random() * 0.6, vel: new THREE.Vector3(Math.cos(a) * s * 0.5, 0.45 + Math.random() * 0.35, Math.sin(a) * s * 0.5), grow: 0.12 * r, lit: true, opacity: 0.8 });
  }
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 1.6;
    const c = new THREE.Mesh(chunkGeo, snowMat);
    c.castShadow = true;
    c.scale.setScalar(0.035 + Math.random() * 0.03);
    c.position.copy(g).setY(0.05);
    scene.add(c);
    chunks.push({ obj: c, vel: new THREE.Vector3(Math.cos(a) * s * 0.6, 2.2 + Math.random() * 1.6, Math.sin(a) * s * 0.6), t: 0 });
  }
  const b = blasts.reduce((a, c) => (c.t > a.t ? c : a));
  b.light.position.copy(g).setY(0.5);
  b.t = 0; b.max = 6 * r;
}

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function worldOf(t: Tower, local: THREE.Vector3): THREE.Vector3 {
  t.root.updateMatrixWorld(true);
  return t.pitch.localToWorld(local.clone());
}
function forwardOf(t: Tower): THREE.Vector3 {
  const q = new THREE.Quaternion();
  t.pitch.getWorldQuaternion(q);
  return new THREE.Vector3(0, 0, 1).applyQuaternion(q);
}

const rocketMesh = (s: number): THREE.Group => {
  const g = new THREE.Group();
  g.add(m(barrel(0.026 * s, 0.13 * s, 6), mat.plate, 0, 0, -0.08 * s));
  g.add(m(nose(0.026 * s, 0.05 * s, 6), mat.accent, 0, 0, 0.05 * s));
  const flame = new THREE.Mesh(nose(0.03 * s, 0.1 * s, 6).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: "#ffb45a", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  flame.position.z = -0.08 * s;
  g.add(flame);
  return g;
};
const grenadeMesh = (s: number): THREE.Group => {
  const g = new THREE.Group();
  g.add(m(new THREE.IcosahedronGeometry(0.05 * s, 1), mat.gunDark));
  g.add(m(cyl(0.052 * s, 0.052 * s, 0.025 * s, 8), mat.accent));
  return g;
};

function fire(t: Tower, now: number): boolean {
  const mz = t.muzzles[t.shot % t.muzzles.length]!;
  if (mz.load && !mz.load.visible) return false;
  t.shot++;
  const from = worldOf(t, mz.at), fwd = forwardOf(t), s = t.big ? 1.35 : 1;
  const aim = t.aim.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
  const dist = from.distanceTo(aim);
  // Muzzle flash and a puff of smoke.
  puff(from.clone().addScaledVector(fwd, 0.04), { color: "#ffd08a", size: 0.07 * s, life: 0.09, grow: 1.6 * s, additive: true });
  puff(from.clone(), { color: "#c9c4d6", size: 0.035 * s, life: 0.6, grow: 0.08 * s, vel: fwd.clone().multiplyScalar(0.3).add(new THREE.Vector3(0, 0.25, 0)), lit: true, opacity: 0.6 });
  if (mz.kick) mz.kick.position.z = -0.08 * s;
  if (t.look === "rocket") {
    const p1 = from.clone().lerp(aim, 0.45).add(new THREE.Vector3(0, 0.45 + dist * 0.05, 0));
    const curve = new THREE.QuadraticBezierCurve3(from, p1, aim);
    shots.push({ obj: rocketMesh(s), t: 0, dur: dist / 7.5, at: u => curve.getPoint(u), trail: 0.022, trailT: 0, blast: t.big ? 0.6 : 0.45 });
  } else if (t.look === "grenade") {
    const h = 0.8 + dist * 0.28;
    shots.push({ obj: grenadeMesh(s), t: 0, dur: 0.55 + dist * 0.11, at: u => tmp.copy(from).lerp(aim, u).setY(from.y + (aim.y - from.y) * u + 4 * h * u * (1 - u)).clone(), trail: 0.05, trailT: 0, blast: t.big ? 0.85 : 0.7, spin: true });
  } else {
    mz.load!.visible = false;
    mz.reloadAt = now + (t.big ? 2 : 1.6);
    const curve = new THREE.CubicBezierCurve3(from, from.clone().addScaledVector(fwd, 1.3), aim.clone().add(new THREE.Vector3(0, 2.4 + dist * 0.1, 0)), aim);
    const obj = missileMesh(t.big ? 1.7 : 1.15);
    shots.push({ obj, t: 0, dur: 1.05 + dist * 0.09, at: u => curve.getPoint(u), trail: 0.018, trailT: 0, blast: t.big ? 1.15 : 0.9 });
  }
  const shot = shots.at(-1)!;
  shot.obj.position.copy(from);
  shot.obj.lookAt(from.clone().add(fwd));
  scene.add(shot.obj);
  return true;
}

// ------------------------------------------------------------------ camera and focus

let focus = -1;
const view = { at: new THREE.Vector3(), half: 1 };
function wanted(): { at: THREE.Vector3; half: number } {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  if (focus < 0) return { at: FRONT.clone().multiplyScalar(2.8).setY(0.3), half: Math.max(3.6, 8.6 / aspect) };
  return { at: groups[focus]!.c.clone().addScaledVector(FRONT, 1.9).setY(0.3), half: Math.max(2.4, 3.9 / aspect) };
}
function placeCamera(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  camera.left = -view.half * aspect; camera.right = view.half * aspect; camera.top = view.half; camera.bottom = -view.half;
  camera.position.copy(CAM_DIR).multiplyScalar(40).add(view.at);
  camera.lookAt(view.at);
  camera.updateProjectionMatrix();
}
function resize(): void {
  renderer.setSize(container.clientWidth, container.clientHeight);
  const want = wanted();
  view.at.copy(want.at); view.half = want.half;
  placeCamera();
}
addEventListener("resize", resize);
resize();

const chips = document.createElement("div");
chips.className = "looks";
["All", "A", "B", "C"].forEach((label, i) => {
  const b = document.createElement("button");
  b.className = "chip";
  b.textContent = label;
  b.setAttribute("aria-pressed", String(i === 0));
  b.onclick = () => {
    focus = i - 1;
    for (const c of chips.children) c.setAttribute("aria-pressed", String(c === b));
  };
  chips.appendChild(b);
});
document.getElementById("app")!.appendChild(chips);

// ------------------------------------------------------------------ animation

let last = performance.now(), clock = 0;
const v = new THREE.Vector3();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;

  const want = wanted(), ease = 1 - Math.exp(-dt * 5);
  view.at.lerp(want.at, ease);
  view.half += (want.half - view.half) * ease;
  placeCamera();

  for (const t of towers) {
    // Turn toward the aim point; fire once lined up.
    tmp.copy(t.aim).sub(t.root.position);
    const want = Math.atan2(tmp.x, tmp.z);
    let diff = want - t.yaw.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    t.yaw.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), dt * 2.6);
    t.next -= dt;
    if (Math.abs(diff) < 0.04 && t.next <= 0) {
      if (t.look === "rocket") {
        if (t.salvoLeft === 0) t.salvoLeft = t.muzzles.length;
        fire(t, clock);
        t.salvoLeft--;
        t.next = t.salvoLeft > 0 ? 0.09 : (t.big ? 3.6 : 3);
        if (t.salvoLeft === 0) { t.shot = 0; t.aim = pickAim(t.zone.c); }
      } else if (t.look === "grenade") {
        fire(t, clock);
        t.next = t.big ? 0.75 : 1.3;
        t.aim = pickAim(t.zone.c);
      } else {
        if (fire(t, clock)) { t.next = t.big ? 0.9 : 1.5; t.aim = pickAim(t.zone.c); }
        else t.next = 0.1;
      }
    }
    for (const mz of t.muzzles) {
      if (mz.kick) mz.kick.position.z += (0 - mz.kick.position.z) * (1 - Math.exp(-dt * 9));
      if (mz.load && !mz.load.visible && clock >= (mz.reloadAt ?? 0)) { mz.load.visible = true; mz.load.position.z = -0.35; }
      if (mz.load?.visible) mz.load.position.z += (0 - mz.load.position.z) * (1 - Math.exp(-dt * 8));
    }
    // A small kick of the whole head on the rocket pod's salvo.
    t.pitch.rotation.x += (t.pitchRest - t.pitch.rotation.x) * (1 - Math.exp(-dt * 8));
    if (t.spinner) t.spinner.rotation.y += dt * 2.2;
  }

  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]!;
    s.t += dt;
    const u = Math.min(1, s.t / s.dur);
    const p = s.at(u);
    tmp2.copy(s.at(Math.min(1, u + 0.02)));
    s.obj.position.copy(p);
    if (s.spin) s.obj.rotation.x += dt * 12;
    else if (tmp2.distanceToSquared(p) > 1e-8) s.obj.lookAt(tmp2);
    s.trailT -= dt;
    if (s.trailT <= 0) {
      s.trailT = s.trail;
      puff(p.clone(), { color: s.spin ? "#a9a4b7" : "#e2dfea", size: s.spin ? 0.014 : 0.022, life: s.spin ? 0.3 : 0.7, grow: s.spin ? 0.02 : 0.05, lit: true, opacity: s.spin ? 0.45 : 0.65, vel: new THREE.Vector3(0, 0.08, 0) });
    }
    if (u >= 1) {
      explode(p, s.blast);
      scene.remove(s.obj);
      shots.splice(i, 1);
    }
  }

  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]!;
    p.t += dt;
    const k = p.t / p.life;
    if (k >= 1) { scene.remove(p.obj); (p.obj.material as THREE.Material).dispose(); puffs.splice(i, 1); continue; }
    p.obj.position.addScaledVector(p.vel, dt);
    p.vel.multiplyScalar(1 - dt * 1.5);
    p.obj.scale.addScalar(p.grow * dt);
    (p.obj.material as THREE.MeshBasicMaterial).opacity = p.fade * (1 - k * k);
  }

  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i]!;
    c.t += dt;
    c.vel.y -= 9 * dt;
    c.obj.position.addScaledVector(c.vel, dt);
    c.obj.rotation.x += dt * 8; c.obj.rotation.z += dt * 6;
    if (c.obj.position.y < 0.02 || c.t > 2) { scene.remove(c.obj); chunks.splice(i, 1); }
  }

  for (const b of blasts) {
    b.t += dt;
    b.light.intensity = b.t < 0.35 ? b.max * (1 - b.t / 0.35) ** 2 : 0;
  }

  for (const g of groups) {
    v.copy(g.c).addScaledVector(FRONT, 6.4).project(camera);
    g.tag.style.left = `${(v.x * 0.5 + 0.5) * container.clientWidth}px`;
    g.tag.style.top = `${(-v.y * 0.5 + 0.5) * container.clientHeight}px`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
