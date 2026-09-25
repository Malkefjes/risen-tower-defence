import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING } from "../../src/render/models";
import { createRig, RigAnimator } from "../../src/render/rig";
import { Avatar, defaultAvatarTuning, type AvatarTuning } from "../../src/sim/avatar";
import "./style.css";

// Movement playground: the real avatar rules (src/sim/avatar.ts) and the real rig
// (src/render/rig.ts) on a patch of Frostfall, with sliders to tune the feel.
// WASD runs (screen-relative), Space jumps, arrows or drag pan, C follows the rig
// again, H looks at the Rocket, K hides the tuning panel, scroll zooms.
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
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const mat = createMaterials();
const models = createDefaultModels(mat, createGlows());
scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ the world

/** Standing height per cell: walls are decks, rocks, trees and the Rocket are solid. */
const heights = new Map<string, number>();
const key = (x: number, y: number) => `${x},${y}`;
const heightAt = (x: number, y: number) => heights.get(key(x, y)) ?? 0;

// Rocket on cells (-1..1, -1..1).
const ship = models.create("ship");
ship.position.set(0.5, 0, 0.5);
scene.add(ship);
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) heights.set(key(x, y), Infinity);

// Wall pieces of different shapes, some touching so decks connect.
const PIECES: [number, number][][] = [
  [[3, -2], [4, -2], [5, -2], [6, -2]],
  [[3, -1], [3, 0], [3, 1], [4, 1]],
  [[-4, 2], [-3, 2], [-3, 3], [-2, 3]],
  [[0, 4], [1, 4], [2, 4], [1, 5]],
  [[-5, -3], [-4, -3], [-5, -2], [-4, -2]],
  [[6, 2], [6, 3], [6, 4], [6, 5]],
  [[7, 5], [8, 5], [8, 6], [8, 7]],
  [[-2, -5], [-1, -5], [0, -5], [1, -5]],
];
PIECES.forEach((cells, i) => {
  scene.add(models.create("wallPiece", { cells, variant: i % 2 }));
  for (const [x, y] of cells) heights.set(key(x, y), DECK_TOP);
});
const twin = models.create("twin");
twin.position.set(5.5, DECK_TOP, -1.5);
scene.add(twin);
heights.set(key(5, -2), Infinity);

const deco: [string, number, number, number][] = [
  ["rock", -6, 5, 13], ["rock", 9, -3, 11], ["rock", -1, 8, 12], ["rock", 4, -6, 14],
  ["tree", -8, 0, 1.0], ["tree", 10, 2, 1.1], ["tree", -3, -8, 0.95], ["tree", 3, 9, 1.05], ["tree", 11, 8, 1.0], ["tree", -9, 7, 0.9],
];
for (const [name, x, y, s] of deco) {
  const m = models.create(name, name === "tree" ? { scale: s, seed: x * 7 + y } : { scale: s, seed: x * 5 + y });
  m.position.set(x + 0.5, 0, y + 0.5);
  scene.add(m);
  heights.set(key(x, y), Infinity);
}

// ------------------------------------------------------------------ avatar and rig

const avatar = new Avatar(2.5, 2.5);
const rig = createRig();
scene.add(rig.object);
const anim = new RigAnimator(rig);

// ------------------------------------------------------------------ tuning

interface Knob { label: string; min: number; max: number; step: number; get(): number; set(v: number): void }
const T: AvatarTuning = defaultAvatarTuning();
const view = { follow: 4, zoom: 4.2 };
const STORE = "risen.playground.v1";
const knobs: Knob[] = [
  { label: "Run speed (cells/s)", min: 1, max: 8, step: 0.1, get: () => T.speed, set: v => { T.speed = v; } },
  { label: "Acceleration", min: 4, max: 80, step: 1, get: () => T.accel, set: v => { T.accel = v; } },
  { label: "Turn speed", min: 3, max: 40, step: 1, get: () => T.turnSpeed, set: v => { T.turnSpeed = v; } },
  { label: "Jump height (cells)", min: 0.6, max: 2, step: 0.05, get: () => T.jumpHeight, set: v => { T.jumpHeight = v; } },
  { label: "Jump rise time (s)", min: 0.15, max: 0.6, step: 0.01, get: () => T.jumpRise, set: v => { T.jumpRise = v; } },
  { label: "Air control", min: 0, max: 1, step: 0.05, get: () => T.airControl, set: v => { T.airControl = v; } },
  { label: "Stride (lower = longer)", min: 2, max: 7, step: 0.1, get: () => anim.tuning.stride, set: v => { anim.tuning.stride = v; } },
  { label: "Camera follow", min: 1, max: 20, step: 0.5, get: () => view.follow, set: v => { view.follow = v; } },
];
try {
  const saved = JSON.parse(localStorage.getItem(STORE) ?? "null") as number[] | null;
  if (saved) knobs.forEach((k, i) => { if (typeof saved[i] === "number") k.set(saved[i]!); });
} catch { /* no saved tuning */ }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(knobs.map(k => k.get()))); } catch { /* storage blocked */ } };

const panel = document.getElementById("tune")!;
function renderPanel(): void {
  panel.innerHTML = `<h4>Movement <span><button id="copy">Copy values</button> <button id="reset">Reset</button></span></h4>`;
  knobs.forEach((k, i) => {
    const l = document.createElement("label");
    l.innerHTML = `<span>${k.label}</span><output>${+k.get().toFixed(2)}</output><input id="k${i}" type="range" min="${k.min}" max="${k.max}" step="${k.step}" value="${k.get()}">`;
    const input = l.querySelector("input")!, out = l.querySelector("output")!;
    input.addEventListener("input", () => { k.set(Number(input.value)); out.textContent = String(+k.get().toFixed(2)); save(); });
    input.addEventListener("keydown", e => e.stopPropagation());
    panel.appendChild(l);
  });
  panel.querySelector("#copy")!.addEventListener("click", e => {
    const text = knobs.map(k => `${k.label}: ${+k.get().toFixed(2)}`).join("\n");
    const btn = e.currentTarget as HTMLButtonElement;
    navigator.clipboard.writeText(text).then(() => { btn.textContent = "Copied"; }, () => { btn.textContent = "Copy failed"; });
    setTimeout(() => { btn.textContent = "Copy values"; }, 1500);
  });
  panel.querySelector("#reset")!.addEventListener("click", () => {
    const d = defaultAvatarTuning();
    Object.assign(T, d);
    anim.tuning.stride = 3;
    view.follow = 4;
    save();
    renderPanel();
  });
}
renderPanel();

// ------------------------------------------------------------------ input

const keys = new Set<string>();
let jumpQueued = false, following = true;
const target = new THREE.Vector3(avatar.x, 0, avatar.y);
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); if (!e.repeat) jumpQueued = true; return; }
  if (k.startsWith("arrow")) e.preventDefault();
  keys.add(k);
  if (k === "c") following = true;
  if (k === "h") { following = false; target.set(0.5, 0, 0.5); }
  if (k === "k") panel.hidden = !panel.hidden;
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());

// Drag to pan; scroll to zoom.
/** A press only becomes a pan once the mouse has moved a few pixels, so clicks don't break the follow. */
let drag: { x: number; y: number; sx: number; sy: number; panning: boolean } | null = null;
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(cx: number, cy: number): THREE.Vector3 | null {
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, p) ? p : null;
}
renderer.domElement.addEventListener("pointerdown", e => {
  drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, panning: false };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointermove", e => {
  if (!drag) return;
  if (!drag.panning && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
  if (!drag.panning) { drag.panning = true; drag.x = e.clientX; drag.y = e.clientY; return; }
  const a = groundAt(drag.x, drag.y), b = groundAt(e.clientX, e.clientY);
  if (a && b) { following = false; target.x += a.x - b.x; target.z += a.z - b.z; }
  drag.x = e.clientX; drag.y = e.clientY;
});
renderer.domElement.addEventListener("pointerup", () => { drag = null; });
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); view.zoom = Math.min(10, Math.max(2, view.zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });

addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

// Screen directions on the ground for this camera: up the screen is (-1, -1), right is (1, -1).
const K = Math.SQRT1_2;
function moveInput(): { x: number; y: number } {
  let r = 0, u = 0;
  if (keys.has("d")) r += 1;
  if (keys.has("a")) r -= 1;
  if (keys.has("w")) u += 1;
  if (keys.has("s")) u -= 1;
  const x = (r - u) * K, y = (-r - u) * K, l = Math.hypot(x, y);
  return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

// ------------------------------------------------------------------ snow, loop

const N = 900;
const snowPos = new Float32Array(N * 3), snowSpeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 30; snowPos[i * 3 + 1] = Math.random() * 12; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 30;
  snowSpeed[i] = 0.5 + Math.random() * 0.7;
}
const sg = new THREE.BufferGeometry();
sg.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
snow.frustumCulled = false;
scene.add(snow);

const wrap = (v: number, center: number, half: number) => ((((v - center + half) % (2 * half)) + 2 * half) % (2 * half)) + center - half;
const prev = { x: avatar.x, y: avatar.y, z: avatar.z, facing: avatar.facing };
// Light space: the sun's direction and two axes across it, for snapping the shadow camera.
const lightDir = new THREE.Vector3(-EVENING.sunOffset[0], -EVENING.sunOffset[1], -EVENING.sunOffset[2]).normalize();
const SUN_DIST = Math.hypot(...EVENING.sunOffset);
const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lightDir).normalize();
const lightUp = new THREE.Vector3().crossVectors(lightDir, lightRight).normalize();
const snapOrigin = new THREE.Vector3();
const speedEl = document.getElementById("speed")!;
const TICK = 1 / 60;
let acc = 0, last = performance.now(), time = 0, zoom = view.zoom;

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  (ship.userData.update as (t: number) => void)(time);

  // Fixed-step movement, like the game loop.
  // Movement runs at a fixed 60 ticks/s; the screen may draw more often. Keep the previous
  // tick's state and draw the rig in between, so it moves smoothly on every frame.
  acc += dt;
  let landed = false;
  while (acc >= TICK) {
    prev.x = avatar.x; prev.y = avatar.y; prev.z = avatar.z; prev.facing = avatar.facing;
    const m = moveInput();
    avatar.step(TICK, { x: m.x, y: m.y, jump: jumpQueued }, heightAt, T);
    if (jumpQueued) jumpQueued = false;
    landed ||= avatar.landed;
    acc -= TICK;
  }
  const alpha = acc / TICK;
  const rx = prev.x + (avatar.x - prev.x) * alpha, ry = prev.y + (avatar.y - prev.y) * alpha;
  const rz = prev.z + (avatar.z - prev.z) * alpha;
  const df = Math.atan2(Math.sin(avatar.facing - prev.facing), Math.cos(avatar.facing - prev.facing));
  rig.object.position.set(rx, rz, ry);
  rig.object.rotation.y = prev.facing + df * alpha;
  // Animate every drawn frame.
  anim.update(dt, {
    speed: avatar.speed, topSpeed: T.speed, grounded: avatar.grounded, vz: avatar.vz,
    jumpSpeed: (2 * T.jumpHeight) / T.jumpRise, landed, ready: false, mining: false,
  });
  speedEl.textContent = `${following ? "Following" : "Free camera"}  ·  ${avatar.speed.toFixed(1)} cells/s${avatar.grounded ? "" : "  ·  airborne"}${avatar.z > 0.3 && avatar.grounded ? "  ·  on a wall" : ""}`;

  // Camera: follows the rig unless panned away.
  let pr = 0, pu = 0;
  if (keys.has("arrowright")) pr += 1;
  if (keys.has("arrowleft")) pr -= 1;
  if (keys.has("arrowup")) pu += 1;
  if (keys.has("arrowdown")) pu -= 1;
  if (pr || pu) {
    following = false;
    const s = zoom * 1.6 * dt;
    target.x += (pr - pu) * K * s; target.z += (-pr - pu) * K * s;
  }
  if (following) {
    const k = 1 - Math.exp(-dt * view.follow);
    target.x += (rx - target.x) * k;
    target.z += (ry - target.z) * k;
  }
  zoom += (view.zoom - zoom) * (1 - Math.exp(-dt * 8));

  // Flakes live in the world and wrap around the camera's area, so they don't move with the camera.
  for (let i = 0; i < N; i++) {
    snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
    snowPos[i * 3]! += Math.sin(time * 0.7 + i) * 0.12 * dt;
    if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 12;
    snowPos[i * 3] = wrap(snowPos[i * 3]!, target.x, 15);
    snowPos[i * 3 + 2] = wrap(snowPos[i * 3 + 2]!, target.z, 15);
  }
  sg.attributes.position!.needsUpdate = true;

  const a = container.clientWidth / Math.max(1, container.clientHeight);
  Object.assign(camera, { left: -zoom * a, right: zoom * a, top: zoom, bottom: -zoom });
  camera.updateProjectionMatrix();
  camera.position.copy(target).add(CAM_OFFSET);
  camera.lookAt(target.x, 0, target.z);
  const sc = Math.max(12, zoom * 2.4);
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 0.5, far: 60 });
  sun.shadow.camera.updateProjectionMatrix();
  // Snap the shadow camera to its own texel grid, so shadows don't shimmer as the camera slides.
  const texel = (2 * sc) / sun.shadow.mapSize.x;
  const lr = snapOrigin.set(target.x, 0, target.z);
  const u = lr.dot(lightRight), v = lr.dot(lightUp), w = lr.dot(lightDir);
  const snapped = new THREE.Vector3()
    .addScaledVector(lightRight, Math.round(u / texel) * texel)
    .addScaledVector(lightUp, Math.round(v / texel) * texel)
    .addScaledVector(lightDir, w);
  sun.position.copy(snapped).sub(lightDir.clone().multiplyScalar(SUN_DIST));
  sun.target.position.copy(snapped);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
