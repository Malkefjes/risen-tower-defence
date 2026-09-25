import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, roundedBox, type TurretRig } from "../../src/render/models";
import type { ShipRig } from "../../src/render/ship";
import "./style.css";

// Player rig B mockup: three variations on humanoid rig B, next to the real Rocket, each running
// the early loop: walk to an ore node, mine (the held key), carry the ore back
// to the cargo ramp. Judged at the game's default zoom, where the avatar is small.
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
const glows = createGlows();
const models = createDefaultModels(mat, glows);

scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 60 });
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ palette

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true, ...o });
const M = {
  suit: std("#eef1f6", { roughness: 0.6 }),
  suitShade: std("#c9cfdb", { roughness: 0.65 }),
  orange: std(EVENING.wallA),
  orangeDark: std("#a8432d"),
  steel: std("#3d4457", { roughness: 0.55 }),
  steelDark: std("#2c3142", { roughness: 0.6 }),
  steelLight: std("#8a94ab", { roughness: 0.5 }),
  visor: std("#1d2233", { roughness: 0.2 }),
  power: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.8, roughness: 0.4 }),
  rock: std("#4b4f63"),
  ore: std("#f3c75a", { emissive: "#d9962a", emissiveIntensity: 0.35, roughness: 0.4 }),
};

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
/** Box standing on y. */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(roundedBox(w, h, d, r), m, x, y, z);
const shadowAll = <T extends THREE.Object3D>(o: T): T => {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
};
const oreChunk = (s: number) => {
  const o = mesh(new THREE.OctahedronGeometry(s, 0), M.ore);
  o.scale.y = 1.3;
  return o;
};

// ------------------------------------------------------------------ humanoid rigs

/** What the loop animates. Models face +z. */
interface Rig {
  root: THREE.Group;
  body: THREE.Object3D;
  /** Ore carried: chunks shown in order as the load grows. */
  load: THREE.Object3D[];
  walk(s: number, walking: boolean): void;
  mine(t: number, on: boolean): void;
  speed: number;
  height: number;
}

interface Design { key: string; text: string; build(): Rig }

/**
 * A two-part limb hanging down from a pivot: upper segment, joint, lower segment.
 * Rotating `top` swings the whole limb; rotating `mid` bends it. Positive x
 * rotation moves the end backwards (knees), negative forwards (elbows).
 */
function limb(parent: THREE.Object3D, x: number, y: number, z: number, upper: number, lower: number, wU: number, wL: number, mU: THREE.Material, mL: THREE.Material, mJ: THREE.Material) {
  const top = new THREE.Group(); top.position.set(x, y, z); parent.add(top);
  top.add(mesh(new THREE.SphereGeometry(wU * 0.62, 10, 8), mJ));
  top.add(rbox(wU, upper, wU, Math.min(wU, upper) * 0.25, mU, 0, -upper, 0));
  const mid = new THREE.Group(); mid.position.y = -upper; top.add(mid);
  mid.add(mesh(new THREE.SphereGeometry(wL * 0.6, 10, 8), mJ));
  mid.add(rbox(wL, lower, wL, Math.min(wL, lower) * 0.25, mL, 0, -lower, 0));
  const end = new THREE.Group(); end.position.y = -lower; mid.add(end);
  return { top, mid, end };
}

interface Proportions {
  hipY: number; hipW: number; thigh: number; shin: number; legW: number;
  shoulderY: number; shoulderW: number; upperArm: number; foreArm: number; armW: number;
  foot: [number, number, number];
}

/** Shared skeleton: legs and arms on a body group, with a walk cycle and a mining pose. */
function skeleton(p: Proportions, m: { armor: THREE.Material; limb: THREE.Material; joint: THREE.Material; accent: THREE.Material }) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const legs = [-1, 1].map(sx => {
    const l = limb(root, sx * p.hipW, p.hipY, 0, p.thigh, p.shin, p.legW, p.legW * 0.9, m.armor, m.limb, m.joint);
    const [fw, fh, fl] = p.foot;
    l.end.add(rbox(fw, fh, fl, fh * 0.35, m.limb, 0, -fh, fl * 0.2));
    l.end.add(box(fw * 1.02, fh * 0.45, fl * 0.3, m.accent, 0, -fh, fl * 0.55));
    return l;
  });
  const arms = [-1, 1].map(sx => limb(body, sx * p.shoulderW, p.shoulderY, 0, p.upperArm, p.foreArm, p.armW, p.armW * 1.05, m.armor, m.limb, m.joint));
  const drill = new THREE.Group();
  const bit = mesh(new THREE.ConeGeometry(p.armW * 0.55, p.foreArm * 0.8, 8), M.steelLight, 0, -p.foreArm * 0.4, 0);
  bit.rotation.x = Math.PI;
  drill.add(box(p.armW * 1.25, p.armW * 1.1, p.armW * 1.25, m.accent, 0, -p.armW * 0.9, 0), bit);
  arms[1]!.end.add(drill);
  // Left hand: a simple three-finger grip.
  for (const dx of [-1, 0, 1]) arms[0]!.end.add(box(p.armW * 0.22, p.armW * 0.8, p.armW * 0.3, m.limb, dx * p.armW * 0.3, -p.armW * 0.8, p.armW * 0.15));
  const set = (l: ReturnType<typeof limb>, swing: number, bend: number) => { l.top.rotation.x = swing; l.mid.rotation.x = bend; l.end.rotation.x = -(swing + bend) * 0.8; };
  const setArm = (l: ReturnType<typeof limb>, swing: number, bend: number) => { l.top.rotation.x = swing; l.mid.rotation.x = bend; };
  let mining = false;
  return {
    root, body, legs, arms, bit,
    walk(s: number, on: boolean) {
      const a = on ? Math.sin(s) * 0.5 : 0;
      const knee = (k: number) => (on ? Math.max(0, Math.sin(k)) * 0.8 : 0.05);
      set(legs[0]!, -a, knee(s + Math.PI * 0.6));
      set(legs[1]!, a, knee(s - Math.PI * 0.4));
      if (!mining) { setArm(arms[0]!, a * 0.7, -0.35); setArm(arms[1]!, -a * 0.7, -0.35); }
      body.position.y = on ? Math.abs(Math.cos(s)) * 0.025 : 0;
      body.rotation.y = on ? Math.sin(s) * 0.06 : 0;
    },
    mine(t: number, on: boolean) {
      mining = on;
      body.rotation.x = on ? 0.12 : 0;
      if (on) {
        setArm(arms[1]!, -1.25 + Math.sin(t * 14) * 0.06, -0.25);
        setArm(arms[0]!, -0.7, -0.6);
      }
      bit.rotation.y = on ? t * 40 : 0;
    },
  };
}

/** Rig B's parts, parameterised: `k` thickens limbs and armor, `c` picks where orange goes. */
function rigB(o: { k: number; head: number; orangeChest: boolean; orangeShoulders: boolean; helmetStripe: boolean; frame: boolean; pack: "slim" | "core" | "frame" }): Rig {
  const k = o.k;
  const sk = skeleton(
    { hipY: 0.44, hipW: 0.07 * k, thigh: 0.22, shin: 0.21, legW: 0.07 * k, shoulderY: 0.78, shoulderW: 0.14 * k, upperArm: 0.18, foreArm: 0.17, armW: 0.06 * k, foot: [0.08 * k, 0.045, 0.15] },
    { armor: M.suit, limb: M.steelDark, joint: M.steel, accent: M.orange },
  );
  const b = sk.body;
  b.add(rbox(0.16 * k, 0.1, 0.12 * k, 0.03, M.steelDark, 0, 0.42, 0));
  b.add(rbox(0.24 * k, 0.26, 0.17 * k, 0.06, M.suit, 0, 0.52, 0));
  b.add(box(0.13 * k, 0.09, 0.02, o.orangeChest ? M.orange : M.suitShade, 0, 0.6, 0.085 * k + 0.005));
  for (const sx of [-1, 1]) b.add(rbox(0.09 * k, 0.06 * k, 0.13 * k, 0.025, o.orangeShoulders ? M.orange : M.suitShade, sx * 0.14 * k, 0.76, 0));
  b.add(box(0.07, 0.05, 0.07, M.steelDark, 0, 0.78, 0));
  const h = o.head;
  b.add(mesh(new THREE.SphereGeometry(0.09 * h, 14, 10), M.suit, 0, 0.8 + 0.1 * h, 0));
  b.add(mesh(new THREE.SphereGeometry(0.075 * h, 14, 8, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.35, Math.PI * 0.28), M.power, 0, 0.8 + 0.1 * h, 0.025 * h));
  if (o.helmetStripe) {
    const st = mesh(new THREE.TorusGeometry(0.09 * h, 0.012, 6, 24, Math.PI), M.orange, 0, 0.8 + 0.1 * h, 0);
    st.rotation.set(0, Math.PI / 2, 0);
    b.add(st);
  }
  for (const a of sk.arms) a.mid.add(box(0.07 * k, 0.05, 0.07 * k, M.orange, 0, -0.1, 0));
  for (const l of sk.legs) l.mid.add(box(0.075 * k, 0.06, 0.075 * k, M.orange, 0, -0.1, 0.005));
  let load: THREE.Object3D[];
  const back = -0.085 * k - 0.04;
  if (o.pack === "slim") {
    b.add(rbox(0.16 * k, 0.22, 0.07, 0.03, M.steel, 0, 0.5, back), box(0.04, 0.14, 0.01, M.power, 0.05, 0.55, back - 0.04));
    load = [0, 1, 2].map(i => { const c = box(0.1, 0.045, 0.02, M.ore, -0.02, 0.54 + i * 0.055, back - 0.042); b.add(c); return c; });
  } else if (o.pack === "core") {
    // A bigger pack with a round cyan power core and ore canisters either side.
    b.add(rbox(0.22 * k, 0.26, 0.09, 0.035, M.steel, 0, 0.48, back - 0.01));
    const core = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 14).rotateX(Math.PI / 2), M.power, 0, 0.62, back - 0.065);
    b.add(core);
    load = [0, 1, 2].map(i => { const c = box(0.045, 0.06, 0.03, M.ore, (i - 1) * 0.07, 0.5, back - 0.06); b.add(c); return c; });
  } else {
    // An open steel frame on the back: spine, two uprights and an ore cradle.
    b.add(box(0.03, 0.46, 0.03, M.steelLight, 0, 0.38, back - 0.03));
    for (const sx of [-1, 1]) b.add(box(0.025, 0.36, 0.025, M.steelLight, sx * 0.1 * k, 0.44, back - 0.06));
    b.add(box(0.24 * k, 0.025, 0.025, M.orange, 0, 0.8, back - 0.06), box(0.24 * k, 0.025, 0.06, M.steelLight, 0, 0.44, back - 0.07));
    b.add(box(0.05, 0.05, 0.03, M.power, 0, 0.7, back - 0.05));
    load = [0, 1, 2].map(i => { const c = oreChunk(0.045); c.position.set((i - 1) * 0.065, 0.51, back - 0.08); b.add(c); return c; });
  }
  if (o.frame) {
    // Exo-frame: steel struts along the outside of the arms and legs, and over the shoulders.
    for (const a of sk.arms) { a.top.add(box(0.015, 0.16, 0.015, M.steelLight, (a.top.position.x > 0 ? 1 : -1) * 0.045 * k, -0.17, 0)); a.mid.add(box(0.015, 0.15, 0.015, M.steelLight, (a.top.position.x > 0 ? 1 : -1) * 0.045 * k, -0.16, 0)); }
    for (const l of sk.legs) { const sx = l.top.position.x > 0 ? 1 : -1; l.top.add(box(0.015, 0.2, 0.015, M.steelLight, sx * 0.05 * k, -0.21, 0)); l.mid.add(box(0.015, 0.19, 0.015, M.steelLight, sx * 0.05 * k, -0.2, 0)); }
    for (const sx of [-1, 1]) { const arch = box(0.02, 0.02, 0.26, M.steelLight, sx * 0.1 * k, 0.83, -0.02); b.add(arch); }
  }
  return { root: sk.root, body: b, load, walk: sk.walk, mine: sk.mine, speed: 1.8, height: 1.15 };
}

const DESIGNS: Design[] = [
  {
    key: "B1",
    text: "B with more mass: limbs, torso and armor about 30% thicker and a bigger helmet, so it still reads as a figure at game zoom. Same colors as B: white armor, dark joints, orange on forearms and shins, cyan visor.",
    build: () => rigB({ k: 1.3, head: 1.2, orangeChest: false, orangeShoulders: false, helmetStripe: false, frame: false, pack: "slim" }),
  },
  {
    key: "B2",
    text: "B in colony colors: an orange chest plate, orange shoulders and an orange stripe over the helmet, plus a bigger backpack with a round cyan power core and ore canisters. Easiest to spot on snow.",
    build: () => rigB({ k: 1.15, head: 1.1, orangeChest: true, orangeShoulders: true, helmetStripe: true, frame: false, pack: "core" }),
  },
  {
    key: "B3",
    text: "B wearing a visible exo-frame: steel struts along the outside of the arms and legs, arches over the shoulders, and an open back frame with an orange crossbar that cradles the ore. Reads most as a rig.",
    build: () => rigB({ k: 1.15, head: 1.1, orangeChest: false, orangeShoulders: true, helmetStripe: false, frame: true, pack: "frame" }),
  },
];

// ------------------------------------------------------------------ scene: the Rocket, walls, nodes

// Rocket on cells (-1..1, -1..1). Its cargo ramp faces front-left (world +z side, toward the camera).
const ship = models.create("ship");
ship.position.set(0.5, 0, 0.5);
scene.add(ship);
const shipRig = ship.userData.rig as ShipRig;
shipRig.door.rotation.x = shipRig.openAngle;
shipRig.materials.bayLight.emissiveIntensity = 1.2;
ship.updateMatrixWorld(true);
const rampFoot = shipRig.bay.localToWorld(new THREE.Vector3(0, 0, shipRig.face + 0.06 + shipRig.reach + 0.35));
rampFoot.y = 0;

[[[-3, -2], [-3, -1], [-3, 0], [-3, 1]], [[-1, -3], [0, -3], [1, -3], [2, -3]]].forEach((cells, i) =>
  scene.add(models.create("wallPiece", { cells: cells as [number, number][], variant: i })));
const twin = models.create("twin");
twin.position.set(-2.5, DECK_TOP, -1.5);
scene.add(twin);
const twinRig = twin.userData.rig as TurretRig;

/** An ore node: dark rock with gold crystals. A placeholder until the ore mockup in part 2. */
function oreNode(x: number, z: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = mesh(new THREE.DodecahedronGeometry(0.42, 0), M.rock, 0, 0.25, 0);
  r.scale.set(1.1, 0.75, 1.0); r.rotation.y = seed;
  g.add(r);
  for (let i = 0; i < 5; i++) {
    const a = seed + i * 1.3, c = oreChunk(0.09 + (i % 3) * 0.03);
    c.position.set(Math.cos(a) * 0.25, 0.42 + (i % 2) * 0.08, Math.sin(a) * 0.25);
    c.rotation.set(0.3 * Math.sin(a), a, 0.4 * Math.cos(a));
    g.add(c);
  }
  g.position.set(x, 0, z);
  return shadowAll(g);
}
const NODES = [new THREE.Vector3(-4.5, 0, 5.5), new THREE.Vector3(1.5, 0, 6.5), new THREE.Vector3(5.5, 0, 3.0)];
NODES.forEach((n, i) => scene.add(oreNode(n.x, n.z, i * 2.1)));

const deco: [string, number, number, number][] = [
  ["tree", -7, -4, 1.1], ["tree", -8, 3, 0.9], ["tree", 6, -6, 1.0], ["tree", 8, 0, 1.15], ["tree", -2, 10, 0.95],
  ["rock", -5, -7, 13], ["rock", 7, -3, 11], ["rock", 4, 9, 12], ["tree", 9, -8, 1.0], ["tree", -9, 8, 1.05],
];
for (const [name, x, z, s] of deco) {
  const m = models.create(name, name === "tree" ? { scale: s, seed: x * 7 + z } : { scale: s, seed: x * 5 + z });
  m.position.set(x + 0.5, 0, z + 0.5);
  scene.add(m);
}

// ------------------------------------------------------------------ the loop per avatar

type Phase = "out" | "mine" | "back" | "drop";
interface Runner { d: Design; rig: Rig; node: THREE.Vector3; phase: Phase; t: number; carried: number; stride: number; label: HTMLElement }
const labels = document.getElementById("labels")!;
const MINE_TIME = 2.6, DROP_TIME = 0.6;

const runners: Runner[] = DESIGNS.map((d, i) => {
  const rig = d.build();
  shadowAll(rig.root);
  // A touch bigger than life so the rig reads at the game's default zoom.
  rig.root.scale.setScalar(1.25);
  rig.root.position.copy(rampFoot).add(new THREE.Vector3(i * 0.5 - 0.5, 0, i * 0.4));
  scene.add(rig.root);
  const el = document.createElement("div");
  el.className = "label";
  el.innerHTML = `<b>${d.key}</b>`;
  labels.appendChild(el);
  return { d, rig, node: NODES[i]!, phase: "out" as Phase, t: 0, carried: 0, stride: i, label: el };
});

// Sparks and ore flecks while mining.
const sparkGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);
const sparkMat = new THREE.MeshBasicMaterial({ color: "#ffe29a" });
const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
function spark(at: THREE.Vector3): void {
  const m = new THREE.Mesh(sparkGeo, sparkMat);
  m.position.copy(at);
  scene.add(m);
  sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2), life: 0.35 });
}

const tmp = new THREE.Vector3();
function walkTo(r: Runner, goal: THREE.Vector3, dt: number, stop: number): boolean {
  const p = r.rig.root.position;
  tmp.subVectors(goal, p); tmp.y = 0;
  const L = tmp.length();
  if (L <= stop) return true;
  const step = Math.min(L - stop, r.rig.speed * dt);
  p.addScaledVector(tmp.normalize(), step);
  const want = Math.atan2(tmp.x, tmp.z);
  let d = want - r.rig.root.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  r.rig.root.rotation.y += d * Math.min(1, dt * 10);
  r.stride += dt * r.rig.speed * 6;
  return false;
}

function step(r: Runner, dt: number): void {
  const rig = r.rig;
  let walking = false, mining = false;
  if (r.phase === "out") {
    walking = !walkTo(r, r.node, dt, 0.8);
    if (!walking) { r.phase = "mine"; r.t = 0; }
  } else if (r.phase === "mine") {
    mining = true;
    r.t += dt;
    r.carried = Math.min(3, Math.floor((r.t / MINE_TIME) * 3.99));
    tmp.subVectors(r.node, rig.root.position);
    rig.root.rotation.y = Math.atan2(tmp.x, tmp.z);
    if (Math.random() < dt * 22) spark(r.node.clone().setY(0.4).addScaledVector(tmp.normalize(), -0.3));
    if (r.t >= MINE_TIME) { r.phase = "back"; r.t = 0; }
  } else if (r.phase === "back") {
    walking = !walkTo(r, rampFoot, dt, 0.25);
    if (!walking) { r.phase = "drop"; r.t = 0; }
  } else {
    r.t += dt;
    if (r.t > DROP_TIME * 0.5) r.carried = 0;
    if (r.t >= DROP_TIME) { r.phase = "out"; r.t = 0; }
  }
  rig.walk(r.stride, walking);
  rig.mine(time, mining);
  rig.load.forEach((c, i) => { c.visible = i < r.carried; });
}

// ------------------------------------------------------------------ camera, focus

const target = new THREE.Vector3(0.6, 0, 2.2), wantTarget = target.clone();
let zoom = 6.2, wantZoom = 6.2;
const buttons = { fAll: -1, fA: 0, fB: 1, fC: 2 } as const; // B1, B2, B3
const note = document.getElementById("note")!;
let focus = -1;
function setFocus(i: number): void {
  focus = i;
  for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.setAttribute("aria-pressed", String(idx === i));
  if (i < 0) { wantZoom = 6.2; note.textContent = "Shown at the game's default zoom. Pick one to follow it up close."; }
  else { wantZoom = 2.2; const d = DESIGNS[i]!; note.innerHTML = `<b>${d.key}.</b> ${d.text}`; }
}
for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.addEventListener("click", () => setFocus(idx));
setFocus(-1);
addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

// ------------------------------------------------------------------ snow and loop

const N = 800;
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

const clock = new THREE.Clock();
let time = 0;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lp = new THREE.Vector3();

function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  (ship.userData.update as (t: number) => void)(time);
  shipRig.materials.print.emissiveIntensity = 0.2 + Math.max(0, 1 - ((time % 3) / 0.5)) * 1.3;
  twinRig.yaw.rotation.y = Math.sin(time * 0.5) * 0.9 + 0.8;
  for (const r of runners) step(r, dt);
  for (const s of sparks) { s.life -= dt; s.v.y -= 6 * dt; s.m.position.addScaledVector(s.v, dt); s.m.scale.setScalar(Math.max(0.01, s.life / 0.35)); }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i]!.life <= 0) { scene.remove(sparks[i]!.m); sparks.splice(i, 1); }

  if (!reduce) {
    for (let i = 0; i < N; i++) {
      snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
      snowPos[i * 3]! += Math.sin(time * 0.7 + i) * dt * 0.15;
      if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 12;
    }
    sg.attributes.position!.needsUpdate = true;
  }

  // Follow the picked avatar, or frame the whole scene.
  if (focus >= 0) wantTarget.copy(runners[focus]!.rig.root.position);
  else wantTarget.set(0.6, 0, 2.2);
  const ease = 1 - Math.exp(-dt * 4);
  target.lerp(wantTarget, ease);
  zoom += (wantZoom - zoom) * ease;
  snow.position.set(target.x, 0, target.z);
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  const z = a < 1.2 ? zoom * (1.35 / Math.max(0.5, a)) : zoom;
  Object.assign(camera, { left: -z * a, right: z * a, top: z, bottom: -z });
  camera.updateProjectionMatrix();
  camera.position.copy(target).add(CAM_OFFSET);
  camera.lookAt(target.x, 0, target.z);
  camera.updateMatrixWorld();
  sun.position.set(target.x + EVENING.sunOffset[0], EVENING.sunOffset[1], target.z + EVENING.sunOffset[2]);
  sun.target.position.set(target.x, 0, target.z);

  const w = container.clientWidth, h = container.clientHeight;
  runners.forEach((r, i) => {
    lp.copy(r.rig.root.position); lp.y += r.rig.height * 1.25;
    lp.project(camera);
    r.label.style.transform = `translate(${((lp.x + 1) / 2) * w}px, ${((1 - lp.y) / 2) * h}px) translate(-50%, -100%)`;
    r.label.classList.toggle("dim", focus >= 0 && focus !== i);
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
