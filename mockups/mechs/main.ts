import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EVENING } from "../../src/render/models";
import "./style.css";

// Pass 4 of the enemy looks: three mech Grunts, A/B/C, built the way the game would
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
const ball = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);
const rod = (rTop: number, rBot: number, h: number, seg = 6) => new THREE.CylinderGeometry(rTop, rBot, h, seg);

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

// ------------------------------------------------------------------ the mechs

/** A mech's parts, each built around its pivot, and how it walks. */
interface MechDesign {
  name: string;
  body: THREE.BufferGeometry;
  armR: THREE.BufferGeometry; armL: THREE.BufferGeometry;
  legR: THREE.BufferGeometry; legL: THREE.BufferGeometry;
  shoulder: V3; hip: V3;
  gait: { speed: number; stride: number; swing: number; bob: number; roll: number; lean: number; holdR?: number };
}

const GUN = "#3d4252", DARK = "#262a35", PLATE = "#d4cebe", PLATE2 = "#b3ad9f", JOINT = "#1b1e26", STRIPE = "#8458c4", OPTIC = "#ef4a5c";

/** A: the Stomper. A cockpit torso on backward-bent legs, missile pods on its shoulders, a gun under each. */
function stomper(): MechDesign {
  const body = part([
    // torso: a wedge cockpit leaning forward, with a dark canopy and a red optic
    piece(taperBox(0.3, 0.2, 0.34, 0.8, 0.75, 0.04), PLATE, { at: [0, 0.55, 0] }),
    piece(taperBox(0.26, 0.08, 0.3, 1.1, 1.05), GUN, { at: [0, 0.42, -0.01] }),
    piece(taperBox(0.18, 0.07, 0.08, 0.8, 0.6), DARK, { at: [0, 0.59, 0.15], rot: [0.5, 0, 0] }),
    piece(box(0.06, 0.03, 0.02), OPTIC, { at: [0, 0.54, 0.18] }),
    piece(box(0.31, 0.03, 0.02), STRIPE, { at: [0, 0.5, 0.155] }),
    piece(box(0.12, 0.08, 0.1), JOINT, { at: [0, 0.35, 0] }),
    // missile pods on the shoulders
    piece(box(0.1, 0.1, 0.16), GUN, { at: [0.2, 0.66, -0.03] }),
    piece(box(0.1, 0.1, 0.16), GUN, { at: [-0.2, 0.66, -0.03] }),
    piece(box(0.07, 0.07, 0.01), DARK, { at: [0.2, 0.66, 0.055] }),
    piece(box(0.07, 0.07, 0.01), DARK, { at: [-0.2, 0.66, 0.055] }),
    piece(box(0.102, 0.018, 0.162), STRIPE, { at: [0.2, 0.635, -0.03] }),
    piece(box(0.102, 0.018, 0.162), STRIPE, { at: [-0.2, 0.635, -0.03] }),
  ]);
  const armR = part([
    piece(box(0.07, 0.1, 0.1), GUN, { at: [0.02, 0, 0] }),
    piece(rod(0.03, 0.03, 0.22, 6), JOINT, { at: [0.03, -0.02, 0.12], rot: [Math.PI / 2, 0, 0] }),
    piece(rod(0.038, 0.038, 0.05, 6), PLATE2, { at: [0.03, -0.02, 0.05], rot: [Math.PI / 2, 0, 0] }),
  ]);
  const legR = part([
    piece(ball(0.055), JOINT, { at: [0, 0, 0] }),
    piece(taperBox(0.09, 0.2, 0.09, 0.8, 0.8), PLATE, { at: [0.01, -0.07, -0.06], rot: [0.7, 0, 0] }),
    piece(ball(0.04), JOINT, { at: [0.01, -0.14, -0.12] }),
    piece(box(0.055, 0.24, 0.055), GUN, { at: [0.01, -0.235, -0.06], rot: [-0.56, 0, 0] }),
    piece(taperBox(0.12, 0.035, 0.18, 0.7, 0.8, 0.01), DARK, { at: [0.01, -0.335, 0.0] }),
    piece(box(0.035, 0.03, 0.08), DARK, { at: [0.01, -0.34, -0.1] }),
  ]);
  return { name: "Stomper", body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.18, 0.46, 0.04], hip: [0.11, 0.35, 0],
    gait: { speed: 6.5, stride: 0.35, swing: 0.06, bob: 0.035, roll: 0.03, lean: 0.05 } };
}

/** B: the Bulwark. A heavy humanoid mech: a broad chest with a small armoured head, an autocannon arm and a shield arm. */
function bulwark(): MechDesign {
  const body = part([
    piece(taperBox(0.34, 0.26, 0.24, 1.2, 1.1, 0.01), PLATE, { at: [0, 0.48, 0] }),
    piece(box(0.2, 0.12, 0.05), PLATE2, { at: [0, 0.5, 0.13] }),
    piece(box(0.36, 0.03, 0.02), STRIPE, { at: [0, 0.57, 0.135] }),
    piece(taperBox(0.24, 0.1, 0.18, 1.2, 1.1), GUN, { at: [0, 0.3, 0] }),
    piece(box(0.28, 0.04, 0.2), JOINT, { at: [0, 0.36, 0] }),
    piece(box(0.22, 0.2, 0.1), GUN, { at: [0, 0.5, -0.15] }),
    piece(rod(0.025, 0.025, 0.1, 6), JOINT, { at: [0.07, 0.64, -0.16] }),
    // head: a small armoured block sunk between the shoulders, a red slit
    piece(taperBox(0.13, 0.09, 0.13, 0.85, 0.8), GUN, { at: [0, 0.655, 0.03] }),
    piece(box(0.1, 0.02, 0.02), OPTIC, { at: [0, 0.66, 0.1] }),
  ]);
  const cannon = part([
    piece(taperBox(0.15, 0.12, 0.17, 0.85, 0.9), PLATE, { at: [0.03, 0.03, 0], rot: [0, 0, -0.2] }),
    piece(box(0.08, 0.16, 0.09), GUN, { at: [0.035, -0.13, 0] }),
    piece(box(0.09, 0.09, 0.14), DARK, { at: [0.035, -0.25, 0.04] }),
    piece(rod(0.022, 0.022, 0.22, 6), JOINT, { at: [0.015, -0.25, 0.19], rot: [Math.PI / 2, 0, 0] }),
    piece(rod(0.022, 0.022, 0.22, 6), JOINT, { at: [0.055, -0.25, 0.19], rot: [Math.PI / 2, 0, 0] }),
  ]);
  const shield = part([
    piece(taperBox(0.15, 0.12, 0.17, 0.85, 0.9), PLATE, { at: [0.03, 0.03, 0], rot: [0, 0, -0.2] }),
    piece(box(0.08, 0.16, 0.09), GUN, { at: [0.035, -0.13, 0] }),
    piece(taperBox(0.03, 0.3, 0.2, 1, 0.8), PLATE2, { at: [0.09, -0.2, 0.04] }),
    piece(box(0.035, 0.03, 0.2), STRIPE, { at: [0.09, -0.12, 0.04] }),
  ]);
  const legR = part([
    piece(box(0.11, 0.12, 0.12), GUN, { at: [0, -0.05, 0] }),
    piece(taperBox(0.12, 0.08, 0.1, 1, 1, 0.02), PLATE, { at: [0, -0.13, 0.03] }),
    piece(box(0.09, 0.08, 0.1), DARK, { at: [0, -0.2, 0] }),
    piece(taperBox(0.13, 0.05, 0.19, 0.8, 0.8, 0.01), JOINT, { at: [0, -0.25, 0.02] }),
  ]);
  return { name: "Bulwark", body, armR: cannon, armL: mirror(shield), legR, legL: mirror(legR), shoulder: [0.26, 0.54, 0], hip: [0.09, 0.28, 0],
    gait: { speed: 5.5, stride: 0.38, swing: 0.2, bob: 0.03, roll: 0.05, lean: 0.06, holdR: 0.25 } };
}

/** C: the Skitter. A low four-legged mech with a turret on its back; each side's two legs move as one. */
function skitter(): MechDesign {
  const body = part([
    piece(taperBox(0.3, 0.1, 0.36, 0.85, 0.85), PLATE, { at: [0, 0.3, 0] }),
    piece(taperBox(0.32, 0.06, 0.38, 0.95, 0.95), GUN, { at: [0, 0.23, 0] }),
    piece(box(0.3, 0.025, 0.02), STRIPE, { at: [0, 0.3, 0.16] }),
    // turret: a squat block with twin barrels and a red optic
    piece(rod(0.1, 0.12, 0.05, 8), DARK, { at: [0, 0.38, -0.02] }),
    piece(taperBox(0.18, 0.09, 0.18, 0.8, 0.75, 0.02), PLATE2, { at: [0, 0.45, -0.01] }),
    piece(rod(0.018, 0.018, 0.2, 6), JOINT, { at: [0.035, 0.45, 0.15], rot: [Math.PI / 2, 0, 0] }),
    piece(rod(0.018, 0.018, 0.2, 6), JOINT, { at: [-0.035, 0.45, 0.15], rot: [Math.PI / 2, 0, 0] }),
    piece(box(0.05, 0.025, 0.02), OPTIC, { at: [0.06, 0.48, 0.08] }),
    piece(box(0.1, 0.035, 0.06), JOINT, { at: [0, 0.19, 0] }),
  ]);
  // One side's front and back legs: each goes out, then bends down to a pointed foot.
  const leg = (z: number) => [
    piece(ball(0.04), JOINT, { at: [0, 0, z] }),
    piece(box(0.16, 0.045, 0.05), PLATE, { at: [0.08, 0.03, z], rot: [0, 0, 0.35] }),
    piece(ball(0.035), JOINT, { at: [0.16, 0.06, z] }),
    piece(taperBox(0.05, 0.27, 0.05, 0.4, 0.4), GUN, { at: [0.2, -0.07, z], rot: [Math.PI, 0, 0.3] }),
  ];
  const legR = part([...leg(0.13), ...leg(-0.13)]);
  const stub = part([piece(box(0.001, 0.001, 0.001), JOINT)]);
  return { name: "Skitter", body, armR: stub, armL: stub, legR, legL: mirror(legR), shoulder: [0, 0, 0], hip: [0.14, 0.22, 0],
    gait: { speed: 10, stride: 0.22, swing: 0, bob: 0.02, roll: 0.03, lean: 0.02 } };
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
const designs = [stomper(), bulwark(), skitter()];
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
