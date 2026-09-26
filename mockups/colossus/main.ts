import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EVENING } from "../../src/render/models";
import glbUrl from "./colossus.glb?url";
import "./style.css";

// Erik's Stonebound Colossus, his own 705-triangle mesh, made game-ready: cut into
// five parts that can move (body, two arms, two legs) around shoulder and hip pivots,
// and coloured by rule (rock on the sides, a second colour on faces that point up,
// darker underneath), plus glowing eyes. One material per golem, colours in the vertices.

THREE.ColorManagement.enabled = false;

type V3 = [number, number, number];

interface MechDesign {
  name: string;
  body: THREE.BufferGeometry;
  armR: THREE.BufferGeometry; armL: THREE.BufferGeometry;
  legR: THREE.BufferGeometry; legL: THREE.BufferGeometry;
  shoulder: V3; hip: V3;
  eyes?: THREE.BufferGeometry; eyeColor?: string;
  gait: { speed: number; stride: number; swing: number; bob: number; roll: number; lean: number; holdR?: number };
}

/** A small seeded random. */
function rand(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// The model stands 1.83 tall, centred on the origin; the game wants a Grunt about 0.8 tall standing on y = 0.
const SCALE = 0.8 / 1.833, LIFT = 0.917;
// A rough skeleton in the model's own units: each triangle goes to the nearest bone.
// The torso is thick, so it gets a head start over the thin limbs.
const SHOULDER = 0.42, SHOULDER_Y = 0.55, HIP = 0.17, HIP_Y = -0.02;
const BONES: { part: "body" | "armR" | "armL" | "legR" | "legL"; a: V3; b: V3; bonus: number }[] = [
  { part: "body", a: [0, -0.05, 0], b: [0, 0.8, 0], bonus: 0.12 },
  { part: "armR", a: [SHOULDER, SHOULDER_Y, 0], b: [0.7, -0.35, 0], bonus: 0 },
  { part: "armL", a: [-SHOULDER, SHOULDER_Y, 0], b: [-0.7, -0.35, 0], bonus: 0 },
  { part: "legR", a: [HIP, HIP_Y, 0], b: [0.33, -0.85, 0], bonus: 0 },
  { part: "legL", a: [-HIP, HIP_Y, 0], b: [-0.33, -0.85, 0], bonus: 0 },
];
function segDist(p: THREE.Vector3, a: V3, b: V3): number {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), ab = B.clone().sub(A);
  const t = THREE.MathUtils.clamp(p.clone().sub(A).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(A.addScaledVector(ab, t));
}

/**
 * Cut the mesh into parts and colour it. `side`, `top`, `under`: rock on the sides,
 * the colour of faces that point up, and faces that point down.
 */
function colossus(src: THREE.BufferGeometry, name: string, side: [string, string], top: string, under: string, eye: string, seed: number): MechDesign {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const p = g.attributes.position!, rnd = rand(seed);
  const pivots: Record<string, V3> = {
    body: [0, 0, 0], armR: [SHOULDER, SHOULDER_Y, 0], armL: [-SHOULDER, SHOULDER_Y, 0], legR: [HIP, HIP_Y, 0], legL: [-HIP, HIP_Y, 0],
  };
  const out: Record<string, { pos: number[]; col: number[] }> = {};
  for (const k of Object.keys(pivots)) out[k] = { pos: [], col: [] };
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], n = new THREE.Vector3(), c = new THREE.Vector3();
  // The low evening sun barely lights faces that point up, so their colour is pushed
  // past 1 to read as bright snow or ice (vertex colours may go above white).
  const sides = side.map(h => new THREE.Color(h)), topC = new THREE.Color(top).multiplyScalar(1.6), underC = new THREE.Color(under);
  let headZ = -1;
  for (let t = 0; t < p.count; t += 3) {
    for (let k = 0; k < 3; k++) tri[k]!.fromBufferAttribute(p, t + k);
    c.copy(tri[0]!).add(tri[1]!).add(tri[2]!).divideScalar(3);
    n.copy(tri[1]!).sub(tri[0]!).cross(tri[2]!.clone().sub(tri[0]!)).normalize();
    let best = BONES[0]!, bestD = Infinity;
    for (const bone of BONES) { const d = segDist(c, bone.a, bone.b) - bone.bonus; if (d < bestD) { bestD = d; best = bone; } }
    // Faces that point up catch the second colour, faces that point down go dark; a light touch of variation on the sides.
    const col = n.y > 0.38 ? topC : n.y < -0.35 ? underC : sides[rnd() < 0.8 ? 0 : 1]!;
    const piv = pivots[best.part]!, o = out[best.part]!;
    for (const v of tri) { o.pos.push((v.x - piv[0]) * SCALE, (v.y - piv[1]) * SCALE, (v.z - piv[2]) * SCALE); o.col.push(col.r, col.g, col.b); }
    if (best.part === "body" && Math.abs(c.x) < 0.12 && c.y > 0.4 && c.y < 0.7) headZ = Math.max(headZ, c.z);
  }
  const geo = (k: string) => {
    const b = new THREE.BufferGeometry();
    b.setAttribute("position", new THREE.Float32BufferAttribute(out[k]!.pos, 3));
    b.setAttribute("color", new THREE.Float32BufferAttribute(out[k]!.col, 3));
    b.computeVertexNormals();
    // The body's pivot is the origin: stand it on the ground.
    if (k === "body") b.translate(0, LIFT * SCALE, 0);
    return b;
  };
  // Two glowing eyes on the front of the head.
  const eyeY = (0.56 + LIFT) * SCALE, eyeZ = (headZ + 0.03) * SCALE;
  const eyes = new THREE.BufferGeometry();
  const e1 = new THREE.BoxGeometry(0.04, 0.018, 0.012).toNonIndexed().rotateZ(0.3).translate(0.04, eyeY, eyeZ);
  const e2 = new THREE.BoxGeometry(0.04, 0.018, 0.012).toNonIndexed().rotateZ(-0.3).translate(-0.04, eyeY, eyeZ);
  eyes.setAttribute("position", new THREE.Float32BufferAttribute([...e1.attributes.position!.array, ...e2.attributes.position!.array], 3));
  const white = new Array(eyes.attributes.position!.count * 3).fill(1);
  eyes.setAttribute("color", new THREE.Float32BufferAttribute(white, 3));
  const at = (v: V3): V3 => [v[0] * SCALE, (v[1] + LIFT) * SCALE, v[2] * SCALE];
  return {
    name, body: geo("body"), armR: geo("armR"), armL: geo("armL"), legR: geo("legR"), legL: geo("legL"),
    // The mockup places arms and legs at +x and mirrored -x; these pivots are symmetric.
    shoulder: at([SHOULDER, SHOULDER_Y, 0]), hip: at([HIP, HIP_Y, 0]), eyes, eyeColor: eye,
    gait: { speed: 5, stride: 0.3, swing: 0.32, bob: 0.03, roll: 0.06, lean: 0.06 },
  };
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
function show(designs: MechDesign[]): void {
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
}

new GLTFLoader().load(glbUrl, gltf => {
  let src: THREE.BufferGeometry | null = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !src) src = m.geometry.clone().applyMatrix4(m.matrixWorld); });
  show([
    colossus(src!, "Snow-capped", ["#5a5f70", "#555a6b"], "#f2f4fa", "#3a3d4a", "#8fd8ff", 1),
    colossus(src!, "Ice-crusted", ["#3f4454", "#3b4050"], "#86cbe6", "#2a2d38", "#bfeaff", 2),
    colossus(src!, "Your golem's colours", ["#3d352f", "#413832"], "#a08c74", "#2a2420", "#7fa8ff", 3),
  ]);
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
