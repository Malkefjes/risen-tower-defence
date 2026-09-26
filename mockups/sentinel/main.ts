import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EVENING } from "../../src/render/models";
import refUrl from "./ref.png";
import "./style.css";

(document.getElementById("refImg") as HTMLImageElement).src = refUrl;

// Erik's Stone Sentinel rebuilt low poly next to the rock golem, A/B/C, built the way the game would
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
  /** Glowing bits (the eyes): one extra part with an unlit material. */
  eyes?: THREE.BufferGeometry; eyeColor?: string;
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

/**
 * Erik's golem, rebuilt by eye from his render: a gorilla stance with a huge rounded
 * back, a small head sunk low in front (a light muzzle, a heavy brow, glowing eyes),
 * two pale rocks for a chest, shoulders like boulders, arms ringed with pale stones
 * ending in boulder fists that rest on the ground, and stubby pillar legs.
 * `paleA`/`paleB` are the light stones (muzzle, spikes, rings), `chest` the chest rocks.
 */
function golem(name: string, rk: string, rkDark: string, paleA: string, paleB: string, chest: string, eye: string, seed: number): MechDesign {
  const r = (s: number, amt = 0.12) => rough(new THREE.IcosahedronGeometry(0.5, 0), seed + s, amt);
  // The pale protrusions are blunt, chunky stones, not sharp cones.
  const spike = (s: number) => rough(new THREE.IcosahedronGeometry(0.5, 0).scale(1.4, 1.5, 1.4), seed + s, 0.14);
  const body = part([
    // the great back and belly
    piece(r(1), rk, { at: [0, 0.37, -0.04], scale: [0.4, 0.4, 0.36] }),
    piece(r(2), rkDark, { at: [0, 0.2, 0.0], scale: [0.24, 0.14, 0.22] }),
    // chest: two pale rounded rocks
    piece(r(3, 0.1), chest, { at: [0.08, 0.3, 0.12], scale: [0.17, 0.15, 0.12] }),
    piece(r(4, 0.1), chest, { at: [-0.08, 0.3, 0.12], scale: [0.17, 0.15, 0.12] }),
    // head sunk low in front: dark skull, heavy brow, pale muzzle
    piece(r(5), rkDark, { at: [0, 0.47, 0.14], scale: [0.18, 0.14, 0.14] }),
    piece(stone(0.16, 0.035, 0.06, seed + 6, 1), rkDark, { at: [0, 0.49, 0.21], rot: [0.2, 0, 0] }),
    piece(r(7, 0.1), paleA, { at: [0, 0.42, 0.22], scale: [0.2, 0.1, 0.11] }),
    // pale spikes along the back and shoulders
    piece(spike(8), paleA, { at: [0.02, 0.6, -0.08], rot: [-0.3, 0, 0.1], scale: [0.06, 0.09, 0.06] }),
    piece(spike(9), paleB, { at: [-0.12, 0.54, -0.1], rot: [-0.4, 0, 0.5], scale: [0.05, 0.08, 0.05] }),
    piece(spike(10), paleB, { at: [0.12, 0.54, -0.12], rot: [-0.4, 0, -0.5], scale: [0.05, 0.08, 0.05] }),
    piece(spike(11), paleA, { at: [0, 0.5, -0.24], rot: [-1.1, 0, 0], scale: [0.05, 0.08, 0.05] }),
  ]);
  // Arm from the shoulder pivot: a boulder shoulder with a spike, two pale rings, a boulder fist on the ground.
  const armR = part([
    piece(r(12), rk, { at: [0.03, -0.01, 0], scale: [0.24, 0.24, 0.24] }),
    piece(spike(13), paleA, { at: [0.08, 0.12, -0.02], rot: [0, 0, -0.5], scale: [0.05, 0.08, 0.05] }),
    piece(r(14, 0.1), paleB, { at: [0.07, -0.15, 0.01], scale: [0.14, 0.07, 0.13] }),
    piece(r(15, 0.1), paleA, { at: [0.085, -0.205, 0.01], scale: [0.13, 0.065, 0.12] }),
    piece(r(16), rk, { at: [0.1, -0.31, 0.02], scale: [0.22, 0.2, 0.23] }),
    piece(r(17, 0.15), paleB, { at: [0.2, -0.3, 0.05], scale: [0.05, 0.05, 0.05] }),
    piece(spike(18), paleA, { at: [0.14, -0.3, 0.13], rot: [1.2, 0, 0], scale: [0.04, 0.07, 0.04] }),
  ]);
  // Leg from the hip pivot: a short dark thigh into a tall rock pillar, narrow at the top.
  const legR = part([
    piece(r(19), rkDark, { at: [0, -0.02, 0], scale: [0.11, 0.08, 0.11] }),
    piece(stone(0.14, 0.2, 0.14, seed + 20, 0.5, 0.08), rk, { at: [0.01, -0.11, 0.02] }),
  ]);
  const eyes = part([
    piece(box(0.03, 0.015, 0.01), eye, { at: [0.038, 0.47, 0.245], rot: [0, 0, 0.35] }),
    piece(box(0.03, 0.015, 0.01), eye, { at: [-0.038, 0.47, 0.245], rot: [0, 0, -0.35] }),
  ]);
  return { name, body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.2, 0.42, 0], hip: [0.13, 0.21, 0], eyes, eyeColor: eye,
    gait: { speed: 4.4, stride: 0.22, swing: 0.4, bob: 0.03, roll: 0.07, lean: 0.02 } };
}


/**
 * Erik's Stone Sentinel, rebuilt by eye from his model: a round ball of a torso with
 * blunt spikes on top, the head set in the middle of the chest (heavy brow, a stub on
 * top), two chest rocks as a ledge under it, a waist band, legs that strut out to
 * pointed rock pillars, boulder shoulders, two disc rings per arm and studded fists.
 */
function sentinel(name: string, rk: string, rkDark: string, paleA: string, paleB: string, chest: string, eye: string, seed: number): MechDesign {
  const r = (s: number, amt = 0.12) => rough(new THREE.IcosahedronGeometry(0.5, 0), seed + s, amt);
  const ball = (s: number) => rough(new THREE.IcosahedronGeometry(0.5, 1), seed + s, 0.05);
  const spike = (s: number) => rough(new THREE.ConeGeometry(0.75, 1, 5), seed + s, 0.12);
  const body = part([
    // the ball of a torso, with spikes along the top
    piece(ball(1), rk, { at: [0, 0.39, -0.03], scale: [0.34, 0.4, 0.36] }),
    piece(spike(2), paleA, { at: [0, 0.62, -0.02], scale: [0.07, 0.1, 0.07] }),
    piece(spike(3), paleB, { at: [-0.12, 0.56, 0.0], rot: [0, 0, 0.6], scale: [0.06, 0.08, 0.06] }),
    piece(spike(4), paleB, { at: [0.12, 0.56, 0.0], rot: [0, 0, -0.6], scale: [0.06, 0.08, 0.06] }),
    piece(spike(5), paleA, { at: [0, 0.5, -0.2], rot: [-1.0, 0, 0], scale: [0.06, 0.08, 0.06] }),
    piece(r(6, 0.15), paleB, { at: [0.08, 0.48, -0.17], scale: [0.05, 0.05, 0.05] }),
    piece(r(7, 0.15), paleB, { at: [-0.07, 0.42, -0.2], scale: [0.05, 0.05, 0.05] }),
    // the head in the middle of the chest: skull, brow, a stub on top, a pale muzzle
    piece(r(8, 0.1), rkDark, { at: [0, 0.4, 0.19], scale: [0.17, 0.15, 0.13] }),
    piece(stone(0.16, 0.04, 0.06, seed + 9, 1), rkDark, { at: [0, 0.462, 0.225], rot: [0.25, 0, 0] }),
    piece(r(10, 0.12), paleA, { at: [0, 0.485, 0.2], scale: [0.05, 0.045, 0.05] }),
    piece(r(11, 0.1), paleA, { at: [0, 0.36, 0.26], scale: [0.16, 0.07, 0.08] }),
    // chest ledge, waist band
    piece(r(12, 0.1), chest, { at: [0.08, 0.29, 0.17], scale: [0.17, 0.11, 0.11] }),
    piece(r(13, 0.1), chest, { at: [-0.08, 0.29, 0.17], scale: [0.17, 0.11, 0.11] }),
    piece(stone(0.2, 0.07, 0.2, seed + 14, 0.95, 0.06), rkDark, { at: [0, 0.22, 0] }),
  ]);
  // Arm from the shoulder pivot: a boulder shoulder with spikes, two disc rings, a studded fist.
  const armR = part([
    piece(r(15), rk, { at: [0.03, -0.02, 0], scale: [0.22, 0.3, 0.26] }),
    piece(spike(16), paleA, { at: [0.06, 0.15, -0.03], rot: [0, 0, -0.45], scale: [0.05, 0.08, 0.05] }),
    piece(spike(17), paleB, { at: [0.14, 0.05, -0.05], rot: [0, 0, -1.2], scale: [0.045, 0.07, 0.045] }),
    piece(rough(new THREE.CylinderGeometry(0.5, 0.5, 1, 7), seed + 18, 0.08), paleB, { at: [0.06, -0.16, 0.01], scale: [0.1, 0.035, 0.1] }),
    piece(rough(new THREE.CylinderGeometry(0.5, 0.5, 1, 7), seed + 19, 0.08), paleA, { at: [0.065, -0.205, 0.01], scale: [0.11, 0.035, 0.11] }),
    piece(r(20), rk, { at: [0.1, -0.31, 0.02], scale: [0.25, 0.22, 0.24] }),
    piece(r(21, 0.15), paleA, { at: [0.2, -0.29, 0.07], scale: [0.045, 0.045, 0.045] }),
    piece(r(22, 0.15), paleB, { at: [0.12, -0.26, 0.14], scale: [0.04, 0.04, 0.04] }),
    piece(spike(23), paleA, { at: [0.2, -0.36, 0.1], rot: [1.3, 0, -0.4], scale: [0.04, 0.07, 0.04] }),
  ]);
  // Leg from the hip pivot: a strut angling out to a pillar with a jagged, pointed top.
  const legR = part([
    piece(stone(0.05, 0.12, 0.06, seed + 24, 1), rkDark, { at: [0.035, -0.04, 0], rot: [0, 0, 0.9] }),
    piece(stone(0.15, 0.2, 0.15, seed + 25, 0.55, 0.08), rk, { at: [0.08, -0.12, 0.02] }),
    piece(spike(26), rk, { at: [0.06, 0.0, 0.02], scale: [0.05, 0.07, 0.05] }),
  ]);
  const eyes = part([
    piece(box(0.036, 0.017, 0.012), eye, { at: [0.036, 0.418, 0.272], rot: [0, 0, 0.35] }),
    piece(box(0.036, 0.017, 0.012), eye, { at: [-0.036, 0.418, 0.272], rot: [0, 0, -0.35] }),
  ]);
  return { name, body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.22, 0.42, 0], hip: [0.06, 0.22, 0], eyes, eyeColor: eye,
    gait: { speed: 4.4, stride: 0.2, swing: 0.4, bob: 0.03, roll: 0.07, lean: 0.02 } };
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
const designs = [
  golem("Rock golem", "#3d352f", "#2c2622", "#a08c74", "#8d7a63", "#5d6069", "#7fa8ff", 100),
  sentinel("Sentinel", "#3d352f", "#2c2622", "#a08c74", "#8d7a63", "#5d6069", "#7fa8ff", 400),
  sentinel("Sentinel, frost", "#434857", "#30343f", "#f2f4fa", "#d3d9e6", "#7fbfdd", "#8fd8ff", 500),
];
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
  if (d.eyes) tilt.add(new THREE.Mesh(d.eyes, new THREE.MeshBasicMaterial({ color: d.eyeColor, vertexColors: true })));
  root.position.copy(SIDE.clone().multiplyScalar((i - 1) * 1.9));
  scene.add(root);
  const parts = [d.body, d.armR, d.armL, d.legR, d.legL, ...(d.eyes ? [d.eyes] : [])];
  const tris = parts.reduce((a, g) => a + g.attributes.position!.count / 3, 0);
  orc.tag.className = "tag";
  orc.tag.innerHTML = `<b>${"ABC"[i]} &middot; ${d.name}</b><span>${parts.length} parts &middot; ${tris} triangles</span>`;
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
