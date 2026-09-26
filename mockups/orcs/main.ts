import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EVENING } from "../../src/render/models";
import "./style.css";

// Pass 1 of the enemy looks: three orc Grunts, A/B/C, built the way the game would
// build them: five rigid parts each (body with head, two arms, two legs), every part
// one geometry with its colours in the vertices, one material per orc. In the game
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
const spike = (r: number, h: number, seg = 5) => new THREE.ConeGeometry(r, h, seg);

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

// ------------------------------------------------------------------ the orcs

/** An orc's parts, each built around its pivot, and how it walks. */
interface OrcDesign {
  name: string;
  body: THREE.BufferGeometry;
  armR: THREE.BufferGeometry; armL: THREE.BufferGeometry;
  legR: THREE.BufferGeometry; legL: THREE.BufferGeometry;
  shoulder: V3; hip: V3;
  gait: { speed: number; stride: number; swing: number; bob: number; roll: number; lean: number; holdR?: number };
}

/** A: the Brawler. Chibi proportions: a huge head and jaw, a barrel body, fists that nearly drag, stubby legs. */
function brawler(): OrcDesign {
  const skin = "#6f8a4a", dark = "#55703a", leather = "#4a3526", strap = "#2c211d", bone = "#ece4cc", iron = "#5b6170", eye = "#f1e3a0";
  const body = part([
    piece(taperBox(0.42, 0.3, 0.3, 1.18, 1.1), skin, { at: [0, 0.37, 0] }),
    piece(ball(0.19), skin, { at: [0, 0.3, 0.05], scale: [1.05, 0.8, 0.9] }),
    piece(box(0.44, 0.07, 0.33), leather, { at: [0, 0.24, 0] }),
    piece(box(0.1, 0.08, 0.05), iron, { at: [0, 0.24, 0.17] }),
    piece(box(0.07, 0.34, 0.05), strap, { at: [0.08, 0.4, 0.15], rot: [0, 0, 0.55] }),
    // head: skull, heavy jaw, brow, tusks, ears, eyes
    piece(taperBox(0.25, 0.2, 0.23, 0.92, 0.9), skin, { at: [0, 0.6, 0.08] }),
    piece(taperBox(0.3, 0.1, 0.22, 0.95, 0.95), dark, { at: [0, 0.5, 0.12] }),
    piece(box(0.27, 0.05, 0.06), dark, { at: [0, 0.65, 0.19], rot: [0.25, 0, 0] }),
    piece(spike(0.028, 0.1, 4), bone, { at: [0.1, 0.58, 0.21], rot: [0.1, 0, -0.15] }),
    piece(spike(0.028, 0.1, 4), bone, { at: [-0.1, 0.58, 0.21], rot: [0.1, 0, 0.15] }),
    piece(spike(0.05, 0.14, 4), skin, { at: [0.16, 0.63, 0.04], rot: [0, 0, -1.9], scale: [1, 1, 0.5] }),
    piece(spike(0.05, 0.14, 4), skin, { at: [-0.16, 0.63, 0.04], rot: [0, 0, 1.9], scale: [1, 1, 0.5] }),
    piece(box(0.05, 0.025, 0.02), eye, { at: [0.06, 0.615, 0.2] }),
    piece(box(0.05, 0.025, 0.02), eye, { at: [-0.06, 0.615, 0.2] }),
  ]);
  // Arm hangs from the shoulder pivot: shoulder ball, upper arm, forearm, a big fist.
  const armR = part([
    piece(ball(0.1), skin, { at: [0, 0, 0] }),
    piece(taperBox(0.13, 0.08, 0.13, 1.1, 1.1), iron, { at: [0.02, 0.06, 0], rot: [0, 0, -0.35] }),
    piece(rod(0.065, 0.055, 0.16), skin, { at: [0.02, -0.12, 0] }),
    piece(rod(0.06, 0.075, 0.14), dark, { at: [0.03, -0.26, 0.02] }),
    piece(box(0.1, 0.05, 0.1), strap, { at: [0.03, -0.3, 0.02] }),
    piece(ball(0.1), skin, { at: [0.035, -0.37, 0.03], scale: [1, 0.9, 1.05] }),
  ]);
  const legR = part([
    piece(box(0.13, 0.13, 0.14), leather, { at: [0, -0.06, 0] }),
    piece(box(0.1, 0.06, 0.1), skin, { at: [0, -0.14, 0] }),
    piece(taperBox(0.13, 0.06, 0.2, 0.9, 0.8, 0.01), strap, { at: [0, -0.18, 0.03] }),
  ]);
  return { name: "Brawler", body, armR, armL: mirror(armR), legR, legL: mirror(legR), shoulder: [0.26, 0.46, 0.02], hip: [0.1, 0.21, 0],
    gait: { speed: 6.2, stride: 0.55, swing: 0.6, bob: 0.035, roll: 0.09, lean: 0.12 } };
}

/** B: the Raider. Taller and armoured: horned helmet, big pauldrons, a cleaver in the right hand. */
function raider(): OrcDesign {
  const skin = "#6b7f57", dark = "#566847", plate = "#6e2b24", plateDark = "#4e1d19", iron = "#565c68", cloth = "#3a2c2a", bone = "#e8e0c8", eye = "#f1e3a0";
  const body = part([
    piece(taperBox(0.32, 0.3, 0.22, 1.2, 1.1), plate, { at: [0, 0.5, 0] }),
    piece(box(0.22, 0.1, 0.05), plateDark, { at: [0, 0.52, 0.12] }),
    piece(taperBox(0.3, 0.12, 0.2, 1.05, 1), cloth, { at: [0, 0.32, 0] }),
    piece(box(0.33, 0.05, 0.22), iron, { at: [0, 0.37, 0] }),
    piece(taperBox(0.18, 0.12, 0.05, 0.8, 1), cloth, { at: [0, 0.25, 0.1] }),
    // head: jaw and tusks under a horned iron helmet
    piece(taperBox(0.19, 0.1, 0.17, 1, 1), skin, { at: [0, 0.7, 0.05] }),
    piece(taperBox(0.21, 0.07, 0.17, 0.95, 1), dark, { at: [0, 0.66, 0.07] }),
    piece(spike(0.022, 0.08, 4), bone, { at: [0.07, 0.72, 0.15], rot: [0.1, 0, -0.1] }),
    piece(spike(0.022, 0.08, 4), bone, { at: [-0.07, 0.72, 0.15], rot: [0.1, 0, 0.1] }),
    piece(taperBox(0.22, 0.13, 0.2, 0.75, 0.8), iron, { at: [0, 0.82, 0.03] }),
    piece(box(0.23, 0.035, 0.21), plateDark, { at: [0, 0.765, 0.035] }),
    piece(box(0.13, 0.025, 0.02), eye, { at: [0, 0.745, 0.14] }),
    piece(spike(0.04, 0.2, 5), bone, { at: [0.15, 0.9, 0.02], rot: [0, 0, -0.75] }),
    piece(spike(0.04, 0.2, 5), bone, { at: [-0.15, 0.9, 0.02], rot: [0, 0, 0.75] }),
  ]);
  const arm = (weapon: boolean) => part([
    piece(taperBox(0.17, 0.1, 0.2, 0.7, 0.85), plate, { at: [0.03, 0.05, 0], rot: [0, 0, -0.3] }),
    piece(box(0.18, 0.03, 0.2), iron, { at: [0.04, 0.0, 0], rot: [0, 0, -0.3] }),
    piece(rod(0.05, 0.045, 0.16), skin, { at: [0.02, -0.1, 0] }),
    piece(rod(0.05, 0.06, 0.13), iron, { at: [0.02, -0.23, 0.01] }),
    piece(ball(0.055), dark, { at: [0.02, -0.32, 0.02] }),
    ...(weapon ? [
      piece(rod(0.015, 0.015, 0.2, 5), cloth, { at: [0.02, -0.32, 0.06], rot: [Math.PI / 2, 0, 0] }),
      piece(taperBox(0.02, 0.24, 0.13, 1, 1.25, 0.02), iron, { at: [0.02, -0.33, 0.2], rot: [Math.PI / 2, 0, 0] }),
      piece(box(0.024, 0.05, 0.14), bone, { at: [0.02, -0.28, 0.21], rot: [Math.PI / 2, 0, 0] }),
    ] : []),
  ]);
  const armR = arm(true);
  const legR = part([
    piece(box(0.12, 0.16, 0.13), cloth, { at: [0, -0.07, 0] }),
    piece(taperBox(0.12, 0.14, 0.14, 1.1, 1.1), iron, { at: [0, -0.2, 0.01] }),
    piece(taperBox(0.12, 0.05, 0.19, 0.9, 0.8, 0.01), plateDark, { at: [0, -0.28, 0.03] }),
  ]);
  return { name: "Raider", body, armR, armL: mirror(arm(false)), legR, legL: mirror(legR), shoulder: [0.2, 0.6, 0], hip: [0.08, 0.31, 0],
    gait: { speed: 7, stride: 0.5, swing: 0.45, bob: 0.025, roll: 0.05, lean: 0.08, holdR: 0.35 } };
}

/** C: the Frost Stalker. Hunched under a fur cloak and hood, a bone mask with tusks, a long spear. */
function stalker(): OrcDesign {
  const fur = "#3a3440", furLight = "#514855", cloak = "#6a3530", cloakDark = "#4c2522", skin = "#7c90a0", mask = "#e6dfcc", wood = "#5a4030", iron = "#5b6170", eye = "#1a1418";
  const body = part([
    piece(rod(0.13, 0.28, 0.36, 7), cloak, { at: [0, 0.32, -0.02] }),
    piece(rod(0.285, 0.29, 0.04, 7), cloakDark, { at: [0, 0.14, -0.02] }),
    piece(new THREE.TorusGeometry(0.15, 0.065, 4, 7), fur, { at: [0, 0.5, 0.0], rot: [Math.PI / 2 + 0.25, 0, 0] }),
    // hood leaning forward over a bone mask
    piece(ball(0.15), fur, { at: [0, 0.6, 0.06], scale: [1, 1.05, 1.1] }),
    piece(spike(0.09, 0.16, 5), furLight, { at: [0, 0.72, -0.04], rot: [-0.9, 0, 0] }),
    piece(taperBox(0.16, 0.14, 0.05, 0.85, 1), mask, { at: [0, 0.58, 0.19], rot: [0.15, 0, 0] }),
    piece(box(0.045, 0.02, 0.02), eye, { at: [0.035, 0.605, 0.215], rot: [0, 0, -0.3] }),
    piece(box(0.045, 0.02, 0.02), eye, { at: [-0.035, 0.605, 0.215], rot: [0, 0, 0.3] }),
    piece(spike(0.025, 0.11, 4), mask, { at: [0.06, 0.52, 0.22], rot: [0.5, 0, -0.35] }),
    piece(spike(0.025, 0.11, 4), mask, { at: [-0.06, 0.52, 0.22], rot: [0.5, 0, 0.35] }),
    piece(rod(0.012, 0.012, 0.03), skin, { at: [0, 0.52, 0.19] }),
  ]);
  const arm = (weapon: boolean) => part([
    piece(rod(0.055, 0.06, 0.2, 6), cloak, { at: [0.01, -0.08, 0] }),
    piece(rod(0.066, 0.066, 0.04, 6), fur, { at: [0.01, -0.19, 0] }),
    piece(ball(0.045), skin, { at: [0.01, -0.23, 0.01] }),
    ...(weapon ? [
      piece(rod(0.014, 0.014, 0.95, 5), wood, { at: [0.01, -0.2, 0.08], rot: [Math.PI / 2 - 0.25, 0, 0] }),
      piece(spike(0.035, 0.13, 4), iron, { at: [0.01, -0.08, 0.6], rot: [Math.PI / 2 - 0.25, 0, 0] }),
      piece(box(0.05, 0.03, 0.04), fur, { at: [0.01, -0.11, 0.5], rot: [-0.25, 0, 0] }),
    ] : []),
  ]);
  const legR = part([
    piece(rod(0.05, 0.045, 0.1, 6), cloakDark, { at: [0, -0.05, 0] }),
    piece(taperBox(0.1, 0.06, 0.16, 0.85, 0.8, 0.01), fur, { at: [0, -0.11, 0.03] }),
  ]);
  return { name: "Frost Stalker", body, armR: arm(true), armL: mirror(arm(false)), legR, legL: mirror(legR), shoulder: [0.17, 0.46, 0.04], hip: [0.09, 0.14, 0.02],
    gait: { speed: 7.5, stride: 0.6, swing: 0.35, bob: 0.02, roll: 0.04, lean: 0.2, holdR: 0.9 } };
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

interface Orc {
  design: OrcDesign; root: THREE.Group; tilt: THREE.Group; body: THREE.Mesh;
  armR: THREE.Mesh; armL: THREE.Mesh; legR: THREE.Mesh; legL: THREE.Mesh;
  mat: THREE.MeshStandardMaterial; phase: number; flash: number; nextHit: number; tag: HTMLElement;
}

const tagsEl = document.getElementById("tags")!;
const orcs: Orc[] = [];
const designs = [brawler(), raider(), stalker()];
// Along the screen's horizontal (screen right is +x -z in the world).
const SIDE = new THREE.Vector3(1, 0, -1).normalize();
designs.forEach((d, i) => {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.05, emissive: "#ffffff", emissiveIntensity: 0 });
  const mk = (g: THREE.BufferGeometry, at: V3) => { const o = new THREE.Mesh(g, m); o.position.set(...at); o.castShadow = true; return o; };
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt);
  const [sx, sy, sz] = d.shoulder, [hx, hy, hz] = d.hip;
  const orc: Orc = {
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
