import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EVENING } from "../../src/render/models";
import { colonyOrange } from "../../src/render/palette";
import { Sentinel } from "../../src/render/sentinel";

// The hub, the base's core (it replaces the ship; the ship becomes a drop pad): the bunker, walls
// angled down from a roof piece flush with them, tall enough to walk in at the front door, three
// ways: A steep, B heavy roof, C armour band, each on its 3×3 cells, in
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
const lookAt = new THREE.Vector3(0.5, 1.0, 0.8);
function resize(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  renderer.setSize(w, h);
  const half = Math.max(4.4, 10 / aspect) / zoom;
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

/** A box with rounded edges, standing on the ground at y. */
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new RoundedBoxGeometry(w, h, d, 2, r), m, x, y + h / 2, z);

/** A comms mast with a cyan tip that blinks; returns the tip's material. */
function mast(g: THREE.Group, x: number, y: number, z: number, h = 1.0): THREE.MeshStandardMaterial {
  g.add(cyl(0.035, 0.05, h, M.dark, x, y, z, 6));
  const m = M.lit.clone();
  g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), m, x, y + h + 0.04, z));
  return m;
}

// ------------------------------------------------------------------ the bunker

/** Tall enough for the player to walk in at the front door (he is 1.33 cells). */
const DOOR_H = 1.55, DOOR_W = 0.9, PORCH_H = 1.8;

/** The shared shape: four walls leaning in from `foot` (half width at the ground) to `top` under a roof piece. */
interface Slope { foot: number; top: number; h: number; lean: number; at: (y: number) => number }
function slope(foot: number, top: number, h: number): Slope {
  return { foot, top, h, lean: Math.atan((foot - top) / h), at: y => foot - (foot - top) * (y / h) };
}
/** The walls, as a square frustum. */
function walls(g: THREE.Group, s: Slope, m: THREE.Material): void {
  g.add(mesh(new THREE.CylinderGeometry(s.top * Math.SQRT2, s.foot * Math.SQRT2, s.h, 4, 1).rotateY(Math.PI / 4), m, 0, s.h / 2, 0));
}
/** A flat piece lying on one wall (turned to it by the caller) at height y, `out` off its face. */
function onSlope(s: Slope, geo: THREE.BufferGeometry, m: THREE.Material, y: number, out: number, x = 0): THREE.Mesh {
  const o = mesh(geo, m, x, y, s.at(y) + out);
  o.rotation.x = -s.lean;
  return o;
}
/** For each wall but the front (sides and back), or all four. */
function eachWall(g: THREE.Group, make: (side: THREE.Group) => void, withFront = false): void {
  for (let i = withFront ? 0 : 1; i < 4; i++) {
    const side = new THREE.Group();
    make(side);
    side.rotation.y = (i * Math.PI) / 2;
    g.add(side);
  }
}
/** The walk-in entrance: an upright porch out of the front wall, a blast door framed in cyan. */
function porch(g: THREE.Group, s: Slope): void {
  const front = s.foot + 0.35;
  g.add(rbox(DOOR_W + 0.4, PORCH_H, 1.0, 0.1, M.dark, 0, 0, front - 0.5));
  g.add(rbox(DOOR_W + 0.5, 0.12, 1.06, 0.05, M.orange, 0, PORCH_H, front - 0.5));
  g.add(box(DOOR_W + 0.12, DOOR_H + 0.06, 0.04, M.power, 0, 0, front));
  g.add(box(DOOR_W, DOOR_H, 0.05, M.deck, 0, 0, front + 0.01));
  g.add(box(0.04, DOOR_H, 0.06, M.dark, 0, 0, front + 0.015));
}
const blinker = (m: THREE.MeshStandardMaterial) => (t: number) => { m.emissiveIntensity = Math.sin(t * 3) > 0.6 ? 1.8 : 0.4; };

// ------------------------------------------------------------------ A · steep

function steep(): Hub {
  const g = new THREE.Group(), s = slope(1.45, 0.95, 2.2);
  walls(g, s, M.steel);
  // The roof piece: a thin slab exactly as wide as the tops of the walls.
  g.add(box(s.top * 2, 0.16, s.top * 2, M.dark, 0, s.h));
  eachWall(g, side => {
    side.add(onSlope(s, new RoundedBoxGeometry(1.8, 0.9, 0.08, 2, 0.04), M.orange, 0.7, 0.04));
    side.add(onSlope(s, new THREE.BoxGeometry(1.3, 0.06, 0.04), M.power, 1.55, 0.02));
  });
  porch(g, s);
  g.add(onSlope(s, new THREE.BoxGeometry(1.0, 0.06, 0.04), M.power, 2.0, 0.02));
  const roof = s.h + 0.16;
  g.add(cyl(0.24, 0.27, 0.12, M.orange, -0.4, roof, -0.35, 10));
  const tip = mast(g, 0.45, roof, -0.4, 1.1);
  return { object: g, update: blinker(tip) };
}

// ------------------------------------------------------------------ B · heavy roof

function heavyRoof(): Hub {
  const g = new THREE.Group(), s = slope(1.45, 1.15, 1.8);
  walls(g, s, M.steel);
  // A thick roof block, flush with the tops of the walls, a cyan band all round it.
  g.add(box(s.top * 2, 0.5, s.top * 2, M.dark, 0, s.h));
  const band = M.power.clone();
  eachWall(g, side => side.add(box(s.top * 2 - 0.1, 0.07, 0.04, band, 0, s.h + 0.22, s.top + 0.005)), true);
  // Orange strips down the four sloped corner edges.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, x0 = Math.cos(a) * s.foot * Math.SQRT2, z0 = Math.sin(a) * s.foot * Math.SQRT2;
    const x1 = Math.cos(a) * s.top * Math.SQRT2, z1 = Math.sin(a) * s.top * Math.SQRT2;
    const len = Math.hypot(x1 - x0, s.h, z1 - z0), mid = new THREE.Vector3((x0 + x1) / 2, s.h / 2, (z0 + z1) / 2);
    const strip = mesh(new THREE.BoxGeometry(0.2, len, 0.2), M.orange, mid.x, mid.y, mid.z);
    strip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, s.h, z1 - z0).normalize());
    g.add(strip);
  }
  eachWall(g, side => side.add(onSlope(s, new THREE.BoxGeometry(1.5, 0.06, 0.04), M.power, 1.2, 0.02)));
  porch(g, s);
  const roof = s.h + 0.5;
  g.add(cyl(0.26, 0.29, 0.1, M.orange, 0.4, roof, 0.4, 10));
  const tip = mast(g, -0.5, roof, -0.5, 1.0);
  return { object: g, update: t => { blinker(tip)(t); band.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.4)); } };
}

// ------------------------------------------------------------------ C · armour band

function armourBand(): Hub {
  const g = new THREE.Group(), s = slope(1.45, 1.0, 2.2);
  walls(g, s, M.steel);
  g.add(box(s.top * 2, 0.18, s.top * 2, M.dark, 0, s.h));
  // An orange armour band round the foot of all four walls.
  eachWall(g, side => side.add(onSlope(s, new RoundedBoxGeometry(s.at(0.35) * 2 - 0.05, 0.6, 0.1, 2, 0.04), M.orange, 0.35, 0.05)), true);
  // Pairs of upright cyan slits on the slopes.
  eachWall(g, side => { for (const x of [-0.35, 0.35]) side.add(onSlope(s, new THREE.BoxGeometry(0.06, 0.5, 0.04), M.power, 1.35, 0.02, x)); });
  porch(g, s);
  // A small raised module in the middle of the roof, the mast on it.
  const roof = s.h + 0.18;
  g.add(rbox(0.9, 0.35, 0.9, 0.08, M.steel, 0, roof, 0));
  g.add(box(0.6, 0.06, 0.04, M.lit, 0, roof + 0.18, 0.46));
  const tip = mast(g, 0.2, roof + 0.35, -0.2, 0.9);
  return { object: g, update: blinker(tip) };
}

// ------------------------------------------------------------------ layout

const SPACING = 5.5;
const hubs = [steep(), heavyRoof(), armourBand()];
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
// The Sentinel at the middle one's door, for scale.
const sentinel = new Sentinel();
sentinel.object.position.set(1.4, 0, 3.1);
sentinel.object.rotation.y = Math.PI / 5;
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
  tags.forEach((el, i) => {
    hubs[i]!.object.getWorldPosition(v).add(new THREE.Vector3(1, 0, 1).normalize().multiplyScalar(2.6)).project(camera);
    el.style.left = `${(v.x * 0.5 + 0.5) * container.clientWidth}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * container.clientHeight}px`;
  });
  sentinel.update(dt, { speed: 0, grounded: true, aiming: false, twist: 0 });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
