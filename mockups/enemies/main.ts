import * as THREE from "three";
import { caveLook } from "../../src/render/caveLooks";
import { enemyLook, type Enemy, type EnemyLook } from "../../src/render/enemyLooks";
import { createDefaultModels, createGlows, createMaterials, EVENING } from "../../src/render/models";
import { createRig, RigAnimator } from "../../src/render/rig";
import "./style.css";

// The new basic enemy: three Tyranid-inspired looks in ice blue, A, B, C. A pack walks
// out of cave exit A and loops past the rig. Drag to pan, scroll to zoom.

THREE.ColorManagement.enabled = false;

const CAM_OFFSET = new THREE.Vector3(20, 16.33, 20);
const container = document.getElementById("view")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const mat = createMaterials();
const models = createDefaultModels(mat, createGlows());
scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 80 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const cave = caveLook("A", 11);
cave.object.position.set(-2.5, 0, -2.5);
cave.object.rotation.y = Math.PI / 4;
scene.add(cave.object);
for (const [x, z, s] of [[-5, -1, 1], [-1, -5, 0.95], [3.5, -3, 1.1], [-4.5, 3, 1]] as [number, number, number][]) {
  const t = models.create("tree", { scale: s, seed: x * 17 + z });
  t.position.set(x, 0, z);
  scene.add(t);
}
const rig = createRig();
rig.object.position.set(2.2, 0, 1.2);
rig.object.rotation.y = -2.2;
scene.add(rig.object);
const anim = new RigAnimator(rig);

// Close up: one standing still, big, to see the model; the pack walks the loop.
let look: EnemyLook = "C";
try { const l = localStorage.getItem("risen.enemies.look"); void l; } catch { /* storage blocked */ }
let pack: Enemy[] = [];
let still: Enemy | null = null;
function build(): void {
  for (const e of pack) scene.remove(e.object);
  if (still) scene.remove(still.object);
  pack = [0, 1, 2].map(() => { const e = enemyLook(look); scene.add(e.object); return e; });
  still = enemyLook(look);
  still.object.position.set(0.6, 0, 2.6);
  // Three-quarter view, facing the camera and a little to the side.
  still.object.rotation.y = Math.PI / 4 + 0.6;
  scene.add(still.object);
}
build();

const looksEl = document.getElementById("looks")!;
function drawLooks(): void {
  looksEl.innerHTML = (["C"] as EnemyLook[]).map(l => `<button class="chip" data-look="${l}" aria-pressed="${look === l}">${l}</button>`).join("");
}
looksEl.addEventListener("click", e => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  look = b.dataset.look as EnemyLook;
  try { localStorage.setItem("risen.enemies.look", look); } catch { /* storage blocked */ }
  drawLooks(); build();
});
drawLooks();

/** The loop: out of the cave mouth, round past the rig, and back in. */
const loop = (u: number) => {
  const a = u * Math.PI * 2;
  return new THREE.Vector3(-0.2 + Math.cos(a) * 2.4, 0, -0.2 + Math.sin(a) * 1.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 4);
};

const target = new THREE.Vector3(0, 0, 0.3);
let zoom = 3.6;
let drag: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener("pointerup", () => { drag = null; });
renderer.domElement.addEventListener("pointermove", e => {
  if (!drag) return;
  const k = (2 * zoom) / container.clientHeight, dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
  target.x -= (dx + dy * 2) * Math.SQRT1_2; target.z -= (-dx + dy * 2) * Math.SQRT1_2;
  drag = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.min(12, Math.max(1.2, zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

let last = performance.now(), time = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now; time += dt;
  pack.forEach((e, i) => {
    const u = (time * 0.06 + i * 0.09) % 1, p = loop(u), q = loop(u + 0.002);
    e.object.position.copy(p);
    e.object.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
    e.update(time + i * 0.7, true);
  });
  still?.update(time, false);
  anim.update(dt, { speed: 0, topSpeed: 5, grounded: true, vz: 0, jumpSpeed: 5, landed: false, ready: false, mining: false });
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  Object.assign(camera, { left: -zoom * a, right: zoom * a, top: zoom, bottom: -zoom });
  camera.updateProjectionMatrix();
  camera.position.copy(target).addScaledVector(CAM_OFFSET, 2);
  camera.lookAt(target);
  sun.target.position.copy(target);
  sun.position.copy(target).add(new THREE.Vector3(...EVENING.sunOffset));
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { closeUp: () => void }).closeUp = () => { target.set(0.6, 0.3, 2.6); zoom = 0.9; };
