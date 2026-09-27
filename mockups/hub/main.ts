import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EVENING } from "../../src/render/models";
import { colonyOrange } from "../../src/render/palette";
import { Sentinel } from "../../src/render/sentinel";

// The hub, the base's core (it replaces the ship; the ship becomes a drop pad): three bunkers,
// square with rounded edges, on the ground, A low block, B banded block, C skirted block, each on its 3×3 cells, in
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

/** A box with rounded edges, standing on the ground at y. */
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new RoundedBoxGeometry(w, h, d, 2, r), m, x, y + h / 2, z);

/** The front of every bunker: an entrance porch with a blast door framed in cyan, facing +z from `z`. */
function porch(g: THREE.Group, z: number, h = 0.7): void {
  g.add(rbox(1.0, h, 0.5, 0.08, M.dark, 0, 0, z + 0.2));
  g.add(rbox(1.06, 0.1, 0.56, 0.04, M.orange, 0, h, z + 0.2));
  g.add(box(0.74, h - 0.12, 0.04, M.power, 0, 0, z + 0.46));
  g.add(box(0.64, h - 0.18, 0.05, M.deck, 0, 0, z + 0.47));
  g.add(box(0.04, h - 0.18, 0.06, M.dark, 0, 0, z + 0.475));
}

/** A comms mast with a cyan tip that blinks; returns the tip's material. */
function mast(g: THREE.Group, x: number, y: number, z: number, h = 1.0): THREE.MeshStandardMaterial {
  g.add(cyl(0.035, 0.05, h, M.dark, x, y, z, 6));
  const m = M.lit.clone();
  g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), m, x, y + h + 0.04, z));
  return m;
}
const blink = (m: THREE.MeshStandardMaterial, t: number) => { m.emissiveIntensity = Math.sin(t * 3) > 0.6 ? 1.8 : 0.4; };

/** Something on each of three walls (sides and back), turned to face out. */
function onWalls(g: THREE.Group, make: () => THREE.Object3D): void {
  for (let i = 1; i < 4; i++) {
    const side = new THREE.Group();
    side.add(make());
    side.rotation.y = (i * Math.PI) / 2;
    g.add(side);
  }
}

// ------------------------------------------------------------------ A · low block

function lowBlock(): Hub {
  const g = new THREE.Group();
  g.add(rbox(2.9, 0.85, 2.9, 0.2, M.steel));
  // Orange plates flat on the walls, a cyan slit above each.
  onWalls(g, () => {
    const w = new THREE.Group();
    w.add(rbox(1.7, 0.4, 0.08, 0.03, M.orange, 0, 0.12, 1.46));
    w.add(box(1.2, 0.05, 0.04, M.power, 0, 0.64, 1.46));
    return w;
  });
  porch(g, 1.3);
  // Roof: a deck plate, a hatch, a mast.
  g.add(rbox(1.9, 0.06, 1.9, 0.03, M.deck, 0, 0.85, 0));
  g.add(cyl(0.24, 0.27, 0.1, M.orange, -0.45, 0.91, -0.35, 10));
  const tip = mast(g, 0.5, 0.91, -0.45);
  return { object: g, update: t => blink(tip, t) };
}

// ------------------------------------------------------------------ B · banded block

function bandedBlock(): Hub {
  const g = new THREE.Group();
  // Lower and upper body, a dark recessed band between them with one cyan slit all round.
  g.add(rbox(2.9, 0.5, 2.9, 0.18, M.steel));
  g.add(rbox(2.7, 0.3, 2.7, 0.1, M.dark, 0, 0.5));
  g.add(rbox(2.9, 0.45, 2.9, 0.18, M.steel, 0, 0.8));
  const band = M.power.clone();
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Group();
    side.add(box(2.3, 0.06, 0.04, band, 0, 0.62, 1.36));
    side.rotation.y = (i * Math.PI) / 2;
    g.add(side);
  }
  // Rounded orange guards on the four corners.
  for (const [sx, sz] of CORNERS) g.add(rbox(0.42, 1.3, 0.42, 0.14, M.orange, sx * 1.3, 0, sz * 1.3));
  porch(g, 1.3, 0.62);
  g.add(cyl(0.26, 0.3, 0.1, M.dark, 0.3, 1.25, 0.3, 10));
  const tip = mast(g, -0.5, 1.25, -0.4, 0.9);
  return { object: g, update: t => { blink(tip, t); band.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.4)); } };
}

// ------------------------------------------------------------------ C · skirted block

function skirtedBlock(): Hub {
  const g = new THREE.Group();
  // A heavy orange armour skirt round the foot, the steel block rising out of it.
  g.add(rbox(3.0, 0.35, 3.0, 0.14, M.orange));
  g.add(rbox(2.7, 0.75, 2.7, 0.2, M.steel, 0, 0.3));
  // Cyan slits high on the walls.
  onWalls(g, () => {
    const w = new THREE.Group();
    for (const x of [-0.6, 0, 0.6]) w.add(box(0.4, 0.06, 0.04, M.power, x, 0.82, 1.35));
    return w;
  });
  porch(g, 1.2, 0.62);
  // A smaller rounded roof module, its own mast.
  g.add(rbox(1.2, 0.4, 1.0, 0.12, M.dark, -0.4, 1.05, -0.3));
  g.add(box(0.8, 0.08, 0.04, M.lit, -0.4, 1.2, 0.21));
  const tip = mast(g, -0.75, 1.45, -0.6, 0.8);
  return { object: g, update: t => blink(tip, t) };
}

// ------------------------------------------------------------------ layout

const SPACING = 5;
const hubs = [lowBlock(), bandedBlock(), skirtedBlock()];
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
