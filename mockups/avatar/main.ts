import * as THREE from "three";
import { EVENING } from "../../src/render/models";
import { Sentinel } from "../../src/render/sentinel";

// The player's avatar, the Neon Star Sentinel (src/render/sentinel.ts, the same one as in
// the game), running in place on the snow in the game's evening light: for fixing him up.

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
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 60 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: EVENING.snow, roughness: 1, emissive: "#d8cfe6", emissiveIntensity: 0.45 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0xb9bfd6, 0xb9bfd6);
grid.position.set(0.5, 0.004, 0.5);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.55;
scene.add(grid);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
let zoom = 1;
const lookAt = new THREE.Vector3(0, 0.5, 0);
function resize(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  renderer.setSize(w, h);
  const half = Math.max(3, 3.4 / aspect) / (zoom * 2.2);
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
  camera.position.copy(CAM_DIR).multiplyScalar(40).add(lookAt);
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ------------------------------------------------------------------ the Sentinel

const sentinel = new Sentinel();
scene.add(sentinel.object);

// ------------------------------------------------------------------ controls

type Mode = "stand" | "walk" | "run" | "sprint";
const SPEEDS: Record<Mode, number> = { stand: 0, walk: 1.8, run: 5, sprint: 7 };
let mode: Mode = "run", aiming = false;
const bar = document.getElementById("bar")!;
const syncs: (() => void)[] = [];
const button = (label: string, on: () => boolean, click: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  const sync = () => b.setAttribute("aria-pressed", String(on()));
  b.onclick = () => { click(); for (const s of syncs) s(); };
  syncs.push(sync);
  sync();
  bar.appendChild(b);
};
for (const m of ["stand", "walk", "run", "sprint"] as Mode[]) button(m[0]!.toUpperCase() + m.slice(1), () => mode === m, () => { mode = m; });
button("Jump", () => false, () => { if (grounded) { vz = 4.2; grounded = false; } });
button("Aim", () => aiming, () => { aiming = !aiming; });

// ------------------------------------------------------------------ animation

let last = performance.now(), speed = SPEEDS.run, y = 0, vz = 0, grounded = true;
// He runs in place, turned by dragging with the left button; the grid slides under his feet.
let heading = Math.PI / 4 + 0.7, dragX: number | null = null;
const slide = new THREE.Vector2();
renderer.domElement.addEventListener("pointerdown", e => { if (e.button === 0) { dragX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener("pointermove", e => { if (dragX !== null) { heading += (e.clientX - dragX) * 0.012; dragX = e.clientX; } });
renderer.domElement.addEventListener("pointerup", () => { dragX = null; });

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  speed += (SPEEDS[mode] - speed) * Math.min(1, dt * 6);
  if (!grounded) { vz -= 14 * dt; y += vz * dt; if (y <= 0) { y = 0; vz = 0; grounded = true; } }
  sentinel.object.position.set(0, y, 0);
  sentinel.object.rotation.y = heading;
  slide.x = (slide.x - Math.sin(heading) * speed * dt) % 1;
  slide.y = (slide.y - Math.cos(heading) * speed * dt) % 1;
  grid.position.set(0.5 + slide.x, 0.004, 0.5 + slide.y);
  sentinel.update(dt, { speed, grounded, aiming, twist: 0 });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener("wheel", e => { zoom = Math.min(3, Math.max(0.6, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); resize(); });
