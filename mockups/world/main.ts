import * as THREE from "three";
import { bakeStatic } from "../../src/render/bake";
import { createDefaultModels, createGlows, createMaterials, EVENING } from "../../src/render/models";
import { createOreNode } from "../../src/render/ore";
import { createRig, RigAnimator } from "../../src/render/rig";
import { Avatar, defaultAvatarTuning } from "../../src/sim/avatar";
import { nodeCellTop, nodeMax, type OreKind, type OreNode } from "../../src/sim/ore";
import { cellKey } from "../../src/sim/types";
import { rockTop, TREE_HURDLE } from "../../src/sim/world";
import "./style.css";

// World playground: a bigger piece of the planet, made only from what the game has
// today (pines, rocks, ore nodes, snow drifts), to walk around in and judge. No
// buildings. The world is generated from a seed; "New seed" makes another.

THREE.ColorManagement.enabled = false;

const CAM_OFFSET = new THREE.Vector3(20, 16.33, 20);
const LIGHT_DIR = new THREE.Vector3(-EVENING.sunOffset[0], -EVENING.sunOffset[1], -EVENING.sunOffset[2]).normalize();
const LIGHT_DIST = Math.hypot(...EVENING.sunOffset);
const LIGHT_RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LIGHT_DIR).normalize();
const LIGHT_UP = new THREE.Vector3().crossVectors(LIGHT_DIR, LIGHT_RIGHT).normalize();
/** Half the size of the generated world, in cells (the world is 2·R across). */
const R = 36;

const container = document.getElementById("view")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 900);
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
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ generation

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Smooth value noise in 0..1, for groves and outcrops. */
function noise(seed: number) {
  const h = (x: number, y: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

interface Cell { kind: "tree" | "rock" | "ore"; top: number; node?: OreNode }
const cells = new Map<string, Cell>();
const worldGroup = new THREE.Group();
scene.add(worldGroup);
let seed = 1;
try { seed = Number(localStorage.getItem("risen.world.seed")) || 1; } catch { /* storage blocked */ }

function clearWorld(): void {
  worldGroup.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose(); });
  worldGroup.clear();
  cells.clear();
}

/**
 * Today's world, bigger: a clearing in the middle (where a ship would land), pine
 * groves and rock outcrops where the noise says so, a few stone and metal nodes
 * out in the open, and snow drifts everywhere.
 */
function generate(): void {
  clearWorld();
  const rand = rng(seed), grove = noise(seed * 3 + 1), rocky = noise(seed * 7 + 2);
  const free = (x: number, y: number, pad = 0) => {
    for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) if (cells.has(cellKey(x + dx, y + dy))) return false;
    return true;
  };
  const clearing = (x: number, y: number) => Math.hypot(x, y) < 7;
  // Ore nodes first: open ground, away from the clearing and from each other.
  const nodes: OreNode[] = [];
  for (let tries = 0; tries < 400 && nodes.length < 14; tries++) {
    const x = Math.floor((rand() * 2 - 1) * (R - 4)), y = Math.floor((rand() * 2 - 1) * (R - 4));
    if (Math.hypot(x + 1.5, y + 1.5) < 11) continue;
    if (nodes.some(n => Math.hypot(n.x - x, n.y - y) < 9)) continue;
    const kind: OreKind = rand() < 0.35 ? "metal" : "stone";
    const n: OreNode = { id: nodes.length + 1, kind, x, y, amount: nodeMax(kind), max: nodeMax(kind) };
    nodes.push(n);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) cells.set(cellKey(x + dx, y + dy), { kind: "ore", top: nodeCellTop(n, x + dx, y + dy), node: n });
    const m = createOreNode(3, seed * 131 + n.id * 17, kind);
    m.object.position.set(x + 1.5, 0, y + 1.5);
    worldGroup.add(m.object);
  }
  for (let y = -R; y < R; y++) for (let x = -R; x < R; x++) {
    if (clearing(x, y) || !free(x, y)) continue;
    const g = grove(x / 7, y / 7), r = rocky(x / 5, y / 5);
    if (g > 0.62 && rand() < (g - 0.55) * 1.6) {
      const s = 0.85 + rand() * 0.35;
      cells.set(cellKey(x, y), { kind: "tree", top: TREE_HURDLE });
      const t = models.create("tree", { scale: s, seed: x * 17 + y + seed });
      t.position.set(x + 0.5, 0, y + 0.5);
      worldGroup.add(t);
    } else if (r > 0.7 && rand() < (r - 0.62) * 1.4) {
      const h = 10 + Math.floor(rand() * 7);
      cells.set(cellKey(x, y), { kind: "rock", top: rockTop(h) });
      const m = models.create("rock", { scale: h, seed: x * 31 + y + seed });
      m.position.set(x + 0.5, 0, y + 0.5);
      worldGroup.add(m);
    } else if (rand() < 0.012) {
      // A lone pine or boulder out in the open.
      const tree = rand() < 0.6;
      cells.set(cellKey(x, y), tree ? { kind: "tree", top: TREE_HURDLE } : { kind: "rock", top: rockTop(11) });
      const m = tree ? models.create("tree", { scale: 0.9 + rand() * 0.25, seed: x * 17 + y + seed }) : models.create("rock", { scale: 11, seed: x * 31 + y });
      m.position.set(x + 0.5, 0, y + 0.5);
      worldGroup.add(m);
    }
  }
  // Snow drifts: decoration only, never in anyone's way.
  for (let i = 0; i < 260; i++) {
    const x = (rand() * 2 - 1) * (R + 6), z = (rand() * 2 - 1) * (R + 6);
    if (!free(Math.floor(x), Math.floor(z), 1)) continue;
    const m = models.create("snowMound", { scale: 0.3 + rand() * 0.45 });
    m.position.set(x, 0, z);
    worldGroup.add(m);
  }
  bakeStatic(worldGroup);
}

// ------------------------------------------------------------------ avatar

const T = defaultAvatarTuning();
const avatar = new Avatar(0.5, 0.5);
const heightAt = (x: number, y: number) => cells.get(cellKey(x, y))?.top ?? 0;
const standable = (x: number, y: number) => cells.get(cellKey(x, y))?.kind !== "tree";
const rig = createRig();
scene.add(rig.object);
const anim = new RigAnimator(rig);

// ------------------------------------------------------------------ input and tools

const keys = new Set<string>();
let jumpQueued = false;
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); if (!e.repeat) jumpQueued = true; return; }
  keys.add(k);
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); wantZoom = Math.min(24, Math.max(2.5, wantZoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);
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

const tools = document.getElementById("tools")!;
tools.innerHTML = `<button class="chip" id="seed">New seed</button>`;
document.getElementById("seed")!.addEventListener("click", () => {
  seed = Math.floor(Math.random() * 1e6) + 1;
  try { localStorage.setItem("risen.world.seed", String(seed)); } catch { /* storage blocked */ }
  generate();
  avatar.place(0.5, 0.5);
});
generate();

// ------------------------------------------------------------------ snow and loop

/**
 * Snow: flakes per square cell that look right at the default zoom (1400 over
 * ±18 cells), over a field wide enough for the most zoomed-out view. Enough
 * flakes for close zooms, capped so the loop stays cheap.
 */
const SNOW_ZOOM = 5, SNOW_DENSITY = 1400 / (36 * 36), H = Math.ceil(18 * 24 / SNOW_ZOOM);
const N = Math.min(60000, Math.ceil(SNOW_DENSITY * (SNOW_ZOOM / 2.5) ** 2 * (2 * H) ** 2));
const snowPos = new Float32Array(N * 3), snowSpeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 2 * H; snowPos[i * 3 + 1] = Math.random() * 12; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 2 * H;
  snowSpeed[i] = 0.5 + Math.random() * 0.7;
}
const sg = new THREE.BufferGeometry();
sg.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
snow.frustumCulled = false;
scene.add(snow);
const wrap = (v: number, c: number) => ((((v - c + H) % (2 * H)) + 2 * H) % (2 * H)) + c - H;

const TICK = 1 / 60;
const prev = { x: avatar.x, y: avatar.y, z: avatar.z, facing: avatar.facing };
const target = new THREE.Vector3(avatar.x, 0, avatar.y);
let acc = 0, last = performance.now(), zoom = 5, wantZoom = 5;
const tmp = new THREE.Vector3();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let landed = false;
  while (acc >= TICK) {
    prev.x = avatar.x; prev.y = avatar.y; prev.z = avatar.z; prev.facing = avatar.facing;
    const m = moveInput();
    avatar.step(TICK, { x: m.x, y: m.y, jump: jumpQueued, sprint: keys.has("shift") }, heightAt, T, standable);
    jumpQueued = false;
    landed ||= avatar.landed;
    acc -= TICK;
  }
  const alpha = acc / TICK;
  const rx = prev.x + (avatar.x - prev.x) * alpha, ry = prev.y + (avatar.y - prev.y) * alpha;
  rig.object.position.set(rx, prev.z + (avatar.z - prev.z) * alpha, ry);
  const df = Math.atan2(Math.sin(avatar.facing - prev.facing), Math.cos(avatar.facing - prev.facing));
  rig.object.rotation.y = prev.facing + df * alpha;
  anim.update(dt, { speed: avatar.speed, topSpeed: T.speed, grounded: avatar.grounded, vz: avatar.vz, jumpSpeed: (2 * T.jumpHeight) / T.jumpRise, landed, ready: false, mining: false });

  const k = 1 - Math.exp(-dt * 4);
  target.x += (rx - target.x) * k; target.z += (ry - target.z) * k;
  zoom += (wantZoom - zoom) * (1 - Math.exp(-dt * 8));
  // Snow always falls the same way; zoom only changes how many flakes are drawn,
  // fewer when zoomed out, so the snow looks equally dense on screen.
  const n = Math.min(N, Math.round(SNOW_DENSITY * (SNOW_ZOOM / zoom) ** 2 * (2 * H) ** 2));
  sg.setDrawRange(0, n);
  for (let i = 0; i < n; i++) {
    snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
    if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 12;
    snowPos[i * 3] = wrap(snowPos[i * 3]!, target.x);
    snowPos[i * 3 + 2] = wrap(snowPos[i * 3 + 2]!, target.z);
  }
  sg.attributes.position!.needsUpdate = true;
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  Object.assign(camera, { left: -zoom * a, right: zoom * a, top: zoom, bottom: -zoom });
  camera.updateProjectionMatrix();
  // Far enough back that the bottom of a zoomed-out view never dips under the snow (orthographic: distance doesn't change the picture).
  camera.position.copy(target).addScaledVector(CAM_OFFSET, 4);
  camera.lookAt(target.x, 0, target.z);
  // Shadows cover the view, snapped to the shadow map's texels so they don't shimmer.
  const sc = Math.max(14, zoom * 2.6);
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 0.5, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  const texel = (2 * sc) / sun.shadow.mapSize.x, p = tmp.set(target.x, 0, target.z);
  const u = Math.round(p.dot(LIGHT_RIGHT) / texel) * texel, v = Math.round(p.dot(LIGHT_UP) / texel) * texel, w = p.dot(LIGHT_DIR);
  const snapped = p.set(0, 0, 0).addScaledVector(LIGHT_RIGHT, u).addScaledVector(LIGHT_UP, v).addScaledVector(LIGHT_DIR, w);
  sun.target.position.copy(snapped);
  sun.position.copy(snapped).addScaledVector(LIGHT_DIR, -LIGHT_DIST);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
