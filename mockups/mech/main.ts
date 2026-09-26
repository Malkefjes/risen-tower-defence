import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EVENING } from "../../src/render/models";
import refUrl from "./ref.png";
import "./style.css";

(document.getElementById("refImg") as HTMLImageElement).src = refUrl;

// Erik's mech model rebuilt low poly in three accent colours, A/B/C, built the way the game would
// build them: five rigid parts each (body with head, two arms, two legs), every part
// one geometry with its colours in the vertices, one material per mech. In the game
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
const ball = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);

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

// ------------------------------------------------------------------ the mech

/** A mech's parts, each built around its pivot, and how it walks. */
interface MechDesign {
  name: string;
  body: THREE.BufferGeometry;
  armR: THREE.BufferGeometry; armL: THREE.BufferGeometry;
  legR: THREE.BufferGeometry; legL: THREE.BufferGeometry;
  shoulder: V3; hip: V3;
  gait: { speed: number; stride: number; swing: number; bob: number; roll: number; lean: number; holdR?: number };
}

/**
 * Erik's mech, rebuilt by eye from his model: a hunched cockpit torso with a yellow
 * visor, big armour on the shoulders and forearms, claw hands, armour bands at the
 * knees and ankles. `accent` is the armour colour; the rest stays.
 */
function mech(name: string, accent: string, accentDark: string): MechDesign {
  const hull = "#3e6962", hullDark = "#2e4f4a", joint = "#222828", claw = "#565a52", visor = "#ffd257", frame = "#171c1b";
  const body = part([
    // the cockpit torso: an upper block narrowing to the top, a chin narrowing down
    piece(octo(0.27, 0.17, 0.24, 0.8), hull, { at: [0, 0.715, 0.02] }),
    piece(octo(0.19, 0.1, 0.17, 1.42), hullDark, { at: [0, 0.58, 0.02] }),
    piece(box(0.12, 0.075, 0.03), frame, { at: [0, 0.69, 0.14] }),
    piece(box(0.085, 0.05, 0.02), visor, { at: [0, 0.69, 0.152] }),
    piece(taperBox(0.2, 0.17, 0.08, 0.85, 1), hullDark, { at: [0, 0.68, -0.12] }),
    // waist and hips
    piece(box(0.13, 0.12, 0.13), hull, { at: [0, 0.46, 0.01] }),
    piece(box(0.25, 0.05, 0.1), joint, { at: [0, 0.47, 0] }),
    piece(box(0.07, 0.12, 0.2), joint, { at: [0.15, 0.68, 0] }),
    piece(box(0.07, 0.12, 0.2), joint, { at: [-0.15, 0.68, 0] }),
  ]);
  // Arm from the shoulder pivot: a big armoured pad, a dark elbow, an armoured forearm, a claw.
  const armR = part([
    piece(octo(0.13, 0.18, 0.2, 0.85), accent, { at: [0.02, -0.035, 0] }),
    piece(box(0.132, 0.03, 0.2), hull, { at: [0.02, -0.12, 0] }),
    piece(box(0.06, 0.06, 0.07), joint, { at: [0.035, -0.15, 0] }),
    piece(octo(0.11, 0.17, 0.13, 1.1), accent, { at: [0.045, -0.255, 0.01] }),
    piece(box(0.112, 0.025, 0.132), accentDark, { at: [0.045, -0.2, 0.01] }),
    piece(box(0.075, 0.06, 0.08), hull, { at: [0.045, -0.365, 0.01] }),
    piece(taperBox(0.025, 0.07, 0.03, 0.5, 0.6), claw, { at: [0.02, -0.415, 0.03], rot: [0.25, 0, 0.15] }),
    piece(taperBox(0.025, 0.07, 0.03, 0.5, 0.6), claw, { at: [0.07, -0.415, 0.03], rot: [0.25, 0, -0.15] }),
    piece(taperBox(0.025, 0.06, 0.03, 0.5, 0.6), claw, { at: [0.045, -0.41, -0.03], rot: [-0.3, 0, 0] }),
  ]);
  // Leg from the hip pivot: thigh, knee band, a round knee cap, shin, ankle band, a long foot.
  const legR = part([
    piece(octo(0.12, 0.11, 0.13, 1.05), hull, { at: [0, -0.055, 0] }),
    piece(octo(0.125, 0.075, 0.135), accent, { at: [0, -0.14, 0.005] }),
    piece(ball(0.045), hullDark, { at: [0, -0.2, 0.06], scale: [1, 1, 0.7] }),
    piece(octo(0.09, 0.19, 0.1, 1.15), hull, { at: [0, -0.27, -0.005] }),
    piece(octo(0.115, 0.065, 0.13), accent, { at: [0, -0.385, 0.01] }),
    piece(taperBox(0.13, 0.07, 0.21, 0.85, 0.85, 0.01), hullDark, { at: [0, -0.455, 0.035] }),
  ]);
  return { name, body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.19, 0.72, 0.01], hip: [0.1, 0.49, 0],
    gait: { speed: 5.8, stride: 0.34, swing: 0.28, bob: 0.03, roll: 0.045, lean: 0.12 } };
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
const designs = [mech("Original colours", "#e2873a", "#b86a2c"), mech("Violet", "#7a55b5", "#5e3f8f"), mech("Rust red", "#9a3a30", "#772c24")];
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
