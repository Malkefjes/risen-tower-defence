import * as THREE from "three";
import { crystalCluster, deadTree } from "../../src/render/alien";
import { bakeStatic } from "../../src/render/bake";
import { createDefaultModels, createGlows, createMaterials, EVENING } from "../../src/render/models";
import { createOreNode } from "../../src/render/ore";
import { createRig, RigAnimator } from "../../src/render/rig";
import { Avatar, defaultAvatarTuning } from "../../src/sim/avatar";
import { nodeCellTop, nodeMax, type OreKind, type OreNode } from "../../src/sim/ore";
import { cellKey } from "../../src/sim/types";
import { rockTop, TREE_HURDLE } from "../../src/sim/world";
import "./style.css";

// World playground: a piece of the planet built in zones around the landing site
// (the clearing, a pine forest belt, rocky highlands with the metal, and the violet
// rift wastes to the north-west). Built in chunks so only what's on screen is drawn.
// No buildings. "New seed" makes another world; the ` key shows performance numbers.

THREE.ColorManagement.enabled = false;

const CAM_OFFSET = new THREE.Vector3(20, 16.33, 20);
const LIGHT_DIR = new THREE.Vector3(-EVENING.sunOffset[0], -EVENING.sunOffset[1], -EVENING.sunOffset[2]).normalize();
const LIGHT_DIST = Math.hypot(...EVENING.sunOffset);
const LIGHT_RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LIGHT_DIR).normalize();
const LIGHT_UP = new THREE.Vector3().crossVectors(LIGHT_DIR, LIGHT_RIGHT).normalize();
/** Beyond the game's own zoom range, the playground zooms out to see the whole world (snow fades away there). */
const OVERVIEW_ZOOM = 70;
/** Half the size of the generated world, in cells. */
const R = 112;
/** Scenery is merged per chunk of this many cells, so chunks off screen are skipped. */
const CHUNK = 16;

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
// Plain snow far beyond the world's edge.
const farGround = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), mat.snow);
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -0.01;
farGround.receiveShadow = true;
scene.add(farGround);
const groundMat = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 1, metalness: 0 });

// ------------------------------------------------------------------ noise

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Smooth value noise in 0..1. */
function noise(seed: number) {
  const h = (x: number, y: number) => { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ zones

/**
 * How much of each zone a point belongs to (0..1 each), from its distance to the
 * landing site and its direction, with wobbly edges so the zones feel grown, not
 * drawn with a compass. The rift wastes lie in one direction (north-west, where the
 * rifts are); the highlands take the far ring everywhere else.
 */
interface Zones { clearing: number; forest: number; highlands: number; wastes: number }
let edgeNoise = noise(1);
const WASTES_DIR = Math.atan2(-1, -1); // north-west on the grid (x east, y south)
function zonesAt(x: number, y: number): Zones {
  const wob = (edgeNoise(x / 18, y / 18) - 0.5) * 16;
  const d = Math.hypot(x, y) + wob;
  const clearing = 1 - smooth(9, 13, d);
  const far = smooth(42, 52, d);
  let da = Math.abs(Math.atan2(y, x) - WASTES_DIR);
  if (da > Math.PI) da = 2 * Math.PI - da;
  const toward = 1 - smooth(0.7, 1.05, da + (edgeNoise(x / 25 + 9, y / 25) - 0.5) * 0.5);
  const wastes = far * toward * smooth(58, 70, d);
  const highlands = far * (1 - wastes / Math.max(1e-6, far));
  const forest = Math.max(0, 1 - clearing - highlands - wastes);
  return { clearing, forest, highlands: Math.max(0, highlands), wastes };
}

// Ground colour per zone: fresh snow in the clearing, bluer shaded snow in the forest,
// grey rocky ground in the highlands, and violet-stained snow in the wastes.
const GROUND = {
  clearing: new THREE.Color("#f1f4fa"),
  forest: new THREE.Color("#dfe3ef"),
  highlands: new THREE.Color("#b9bcc9"),
  highlandsRock: new THREE.Color("#8d909e"),
  wastes: new THREE.Color("#cbbde6"),
  wastesDeep: new THREE.Color("#9c86c9"),
};

// ------------------------------------------------------------------ the world

interface Cell { kind: "tree" | "rock" | "ore" | "crystal"; top: number; node?: OreNode }
const cells = new Map<string, Cell>();
/** Ground kept clear of scenery (around the rifts). */
const reserved = new Set<string>();
const worldGroup = new THREE.Group();
scene.add(worldGroup);
const animated: THREE.Object3D[] = [];
let seed = 1;
try { seed = Number(localStorage.getItem("risen.world.seed")) || 1; } catch { /* storage blocked */ }

function clearWorld(): void {
  worldGroup.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose(); });
  worldGroup.clear();
  cells.clear();
  reserved.clear();
  animated.length = 0;
}

/** Ground for one chunk: a grid of vertices coloured by zone, with patchy variation. */
function groundChunk(cx: number, cy: number, detail: (x: number, y: number) => number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(CHUNK, CHUNK, CHUNK, CHUNK).rotateX(-Math.PI / 2);
  g.translate(cx + CHUNK / 2, 0, cy + CHUNK / 2);
  const pos = g.attributes.position!, col = new Float32Array(pos.count * 3), c = new THREE.Color(), t = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getZ(i), z = zonesAt(x, y), p = detail(x, y);
    c.copy(GROUND.clearing).multiplyScalar(z.clearing);
    c.add(t.copy(GROUND.forest).multiplyScalar(z.forest));
    c.add(t.copy(GROUND.highlands).lerp(GROUND.highlandsRock, smooth(0.55, 0.75, p)).multiplyScalar(z.highlands));
    c.add(t.copy(GROUND.wastes).lerp(GROUND.wastesDeep, smooth(0.5, 0.8, p)).multiplyScalar(z.wastes));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, groundMat);
  m.receiveShadow = true;
  return m;
}

function generate(): void {
  clearWorld();
  edgeNoise = noise(seed * 5 + 3);
  const rand = rng(seed), grove = noise(seed * 3 + 1), rocky = noise(seed * 7 + 2), detail = noise(seed * 11 + 4);
  /** Scenery goes into the chunk it stands in; each chunk is merged at the end. */
  const chunks = new Map<string, THREE.Group>();
  const put = (o: THREE.Object3D, x: number, y: number) => {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
    let g = chunks.get(k);
    if (!g) chunks.set(k, g = new THREE.Group());
    o.position.set(x, 0, y);
    g.add(o);
  };
  const free = (x: number, y: number, pad = 0) => {
    for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
      const k = cellKey(x + dx, y + dy);
      if (cells.has(k) || reserved.has(k)) return false;
    }
    return true;
  };
  const tree = (x: number, y: number, s: number) => {
    cells.set(cellKey(x, y), { kind: "tree", top: TREE_HURDLE });
    put(models.create("tree", { scale: s, seed: x * 17 + y + seed }), x + 0.5, y + 0.5);
  };
  const rock = (x: number, y: number, h: number) => {
    cells.set(cellKey(x, y), { kind: "rock", top: rockTop(h) });
    put(models.create("rock", { scale: h, seed: x * 31 + y + seed }), x + 0.5, y + 0.5);
  };
  const crystal = (x: number, y: number, s: number) => {
    cells.set(cellKey(x, y), { kind: "crystal", top: TREE_HURDLE });
    put(crystalCluster(x * 13 + y + seed, s), x + 0.5, y + 0.5);
  };

  // Two rifts deep in the wastes: landmarks you can see the glow of from afar,
  // with open ground around them and a ring of large crystals.
  for (let i = 0; i < 2; i++) {
    const a = WASTES_DIR + (i ? 0.35 : -0.3), d = 88 + i * 10;
    const x = Math.round(Math.cos(a) * d), y = Math.round(Math.sin(a) * d);
    const r = models.create("rift");
    r.position.set(x + 0.5, 0, y + 0.5);
    worldGroup.add(r);
    animated.push(r);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) reserved.add(cellKey(x + dx, y + dy));
    for (let k = 0; k < 9; k++) {
      const ca = rand() * Math.PI * 2, cd = 3 + rand() * 2.5;
      const cx = Math.floor(x + Math.cos(ca) * cd), cy = Math.floor(y + Math.sin(ca) * cd);
      if (free(cx, cy)) crystal(cx, cy, 1.2 + rand() * 0.4);
    }
  }

  // Ore where it belongs: stone in the forest belt and highland outcrops, metal up
  // in the highlands. The wastes hold none (yet), only crystal.
  const nodes: OreNode[] = [];
  for (let tries = 0; tries < 8000 && nodes.length < 130; tries++) {
    const x = Math.floor((rand() * 2 - 1) * (R - 4)), y = Math.floor((rand() * 2 - 1) * (R - 4));
    const z = zonesAt(x + 1.5, y + 1.5);
    if (z.clearing > 0.05 || z.wastes > 0.3 || !free(x + 1, y + 1, 2)) continue;
    if (nodes.some(n => Math.hypot(n.x - x, n.y - y) < 6)) continue;
    let kind: OreKind;
    if (z.highlands > 0.6) kind = rand() < 0.6 ? "metal" : "stone";
    else if (z.forest > 0.6) kind = "stone";
    else continue;
    const n: OreNode = { id: nodes.length + 1, kind, x, y, amount: nodeMax(kind), max: nodeMax(kind) };
    nodes.push(n);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) cells.set(cellKey(x + dx, y + dy), { kind: "ore", top: nodeCellTop(n, x + dx, y + dy), node: n });
    put(createOreNode(3, seed * 131 + n.id * 17, kind).object, x + 1.5, y + 1.5);
  }

  for (let y = -R; y < R; y++) for (let x = -R; x < R; x++) {
    if (!free(x, y)) continue;
    const z = zonesAt(x + 0.5, y + 0.5);
    if (z.clearing > 0.5) continue;
    const g = grove(x / 7, y / 7), r = rocky(x / 5, y / 5), roll = rand();
    if (z.wastes > 0.5) {
      // Wastes: crystal fields, and dead pines where the forest used to be.
      if (r > 0.62 && roll < (r - 0.55) * 0.9 * z.wastes) crystal(x, y, 0.7 + rand() * 0.6);
      else if (g > 0.6 && roll < 0.12) {
        cells.set(cellKey(x, y), { kind: "tree", top: TREE_HURDLE });
        put(deadTree(x * 7 + y + seed, 0.9 + rand() * 0.3), x + 0.5, y + 0.5);
      } else if (roll < 0.002) rock(x, y, 10 + Math.floor(rand() * 4));
    } else if (z.highlands > 0.5) {
      // Highlands: rock outcrops and boulder fields, only a few hardy pines.
      if (r > 0.74 && roll < (r - 0.7) * 1.6) rock(x, y, 12 + Math.floor(rand() * 5));
      else if (g > 0.72 && roll < 0.12) tree(x, y, 0.8 + rand() * 0.25);
      else if (roll < 0.002) rock(x, y, 10 + Math.floor(rand() * 3));
    } else {
      // Forest belt: dense groves with open glades between them.
      if (g > 0.5 && roll < (g - 0.42) * 1.5) tree(x, y, 0.85 + rand() * 0.35);
      else if (r > 0.86 && roll < 0.15) rock(x, y, 10 + Math.floor(rand() * 5));
      else if (roll < 0.01) tree(x, y, 0.9 + rand() * 0.25);
    }
  }

  // Snow drifts, mostly in the open snowy parts, never in anyone's way.
  for (let i = 0; i < 1400; i++) {
    const x = (rand() * 2 - 1) * R, y = (rand() * 2 - 1) * R;
    if (!free(Math.floor(x), Math.floor(y), 1)) continue;
    const z = zonesAt(x, y);
    if (rand() > z.clearing + z.forest + z.highlands * 0.3) continue;
    put(models.create("snowMound", { scale: 0.3 + rand() * 0.45 }), x, y);
  }

  // Merge each chunk's scenery, and give it its own patch of ground.
  for (let cy = -R; cy < R; cy += CHUNK) for (let cx = -R; cx < R; cx += CHUNK) {
    const g = chunks.get(`${Math.floor(cx / CHUNK)},${Math.floor(cy / CHUNK)}`) ?? new THREE.Group();
    bakeStatic(g);
    g.add(groundChunk(cx, cy, (x, y) => detail(x / 6, y / 6)));
    worldGroup.add(g);
  }
}

// ------------------------------------------------------------------ avatar

const T = defaultAvatarTuning();
const avatar = new Avatar(0.5, 0.5);
/**
 * The avatar collides in eighths of a cell. A tree (or crystal) only blocks you at
 * its trunk, the middle half of its cell, so you can weave through a forest;
 * enemies would still treat the whole cell as blocked (that's what shapes their path).
 */
const SUB = 8, TRUNK_LO = 2, TRUNK_HI = 6;
const heightAt = (sx: number, sy: number) => {
  const cx = Math.floor(sx / SUB), cy = Math.floor(sy / SUB), c = cells.get(cellKey(cx, cy));
  if (!c) return 0;
  if (c.kind === "tree" || c.kind === "crystal") {
    const lx = sx - cx * SUB, ly = sy - cy * SUB;
    return lx >= TRUNK_LO && lx < TRUNK_HI && ly >= TRUNK_LO && ly < TRUNK_HI ? c.top : 0;
  }
  return c.top;
};
const standable = (sx: number, sy: number) => { const k = cells.get(cellKey(Math.floor(sx / SUB), Math.floor(sy / SUB)))?.kind; return k !== "tree" && k !== "crystal"; };
const rig = createRig();
scene.add(rig.object);
const anim = new RigAnimator(rig);

// ------------------------------------------------------------------ input and tools

const keys = new Set<string>();
let jumpQueued = false;
const stats = document.getElementById("stats")!;
let showStats = false;
try { showStats = localStorage.getItem("risen.world.stats") === "1"; } catch { /* storage blocked */ }
stats.hidden = !showStats;
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); if (!e.repeat) jumpQueued = true; return; }
  // The key left of 1 (backquote; on some layouts it arrives as a dead key or §).
  if (e.code === "Backquote" || k === "`" || k === "§") {
    showStats = !showStats; stats.hidden = !showStats;
    try { localStorage.setItem("risen.world.stats", showStats ? "1" : "0"); } catch { /* storage blocked */ }
    return;
  }
  keys.add(k);
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); wantZoom = Math.min(OVERVIEW_ZOOM, Math.max(2.5, wantZoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
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
let acc = 0, last = performance.now(), zoom = 5, wantZoom = 5, time = 0;
let fpsFrames = 0, fpsTime = 0, fps = 0;
const tmp = new THREE.Vector3();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  acc += dt;
  let landed = false;
  while (acc >= TICK) {
    prev.x = avatar.x; prev.y = avatar.y; prev.z = avatar.z; prev.facing = avatar.facing;
    const m = moveInput();
    avatar.step(TICK, { x: m.x, y: m.y, jump: jumpQueued, sprint: keys.has("shift") }, heightAt, T, standable, SUB);
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
  for (const a of animated) (a.userData.update as ((t: number, dt: number) => void) | undefined)?.(time, dt);

  const k = 1 - Math.exp(-dt * 4);
  target.x += (rx - target.x) * k; target.z += (ry - target.z) * k;
  zoom += (wantZoom - zoom) * (1 - Math.exp(-dt * 8));
  // Snow always falls the same way; zoom only changes how many flakes are drawn,
  // fewer when zoomed out, so the snow looks equally dense on screen.
  const fade = 1 - smooth(22, 30, zoom); // the overview is for looking at the land
  const n = Math.round(Math.min(N, SNOW_DENSITY * (SNOW_ZOOM / zoom) ** 2 * (2 * H) ** 2) * fade);
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
  const sc = Math.max(14, Math.min(zoom, 30) * 2.6);
  Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 0.5, far: 80 });
  sun.shadow.camera.updateProjectionMatrix();
  const texel = (2 * sc) / sun.shadow.mapSize.x, p = tmp.set(target.x, 0, target.z);
  const u = Math.round(p.dot(LIGHT_RIGHT) / texel) * texel, v = Math.round(p.dot(LIGHT_UP) / texel) * texel, w = p.dot(LIGHT_DIR);
  const snapped = p.set(0, 0, 0).addScaledVector(LIGHT_RIGHT, u).addScaledVector(LIGHT_UP, v).addScaledVector(LIGHT_DIR, w);
  sun.target.position.copy(snapped);
  sun.position.copy(snapped).addScaledVector(LIGHT_DIR, -LIGHT_DIST);
  renderer.render(scene, camera);

  // Performance numbers (the ` key): frames per second, draw calls and triangles this frame.
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0; }
  const info = renderer.info.render;
  if (showStats) stats.textContent = `${fps.toFixed(0)} fps · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris · zoom ${zoom.toFixed(1)}`;
  (window as unknown as { perf: object }).perf = { fps, calls: info.calls, tris: info.triangles, x: avatar.x, y: avatar.y };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
