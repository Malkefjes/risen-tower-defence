import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EVENING } from "../../src/render/models";
import "./style.css";

// Pass 2 of the enemy looks: three golem Grunts, A/B/C, built the way the game would
// build them: five rigid parts each (body with head, two arms, two legs), every part
// one geometry with its colours in the vertices, one material per golem. In the game
// each part would be instanced, so a whole raid of one type costs five draw calls.

THREE.ColorManagement.enabled = false;

// ------------------------------------------------------------------ geometry kit

type V3 = [number, number, number];
interface At { at?: V3; rot?: V3; scale?: V3 }

/** Give a primitive one flat colour and place it; the result is ready to merge. */
function piece(g: THREE.BufferGeometry, hex: string, { at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] }: At = {}): THREE.BufferGeometry {
  const out = (g.index ? g.toNonIndexed() : g);
  out.deleteAttribute("uv");
  out.deleteAttribute("normal");
  const c = new THREE.Color(hex), n = out.attributes.position!.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  out.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  out.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  return out;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Merge pieces into one part; flat normals give the faceted low-poly look. */
function part(pieces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(pieces)!;
  g.computeVertexNormals();
  return g;
}
/** Mirror a part left to right (for the other arm or leg). */
function mirror(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone().applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const p = m.attributes.position!;
  // Scaling by -1 turns the triangles inside out: swap two corners of each.
  for (let i = 0; i < p.count; i += 3) for (let k = 0; k < 3; k++) {
    const a = p.getComponent(i + 1, k); p.setComponent(i + 1, k, p.getComponent(i + 2, k)); p.setComponent(i + 2, k, a);
  }
  const c = m.attributes.color!;
  for (let i = 0; i < c.count; i += 3) for (let k = 0; k < 3; k++) {
    const a = c.getComponent(i + 1, k); c.setComponent(i + 1, k, c.getComponent(i + 2, k)); c.setComponent(i + 2, k, a);
  }
  m.computeVertexNormals();
  return m;
}

// ------------------------------------------------------------------ the golems

/** A golem's parts, each built around its pivot, and how it walks. */
interface GolemDesign {
  name: string;
  body: THREE.BufferGeometry;
  armR: THREE.BufferGeometry; armL: THREE.BufferGeometry;
  legR: THREE.BufferGeometry; legL: THREE.BufferGeometry;
  shoulder: V3; hip: V3;
  gait: { speed: number; stride: number; swing: number; bob: number; roll: number; lean: number; holdR?: number };
}

/** A small seeded random, so every rock keeps its shape. */
function rand(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
/** A rough rock: an icosahedron with its corners pushed about (shared corners move together, so it stays closed). */
function rock(r: number, seed: number, amt = 0.28, detail = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position!, rnd = rand(seed), moved = new Map<string, V3>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let m = moved.get(k);
    if (!m) { const f = 1 + (rnd() * 2 - 1) * amt; m = [p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f]; moved.set(k, m); }
    p.setXYZ(i, ...m);
  }
  return g;
}
/** A crystal: a stretched octahedron. */
const shard = (r: number, h: number) => new THREE.OctahedronGeometry(r).scale(1, h / r, 1);

/** A: the Boulder. Heavy rock with a snow-capped back, a head sunk between the shoulders, huge stone fists. */
function boulder(): GolemDesign {
  const rk = "#5a5f74", dark = "#3e4152", light = "#747a91", snow = "#ffffff", ice = "#7cc8e8", eye = "#e6f7ff";
  const body = part([
    piece(rock(0.24, 1), rk, { at: [0, 0.42, 0], scale: [1.2, 0.95, 0.95] }),
    piece(rock(0.17, 2), dark, { at: [0, 0.26, 0.02], scale: [1.1, 0.9, 1] }),
    piece(rock(0.13, 3), light, { at: [0.2, 0.54, -0.02] }),
    piece(rock(0.13, 4), light, { at: [-0.2, 0.54, -0.02] }),
    piece(rock(0.22, 5, 0.18), snow, { at: [0, 0.63, -0.08], scale: [1.2, 0.36, 0.9] }),
    piece(rock(0.1, 6), dark, { at: [0, 0.57, 0.14], scale: [1.1, 0.95, 1] }),
    piece(box(0.05, 0.022, 0.02), eye, { at: [0.035, 0.58, 0.225] }),
    piece(box(0.05, 0.022, 0.02), eye, { at: [-0.035, 0.58, 0.225] }),
    piece(shard(0.035, 0.16), ice, { at: [0.08, 0.66, -0.16], rot: [-0.5, 0, -0.3] }),
    piece(shard(0.03, 0.12), ice, { at: [-0.07, 0.65, -0.18], rot: [-0.6, 0, 0.35] }),
    piece(shard(0.025, 0.1), ice, { at: [0.0, 0.62, -0.22], rot: [-0.9, 0, 0] }),
  ]);
  const armR = part([
    piece(rock(0.085, 7), rk, { at: [0.02, -0.08, 0] }),
    piece(rock(0.09, 8), dark, { at: [0.03, -0.2, 0.01] }),
    piece(rock(0.14, 9, 0.22), rk, { at: [0.04, -0.34, 0.03], scale: [1, 0.9, 1.1] }),
    piece(rock(0.09, 10, 0.2), snow, { at: [0.04, -0.24, 0.02], scale: [1.25, 0.35, 1.15] }),
  ]);
  const legR = part([
    piece(rock(0.1, 11), dark, { at: [0, -0.08, 0], scale: [1, 1.25, 1] }),
    piece(rock(0.1, 12, 0.15), rk, { at: [0, -0.17, 0.03], scale: [1.1, 0.5, 1.3] }),
  ]);
  return { name: "Boulder", body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.3, 0.5, 0.02], hip: [0.11, 0.2, 0],
    gait: { speed: 4.6, stride: 0.42, swing: 0.4, bob: 0.045, roll: 0.12, lean: 0.1 } };
}

/** B: the Shard. Ice crystals grown over a dark stone core; a crown of shards for a head, blade arms. */
function sentinel(): GolemDesign {
  const ice = "#a6e1f5", mid = "#62b3d8", deep = "#3a7fad", core = "#2f3344", coreLight = "#4a5068", eye = "#e9f8ff";
  const body = part([
    piece(rock(0.16, 21, 0.2), core, { at: [0, 0.4, 0], scale: [1.1, 1.1, 0.9] }),
    piece(shard(0.11, 0.3), ice, { at: [0, 0.42, 0.1], rot: [0.35, 0, 0] }),
    piece(shard(0.08, 0.26), mid, { at: [0.15, 0.52, -0.02], rot: [0, 0, -0.55] }),
    piece(shard(0.08, 0.26), mid, { at: [-0.15, 0.52, -0.02], rot: [0, 0, 0.55] }),
    piece(shard(0.06, 0.2), deep, { at: [0.07, 0.48, -0.14], rot: [-0.6, 0, -0.3] }),
    piece(shard(0.06, 0.22), ice, { at: [-0.06, 0.5, -0.15], rot: [-0.7, 0, 0.3] }),
    piece(rock(0.09, 22, 0.15), coreLight, { at: [0, 0.22, 0], scale: [1.4, 0.8, 1.1] }),
    // head: a dark wedge with eye slits, under a crown of shards
    piece(rock(0.075, 23, 0.15), core, { at: [0, 0.62, 0.06] }),
    piece(box(0.1, 0.018, 0.02), eye, { at: [0, 0.625, 0.13] }),
    piece(shard(0.04, 0.18), ice, { at: [0, 0.74, 0.03], rot: [-0.15, 0, 0] }),
    piece(shard(0.03, 0.13), mid, { at: [0.06, 0.7, 0.02], rot: [0, 0, -0.5] }),
    piece(shard(0.03, 0.13), mid, { at: [-0.06, 0.7, 0.02], rot: [0, 0, 0.5] }),
  ]);
  const armR = part([
    piece(rock(0.065, 24, 0.2), core, { at: [0.01, -0.04, 0] }),
    piece(shard(0.06, 0.34), ice, { at: [0.03, -0.24, 0.03], rot: [0.12, 0, 0.08] }),
    piece(shard(0.035, 0.16), deep, { at: [0.07, -0.18, -0.02], rot: [0, 0, 0.5] }),
  ]);
  const legR = part([
    piece(shard(0.06, 0.2), mid, { at: [0, -0.07, 0] }),
    piece(rock(0.07, 25, 0.15), core, { at: [0, -0.15, 0.02], scale: [1.1, 0.55, 1.35] }),
  ]);
  return { name: "Shard", body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.24, 0.52, 0], hip: [0.09, 0.19, 0],
    gait: { speed: 6, stride: 0.45, swing: 0.3, bob: 0.02, roll: 0.035, lean: 0.06 } };
}

/** C: the Cairn. Flat stones stacked into a body, a round stone head with a dark slit, arms of hanging pebbles. */
function cairn(): GolemDesign {
  const s1 = "#6f685c", s2 = "#4f4a43", s3 = "#857d6e", s4 = "#5d5a6b", snow = "#ffffff", gap = "#16141a", lichen = "#7d9a45";
  const flat = (r: number, seed: number, hex: string, y: number, turn: number, dx = 0, dz = 0) =>
    piece(rock(r, seed, 0.18), hex, { at: [dx, y, dz], rot: [0, turn, 0.04 * Math.sin(seed)], scale: [1, 0.42, 0.9] });
  const body = part([
    flat(0.2, 31, s2, 0.24, 0.2),
    flat(0.22, 32, s1, 0.34, 1.1, 0.01, -0.01),
    flat(0.2, 33, s3, 0.45, 0.4, -0.01, 0.01),
    flat(0.17, 34, s4, 0.55, 1.4, 0.01, 0),
    piece(rock(0.05, 35, 0.2), lichen, { at: [0.12, 0.37, 0.12], scale: [1.3, 0.5, 1] }),
    // head: a round stone with a dark slit, capped with snow
    piece(rock(0.11, 36, 0.12, 1), s1, { at: [0, 0.68, 0.02] }),
    piece(box(0.11, 0.025, 0.04), gap, { at: [0, 0.68, 0.115] }),
    piece(rock(0.09, 37, 0.15), snow, { at: [0, 0.76, 0.0], scale: [1.2, 0.38, 1.15] }),
  ]);
  const armR = part([
    piece(rock(0.06, 38, 0.2), s3, { at: [0.02, -0.04, 0], scale: [1, 0.7, 1] }),
    piece(rock(0.055, 39, 0.2), s2, { at: [0.025, -0.13, 0.01], scale: [1, 0.7, 1] }),
    piece(rock(0.06, 40, 0.2), s4, { at: [0.03, -0.22, 0.01], scale: [1, 0.7, 1] }),
    piece(rock(0.09, 41, 0.22), s1, { at: [0.035, -0.33, 0.02] }),
  ]);
  const legR = part([
    piece(rock(0.075, 42, 0.18), s2, { at: [0, -0.06, 0], scale: [1, 0.75, 1] }),
    piece(rock(0.085, 43, 0.15), s1, { at: [0, -0.15, 0.02], scale: [1.1, 0.5, 1.3] }),
  ]);
  return { name: "Cairn", body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.25, 0.5, 0], hip: [0.09, 0.2, 0],
    gait: { speed: 5, stride: 0.38, swing: 0.55, bob: 0.03, roll: 0.09, lean: 0.04 } };
}

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
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.position.set(...EVENING.sunOffset);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 });
scene.add(sun, sun.target);
// The game's snow reads near white in play; lift this plain plane to match it.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: EVENING.snow, roughness: 1, emissive: "#d8cfe6", emissiveIntensity: 0.45 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
// Faint cells, so their size on the grid can be judged.
const grid = new THREE.GridHelper(40, 40, 0xb9bfd6, 0xb9bfd6);
grid.position.set(0.5, 0.004, 0.5);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.35;
scene.add(grid);

interface Golem {
  design: GolemDesign; root: THREE.Group; tilt: THREE.Group; body: THREE.Mesh;
  armR: THREE.Mesh; armL: THREE.Mesh; legR: THREE.Mesh; legL: THREE.Mesh;
  mat: THREE.MeshStandardMaterial; phase: number; flash: number; nextHit: number; tag: HTMLElement;
}

const tagsEl = document.getElementById("tags")!;
const orcs: Golem[] = [];
const designs = [boulder(), sentinel(), cairn()];
// Along the screen's horizontal (screen right is +x -z in the world).
const SIDE = new THREE.Vector3(1, 0, -1).normalize();
designs.forEach((d, i) => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.05, emissive: "#ffffff", emissiveIntensity: 0 });
  const mk = (g: THREE.BufferGeometry, at: V3) => { const o = new THREE.Mesh(g, m); o.position.set(...at); o.castShadow = true; return o; };
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt);
  const [sx, sy, sz] = d.shoulder, [hx, hy, hz] = d.hip;
  const orc: Golem = {
    design: d, root, tilt, mat: m, phase: i * 1.3, flash: 0, nextHit: 1.5 + i * 0.9,
    // The unmirrored parts are built reaching out along +x, so they go on that side.
    body: mk(d.body, [0, 0, 0]), armR: mk(d.armR, [sx, sy, sz]), armL: mk(d.armL, [-sx, sy, sz]),
    legR: mk(d.legR, [hx, hy, hz]), legL: mk(d.legL, [-hx, hy, hz]),
    tag: document.createElement("div"),
  };
  tilt.add(orc.body, orc.armR, orc.armL, orc.legR, orc.legL);
  root.position.copy(SIDE.clone().multiplyScalar((i - 1) * 1.75));
  scene.add(root);
  const tris = [d.body, d.armR, d.armL, d.legR, d.legL].reduce((a, g) => a + g.attributes.position!.count / 3, 0);
  orc.tag.className = "tag";
  orc.tag.innerHTML = `<b>${"ABC"[i]} &middot; ${d.name}</b><span>5 parts &middot; ${tris} triangles</span>`;
  tagsEl.appendChild(orc.tag);
  orcs.push(orc);
});

function resize(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  renderer.setSize(w, h);
  // Fit the row of three with a little room either side.
  const half = Math.max(1.05, 2.75 / aspect);
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
  camera.position.copy(CAM_DIR).multiplyScalar(30).add(new THREE.Vector3(0, 0.4, 0));
  camera.lookAt(0, 0.4, 0);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ------------------------------------------------------------------ animation

let last = performance.now(), clock = 0;
const v = new THREE.Vector3();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  for (const o of orcs) {
    const g = o.design.gait;
    o.phase += dt * g.speed;
    const s = Math.sin(o.phase), c = Math.cos(o.phase);
    // They walk in place, slowly turning, so every side shows.
    o.root.rotation.y = clock * 0.35 + 0.6;
    o.legR.rotation.x = s * g.stride;
    o.legL.rotation.x = -s * g.stride;
    o.armR.rotation.x = -s * g.swing * (g.holdR ? 0.35 : 1) - (g.holdR ?? 0);
    o.armL.rotation.x = s * g.swing;
    o.armR.rotation.z = 0.08; o.armL.rotation.z = -0.08;
    o.tilt.position.y = Math.abs(c) * g.bob;
    o.tilt.rotation.z = s * g.roll;
    // A hit every few seconds: a white flash and a small knock back.
    o.nextHit -= dt;
    if (o.nextHit <= 0) { o.flash = 1; o.nextHit = 2.6 + Math.random() * 1.2; }
    o.flash = Math.max(0, o.flash - dt * 7);
    o.mat.emissiveIntensity = o.flash * 0.6;
    o.tilt.rotation.x = g.lean - o.flash * 0.22;
    // The label sits under its orc.
    v.copy(o.root.position).setY(-0.12).project(camera);
    o.tag.style.left = `${(v.x * 0.5 + 0.5) * container.clientWidth}px`;
    o.tag.style.top = `${(-v.y * 0.5 + 0.5) * container.clientHeight + 18}px`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
