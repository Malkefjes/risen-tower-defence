import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EVENING } from "../../src/render/models";
import { colonyOrange } from "../../src/render/palette";
import { Sentinel } from "../../src/render/sentinel";

// The hub, the base's core (it replaces the ship; the ship becomes a drop pad): Erik's pick, the
// bunker, walls angled down from a roof piece, tall enough to walk in at the front door, on its 3×3 cells, in
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
const lookAt = new THREE.Vector3(0.5, 1.2, 0.8);
function resize(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  renderer.setSize(w, h);
  const half = Math.max(2.8, 4.2 / aspect) / zoom;
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
const BLOCK_H = 2.2, DOOR_H = 1.55, DOOR_W = 0.9, PORCH_H = 1.8;
/** The walls angle down from the roof piece: half the width at the foot and under the roof, and their lean. */
const FOOT = 1.45, TOP = 1.05, LEAN = Math.atan((FOOT - TOP) / BLOCK_H);
const wallAt = (y: number) => FOOT - (FOOT - TOP) * (y / BLOCK_H);

function bunker(): Hub {
  const g = new THREE.Group();
  // The body: four walls leaning in from the ground to the roof piece (a square frustum).
  const r = (x: number) => x * Math.SQRT2;
  g.add(mesh(new THREE.CylinderGeometry(r(TOP), r(FOOT), BLOCK_H, 4, 1).rotateY(Math.PI / 4), M.steel, 0, BLOCK_H / 2, 0));
  // The roof piece: a rounded slab a little wider than the top of the walls.
  g.add(rbox(TOP * 2 + 0.3, 0.3, TOP * 2 + 0.3, 0.1, M.dark, 0, BLOCK_H - 0.02, 0));
  // Orange armour plates lying on the side and back walls, a cyan slit above each.
  for (let i = 1; i < 4; i++) {
    const side = new THREE.Group();
    const plate = mesh(new RoundedBoxGeometry(1.8, 0.9, 0.08, 2, 0.04), M.orange, 0, 0.7, wallAt(0.7) + 0.04);
    plate.rotation.x = -LEAN;
    side.add(plate);
    const slit = mesh(new THREE.BoxGeometry(1.4, 0.06, 0.04), M.power, 0, 1.5, wallAt(1.5) + 0.02);
    slit.rotation.x = -LEAN;
    side.add(slit);
    side.rotation.y = (i * Math.PI) / 2;
    g.add(side);
  }
  // The entrance porch, standing upright out of the front wall and past the cells: a blast door
  // framed in cyan, big enough to walk in.
  const front = FOOT + 0.35;
  g.add(rbox(DOOR_W + 0.4, PORCH_H, 1.0, 0.1, M.dark, 0, 0, front - 0.5));
  g.add(rbox(DOOR_W + 0.5, 0.12, 1.06, 0.05, M.orange, 0, PORCH_H, front - 0.5));
  g.add(box(DOOR_W + 0.12, DOOR_H + 0.06, 0.04, M.power, 0, 0, front));
  g.add(box(DOOR_W, DOOR_H, 0.05, M.deck, 0, 0, front + 0.01));
  g.add(box(0.04, DOOR_H, 0.06, M.dark, 0, 0, front + 0.015));
  // A cyan slit across the front wall above the porch.
  const top = mesh(new THREE.BoxGeometry(1.2, 0.06, 0.04), M.power, 0, 2.0, wallAt(2.0) + 0.02);
  top.rotation.x = -LEAN;
  g.add(top);
  // On the roof piece: a hatch and a mast.
  const roof = BLOCK_H + 0.28;
  g.add(cyl(0.26, 0.29, 0.12, M.orange, -0.45, roof, -0.35, 10));
  const tip = mast(g, 0.5, roof, -0.45, 1.1);
  return { object: g, update: t => { tip.emissiveIntensity = Math.sin(t * 3) > 0.6 ? 1.8 : 0.4; } };
}

// ------------------------------------------------------------------ layout

const hub = bunker();
const turntable = new THREE.Group();
scene.add(turntable);
// On its 3×3 cells: the middle of a cell block, the cells marked on the snow.
hub.object.position.set(0.5, 0, 0.5);
turntable.add(hub.object);
const cells = mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#c9c3dd", transparent: true, opacity: 0.35, depthWrite: false }), 0.5, 0.006, 0.5);
cells.castShadow = false;
turntable.add(cells);
// The Sentinel at the door, for scale.
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

let last = performance.now(), t = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  turntable.rotation.y = yaw;
  hub.update(t);
  sentinel.update(dt, { speed: 0, grounded: true, aiming: false, twist: 0 });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
