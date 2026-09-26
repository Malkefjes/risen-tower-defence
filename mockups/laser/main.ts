import * as THREE from "three";
import { colossusModel } from "../../src/render/colossus";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, roundedBox } from "../../src/render/models";
import type { Enemy } from "../../src/render/stoneCreature";
import type { Cell } from "../../src/sim/types";
import "./style.css";

// The laser cannon, three looks: A rail lance, B focus cannon, C capacitor gun. Each
// stands at 1×1 and grown to 2×2 on a plated wall. Long range, slow, one huge hit:
// it charges (cyan builds up), fires one bright slug that leaves a fading line, and
// the Brutes walking past flash on the hit.

THREE.ColorManagement.enabled = false;

const mat = createMaterials();
const models = createDefaultModels(mat);
const glows = createGlows();

const m = (g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g, material);
  o.castShadow = o.receiveShadow = true;
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

/** The Gun's hex mount, so every tower reads as one family. Returns the turning part. */
function mount(root: THREE.Group, k: number): THREE.Group {
  root.add(m(cyl(0.32 * k, 0.36 * k, 0.12 * k), mat.gun, 0, 0.06 * k, 0));
  root.add(m(cyl(0.2 * k, 0.24 * k, 0.08 * k), mat.gunDark, 0, 0.16 * k, 0));
  const yaw = new THREE.Group();
  yaw.position.y = 0.2 * k;
  root.add(yaw);
  return yaw;
}

/**
 * A laser cannon: `yaw` turns to aim, `recoil` slides back on the shot, `muzzle` is
 * where the slug leaves (in yaw space), `glow` is its own cyan that charges up, and
 * `vent` (if any) is where heat steams off after a shot.
 */
interface Design { root: THREE.Group; yaw: THREE.Group; recoil: THREE.Object3D; muzzle: THREE.Vector3; glow: THREE.MeshStandardMaterial; vent?: THREE.Vector3 }

/** A: two long rails with glowing coils between them, on a low orange turret. */
function railLance(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), yaw = mount(root, k), glow = mat.power.clone();
  yaw.add(m(roundedBox(0.28 * k, 0.15 * k, 0.34 * k, 0.03 * k), mat.accent, 0, 0.08 * k, -0.04 * k));
  yaw.add(m(box(0.2 * k, 0.1 * k, 0.12 * k), mat.gun, 0, 0.08 * k, -0.24 * k));
  const recoil = new THREE.Group();
  recoil.position.set(0, 0.13 * k, 0);
  yaw.add(recoil);
  const len = big ? 0.62 : 0.6;
  for (const sx of [-1, 1]) {
    recoil.add(m(box(0.035 * k, 0.07 * k, len * k), mat.gunDark, sx * 0.05 * k, 0, len * k / 2));
    recoil.add(m(box(0.04 * k, 0.08 * k, 0.05 * k), mat.plate, sx * 0.05 * k, 0, len * k));
  }
  const coils = big ? 5 : 4;
  for (let i = 0; i < coils; i++) {
    const ring = new THREE.TorusGeometry(0.05 * k, 0.012 * k, 4, 8);
    recoil.add(m(ring, glow, 0, 0, (0.14 + (i / (coils - 1)) * (len - 0.24)) * k));
  }
  if (big) for (const sx of [-1, 1]) yaw.add(m(roundedBox(0.07 * k, 0.11 * k, 0.22 * k, 0.015 * k), mat.gun, sx * 0.18 * k, 0.08 * k, -0.08 * k));
  return { root, yaw, recoil, muzzle: new THREE.Vector3(0, 0.13 * k, (len + 0.04) * k), glow, vent: new THREE.Vector3(0, 0.2 * k, -0.24 * k) };
}

/** B: a stubby drum with a big glowing crystal behind a lens, and cooling fins. */
function focusCannon(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), yaw = mount(root, k), glow = mat.power.clone();
  yaw.add(m(box(0.12 * k, 0.12 * k, 0.12 * k), mat.gun, 0, 0.06 * k, -0.02 * k));
  const recoil = new THREE.Group();
  recoil.position.set(0, 0.17 * k, -0.04 * k);
  yaw.add(recoil);
  recoil.add(m(barrel(0.15 * k, 0.3 * k, 8), mat.accent, 0, 0, -0.12 * k));
  recoil.add(m(barrel(0.155 * k, 0.03 * k, 8), mat.gunDark, 0, 0, 0.02 * k));
  recoil.add(m(barrel(0.11 * k, 0.14 * k, 8), mat.plate, 0, 0, 0.18 * k));
  recoil.add(m(barrel(0.075 * k, 0.03 * k, 8), mat.gunDark, 0, 0, 0.31 * k));
  // The crystal sits in a window on top, so its charge shows from the camera.
  recoil.add(m(new THREE.OctahedronGeometry(0.07 * k, 0), glow, 0, 0.14 * k, 0.03 * k));
  recoil.add(m(box(0.16 * k, 0.02 * k, 0.16 * k), mat.gunDark, 0, 0.11 * k, 0.03 * k));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = m(box(0.02 * k, 0.07 * k, 0.12 * k), mat.gunDark, Math.cos(a) * 0.13 * k, Math.sin(a) * 0.13 * k, 0.2 * k);
    fin.rotation.z = a + Math.PI / 2;
    recoil.add(fin);
  }
  if (big) recoil.add(m(roundedBox(0.1 * k, 0.1 * k, 0.16 * k, 0.02 * k), mat.gun, 0.17 * k, 0, -0.14 * k));
  return { root, yaw, recoil, muzzle: new THREE.Vector3(0, 0.17 * k, 0.32 * k), glow, vent: new THREE.Vector3(0, 0.3 * k, -0.2 * k) };
}

/** C: one thick barrel between two tall capacitors banded in cyan, with a heat sink on the back. */
function capacitorGun(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), yaw = mount(root, k), glow = mat.power.clone();
  yaw.add(m(roundedBox(0.22 * k, 0.16 * k, 0.3 * k, 0.025 * k), mat.accent, 0, 0.09 * k, -0.03 * k));
  const caps = big ? [-1, 1, -1, 1] : [-1, 1];
  caps.forEach((sx, i) => {
    const z = (i < 2 ? -0.02 : -0.14) * k, x = sx * (i < 2 ? 0.15 : 0.13) * k;
    yaw.add(m(cyl(0.045 * k, 0.045 * k, 0.24 * k, 8), mat.plate, x, 0.14 * k, z));
    yaw.add(m(cyl(0.047 * k, 0.047 * k, 0.025 * k, 8), glow, x, 0.2 * k, z));
    yaw.add(m(cyl(0.047 * k, 0.047 * k, 0.025 * k, 8), glow, x, 0.12 * k, z));
    yaw.add(m(cyl(0.03 * k, 0.03 * k, 0.02 * k, 8), mat.gunDark, x, 0.27 * k, z));
  });
  for (let i = 0; i < 4; i++) yaw.add(m(box(0.18 * k, 0.1 * k, 0.012 * k), mat.gunDark, 0, 0.1 * k, (-0.2 - i * 0.025) * k));
  const recoil = new THREE.Group();
  recoil.position.set(0, 0.13 * k, 0.08 * k);
  yaw.add(recoil);
  recoil.add(m(barrel(0.06 * k, 0.46 * k, 8), mat.gunDark));
  recoil.add(m(barrel(0.075 * k, 0.1 * k, 8), mat.gun, 0, 0, 0.02 * k));
  recoil.add(m(barrel(0.07 * k, 0.03 * k, 8), glow, 0, 0, 0.3 * k));
  recoil.add(m(barrel(0.072 * k, 0.04 * k, 8), mat.plate, 0, 0, 0.44 * k));
  return { root, yaw, recoil, muzzle: new THREE.Vector3(0, 0.13 * k, 0.56 * k), glow, vent: new THREE.Vector3(0, 0.18 * k, -0.24 * k) };
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

const SIDE = new THREE.Vector3(1, 0, -1).normalize();
const FRONT = new THREE.Vector3(1, 0, 1).normalize();

/** Seconds between shots, and how long the charge shows before each. */
const EVERY = [3, 2.2], CHARGE = 0.8, RANGE = 6;

interface Tower { d: Design; x: number; z: number; big: boolean; t: number; kick: number }
const towers: Tower[] = [];
const groups: { c: THREE.Vector3; tag: HTMLElement }[] = [];
const tagsEl = document.getElementById("tags")!;
const LOOKS: { name: string; make: (big: boolean) => Design }[] = [
  { name: "Rail lance", make: railLance },
  { name: "Focus cannon", make: focusCannon },
  { name: "Capacitor gun", make: capacitorGun },
];
LOOKS.forEach((look, i) => {
  const ox = (i - 1) * 4, oz = -(i - 1) * 4;
  const cells: Cell[] = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) cells.push([ox + x, oz + y]);
  scene.add(models.create("wallPiece", { cells }));
  const place = (big: boolean, x: number, z: number, t: number) => {
    const d = look.make(big);
    d.root.position.set(x, DECK_TOP, z);
    scene.add(d.root);
    towers.push({ d, x, z, big, t, kick: 0 });
  };
  place(false, ox + 2.5, oz + 1.5, 1.2 + i * 0.4);
  place(true, ox + 1, oz + 1, 0.4 + i * 0.4);
  const tag = document.createElement("div");
  tag.className = "tag";
  tag.innerHTML = `<b>${"ABC"[i]} &middot; ${look.name}</b><span>1&times;1 and grown to 2&times;2</span>`;
  tagsEl.appendChild(tag);
  groups.push({ c: new THREE.Vector3(ox + 1.5, 0, oz + 1), tag });
});

// ------------------------------------------------------------------ Brutes walking past

interface Brute { e: Enemy; along: number; hit: number; clock: number }
const SPAN = 11, WALK = 1;
const brutes: Brute[] = [0, 1, 2].map(i => {
  const e = colossusModel({ scale: 2, strideRate: (WALK * 0.75) / 2 });
  e.object.rotation.y = Math.atan2(SIDE.x, SIDE.z);
  scene.add(e.object);
  return { e, along: -7 + i * 7.3, hit: 0, clock: 0 };
});
const brutePos = (b: Brute, out: THREE.Vector3) => out.copy(FRONT).multiplyScalar(4).addScaledVector(SIDE, b.along);

// ------------------------------------------------------------------ shots

interface Fade { obj: THREE.Object3D; t: number; life: number; tick(k: number): void }
const fades: Fade[] = [];
const slugMat = () => new THREE.MeshBasicMaterial({ color: "#e8fffb", transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const sparkGeo = new THREE.BoxGeometry(1, 1, 1);
const sparkMat = new THREE.MeshBasicMaterial({ color: "#bffcf4" });

function sprite(material: THREE.SpriteMaterial, at: THREE.Vector3, size: number, life: number): void {
  const s = new THREE.Sprite(material);
  s.position.copy(at);
  s.scale.setScalar(size);
  scene.add(s);
  fades.push({ obj: s, t: 0, life, tick: k => s.scale.setScalar(size * (1 - k)) });
}

function fire(t: Tower, target: THREE.Vector3): void {
  t.d.root.updateMatrixWorld(true);
  const from = t.d.yaw.localToWorld(t.d.muzzle.clone());
  const to = target.clone().setY(0.55);
  const dist = from.distanceTo(to), w = t.big ? 0.05 : 0.035;
  // The line it leaves: bright, then thinning away.
  const line = new THREE.Mesh(beamGeo, slugMat());
  line.position.copy(from);
  line.lookAt(to);
  line.scale.set(w, w, dist);
  scene.add(line);
  fades.push({ obj: line, t: 0, life: 0.3, tick: k => { line.scale.set(w * (1 - k), w * (1 - k), dist); (line.material as THREE.MeshBasicMaterial).opacity = 1 - k; } });
  sprite(glows.cyan, from, t.big ? 0.9 : 0.6, 0.15);
  sprite(glows.cyan, to, t.big ? 1.4 : 1, 0.25);
  sprite(glows.muzzle, to, t.big ? 0.8 : 0.55, 0.18);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(sparkGeo, sparkMat);
    s.scale.setScalar(0.03);
    s.position.copy(to);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 2);
    scene.add(s);
    fades.push({ obj: s, t: 0, life: 0.35, tick: () => { v.y -= 0.3; s.position.addScaledVector(v, 1 / 60); } });
  }
  t.kick = 1;
}

/** Steam puffing off a vent after a shot. */
const steamMat = new THREE.MeshStandardMaterial({ color: "#e6e3ee", roughness: 1, flatShading: true, transparent: true, opacity: 0.7, depthWrite: false });
const steamGeo = new THREE.IcosahedronGeometry(1, 0);
function steam(at: THREE.Vector3, size: number): void {
  const p = new THREE.Mesh(steamGeo, steamMat.clone());
  p.position.copy(at);
  scene.add(p);
  fades.push({ obj: p, t: 0, life: 0.9, tick: k => { p.scale.setScalar(size * (0.5 + k)); p.position.y += 0.006; (p.material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - k); } });
}

// ------------------------------------------------------------------ camera and focus

let focus = -1;
const view = { at: new THREE.Vector3(), half: 1 };
function wanted(): { at: THREE.Vector3; half: number } {
  const aspect = container.clientWidth / container.clientHeight;
  if (focus < 0) return { at: FRONT.clone().multiplyScalar(2).setY(0.3), half: Math.max(3.4, 8.6 / aspect) };
  return { at: groups[focus]!.c.clone().addScaledVector(FRONT, 1.2).setY(0.6), half: Math.max(2.6, 4.2 / aspect) };
}
function placeCamera(): void {
  const aspect = container.clientWidth / container.clientHeight;
  camera.left = -view.half * aspect; camera.right = view.half * aspect; camera.top = view.half; camera.bottom = -view.half;
  camera.position.copy(CAM_DIR).multiplyScalar(40).add(view.at);
  camera.lookAt(view.at);
  camera.updateProjectionMatrix();
}
function resize(): void {
  renderer.setSize(container.clientWidth, container.clientHeight);
  const w = wanted();
  view.at.copy(w.at); view.half = w.half;
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

let last = performance.now();
const v = new THREE.Vector3(), p = new THREE.Vector3();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const want = wanted(), ek = 1 - Math.exp(-dt * 5);
  view.at.lerp(want.at, ek);
  view.half += (want.half - view.half) * ek;
  placeCamera();

  for (const b of brutes) {
    b.along += WALK * dt;
    if (b.along > SPAN) b.along -= 2 * SPAN;
    brutePos(b, b.e.object.position);
    b.clock += dt;
    b.hit = Math.max(0, b.hit - dt * 5);
    b.e.flash(b.hit);
    b.e.update(b.clock, true);
  }

  for (const t of towers) {
    // Aim at the nearest Brute in reach.
    let target: Brute | null = null, best = RANGE;
    for (const b of brutes) { const d = brutePos(b, p).distanceTo(v.set(t.x, 0, t.z)); if (d < best) { best = d; target = b; } }
    const every = EVERY[t.big ? 1 : 0]!;
    if (target) {
      brutePos(target, p);
      const want = Math.atan2(p.x - t.x, p.z - t.z);
      let d = want - t.d.yaw.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      t.d.yaw.rotation.y += d * Math.min(1, dt * 6);
      t.t += dt;
      if (t.t >= every) { t.t = 0; fire(t, p); target.hit = 1; if (t.d.vent) for (let i = 0; i < 4; i++) setTimeout(() => steam(t.d.yaw.localToWorld(t.d.vent!.clone()), t.big ? 0.07 : 0.05), 120 + i * 120); }
    } else t.t = Math.min(t.t + dt, every - CHARGE - 0.01);
    // The charge: cyan builds up over the last moments before the shot, then drops.
    const c = Math.max(0, (t.t - (every - CHARGE)) / CHARGE);
    t.d.glow.emissiveIntensity = 0.3 + 3.2 * c * c;
    t.kick = Math.max(0, t.kick - dt * 3);
    t.d.recoil.position.z = (t.d.recoil.userData.rest ??= t.d.recoil.position.z) - (t.big ? 0.12 : 0.08) * t.kick ** 2;
  }

  for (let i = fades.length - 1; i >= 0; i--) {
    const f = fades[i]!;
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) { scene.remove(f.obj); fades.splice(i, 1); continue; }
    f.tick(k);
  }

  for (const g of groups) {
    v.copy(g.c).addScaledVector(FRONT, 5.8).project(camera);
    g.tag.style.left = `${(v.x * 0.5 + 0.5) * container.clientWidth}px`;
    g.tag.style.top = `${(-v.y * 0.5 + 0.5) * container.clientHeight}px`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
