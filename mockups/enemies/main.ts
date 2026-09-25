import * as THREE from "three";
import { caveLook } from "../../src/render/caveLooks";
import { enemyLook, type Enemy, type EnemyLook } from "../../src/render/enemyLooks";
import { createDefaultModels, createGlows, createMaterials, EVENING } from "../../src/render/models";
import { createRig, RigAnimator } from "../../src/render/rig";
import "./style.css";

// The new basic enemy (the leaper): they climb out of cave exit A, walk out in a line
// and die about 7 tiles out. Drag to pan, scroll to zoom.

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
rig.object.position.set(1.6, 0, -1.2);
rig.object.rotation.y = -2.2;
scene.add(rig.object);
const anim = new RigAnimator(rig);

// Leapers climb out of the cave mouth one after another, walk out in a line, and
// die about 7 tiles out: they simply burst into dark bits.
let look: EnemyLook = "C";
const OUT = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2); // the way the cave mouth faces
const START = cave.object.position.clone().addScaledVector(OUT, 0.55);
const DIE_AT = 7, SPEED = 1.5, EVERY = 1.1;
interface Walker { e: Enemy; d: number; t: number; dying: number }
let walkers: Walker[] = [];
let spawnT = 0;
const bits: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
const bitGeo = new THREE.IcosahedronGeometry(0.035, 0);
const boneMat = new THREE.MeshStandardMaterial({ color: "#e9e1cf", roughness: 0.7 });
const bitMat = new THREE.MeshStandardMaterial({ color: "#2a0f44", roughness: 0.8, emissive: "#160626", emissiveIntensity: 0.3 });
function spawn(): void {
  const e = enemyLook(look);
  e.object.rotation.y = Math.atan2(OUT.x, OUT.z);
  scene.add(e.object);
  walkers.push({ e, d: 0, t: Math.random() * 10, dying: 0 });
}
function build(): void {
  for (const w of walkers) scene.remove(w.e.object);
  walkers = [];
  spawnT = 0;
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


const target = new THREE.Vector3(0, 0, 0);
let zoom = 4.6;
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
  spawnT -= dt;
  if (spawnT <= 0) { spawn(); spawnT = EVERY; }
  for (const w of walkers) {
    w.t += dt;
    w.d += SPEED * dt;
    const p = START.clone().addScaledVector(OUT, w.d);
    // Climbing out of the mouth: rising from below the snow over the first half tile.
    p.y = -0.25 * Math.max(0, 1 - w.d / 0.5);
    w.e.object.position.copy(p);
    w.e.update(w.t, true);
    if (w.d >= DIE_AT) {
      // Death: it simply bursts into dark bits (and a few bone ones) and is gone.
      w.dying = 1;
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(bitGeo, i < 3 ? boneMat : bitMat);
        m.position.copy(p).setY(0.12);
        scene.add(m);
        const a = Math.random() * Math.PI * 2, sp = 0.9 + Math.random() * 1.6;
        bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 1.2 + Math.random() * 1.5, Math.sin(a) * sp), life: 0.8 });
      }
    }
  }
  walkers = walkers.filter(w => { if (!w.dying) return true; scene.remove(w.e.object); return false; });
  for (const b of bits) {
    b.life -= dt; b.v.y -= 7 * dt; b.m.position.addScaledVector(b.v, dt);
    if (b.m.position.y < 0.02) { b.m.position.y = 0.02; b.v.set(0, 0, 0); }
    b.m.scale.setScalar(Math.max(0.01, Math.min(1, b.life / 0.3)));
  }
  for (let i = bits.length - 1; i >= 0; i--) if (bits[i]!.life <= 0) { scene.remove(bits[i]!.m); bits.splice(i, 1); }
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
(window as unknown as { closeUp: () => void }).closeUp = () => { target.set(0, 0.1, 0); zoom = 1.4; };
