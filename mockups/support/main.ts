import * as THREE from "three";
import { createDefaultModels, createMaterials, DECK_TOP, EVENING, roundedBox } from "../../src/render/models";
import type { Enemy } from "../../src/render/stoneCreature";
import { wolfModel } from "../../src/render/wolf";
import type { Cell } from "../../src/sim/types";
import "./style.css";

// The support tower, three looks: A piston, B gravity ring, C resonator. Each stands
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

/** A support tower: `anim(u)` poses it `u` of the way through its cycle; the pulse goes off at u = 0. */
interface Design { root: THREE.Group; anim(u: number): void }

const ease = (x: number) => x * x * (3 - 2 * x);

/** A: a heavy hammer on a piston that climbs slowly between guide posts and slams onto an anvil. */
function piston(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), base = mount(root, k);
  const housing = new THREE.Group();
  housing.position.y = base;
  root.add(housing);
  housing.add(m(roundedBox(0.4 * k, 0.2 * k, 0.4 * k, 0.03 * k), mat.accent, 0, 0.1 * k, 0));
  housing.add(m(new THREE.BoxGeometry(0.3 * k, 0.03 * k, 0.3 * k), mat.gunDark, 0, 0.215 * k, 0));
  const posts = big ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, -1], [1, 1]];
  for (const [sx, sz] of posts) housing.add(m(cyl(0.022 * k, 0.022 * k, 0.55 * k, 6), mat.gunDark, sx! * 0.16 * k, 0.47 * k, sz! * 0.16 * k));
  housing.add(m(roundedBox(0.4 * k, 0.03 * k, 0.4 * k, 0.01 * k), mat.gun, 0, 0.76 * k, 0));
  const hammer = new THREE.Group();
  housing.add(hammer);
  hammer.add(m(roundedBox(0.28 * k, 0.14 * k, 0.28 * k, 0.02 * k), mat.gun, 0, 0.07 * k, 0));
  hammer.add(m(new THREE.BoxGeometry(0.29 * k, 0.03 * k, 0.29 * k), mat.accent, 0, 0.1 * k, 0));
  hammer.add(m(cyl(0.045 * k, 0.045 * k, 0.5 * k, 6), mat.plate, 0, 0.35 * k, 0));
  const low = 0.23 * k, high = 0.5 * k;
  return {
    root,
    anim(u) {
      // Slam at 0, then a slow climb, a hold at the top, and the drop.
      const h = u < 0.12 ? 0 : u < 0.8 ? ease((u - 0.12) / 0.68) : u < 0.94 ? 1 : 1 - ((u - 0.94) / 0.06) ** 2;
      hammer.position.y = low + (high - low) * h;
      housing.scale.y = 1 - 0.07 * Math.max(0, 1 - u / 0.08);
    },
  };
}

/** B: a heavy ring climbs a mast, hangs, and drops onto the collar at its foot. */
function gravityRing(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), base = mount(root, k);
  root.add(m(cyl(0.2 * k, 0.24 * k, 0.1 * k), mat.accent, 0, base + 0.05 * k, 0));
  root.add(m(cyl(0.035 * k, 0.05 * k, 0.8 * k, 6), mat.gunDark, 0, base + 0.4 * k, 0));
  root.add(m(new THREE.ConeGeometry(0.07 * k, 0.1 * k, 6), mat.accent, 0, base + 0.83 * k, 0));
  const rings: { g: THREE.Group; lag: number }[] = [];
  const make = (r: number, lag: number) => {
    const g = new THREE.Group();
    const t = new THREE.TorusGeometry(r * k, 0.05 * k, 4, 6);
    t.rotateX(Math.PI / 2);
    g.add(m(t, mat.plate));
    const band = new THREE.TorusGeometry(r * k, 0.02 * k, 4, 6);
    band.rotateX(Math.PI / 2);
    band.translate(0, 0.04 * k, 0);
    g.add(m(band, mat.accent));
    root.add(g);
    rings.push({ g, lag });
  };
  make(0.17, 0);
  if (big) make(0.12, 0.05);
  const low = base + 0.13 * k, high = base + 0.68 * k;
  return {
    root,
    anim(u) {
      for (const r of rings) {
        const v = (u - r.lag + 1) % 1;
        const h = v < 0.7 ? ease(v / 0.7) : v < 0.86 ? 1 : 1 - ((v - 0.86) / 0.14) ** 2;
        r.g.position.y = low + (high - low) * h + (r.lag ? 0.05 * k : 0);
        r.g.rotation.y = v < 0.7 ? v * 5 : 3.5;
      }
    },
  };
}

/** C: a squat dome that hums, then thumps down and throws its fins open. */
function resonator(big: boolean): Design {
  const k = big ? 1.8 : 1, root = new THREE.Group(), base = mount(root, k);
  const body = new THREE.Group();
  body.position.y = base;
  root.add(body);
  const domeGeo = new THREE.SphereGeometry(0.26 * k, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = m(domeGeo, mat.accent, 0, 0.04 * k, 0);
  body.add(dome);
  body.add(m(cyl(0.27 * k, 0.28 * k, 0.06 * k, 8), mat.gunDark, 0, 0.03 * k, 0));
  body.add(m(cyl(0.08 * k, 0.1 * k, 0.05 * k, 8), mat.plate, 0, 0.31 * k, 0));
  body.add(m(cyl(0.012 * k, 0.012 * k, 0.22 * k, 5), mat.gunDark, 0.05 * k, 0.42 * k, 0));
  if (big) body.add(m(cyl(0.012 * k, 0.012 * k, 0.16 * k, 5), mat.gunDark, -0.05 * k, 0.39 * k, 0.03 * k));
  const fins: THREE.Group[] = [];
  const n = big ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const hinge = new THREE.Group();
    hinge.position.set(Math.sin(a) * 0.27 * k, 0.04 * k, Math.cos(a) * 0.27 * k);
    hinge.rotation.y = a;
    hinge.add(m(new THREE.BoxGeometry(0.12 * k, 0.2 * k, 0.025 * k), mat.gun, 0, 0.1 * k, 0.012 * k));
    body.add(hinge);
    fins.push(hinge);
  }
  return {
    root,
    anim(u) {
      const hit = Math.max(0, 1 - u / 0.14);
      dome.scale.y = 1 - 0.28 * hit + (u > 0.14 ? Math.sin(u * 60) * 0.015 * u : 0);
      for (const f of fins) f.rotation.x = 0.15 + 0.75 * hit ** 0.6;
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
  { name: "Piston", make: piston },
  { name: "Gravity ring", make: gravityRing },
  { name: "Resonator", make: resonator },
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
    t.d.anim(t.t / every);
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
