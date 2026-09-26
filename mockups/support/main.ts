import * as THREE from "three";
import { createDefaultModels, createMaterials, DECK_TOP, EVENING, roundedBox } from "../../src/render/models";
import type { Enemy } from "../../src/render/stoneCreature";
import { wolfModel } from "../../src/render/wolf";
import type { Cell } from "../../src/sim/types";
import "./style.css";

// The support tower as a high-tech radar, three looks: A dish radar, B phased array,
// C radome (after the resonator Erik liked). Each stands
// at 1×1 and grown to 2×2 on a plated wall and sends out a pulse that makes every
// enemy in range Heavy (brown, 40% slower) for a few seconds. A Runner pack of stone
// wolves runs past all three.

THREE.ColorManagement.enabled = false;

const mat = createMaterials();
const models = createDefaultModels(mat);

const m = (g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(g, material);
  o.castShadow = o.receiveShadow = true;
  o.position.set(x, y, z);
  return o;
};
const cyl = (rt: number, rb: number, h: number, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** The Gun's hex mount, so every tower reads as one family. Returns the height of its top. */
function mount(root: THREE.Group, k: number): number {
  root.add(m(cyl(0.32 * k, 0.36 * k, 0.12 * k), mat.gun, 0, 0.06 * k, 0));
  root.add(m(cyl(0.2 * k, 0.24 * k, 0.08 * k), mat.gunDark, 0, 0.16 * k, 0));
  return 0.2 * k;
}

/** A support tower: `anim(u, dt)` poses it `u` of the way through its cycle; the pulse goes off at u = 0. */
interface Design { root: THREE.Group; anim(u: number, dt: number): void }

/** How hard the pulse still rings, 1 at the pulse and fading to 0 by `len` of the cycle. */
const thump = (u: number, len = 0.14) => Math.max(0, 1 - u / len);

/** A: a dish on a turntable, sweeping round; at the pulse it nods down at the ground. */
function dishRadar(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), base = mount(root, k);
  const yaw = new THREE.Group();
  yaw.position.y = base;
  root.add(yaw);
  yaw.add(m(cyl(0.18 * k, 0.2 * k, 0.05 * k), mat.gunDark, 0, 0.025 * k, 0));
  yaw.add(m(new THREE.BoxGeometry(0.12 * k, 0.2 * k, 0.12 * k), mat.gun, 0, 0.14 * k, -0.02 * k));
  yaw.add(m(new THREE.BoxGeometry(0.14 * k, 0.04 * k, 0.14 * k), mat.accent, 0, 0.2 * k, -0.02 * k));
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.27 * k, 0);
  yaw.add(tilt);
  const R = 0.28 * k;
  const dish = new THREE.CylinderGeometry(R, R * 0.35, 0.09 * k, 12);
  dish.rotateX(Math.PI / 2);
  tilt.add(m(dish, mat.plate, 0, 0, 0.02 * k));
  // A white bowl with a dark hub, so it reads as a dish from any side.
  const bowl = new THREE.CircleGeometry(R * 0.9, 12);
  const bowlMat = mat.plate.clone();
  bowlMat.color.set("#dfe3ea");
  tilt.add(m(bowl, bowlMat, 0, 0, 0.068 * k));
  tilt.add(m(new THREE.CircleGeometry(R * 0.22, 8), mat.gunDark, 0, 0, 0.07 * k));
  // The feed: three struts from the rim to a horn in front of the dish.
  const tip = new THREE.Vector3(0, 0, 0.3 * k);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2, from = new THREE.Vector3(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85, 0.07 * k);
    const len = from.distanceTo(tip), strut = m(cyl(0.008 * k, 0.008 * k, len, 4), mat.gunDark);
    strut.position.copy(from).lerp(tip, 0.5);
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(from).normalize());
    tilt.add(strut);
  }
  tilt.add(m(new THREE.ConeGeometry(0.035 * k, 0.07 * k, 6).rotateX(-Math.PI / 2), mat.accent, 0, 0, 0.31 * k));
  tilt.add(m(roundedBox(0.16 * k, 0.12 * k, 0.08 * k, 0.015 * k), mat.accent, 0, 0, -0.06 * k));
  let second: THREE.Group | undefined;
  if (big) {
    // A little second dish on a mast at the back, sweeping the other way.
    yaw.add(m(cyl(0.012 * k, 0.012 * k, 0.3 * k, 5), mat.gunDark, 0.14 * k, 0.3 * k, -0.14 * k));
    second = new THREE.Group();
    second.position.set(0.14 * k, 0.46 * k, -0.14 * k);
    const d2 = new THREE.CylinderGeometry(0.08 * k, 0.03 * k, 0.03 * k, 10);
    d2.rotateX(Math.PI / 2);
    second.add(m(d2, mat.plate), m(new THREE.CircleGeometry(0.073 * k, 10), mat.gunDark, 0, 0, 0.016 * k));
    yaw.add(second);
  }
  return {
    root,
    anim(u, dt) {
      const h = thump(u, 0.2);
      yaw.rotation.y += dt * (1.3 - 1.1 * h);
      tilt.rotation.x = -0.45 + 0.75 * h ** 0.7;
      if (second) second.rotation.y -= dt * 3;
    },
  };
}

/** B: flat phased-array panels on a block; their tiles light up at the pulse. One panel sweeps at 1×1, three fixed faces at 2×2. */
function phasedArray(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), base = mount(root, k);
  const tiles = mat.power.clone();
  const body = new THREE.Group();
  body.position.y = base;
  root.add(body);
  const blockH = big ? 0.24 * k : 0.16 * k;
  body.add(m(roundedBox(0.3 * k, blockH, 0.3 * k, 0.02 * k), mat.gun, 0, blockH / 2, 0));
  body.add(m(new THREE.BoxGeometry(0.31 * k, 0.035 * k, 0.31 * k), mat.accent, 0, blockH * 0.75, 0));
  const panel = (w: number, h: number) => {
    const g = new THREE.Group();
    g.add(m(roundedBox(w, h, 0.045 * k, 0.012 * k), mat.plate));
    g.add(m(new THREE.BoxGeometry(w * 0.86, h * 0.84, 0.01), mat.gunDark, 0, 0, 0.024 * k));
    const n = 4, rows = 3;
    for (let r = 0; r < rows; r++) for (let c = 0; c < n; c++) {
      g.add(m(new THREE.BoxGeometry(w * 0.14, h * 0.18, 0.01), tiles, ((c + 0.5) / n - 0.5) * w * 0.78, ((r + 0.5) / rows - 0.5) * h * 0.74, 0.03 * k));
    }
    return g;
  };
  let sweep: THREE.Group | undefined;
  const faces: THREE.Group[] = [];
  if (!big) {
    sweep = new THREE.Group();
    sweep.position.y = blockH;
    body.add(sweep);
    sweep.add(m(cyl(0.05 * k, 0.06 * k, 0.1 * k, 6), mat.gunDark, 0, 0.05 * k, 0));
    const p = panel(0.4 * k, 0.3 * k);
    p.position.set(0, 0.24 * k, 0.03 * k);
    p.rotation.x = -0.3;
    sweep.add(p);
    faces.push(p);
  } else {
    // Three fixed faces round a taller block (each looks a third of the way round), and a mast on top.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, p = panel(0.3 * k, 0.26 * k);
      p.position.set(Math.sin(a) * 0.17 * k, blockH * 0.5, Math.cos(a) * 0.17 * k);
      p.rotation.set(0, a, 0);
      p.rotateX(-0.3);
      body.add(p);
      faces.push(p);
    }
    body.add(m(cyl(0.012 * k, 0.015 * k, 0.28 * k, 5), mat.gunDark, 0, blockH + 0.14 * k, 0));
    body.add(m(new THREE.BoxGeometry(0.16 * k, 0.012 * k, 0.012 * k), mat.accent, 0, blockH + 0.22 * k, 0));
  }
  let swing = 0;
  return {
    root,
    anim(u, dt) {
      const h = thump(u, 0.25);
      swing += dt;
      if (sweep) sweep.rotation.y = Math.sin(swing * 0.9) * 1.1;
      tiles.emissiveIntensity = 0.4 + 2.2 * h;
      for (const f of faces) f.scale.setScalar(1 + 0.05 * h);
    },
  };
}

/** C: a faceted radome on lattice legs, turning slowly; at the pulse it thumps and its vents flip open. */
function radome(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), base = mount(root, k);
  const legH = big ? 0.36 * k : 0.24 * k;
  const legs = big ? 4 : 3;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + 0.4;
    const foot = new THREE.Vector3(Math.cos(a) * 0.2 * k, base, Math.sin(a) * 0.2 * k);
    const top = new THREE.Vector3(Math.cos(a) * 0.11 * k, base + legH, Math.sin(a) * 0.11 * k);
    const leg = m(cyl(0.018 * k, 0.022 * k, foot.distanceTo(top), 5), mat.gunDark);
    leg.position.copy(foot).lerp(top, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    root.add(leg);
  }
  root.add(m(cyl(0.12 * k, 0.12 * k, 0.02 * k, 6), mat.gun, 0, base + legH * 0.45, 0));
  const head = new THREE.Group();
  head.position.y = base + legH;
  root.add(head);
  head.add(m(cyl(0.2 * k, 0.17 * k, 0.06 * k, 8), mat.accent, 0, 0.03 * k, 0));
  const shell = mat.plate.clone();
  shell.flatShading = true;
  shell.color.set("#dfe3ea");
  const dome = m(new THREE.IcosahedronGeometry(0.2 * k, 1), shell, 0, 0.2 * k, 0);
  head.add(dome);
  head.add(m(cyl(0.205 * k, 0.205 * k, 0.03 * k, 12), mat.accent, 0, 0.16 * k, 0));
  const vents: THREE.Group[] = [];
  const n = big ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const hinge = new THREE.Group();
    hinge.position.set(Math.sin(a) * 0.2 * k, 0.06 * k, Math.cos(a) * 0.2 * k);
    hinge.rotation.y = a;
    hinge.add(m(new THREE.BoxGeometry(0.08 * k, 0.12 * k, 0.02 * k), mat.gun, 0, 0.06 * k, 0.01 * k));
    head.add(hinge);
    vents.push(hinge);
  }
  if (big) for (const sx of [-1, 1]) head.add(m(cyl(0.008 * k, 0.008 * k, 0.3 * k, 4), mat.gunDark, sx * 0.1 * k, 0.45 * k, -0.05 * k));
  return {
    root,
    anim(u, dt) {
      const h = thump(u);
      dome.rotation.y += dt * 0.5;
      dome.scale.set(1 + 0.08 * h, 1 - 0.18 * h, 1 + 0.08 * h);
      dome.position.y = (0.2 - 0.03 * h) * k;
      for (const v of vents) v.rotation.x = 0.1 + 0.8 * h ** 0.6;
    },
  };
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

/** Screen right in the world, and the ground direction toward the camera. */
const SIDE = new THREE.Vector3(1, 0, -1).normalize();
const FRONT = new THREE.Vector3(1, 0, 1).normalize();

/** Heavy: brown, and 40% slower, for a while after a pulse. */
const HEAVY_SLOW = 0.6;
const HEAVY_BROWN = "#8a5a32";
const SIZES = [
  { range: 2.5, heavy: 2.5, every: 2.2 },
  { range: 3.5, heavy: 4, every: 2.2 },
];

interface Tower { d: Design; x: number; z: number; big: boolean; t: number }
const towers: Tower[] = [];
const groups: { c: THREE.Vector3; tag: HTMLElement }[] = [];
const tagsEl = document.getElementById("tags")!;
const LOOKS: { name: string; make: (big: boolean) => Design }[] = [
  { name: "Dish radar", make: dishRadar },
  { name: "Phased array", make: phasedArray },
  { name: "Radome", make: radome },
];
LOOKS.forEach((look, i) => {
  const ox = (i - 1) * 4, oz = -(i - 1) * 4;
  const cells: Cell[] = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) cells.push([ox + x, oz + y]);
  scene.add(models.create("wallPiece", { cells }));
  const place = (big: boolean, x: number, z: number, t: number) => {
    const d = look.make(big);
    d.root.position.set(x, DECK_TOP, z);
    d.root.rotation.y = Math.PI * 0.75;
    scene.add(d.root);
    towers.push({ d, x, z, big, t });
  };
  place(false, ox + 2.5, oz + 1.5, 0.6 + i * 0.3);
  place(true, ox + 1, oz + 1, 1.4 + i * 0.3);
  const tag = document.createElement("div");
  tag.className = "tag";
  tag.innerHTML = `<b>${"ABC"[i]} &middot; ${look.name}</b><span>1&times;1 and grown to 2&times;2</span>`;
  tagsEl.appendChild(tag);
  groups.push({ c: new THREE.Vector3(ox + 1.5, 0, oz + 1), tag });
});

// ------------------------------------------------------------------ the Runner pack

interface Runner { e: Enemy; along: number; lane: number; heavy: number; clock: number; dust: number; mats: THREE.MeshStandardMaterial[] }
const SPEED = 3, SPAN = 13;
const runners: Runner[] = [];
for (let p = 0; p < 2; p++) for (let i = 0; i < 5; i++) {
  const e = wolfModel({ scale: 1.7, strideRate: (SPEED * 1.1) / 1.7 });
  e.object.rotation.y = Math.atan2(SIDE.x, SIDE.z);
  scene.add(e.object);
  const mats: THREE.MeshStandardMaterial[] = [];
  e.object.traverse(o => {
    const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (mm?.isMeshStandardMaterial && !mats.includes(mm)) mats.push(mm);
  });
  runners.push({ e, along: -4 - p * 13 - i * 0.65 * SPEED, lane: (Math.random() - 0.5) * 0.4, heavy: 0, clock: 0, dust: 0, mats });
}
const LANE = 2.7;
const runnerPos = (r: Runner, out: THREE.Vector3) => out.copy(FRONT).multiplyScalar(LANE + r.lane).addScaledVector(SIDE, r.along);

// ------------------------------------------------------------------ pulses and dust

interface Fade { mesh: THREE.Mesh; t: number; life: number; from: number; to: number; opacity: number; rise?: number }
const fades: Fade[] = [];
const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2);
const dustGeo = new THREE.IcosahedronGeometry(1, 0);
function fade(geo: THREE.BufferGeometry, color: string, at: THREE.Vector3, from: number, to: number, life: number, opacity: number, lit = false, rise = 0): void {
  const material = lit
    ? new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true, transparent: true, opacity, depthWrite: false })
    : new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(at);
  mesh.scale.setScalar(from);
  scene.add(mesh);
  fades.push({ mesh, t: 0, life, from, to, opacity, rise });
}

function pulse(t: Tower): void {
  const s = SIZES[t.big ? 1 : 0]!, at = new THREE.Vector3(t.x, 0.02, t.z);
  // A brown wave rolls out along the snow to the edge of its reach.
  fade(ringGeo, HEAVY_BROWN, at.clone().setY(0.03), 0.3, s.range, 0.5, 0.75);
  fade(discGeo, HEAVY_BROWN, at.clone().setY(0.015), 0.3, s.range, 0.5, 0.18);
  const k = t.big ? 1.8 : 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    fade(dustGeo, "#a98a6e", new THREE.Vector3(t.x + Math.cos(a) * 0.35 * k, DECK_TOP + 0.05, t.z + Math.sin(a) * 0.35 * k), 0.04 * k, 0.09 * k, 0.6, 0.8, true, 0.3);
  }
  const p = new THREE.Vector3();
  for (const r of runners) if (runnerPos(r, p).distanceTo(at.setY(0)) <= s.range) r.heavy = Math.max(r.heavy, s.heavy);
}

// ------------------------------------------------------------------ camera and focus

let focus = -1;
const view = { at: new THREE.Vector3(), half: 1 };
function wanted(): { at: THREE.Vector3; half: number } {
  const aspect = container.clientWidth / container.clientHeight;
  if (focus < 0) return { at: FRONT.clone().multiplyScalar(2).setY(0.3), half: Math.max(3.4, 8.6 / aspect) };
  return { at: groups[focus]!.c.clone().addScaledVector(FRONT, 1).setY(0.7), half: Math.max(2.6, 4.2 / aspect) };
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
const v = new THREE.Vector3();
const brown = new THREE.Color("#c99a6a"), white = new THREE.Color("#ffffff"), heavyGlow = new THREE.Color("#5a3212");
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const want = wanted(), k = 1 - Math.exp(-dt * 5);
  view.at.lerp(want.at, k);
  view.half += (want.half - view.half) * k;
  placeCamera();

  for (const t of towers) {
    const every = SIZES[t.big ? 1 : 0]!.every;
    t.t += dt;
    if (t.t >= every) { t.t -= every; pulse(t); }
    t.d.anim(t.t / every, dt);
  }

  for (const r of runners) {
    const slow = r.heavy > 0 ? HEAVY_SLOW : 1;
    r.heavy = Math.max(0, r.heavy - dt);
    r.along += SPEED * slow * dt;
    if (r.along > SPAN) r.along -= 2 * SPAN + 6;
    runnerPos(r, r.e.object.position);
    r.clock += dt * slow;
    r.e.update(r.clock, true);
    // Heavy shows: brown, with dust shaken off as it plods.
    const h = r.heavy > 0 ? Math.min(1, r.heavy * 4) : 0;
    for (const mm of r.mats) { mm.color.copy(white).lerp(brown, h); mm.emissive.copy(heavyGlow); mm.emissiveIntensity = 0.5 * h; }
    if (h > 0 && (r.dust -= dt) <= 0) {
      r.dust = 0.15;
      fade(dustGeo, "#a98a6e", r.e.object.position.clone().setY(0.06), 0.03, 0.07, 0.5, 0.7, true, 0.15);
    }
  }

  for (let i = fades.length - 1; i >= 0; i--) {
    const f = fades[i]!;
    f.t += dt;
    const u = f.t / f.life;
    if (u >= 1) { scene.remove(f.mesh); (f.mesh.material as THREE.Material).dispose(); fades.splice(i, 1); continue; }
    f.mesh.scale.setScalar(f.from + (f.to - f.from) * (1 - (1 - u) ** 2));
    if (f.rise) f.mesh.position.y += f.rise * dt;
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = f.opacity * (1 - u);
  }

  for (const g of groups) {
    v.copy(g.c).addScaledVector(FRONT, 4.6).project(camera);
    g.tag.style.left = `${(v.x * 0.5 + 0.5) * container.clientWidth}px`;
    g.tag.style.top = `${(-v.y * 0.5 + 0.5) * container.clientHeight}px`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
