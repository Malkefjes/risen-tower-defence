import * as THREE from "three";
import { GOLEM_CLIPS, GOLEM_LOOKS, golemEnemy, type Enemy, type GolemClip, type GolemLook } from "../../src/render/golem";
import { EVENING } from "../../src/render/models";
import type { EnemyKind } from "../../src/sim/enemies";
import { defaultTuning } from "../../src/sim/tuning";

// The enemy golem (src/render/golem.ts, the same one as in the game), one type at a time in
// its size, colour and speed, walking in place on the snow in the game's evening light.

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
let look: GolemLook = { ...GOLEM_LOOKS.swarm };
function resize(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  renderer.setSize(w, h);
  const lh = Math.max(0.5, look.height);
  const half = Math.max(lh * 1.25, (lh * 1.4) / aspect) / zoom;
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
  lookAt.set(0, look.height * 0.5, 0);
  camera.position.copy(CAM_DIR).multiplyScalar(40).add(lookAt);
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ------------------------------------------------------------------ the golem

const TYPES: [EnemyKind, string][] = [["swarm", "Swarm"], ["runner", "Runner"], ["brute", "Brute"], ["grunt", "Grunt"]];
const CLIP_LABEL: Record<GolemClip, string> = { stand: "Stand", walk: "Walk", walk2: "Walk 2", run: "Run" };
const speeds = defaultTuning().enemies;
let kind: EnemyKind = "swarm", clipOverride: GolemClip | null = null, speed = speeds.swarm.speed;
let enemy: Enemy | null = null;
const holder = new THREE.Group();
scene.add(holder);
function rebuild(): void {
  look = { ...GOLEM_LOOKS[kind], clip: clipOverride ?? GOLEM_LOOKS[kind].clip };
  speed = look.clip === "stand" ? 0 : speeds[kind].speed;
  if (enemy) holder.remove(enemy.object);
  enemy = golemEnemy(look, Math.max(speed, 0.001));
  holder.add(enemy.object);
  resize();
  state.textContent = `${TYPES.find(t => t[0] === kind)![1]} · ${look.height.toFixed(2)} cells tall · ${speed} cells/s · ${look.color}`;
}

// ------------------------------------------------------------------ controls

const syncs: (() => void)[] = [];
const button = (bar: HTMLElement, label: string, on: () => boolean, click: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  const sync = () => b.setAttribute("aria-pressed", String(on()));
  b.onclick = () => { click(); for (const s of syncs) s(); };
  syncs.push(sync);
  sync();
  bar.appendChild(b);
};
const typeBar = document.getElementById("bar")!, clipBar = document.getElementById("clips")!, state = document.getElementById("state")!;
for (const [k, label] of TYPES) button(typeBar, label, () => kind === k, () => { kind = k; clipOverride = null; rebuild(); });
button(clipBar, "Own", () => clipOverride === null, () => { clipOverride = null; rebuild(); });
for (const c of GOLEM_CLIPS) button(clipBar, CLIP_LABEL[c], () => clipOverride === c, () => { clipOverride = c; rebuild(); });

// ------------------------------------------------------------------ animation

// It walks in place, turned by dragging with the left button; the grid slides under its feet.
let last = performance.now(), t = 0, heading = Math.PI / 4 + 0.7, dragX: number | null = null;
const slide = new THREE.Vector2();
renderer.domElement.addEventListener("pointerdown", e => { if (e.button === 0) { dragX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener("pointermove", e => { if (dragX !== null) { heading += (e.clientX - dragX) * 0.012; dragX = e.clientX; } });
renderer.domElement.addEventListener("pointerup", () => { dragX = null; });

rebuild();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  holder.rotation.y = heading;
  slide.x = (slide.x - Math.sin(heading) * speed * dt) % 1;
  slide.y = (slide.y - Math.cos(heading) * speed * dt) % 1;
  grid.position.set(0.5 + slide.x, 0.004, 0.5 + slide.y);
  enemy?.update(t, true);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener("wheel", e => { zoom = Math.min(4, Math.max(0.4, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); resize(); });
