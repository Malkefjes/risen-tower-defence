import * as THREE from "three";
import { EVENING } from "../../src/render/models";
import { colonyOrange } from "../../src/render/palette";
import { Sentinel } from "../../src/render/sentinel";

// The hub, the base's core (it replaces the ship; the ship becomes a drop pad): three command
// modules on the ground, A bunker, B twin hangar, C stepped command, each on its 3×3 cells, in
// the colony's dark steel, orange and cyan (no white), in the game's evening light, with the
// Sentinel for scale. Drag to turn, wheel to zoom.

THREE.ColorManagement.enabled = false;

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
scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.position.set(...EVENING.sunOffset);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 80 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: EVENING.snow, roughness: 1, emissive: "#d8cfe6", emissiveIntensity: 0.45 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0xb9bfd6, 0xb9bfd6);
grid.position.set(0.5, 0.004, 0.5);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.4;
scene.add(grid);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
let zoom = 1;
const lookAt = new THREE.Vector3(0.5, 0.8, 0.5);
function resize(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  renderer.setSize(w, h);
  const half = Math.max(4.2, 9.5 / aspect) / zoom;
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
  camera.position.copy(CAM_DIR).multiplyScalar(40).add(lookAt);
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ------------------------------------------------------------------ materials (made after colour management is off)

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, flatShading: true, ...o });
const M = {
  steel: std("#3d4457", { roughness: 0.55 }),
  dark: std("#2c3142", { roughness: 0.6 }),
  deck: std("#4a5266", { roughness: 0.65 }),
  orange: colonyOrange(),
  power: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.6, roughness: 0.4 }),
  glass: std("#1d2233", { roughness: 0.2, metalness: 0.2 }),
  lit: std("#bff7ef", { emissive: "#4fdcca", emissiveIntensity: 0.9, roughness: 0.3 }),
};
/** Every mesh casts and takes shadows. */
function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);

/** Each look: its model and what moves on it every frame. */
type Hub = { object: THREE.Group; update: (t: number) => void };

const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

// ------------------------------------------------------------------ A · bunker

function bunker(): Hub {
  const g = new THREE.Group();
  // A low armoured block on the ground, its sides sloping in: a frustum with four faces.
  const body = mesh(new THREE.CylinderGeometry(1.1, 1.5 * Math.SQRT2 * 0.95, 0.9, 4, 1).rotateY(Math.PI / 4), M.steel, 0, 0.45, 0);
  g.add(body);
  // Where the slopes are: half the width at the foot and at the top, and their lean.
  const FOOT = 1.425, TOP = 0.78, H = 0.9, LEAN = Math.atan((FOOT - TOP) / H);
  const at = (y: number) => FOOT - (FOOT - TOP) * (y / H);
  // Orange armour plates on the sides and back, lying on the slopes, a cyan light slit above each.
  for (let i = 1; i < 4; i++) {
    const side = new THREE.Group();
    const plate = mesh(new THREE.BoxGeometry(1.6, 0.42, 0.06), M.orange, 0, 0.34, at(0.34) + 0.03);
    plate.rotation.x = -LEAN;
    side.add(plate);
    const slit = mesh(new THREE.BoxGeometry(1.0, 0.05, 0.04), M.power, 0, 0.72, at(0.72) + 0.02);
    slit.rotation.x = -LEAN;
    side.add(slit);
    side.rotation.y = (i * Math.PI) / 2;
    g.add(side);
  }
  // The front: an entrance porch out of the slope, its blast door framed in cyan.
  g.add(box(0.95, 0.72, 0.6, M.dark, 0, 0, 1.2));
  g.add(box(1.0, 0.08, 0.64, M.orange, 0, 0.72, 1.2));
  g.add(box(0.72, 0.6, 0.04, M.power, 0, 0, 1.5));
  g.add(box(0.62, 0.54, 0.05, M.deck, 0, 0, 1.51));
  g.add(box(0.04, 0.54, 0.06, M.dark, 0, 0, 1.515));
  // Roof: a flat deck, a hatch, a comms mast with a blinking tip.
  g.add(box(1.5, 0.08, 1.5, M.deck, 0, 0.9, 0));
  g.add(cyl(0.22, 0.25, 0.1, M.orange, -0.35, 0.98, -0.3, 8));
  g.add(cyl(0.035, 0.05, 1.0, M.dark, 0.4, 0.98, -0.35, 6));
  const tip = mesh(new THREE.SphereGeometry(0.07, 8, 6), M.lit.clone(), 0.4, 2.02, -0.35);
  g.add(tip);
  return {
    object: g,
    update: t => { (tip.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 3) > 0.6 ? 1.8 : 0.4; },
  };
}

// ------------------------------------------------------------------ B · twin hangar

function twinHangar(): Hub {
  const g = new THREE.Group();
  const ridges: THREE.MeshStandardMaterial[] = [];
  // Two ribbed half-round halls on the ground, side by side, running front to back.
  for (const sx of [-1, 1]) {
    const hall = new THREE.Group();
    hall.position.x = sx * 0.78;
    hall.add(mesh(new THREE.CylinderGeometry(0.68, 0.68, 2.8, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), M.steel, 0, 0, 0));
    // Ribs across the roof.
    for (let i = -2; i <= 2; i++) hall.add(mesh(new THREE.TorusGeometry(0.69, 0.035, 4, 8, Math.PI), M.dark, 0, 0, i * 0.6));
    // Orange doors on both ends, a cyan strip along the ridge.
    for (const sz of [-1, 1]) hall.add(mesh(new THREE.CircleGeometry(0.64, 8, 0, Math.PI).rotateY(sz > 0 ? 0 : Math.PI), M.orange, 0, 0.001, sz * 1.41));
    const strip = M.power.clone();
    ridges.push(strip);
    hall.add(mesh(new THREE.BoxGeometry(0.08, 0.04, 2.5), strip, 0, 0.69, 0));
    g.add(hall);
  }
  // The control tower joining them in the middle, a dish turning on top.
  g.add(box(0.5, 1.15, 0.8, M.dark, 0, 0, 0));
  g.add(box(0.54, 0.14, 0.84, M.orange, 0, 1.15, 0));
  g.add(box(0.52, 0.1, 0.5, M.lit, 0, 0.85, 0.2));
  const head = new THREE.Group();
  head.position.y = 1.29;
  head.add(cyl(0.05, 0.07, 0.25, M.steel, 0, 0, 0, 8));
  head.add(mesh(new THREE.SphereGeometry(0.34, 12, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-Math.PI / 2 - 0.6), M.steel, 0, 0.32, 0));
  head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), M.lit, 0, 0.36, 0.16));
  g.add(head);
  return {
    object: g,
    update: t => {
      head.rotation.y = t * 0.5;
      ridges.forEach((m, i) => { m.emissiveIntensity = 0.35 + 0.8 * Math.max(0, Math.sin(t * 2 + i * Math.PI)); });
    },
  };
}

// ------------------------------------------------------------------ C · stepped command

function steppedCommand(): Hub {
  const g = new THREE.Group();
  const edges = M.power.clone();
  // A wide base block on the ground, a smaller deck on it, a command cab on top.
  g.add(box(2.9, 0.55, 2.9, M.steel));
  g.add(box(2.1, 0.45, 2.1, M.dark, 0, 0.55));
  g.add(box(1.3, 0.5, 1.3, M.steel, 0, 1.0));
  // Cyan lights along the step edges.
  for (const [w, y] of [[2.92, 0.55], [2.12, 1.0]] as const) {
    for (let i = 0; i < 4; i++) {
      const e = mesh(new THREE.BoxGeometry(w, 0.04, 0.04), edges, 0, y, w / 2);
      const holder = new THREE.Group();
      holder.add(e);
      holder.rotation.y = (i * Math.PI) / 2;
      g.add(holder);
    }
  }
  // The cab's windows: a cyan band all round.
  g.add(box(1.32, 0.16, 1.32, M.lit, 0, 1.22));
  g.add(box(1.36, 0.08, 1.36, M.orange, 0, 1.5));
  // Orange bumpers on the base's corners, a door on the front.
  for (const [sx, sz] of CORNERS) g.add(box(0.3, 0.6, 0.3, M.orange, sx * 1.36, 0, sz * 1.36));
  g.add(box(0.7, 0.45, 0.06, M.orange, 0, 0, 1.46));
  g.add(box(0.58, 0.4, 0.07, M.dark, 0, 0, 1.465));
  // The antenna array on the cab.
  const tips: THREE.MeshStandardMaterial[] = [];
  for (const [x, h] of [[-0.35, 0.7], [0, 1.0], [0.35, 0.55]] as const) {
    g.add(cyl(0.025, 0.035, h, M.dark, x, 1.58, -0.3, 6));
    const tm = M.lit.clone();
    tips.push(tm);
    g.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), tm, x, 1.58 + h, -0.3));
  }
  return {
    object: g,
    update: t => {
      edges.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.4));
      tips.forEach((m, i) => { m.emissiveIntensity = ((t * 0.8 + i / 3) % 1) < 0.12 ? 2 : 0.35; });
    },
  };
}

// ------------------------------------------------------------------ layout

const SPACING = 5;
const hubs = [bunker(), twinHangar(), steppedCommand()];
const turntable = new THREE.Group();
scene.add(turntable);
hubs.forEach((h, i) => {
  // Each on its 3×3 cells: the middle of a cell block, the cells marked on the snow.
  h.object.position.set((i - 1) * SPACING + 0.5, 0, 0.5);
  turntable.add(h.object);
  const cells = mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#c9c3dd", transparent: true, opacity: 0.35, depthWrite: false }), (i - 1) * SPACING + 0.5, 0.006, 0.5);
  cells.castShadow = false;
  turntable.add(cells);
});
// The Sentinel for scale, beside the middle one.
const sentinel = new Sentinel();
sentinel.object.position.set(2.4, 0, 2.3);
sentinel.object.rotation.y = Math.PI / 4;
turntable.add(sentinel.object);

// ------------------------------------------------------------------ interaction and loop

let yaw = 0, dragX: number | null = null;
renderer.domElement.addEventListener("pointerdown", e => { if (e.button === 0) { dragX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener("pointermove", e => { if (dragX !== null) { yaw += (e.clientX - dragX) * 0.01; dragX = e.clientX; } });
renderer.domElement.addEventListener("pointerup", () => { dragX = null; });
addEventListener("wheel", e => { zoom = Math.min(3, Math.max(0.5, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); resize(); });

const tags = ["tagA", "tagB", "tagC"].map(id => document.getElementById(id)!);
const v = new THREE.Vector3();
let last = performance.now(), t = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  turntable.rotation.y = yaw;
  for (const h of hubs) h.update(t);
  sentinel.update(dt, { speed: 0, grounded: true, aiming: false, twist: 0 });
  tags.forEach((el, i) => {
    hubs[i]!.object.getWorldPosition(v).add(new THREE.Vector3(1, 0, 1).normalize().multiplyScalar(2.3)).project(camera);
    el.style.left = `${(v.x * 0.5 + 0.5) * container.clientWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * container.clientHeight}px`;
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
