import * as THREE from "three";
import { cliffLook, type CliffLook } from "../../src/render/cliffLooks";
import { createDefaultModels, createGlows, createMaterials, EVENING } from "../../src/render/models";
import { createRig, RigAnimator } from "../../src/render/rig";
import { cellKey } from "../../src/sim/types";
import "./style.css";

// Cliff looks: the same ridge (a straight run, a diagonal stretch, a bend and a
// pass) in three natural rock looks, with the rig and pines for scale. Drag to
// pan, scroll to zoom.

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
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.5, far: 80 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// The sample ridge.
const ridge: [number, number][] = [];
for (let x = -9; x <= -3; x++) ridge.push([x, -3]);
for (let i = 0; i < 5; i++) { ridge.push([-2 + i, -3 + i]); ridge.push([-2 + i, -2 + i]); }
for (let y = 3; y <= 5; y++) ridge.push([3, y]);
for (let x = 4; x <= 5; x++) ridge.push([x, 5]);
// A pass (two cells open), then the ridge carries on.
for (let x = 8; x <= 12; x++) ridge.push([x, 5]);
ridge.push([12, 4]); ridge.push([12, 3]);
const set = new Set(ridge.map(([x, y]) => cellKey(x, y)));

let look: CliffLook = "A";
try { const l = localStorage.getItem("risen.cliffs.look"); if (l === "A" || l === "B" || l === "C") look = l; } catch { /* storage blocked */ }
let cliffGroup: THREE.Group | null = null;
function build(): void {
  if (cliffGroup) { scene.remove(cliffGroup); cliffGroup.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); }
  cliffGroup = cliffLook(look, ridge, (x, y) => set.has(cellKey(x, y)), 7);
  scene.add(cliffGroup);
}
build();

for (const [x, y, s] of [[-6, 0, 1], [-4, 1, 0.9], [0, 4, 1.1], [6, 1, 1], [9, 8, 0.95], [-7, -6, 1]] as [number, number, number][]) {
  const t = models.create("tree", { scale: s, seed: x * 17 + y });
  t.position.set(x + 0.5, 0, y + 0.5);
  scene.add(t);
}
const rig = createRig();
rig.object.position.set(6.8, 0, 6.2);
rig.object.rotation.y = -2.4;
scene.add(rig.object);
const anim = new RigAnimator(rig);

const looksEl = document.getElementById("looks")!;
function drawLooks(): void {
  looksEl.innerHTML = (["A", "B", "C"] as CliffLook[]).map(l => `<button class="chip" data-look="${l}" aria-pressed="${look === l}">${l}</button>`).join("");
}
looksEl.addEventListener("click", e => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  look = b.dataset.look as CliffLook;
  try { localStorage.setItem("risen.cliffs.look", look); } catch { /* storage blocked */ }
  drawLooks(); build();
});
drawLooks();

const target = new THREE.Vector3(1.5, 0, 1.5);
let zoom = 7;
let drag: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY }; });
addEventListener("pointerup", () => { drag = null; });
renderer.domElement.addEventListener("pointermove", e => {
  if (!drag) return;
  const k = (2 * zoom) / container.clientHeight, dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
  // Screen right is (1, 0, -1)/√2 on the ground, screen down is (1, 0, 1)/√2 (stretched by the 30° view).
  target.x -= (dx + dy * 2) * Math.SQRT1_2; target.z -= (-dx + dy * 2) * Math.SQRT1_2;
  drag = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.min(16, Math.max(3, zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
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
