import * as THREE from "three";
import { EVENING } from "../../src/render/models";
import { colonyOrange } from "../../src/render/palette";
import { Sentinel } from "../../src/render/sentinel";

// The hub, the base's core (it replaces the ship; the ship becomes a drop pad): three looks,
// A beacon dome, B power spire, C command module, each on its 3×3 cells, in the game's evening
// light, with the Sentinel for scale. Drag to turn, wheel to zoom.

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
  white: std("#eef1f6", { roughness: 0.5 }),
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

// ------------------------------------------------------------------ A · beacon dome

function beaconDome(): Hub {
  const g = new THREE.Group();
  // An eight-sided steel platform filling the 3×3 cells, an orange trim, a low deck on it.
  g.add(cyl(1.5, 1.55, 0.22, M.steel, 0, 0, 0, 8));
  g.add(cyl(1.47, 1.47, 0.06, M.orange, 0, 0.22, 0, 8));
  g.add(cyl(1.3, 1.35, 0.1, M.deck, 0, 0.28, 0, 8));
  // The dome: faceted white, a flat-bottomed half of a low-poly ball.
  const dome = new THREE.SphereGeometry(1.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.add(mesh(dome, M.white, 0, 0.38, 0));
  // The cyan power ring round its foot, which breathes.
  const ringMat = M.power.clone(), ring = mesh(new THREE.TorusGeometry(1.08, 0.05, 6, 24).rotateX(Math.PI / 2), ringMat, 0, 0.42, 0);
  g.add(ring);
  // A door frame toward the front.
  g.add(box(0.46, 0.55, 0.12, M.orange, 0, 0.38, 0.98));
  g.add(box(0.34, 0.47, 0.13, M.dark, 0, 0.38, 1.0));
  // Four cargo pods on the corners.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const pod = new THREE.Group();
    pod.add(box(0.46, 0.34, 0.46, M.white, 0, 0, 0));
    pod.add(box(0.48, 0.06, 0.48, M.orange, 0, 0.12, 0));
    pod.position.set(sx * 1.05, 0.28, sz * 1.05);
    pod.rotation.y = Math.PI / 4;
    g.add(pod);
  }
  // A comms mast off the top, a cyan light at its tip.
  g.add(cyl(0.035, 0.05, 0.9, M.dark, 0.35, 1.3, -0.2, 6));
  const tip = mesh(new THREE.SphereGeometry(0.07, 8, 6), M.lit.clone(), 0.35, 2.24, -0.2);
  g.add(tip);
  return {
    object: g,
    update: t => {
      ringMat.emissiveIntensity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.6));
      (tip.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 3) > 0.6 ? 1.6 : 0.5;
    },
  };
}

// ------------------------------------------------------------------ B · power spire

function powerSpire(): Hub {
  const g = new THREE.Group();
  // A square steel plinth on the 3×3 cells, orange pillars on its corners.
  g.add(box(2.9, 0.3, 2.9, M.steel));
  g.add(box(2.5, 0.12, 2.5, M.deck, 0, 0.3));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.add(box(0.36, 0.7, 0.36, M.orange, sx * 1.2, 0.3, sz * 1.2));
  // Conduits out to all four sides, where the walls connect: the hub feeds the network.
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Group();
    c.add(box(0.9, 0.14, 0.22, M.dark, 0.95, 0.42, 0));
    c.add(box(0.5, 0.05, 0.08, M.power, 1.05, 0.56, 0));
    c.rotation.y = (i * Math.PI) / 2;
    g.add(c);
  }
  // The core: a white column rising in three tiers, cyan bands between them that pulse upward.
  const bands: THREE.Mesh[] = [];
  let y = 0.42;
  for (const [r, h] of [[0.72, 0.6], [0.58, 0.55], [0.45, 0.5]] as const) {
    g.add(cyl(r * 0.92, r, h, M.white, 0, y, 0, 10));
    y += h;
    const band = mesh(new THREE.CylinderGeometry(r * 0.94, r * 0.94, 0.1, 10), M.power.clone(), 0, y + 0.05, 0);
    g.add(band);
    bands.push(band);
    y += 0.1;
  }
  // A radar dish on top, turning slowly.
  const head = new THREE.Group();
  head.position.y = y;
  head.add(cyl(0.08, 0.1, 0.25, M.dark, 0, 0, 0, 8));
  const dish = mesh(new THREE.SphereGeometry(0.42, 12, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-Math.PI / 2 - 0.5), M.white, 0, 0.35, 0);
  head.add(dish);
  head.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), M.lit, 0, 0.42, 0.2));
  g.add(head);
  return {
    object: g,
    update: t => {
      head.rotation.y = t * 0.6;
      bands.forEach((b, i) => { (b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + 0.9 * Math.max(0, Math.sin(t * 2.2 - i * 0.9)); });
    },
  };
}

// ------------------------------------------------------------------ C · command module

function commandModule(): Hub {
  const g = new THREE.Group();
  // Stilts on steel pads at the corners of the 3×3 cells.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    g.add(box(0.4, 0.08, 0.4, M.steel, sx * 1.1, 0, sz * 1.1));
    g.add(box(0.14, 0.5, 0.14, M.dark, sx * 1.05, 0.08, sz * 1.05));
  }
  // The habitat: a long white block with an orange stripe, a dark base plate.
  g.add(box(2.6, 0.12, 2.3, M.steel, 0, 0.55));
  g.add(box(2.5, 0.8, 2.1, M.white, 0, 0.67));
  g.add(box(2.52, 0.12, 2.12, M.orange, 0, 1.0));
  // Lit windows along the sides.
  for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) g.add(box(0.36, 0.2, 0.04, M.lit, i * 0.7, 0.75, s * 1.06));
  // A cargo door toward the front, in an orange frame, and a ramp down to the snow.
  g.add(box(0.12, 0.62, 0.8, M.orange, 1.26, 0.67, 0));
  g.add(box(0.13, 0.54, 0.64, M.dark, 1.27, 0.67, 0));
  const ramp = mesh(new THREE.BoxGeometry(0.8, 0.05, 0.64), M.deck, 1.62, 0.33, 0);
  ramp.rotation.z = -0.55;
  g.add(ramp);
  // Solar wings on both ends.
  for (const s of [-1, 1]) {
    g.add(box(0.1, 0.1, 0.3, M.dark, 0, 1.2, s * 1.2));
    const wing = mesh(new THREE.BoxGeometry(2.2, 0.04, 0.7), M.glass, 0, 1.3, s * 1.62);
    wing.rotation.x = s * 0.25;
    g.add(wing);
  }
  // Roof: vents and a comms dish turning slowly.
  g.add(box(0.5, 0.16, 0.4, M.steel, -0.7, 1.12, 0));
  const head = new THREE.Group();
  head.position.set(0.6, 1.12, 0);
  head.add(cyl(0.06, 0.08, 0.28, M.dark, 0, 0, 0, 8));
  head.add(mesh(new THREE.SphereGeometry(0.34, 12, 4, 0, Math.PI * 2, 0, Math.PI / 3).rotateX(-Math.PI / 2 - 0.6), M.white, 0, 0.36, 0));
  g.add(head);
  const beacon = mesh(new THREE.SphereGeometry(0.06, 8, 6), M.lit.clone(), -0.7, 1.36, 0);
  g.add(beacon);
  return {
    object: g,
    update: t => {
      head.rotation.y = -t * 0.45;
      (beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = (t * 1.2) % 1 < 0.15 ? 2 : 0.4;
    },
  };
}

// ------------------------------------------------------------------ layout

const SPACING = 5;
const hubs = [beaconDome(), powerSpire(), commandModule()];
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
