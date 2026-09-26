import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EVENING } from "../../src/render/models";
import refUrl from "./ref.png";
import "./style.css";

(document.getElementById("refImg") as HTMLImageElement).src = refUrl;

// Erik's mech outline as a rock golem, three ways, A/B/C, built the way the game would
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

/** A box whose top face is scaled (a wedge or flare): `tx`, `tz` scale the top's width and depth. */
function taperBox(w: number, h: number, d: number, tx = 1, tz = 1, shiftZ = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * tx); p.setZ(i, p.getZ(i) * tz + shiftZ); }
  return g;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** An eight-sided block: a box with its upright edges chamfered, like the model's armour. `t` scales the top. */
const octo = (w: number, h: number, d: number, t = 1) =>
  new THREE.CylinderGeometry(0.5 * t, 0.5, 1, 8).rotateY(Math.PI / 8).scale(w / Math.cos(Math.PI / 8), h, d / Math.cos(Math.PI / 8));

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

// ------------------------------------------------------------------ the golem

/** A golem's parts, each built around its pivot, and how it walks. */
interface MechDesign {
  name: string;
  body: THREE.BufferGeometry;
  armR: THREE.BufferGeometry; armL: THREE.BufferGeometry;
  legR: THREE.BufferGeometry; legL: THREE.BufferGeometry;
  shoulder: V3; hip: V3;
  gait: { speed: number; stride: number; swing: number; bob: number; roll: number; lean: number; holdR?: number };
}

/** A small seeded random, so every stone keeps its shape. */
function rand(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
/** Push a shape's corners about (shared corners move together, so it stays closed). */
function rough(g: THREE.BufferGeometry, seed: number, amt: number): THREE.BufferGeometry {
  g.computeBoundingBox();
  const size = g.boundingBox!.getSize(new THREE.Vector3()), p = g.attributes.position!, rnd = rand(seed), moved = new Map<string, V3>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let m = moved.get(k);
    if (!m) m = [p.getX(i) + (rnd() * 2 - 1) * amt * size.x, p.getY(i) + (rnd() * 2 - 1) * amt * size.y, p.getZ(i) + (rnd() * 2 - 1) * amt * size.z];
    moved.set(k, m);
    p.setXYZ(i, ...m);
  }
  return g;
}
/** A hewn stone block with the mech armour's shape: an eight-sided block with its corners knocked about. */
const stone = (w: number, h: number, d: number, seed: number, t = 1, amt = 0.07) => rough(octo(w, h, d, t), seed, amt);
/** A rough round rock (the knee caps). */
const pebble = (r: number, seed: number) => rough(new THREE.IcosahedronGeometry(r, 0), seed, 0.12);
/** A crystal: a stretched octahedron. */
const shard = (r: number, h: number) => new THREE.OctahedronGeometry(r).scale(1, h / r, 1);

/**
 * Erik's mech outline as a golem: the same hunched torso, shoulder pads, forearms,
 * claws and leg bands, hewn from dark rock. The "armour" is the accent (snow, ice or
 * crystal) and the visor becomes a glowing crevice in the stone.
 */
function golem(name: string, accent: string, accentDark: string, core: string, seed: number): MechDesign {
  const rk = "#555a6b", rkDark = "#3f4352", crack = "#17181f", claw = "#4a4e5c";
  const body = part([
    piece(stone(0.28, 0.18, 0.25, seed + 1, 0.8), rk, { at: [0, 0.715, 0.02] }),
    piece(stone(0.2, 0.1, 0.17, seed + 2, 1.42), rkDark, { at: [0, 0.58, 0.02] }),
    // the visor becomes a crooked crevice with a glowing core
    piece(rough(box(0.14, 0.06, 0.03), seed + 20, 0.18), crack, { at: [0, 0.69, 0.14], rot: [0, 0, 0.08] }),
    piece(rough(box(0.1, 0.028, 0.02), seed + 21, 0.2), core, { at: [0, 0.69, 0.152], rot: [0, 0, 0.08] }),
    piece(stone(0.21, 0.18, 0.09, seed + 3, 0.85), rkDark, { at: [0, 0.68, -0.12] }),
    piece(shard(0.03, 0.14), accent, { at: [0.05, 0.8, -0.12], rot: [-0.6, 0, -0.3] }),
    piece(shard(0.025, 0.11), accentDark, { at: [-0.05, 0.79, -0.13], rot: [-0.7, 0, 0.35] }),
    piece(stone(0.14, 0.12, 0.13, seed + 4), rk, { at: [0, 0.46, 0.01] }),
    piece(stone(0.26, 0.05, 0.1, seed + 5), rkDark, { at: [0, 0.47, 0] }),
    piece(stone(0.07, 0.12, 0.2, seed + 6), rkDark, { at: [0.15, 0.68, 0] }),
    piece(stone(0.07, 0.12, 0.2, seed + 7), rkDark, { at: [-0.15, 0.68, 0] }),
  ]);
  const armR = part([
    piece(stone(0.14, 0.19, 0.21, seed + 8, 0.85), accent, { at: [0.02, -0.035, 0] }),
    piece(stone(0.14, 0.035, 0.21, seed + 9), rk, { at: [0.02, -0.125, 0] }),
    piece(stone(0.065, 0.065, 0.075, seed + 10), rkDark, { at: [0.035, -0.15, 0] }),
    piece(stone(0.12, 0.17, 0.14, seed + 11, 1.1), accent, { at: [0.045, -0.255, 0.01] }),
    piece(stone(0.12, 0.03, 0.14, seed + 12), accentDark, { at: [0.045, -0.2, 0.01] }),
    piece(stone(0.08, 0.065, 0.085, seed + 13), rk, { at: [0.045, -0.365, 0.01] }),
    piece(taperBox(0.028, 0.075, 0.033, 0.45, 0.6), claw, { at: [0.02, -0.418, 0.03], rot: [0.25, 0, 0.15] }),
    piece(taperBox(0.028, 0.075, 0.033, 0.45, 0.6), claw, { at: [0.07, -0.418, 0.03], rot: [0.25, 0, -0.15] }),
    piece(taperBox(0.028, 0.065, 0.033, 0.45, 0.6), claw, { at: [0.045, -0.412, -0.03], rot: [-0.3, 0, 0] }),
  ]);
  const legR = part([
    piece(stone(0.125, 0.115, 0.135, seed + 14, 1.05), rk, { at: [0, -0.055, 0] }),
    piece(stone(0.13, 0.075, 0.14, seed + 15), accent, { at: [0, -0.14, 0.005] }),
    piece(pebble(0.047, seed + 16), rkDark, { at: [0, -0.2, 0.06], scale: [1, 1, 0.75] }),
    piece(stone(0.095, 0.19, 0.105, seed + 17, 1.15), rk, { at: [0, -0.27, -0.005] }),
    piece(stone(0.12, 0.065, 0.135, seed + 18), accent, { at: [0, -0.385, 0.01] }),
    piece(stone(0.135, 0.07, 0.215, seed + 19, 0.85), rkDark, { at: [0, -0.455, 0.035] }),
  ]);
  return { name, body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.19, 0.72, 0.01], hip: [0.1, 0.49, 0],
    gait: { speed: 5, stride: 0.32, swing: 0.3, bob: 0.035, roll: 0.06, lean: 0.12 } };
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

interface Mech {
  design: MechDesign; root: THREE.Group; tilt: THREE.Group; body: THREE.Mesh;
  armR: THREE.Mesh; armL: THREE.Mesh; legR: THREE.Mesh; legL: THREE.Mesh;
  mat: THREE.MeshStandardMaterial; phase: number; flash: number; nextHit: number; tag: HTMLElement;
}

const tagsEl = document.getElementById("tags")!;
const orcs: Mech[] = [];
const designs = [golem("Snow-packed", "#f2f4fa", "#c9cfdd", "#ffb54a", 100), golem("Ice-plated", "#7cc8e8", "#4f9fc6", "#dff6ff", 200), golem("Violet crystal", "#8d62cf", "#6a45a6", "#e3c9ff", 300)];
// Along the screen's horizontal (screen right is +x -z in the world).
const SIDE = new THREE.Vector3(1, 0, -1).normalize();
designs.forEach((d, i) => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.05, emissive: "#ffffff", emissiveIntensity: 0 });
  const mk = (g: THREE.BufferGeometry, at: V3) => { const o = new THREE.Mesh(g, m); o.position.set(...at); o.castShadow = true; return o; };
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt);
  const [sx, sy, sz] = d.shoulder, [hx, hy, hz] = d.hip;
  const orc: Mech = {
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
