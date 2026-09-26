import * as THREE from "three";
import { createDefaultModels, createMaterials, DECK_TOP, EVENING, roundedBox } from "../../src/render/models";
import { grumtoothModel } from "../../src/render/grumtooth";
import type { Enemy } from "../../src/render/stoneCreature";
import type { Cell } from "../../src/sim/types";
import "./style.css";

// The explosive tower's picked look, the missile rack, at 1×1 and grown to 2×2 on a
// plated wall, with sliders to fine-tune its look and how it fires. Missiles land
// where they were aimed (homing would be a mod), so a walking pack can step out of it.

THREE.ColorManagement.enabled = false;

const mat = createMaterials();
const models = createDefaultModels(mat);

// ------------------------------------------------------------------ the numbers

const DEFAULTS = {
  size: 1, tilt: 29, count1: 2, count2: 4, cheeks: 1, radar: 1,
  every1: 1.5, every2: 0.9, reload1: 1.6, reload2: 2, turn: 2.6,
  push: 1.3, climb: 2.4, flight: 1.05,
  blast1: 0.9, blast2: 1.2, flash: 1, smoke: 5, scorch: 6, trail: 1,
  swarm: 1, speed: 1, zoom: 1,
};
type Params = typeof DEFAULTS;
const KEY = "frostfall.missile.v1";
const P: Params = { ...DEFAULTS };
try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) ?? "{}")); } catch { /* no saved numbers */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* storage off */ } };

// ------------------------------------------------------------------ geometry kit

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

/** A missile lying along +z, its tail at z = -len/2. */
function missileMesh(s: number): THREE.Group {
  const g = new THREE.Group(), len = 0.3 * s, r = 0.038 * s;
  g.add(m(barrel(r, len * 0.78, 8), mat.plate, 0, 0, -len / 2));
  g.add(m(nose(r, len * 0.22, 8), mat.accent, 0, 0, -len / 2 + len * 0.78));
  g.add(m(box(r * 3.2, r * 0.25, len * 0.18), mat.gunDark, 0, 0, -len / 2 + len * 0.09));
  g.add(m(box(r * 0.25, r * 3.2, len * 0.18), mat.gunDark, 0, 0, -len / 2 + len * 0.09));
  return g;
}

// ------------------------------------------------------------------ the rack

interface Muzzle { at: THREE.Vector3; load: THREE.Object3D; reloadAt: number }
interface Tower {
  big: boolean; x: number; z: number; root: THREE.Group; yaw: THREE.Group; pitch: THREE.Group;
  muzzles: Muzzle[]; next: number; shot: number; aim: THREE.Vector3; spinner?: THREE.Object3D;
}

const missileScale = (big: boolean) => P.size * (big ? 1.7 : 1.15);

function buildRack(big: boolean): Pick<Tower, "root" | "yaw" | "pitch" | "muzzles" | "spinner"> {
  const k = big ? 1.8 : 1, root = new THREE.Group();
  // The Gun's hex mount, so the towers read as one family.
  root.add(m(cyl(0.32 * k, 0.36 * k, 0.12 * k), mat.gun, 0, 0.06 * k, 0));
  root.add(m(cyl(0.2 * k, 0.24 * k, 0.08 * k), mat.gunDark, 0, 0.16 * k, 0));
  const yaw = new THREE.Group();
  yaw.position.y = 0.2 * k;
  root.add(yaw);
  yaw.add(m(cyl(0.18 * k, 0.2 * k, 0.05 * k), mat.gunDark, 0, 0.025 * k, 0));
  yaw.add(m(box(0.12 * k, 0.16 * k, 0.12 * k), mat.gun, 0, 0.1 * k, -0.02 * k));
  const pitch = new THREE.Group();
  pitch.position.set(0, 0.2 * k, 0);
  pitch.rotation.x = -P.tilt * Math.PI / 180;
  yaw.add(pitch);

  const s = missileScale(big), count = Math.round(big ? P.count2 : P.count1);
  const rows = big && count > 2 ? 2 : 1, cols = Math.ceil(count / rows);
  const step = (big ? 0.176 : 0.148) * s, rowStep = 0.088 * s, y0 = 0.052 * s;
  const w = (cols - 1) * step + 0.1 * s, len = 0.3 * s, top = y0 + (rows - 1) * rowStep;
  // The cradle: a floor under the missiles, orange cheeks, a back plate.
  pitch.add(m(roundedBox(w, 0.04 * s, len * 0.9, 0.01), mat.gunDark, 0, 0, -0.02 * s));
  if (P.cheeks > 0) {
    const h = 0.1 * s * P.cheeks;
    for (const sx of [-1, 1]) pitch.add(m(roundedBox(0.035 * s, h, len * 0.75, 0.01), mat.accent, sx * (w / 2 + 0.01 * s), h * 0.4, -0.03 * s));
  }
  pitch.add(m(box(w, top + 0.05 * s, 0.03 * s), mat.gun, 0, top / 2, -len / 2 - 0.03 * s));
  if (rows > 1) {
    pitch.add(m(box(w * 0.9, 0.02, len * 0.5), mat.gunDark, 0, y0 + rowStep * 0.5, -0.06));
    for (const sx of [-1, 1]) pitch.add(m(box(0.02, rowStep + 0.02, 0.04), mat.gunDark, sx * (w / 2 - 0.01), y0 + rowStep * 0.5, -0.06));
  }
  const muzzles: Muzzle[] = [];
  for (let r = 0; r < rows; r++) {
    const n = Math.min(cols, count - r * cols);
    for (let c = 0; c < n; c++) {
      const at = new THREE.Vector3((c - (n - 1) / 2) * step, y0 + r * rowStep, 0);
      const load = missileMesh(s);
      load.position.copy(at);
      pitch.add(load);
      muzzles.push({ at, load, reloadAt: 0 });
    }
  }
  let spinner: THREE.Object3D | undefined;
  if (big && P.radar > 0) {
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
  return { root, yaw, pitch, muzzles, spinner };
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
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 60 });
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
const CENTER = new THREE.Vector3(1.5, 0, 1);

const cells: Cell[] = [];
for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) cells.push([x, y]);
scene.add(models.create("wallPiece", { cells }));

const towers: Tower[] = [
  { big: false, x: 0.5, z: 1.5, next: 0.8 },
  { big: true, x: 2, z: 1, next: 1.4 },
].map(t => ({ ...t, ...buildRack(t.big), shot: 0, aim: pickGround() }));
for (const t of towers) { t.root.position.set(t.x, DECK_TOP, t.z); scene.add(t.root); }

/** Rebuild both racks with the current look numbers, keeping where they point. */
function rebuild(): void {
  for (const t of towers) {
    const yawNow = t.yaw.rotation.y;
    scene.remove(t.root);
    Object.assign(t, buildRack(t.big));
    t.yaw.rotation.y = yawNow;
    t.shot = 0;
    t.root.position.set(t.x, DECK_TOP, t.z);
    scene.add(t.root);
  }
}

function pickGround(): THREE.Vector3 {
  return CENTER.clone().addScaledVector(FRONT, 3.2 + Math.random() * 2).addScaledVector(SIDE, (Math.random() - 0.5) * 3.2);
}

// ------------------------------------------------------------------ a walking Swarm pack

interface Walker { e: Enemy; lane: number; offset: number; hit: number }
const PACK = 12, SPACING = 0.32, WALK = 1.5, SPAN = 9;
const walkers: Walker[] = [];
for (let i = 0; i < PACK; i++) {
  const e = grumtoothModel({ scale: 1.7, strideRate: (WALK * 1.6) / 1.7 });
  e.object.rotation.y = Math.atan2(SIDE.x, SIDE.z);
  scene.add(e.object);
  walkers.push({ e, lane: (Math.random() - 0.5) * 0.4, offset: i * SPACING, hit: 0 });
}
let walkClock = 6; // start with the pack in view
function walkerAt(w: Walker, out: THREE.Vector3): THREE.Vector3 {
  const loop = SPAN * 2 + PACK * SPACING;
  const along = ((walkClock * WALK - w.offset) % loop + loop) % loop - SPAN;
  return out.copy(CENTER).addScaledVector(FRONT, 3.9 + w.lane).addScaledVector(SIDE, along);
}
/** Aim at a random Grumtooth in reach, where it stands now; the ground if none is. */
function pickAim(t: Tower): THREE.Vector3 {
  if (P.swarm > 0) {
    const inReach = walkers.map(w => walkerAt(w, new THREE.Vector3())).filter(p => p.distanceTo(new THREE.Vector3(t.x, 0, t.z)) < 6);
    if (inReach.length) return inReach[Math.floor(Math.random() * inReach.length)]!;
  }
  return pickGround();
}

// ------------------------------------------------------------------ shots and blasts

interface Shot { obj: THREE.Object3D; t: number; dur: number; curve: THREE.CubicBezierCurve3; trailT: number; blast: number }
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
const tmp = new THREE.Vector3();
function explode(at: THREE.Vector3, r: number): void {
  const g = at.clone().setY(0.02);
  // Grumtooths inside the blast flash.
  for (const w of walkers) if (P.swarm > 0 && walkerAt(w, tmp).distanceTo(g) <= r) w.hit = 1;
  const f = P.flash;
  if (f > 0) {
    puff(g.clone().setY(0.15 * r), { color: "#ffd49a", size: 0.18 * r, life: 0.14, grow: 2 * r * f, additive: true, opacity: 0.85 });
    puff(g.clone().setY(0.2 * r), { color: "#ff9a3c", size: 0.25 * r, life: 0.3, grow: 1.4 * r * f, additive: true, opacity: 0.9 });
  }
  // The ring ends at the blast radius, so it shows what the blast reaches.
  const ring = puff(g.clone().setY(0.03), { color: "#ffd9a0", size: 0.2, life: 0.35, grow: (r - 0.2) / 0.35, opacity: 0.7, geo: ringGeo });
  ring.obj.rotation.set(0, 0, 0);
  if (P.scorch > 0) {
    const scorch = puff(g.clone().setY(0.006 + Math.random() * 0.002), { color: "#4f475e", size: r * (0.42 + Math.random() * 0.12), life: P.scorch, opacity: 0.4, geo: discGeo });
    scorch.obj.rotation.set(0, Math.random() * 6, 0);
  }
  for (let i = 0; i < Math.round(P.smoke); i++) {
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
  if (f > 0) {
    const b = blasts.reduce((a, c) => (c.t > a.t ? c : a));
    b.light.position.copy(g).setY(0.5);
    b.t = 0; b.max = 6 * r * f;
  }
}

function fire(t: Tower, now: number): boolean {
  // The next missile still on the rack, in turn.
  let mz: Muzzle | undefined;
  for (let i = 0; i < t.muzzles.length && !mz; i++) {
    const c = t.muzzles[(t.shot + i) % t.muzzles.length]!;
    if (c.load.visible) { mz = c; t.shot += i + 1; }
  }
  if (!mz) return false;
  t.root.updateMatrixWorld(true);
  const from = t.pitch.localToWorld(mz.at.clone());
  const q = new THREE.Quaternion();
  t.pitch.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const aim = t.aim.clone().setY(0), dist = from.distanceTo(aim), s = missileScale(t.big);
  puff(from.clone().addScaledVector(fwd, -0.1 * s), { color: "#ffd08a", size: 0.07 * s, life: 0.09, grow: 1.6 * s, additive: true });
  puff(from.clone(), { color: "#c9c4d6", size: 0.035 * s, life: 0.6, grow: 0.08 * s, vel: fwd.clone().multiplyScalar(-0.3).add(new THREE.Vector3(0, 0.25, 0)), lit: true, opacity: 0.6 });
  mz.load.visible = false;
  mz.reloadAt = now + (t.big ? P.reload2 : P.reload1);
  const curve = new THREE.CubicBezierCurve3(from, from.clone().addScaledVector(fwd, P.push), aim.clone().add(new THREE.Vector3(0, P.climb + dist * 0.1, 0)), aim);
  const obj = missileMesh(s);
  obj.position.copy(from);
  obj.lookAt(from.clone().add(fwd));
  scene.add(obj);
  shots.push({ obj, t: 0, dur: P.flight + dist * 0.09, curve, trailT: 0, blast: t.big ? P.blast2 : P.blast1 });
  return true;
}

// ------------------------------------------------------------------ panel

const panel = document.createElement("div");
panel.className = "panel";
document.getElementById("app")!.appendChild(panel);
const inputs: (() => void)[] = [];
function slider(key: keyof Params, label: string, min: number, max: number, step: number, look = false): HTMLElement {
  const el = document.createElement("label");
  el.innerHTML = `<span>${label}</span><output></output><input type="range" min="${min}" max="${max}" step="${step}">`;
  const input = el.querySelector("input")!, out = el.querySelector("output")!;
  const show = () => { input.value = String(P[key]); out.textContent = String(+P[key].toFixed(2)); };
  show();
  inputs.push(show);
  input.addEventListener("input", () => { P[key] = Number(input.value); out.textContent = String(+P[key].toFixed(2)); save(); if (look) rebuild(); });
  return el;
}
function check(key: keyof Params, label: string, look = false): HTMLElement {
  const el = document.createElement("label");
  el.className = "check";
  el.innerHTML = `<input type="checkbox"><span>${label}</span>`;
  const input = el.querySelector("input")!;
  const show = () => { input.checked = P[key] > 0; };
  show();
  inputs.push(show);
  input.addEventListener("change", () => { P[key] = input.checked ? 1 : 0; save(); if (look) rebuild(); });
  return el;
}
function section(title: string, ...kids: HTMLElement[]): void {
  const h = document.createElement("h4");
  h.textContent = title;
  panel.append(h, ...kids);
}
section("Look",
  slider("size", "Missile size", 0.6, 1.6, 0.05, true),
  slider("tilt", "Rack tilt (&deg;)", 0, 70, 1, true),
  slider("count1", "Missiles 1&times;1", 1, 3, 1, true),
  slider("count2", "Missiles 2&times;2", 2, 6, 1, true),
  slider("cheeks", "Orange cheeks", 0, 2, 0.1, true),
  check("radar", "Radar on 2&times;2", true));
section("Rhythm",
  slider("every1", "Fires every (s) 1&times;1", 0.2, 4, 0.05),
  slider("every2", "Fires every (s) 2&times;2", 0.2, 4, 0.05),
  slider("reload1", "Reload (s) 1&times;1", 0.2, 6, 0.1),
  slider("reload2", "Reload (s) 2&times;2", 0.2, 6, 0.1),
  slider("turn", "Turn speed", 0.5, 8, 0.1));
section("Flight",
  slider("push", "Launch push", 0.2, 3, 0.05),
  slider("climb", "Climb height", 0.3, 5, 0.1),
  slider("flight", "Flight time (s)", 0.3, 3, 0.05),
  slider("trail", "Trail", 0, 2, 0.1));
section("Blast",
  slider("blast1", "Radius 1&times;1 (cells)", 0.3, 2.5, 0.05),
  slider("blast2", "Radius 2&times;2 (cells)", 0.3, 2.5, 0.05),
  slider("flash", "Flash", 0, 2, 0.1),
  slider("smoke", "Smoke puffs", 0, 12, 1),
  slider("scorch", "Scorch fades (s)", 0, 20, 0.5));
section("View",
  check("swarm", "Swarm pack walking"),
  slider("speed", "Time speed", 0.1, 1.5, 0.05),
  slider("zoom", "Zoom", 0.6, 2, 0.05));
const buttons = document.createElement("div");
buttons.className = "buttons";
const reset = document.createElement("button");
reset.textContent = "Reset";
reset.onclick = () => { Object.assign(P, DEFAULTS); save(); for (const f of inputs) f(); rebuild(); };
const copy = document.createElement("button");
copy.textContent = "Copy values";
copy.onclick = () => {
  const text = JSON.stringify(P);
  void navigator.clipboard?.writeText(text).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy values"), 1200); }, () => prompt("Values", text));
};
buttons.append(reset, copy);
panel.appendChild(buttons);
for (const w of walkers) w.e.object.visible = P.swarm > 0;

// ------------------------------------------------------------------ camera

function placeCamera(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  const half = Math.max(2.6, 4.6 / aspect) / P.zoom;
  const at = CENTER.clone().addScaledVector(FRONT, 1.9).setY(0.3);
  // With the panel on the right, shift the view so the wall sits left of centre.
  if (w > 640) at.addScaledVector(SIDE, 130 / w * half * aspect);
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
  camera.position.copy(CAM_DIR).multiplyScalar(40).add(at);
  camera.lookAt(at);
  camera.updateProjectionMatrix();
}
function resize(): void {
  renderer.setSize(container.clientWidth, container.clientHeight);
}
addEventListener("resize", resize);
resize();

// ------------------------------------------------------------------ animation

let last = performance.now(), clock = 0;
const tmp2 = new THREE.Vector3();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000) * P.speed;
  last = now;
  clock += dt;
  placeCamera();

  if (P.swarm > 0) walkClock += dt;
  for (const w of walkers) {
    w.e.object.visible = P.swarm > 0;
    walkerAt(w, w.e.object.position);
    w.hit = Math.max(0, w.hit - dt * 4);
    w.e.flash(w.hit);
    w.e.update(walkClock, true);
  }

  for (const t of towers) {
    // Missiles land where the rack aimed when it fired, so it keeps its aim point.
    tmp.copy(t.aim).sub(t.root.position);
    const want = Math.atan2(tmp.x, tmp.z);
    let diff = want - t.yaw.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    t.yaw.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), dt * P.turn);
    t.next -= dt;
    if (Math.abs(diff) < 0.04 && t.next <= 0) {
      if (fire(t, clock)) { t.next = t.big ? P.every2 : P.every1; t.aim = pickAim(t); }
      else t.next = 0.05;
    }
    for (const mz of t.muzzles) {
      if (!mz.load.visible && clock >= mz.reloadAt) { mz.load.visible = true; mz.load.position.z = mz.at.z - 0.35; }
      if (mz.load.visible) mz.load.position.z += (mz.at.z - mz.load.position.z) * (1 - Math.exp(-dt * 8));
    }
    if (t.spinner) t.spinner.rotation.y += dt * 2.2;
  }

  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]!;
    s.t += dt;
    const u = Math.min(1, s.t / s.dur);
    const p = s.curve.getPoint(u);
    s.curve.getPoint(Math.min(1, u + 0.02), tmp2);
    s.obj.position.copy(p);
    if (tmp2.distanceToSquared(p) > 1e-8) s.obj.lookAt(tmp2);
    s.trailT -= dt;
    if (P.trail > 0 && s.trailT <= 0) {
      s.trailT = 0.018;
      puff(p.clone(), { color: "#e2dfea", size: 0.022 * P.trail, life: 0.7 * P.trail, grow: 0.05 * P.trail, lit: true, opacity: 0.65, vel: new THREE.Vector3(0, 0.08, 0) });
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

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
