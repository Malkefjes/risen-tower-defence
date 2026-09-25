import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, roundedBox, type TurretRig } from "../../src/render/models";
import type { ShipRig } from "../../src/render/ship";
import "./style.css";

// Avatar mockup: three colonist designs next to the real Rocket, each running
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

// ------------------------------------------------------------------ the three avatars

/** What the loop animates. Models face +z. */
interface Rig {
  root: THREE.Group;
  body: THREE.Object3D;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  /** Ore carried: chunks shown in order as the load grows. */
  load: THREE.Object3D[];
  /** Plays the mining animation; `k` counts up while mining. */
  mine(k: number, on: boolean): void;
  /** Where the mining effect lands, in root space. */
  toolTip: THREE.Vector3;
  speed: number;
}

interface Design { key: string; name: string; text: string; build(): Rig }

const DESIGNS: Design[] = [
  {
    key: "A", name: "Engineer",
    text: "A light suit with a big round helmet and an orange backpack. Mines with a handheld cutter that throws a cyan beam into the rock; ore stacks up on the pack. Friendly and readable even when tiny.",
    build() {
      const root = new THREE.Group(), body = new THREE.Group();
      root.add(body);
      body.add(mesh(new THREE.CapsuleGeometry(0.12, 0.14, 4, 10), M.suit, 0, 0.3, 0));
      body.add(mesh(new THREE.SphereGeometry(0.14, 14, 10), M.suit, 0, 0.55, 0));
      const visor = mesh(new THREE.SphereGeometry(0.1, 14, 8, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.3, Math.PI * 0.35), M.visor, 0, 0.55, 0.05);
      body.add(visor);
      body.add(box(0.2, 0.03, 0.02, M.power, 0, 0.5, 0.12));
      body.add(rbox(0.2, 0.22, 0.1, 0.03, M.orange, 0, 0.2, -0.15));
      body.add(box(0.06, 0.1, 0.02, M.power, 0, 0.3, -0.21));
      const load = [0, 1, 2].map(i => { const c = oreChunk(0.05); c.position.set((i - 1) * 0.06, 0.47 + (i % 2) * 0.04, -0.16); body.add(c); return c; });
      const legs = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.06, 0.18, 0); p.add(box(0.07, 0.16, 0.08, M.suitShade, 0, -0.16, 0)); p.add(box(0.08, 0.04, 0.11, M.steelDark, 0, -0.18, 0.01)); root.add(p); return p; });
      const arms = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.15, 0.42, 0); p.add(box(0.06, 0.16, 0.06, M.suitShade, 0, -0.16, 0)); body.add(p); return p; });
      const cutter = new THREE.Group();
      cutter.add(box(0.05, 0.05, 0.16, M.steel, 0, 0, 0.06), box(0.05, 0.02, 0.03, M.power, 0, 0.05, 0.13));
      cutter.position.set(0, -0.16, 0.02);
      arms[1]!.add(cutter);
      const beam = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), M.power);
      beam.visible = false;
      cutter.add(beam);
      return {
        root, body, legs, arms, load, speed: 1.9, toolTip: new THREE.Vector3(0.1, 0.3, 0.5),
        mine(k, on) {
          arms[1]!.rotation.x = on ? -1.3 : 0;
          beam.visible = on;
          beam.scale.z = 0.36 + Math.sin(k * 30) * 0.02;
        },
      };
    },
  },
  {
    key: "B", name: "Hardsuit",
    text: "A bulky armored suit in dark steel with orange shoulder plates and a glowing cyan visor slit. Mines with an arm-mounted drill that spins and throws sparks; ore fills a glowing canister on its back. The most \"high-tech soldier\".",
    build() {
      const root = new THREE.Group(), body = new THREE.Group();
      root.add(body);
      body.add(rbox(0.28, 0.26, 0.2, 0.05, M.steel, 0, 0.2, 0));
      body.add(rbox(0.22, 0.1, 0.16, 0.03, M.steelDark, 0, 0.15, 0));
      const helmet = rbox(0.18, 0.16, 0.18, 0.05, M.steelLight, 0, 0.47, 0.01);
      body.add(helmet);
      body.add(box(0.14, 0.03, 0.02, M.power, 0, 0.53, 0.105));
      for (const sx of [-1, 1]) body.add(rbox(0.1, 0.08, 0.16, 0.03, M.orange, sx * 0.17, 0.4, 0));
      // Back canister that fills with ore.
      body.add(rbox(0.16, 0.24, 0.08, 0.03, M.steelDark, 0, 0.2, -0.14));
      for (const sx of [-1, 1]) body.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 8), M.steel, sx * 0.05, 0.18, -0.19));
      const load = [0, 1, 2].map(i => { const c = box(0.1, 0.055, 0.02, M.ore, 0, 0.24 + i * 0.065, -0.185); body.add(c); return c; });
      const legs = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.08, 0.2, 0); p.add(box(0.09, 0.18, 0.1, M.steelDark, 0, -0.18, 0)); p.add(box(0.11, 0.05, 0.14, M.orangeDark, 0, -0.2, 0.02)); root.add(p); return p; });
      const arms = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.19, 0.4, 0); p.add(box(0.08, 0.2, 0.08, M.steel, 0, -0.2, 0)); body.add(p); return p; });
      const drill = new THREE.Group();
      const bit = mesh(new THREE.ConeGeometry(0.045, 0.16, 8).rotateX(Math.PI / 2), M.steelLight, 0, 0, 0.1);
      drill.add(box(0.09, 0.09, 0.08, M.orange, 0, -0.045, 0), bit);
      drill.position.set(0, -0.2, 0.02);
      arms[1]!.add(drill);
      return {
        root, body, legs, arms, load, speed: 1.6, toolTip: new THREE.Vector3(0.19, 0.3, 0.42),
        mine(k, on) {
          arms[1]!.rotation.x = on ? -1.4 + Math.sin(k * 18) * 0.05 : 0;
          bit.rotation.z = on ? k * 40 : 0;
        },
      };
    },
  },
  {
    key: "C", name: "Exo-rig",
    text: "A small walker mech you pilot: white cockpit pod with a glass dome and a tiny pilot inside, digitigrade legs, a drill arm and a claw, and an ore basket behind. Bigger and slower; it reads like a machine doing the work.",
    build() {
      const root = new THREE.Group(), body = new THREE.Group();
      root.add(body);
      body.add(rbox(0.36, 0.26, 0.32, 0.07, M.suit, 0, 0.45, 0));
      body.add(box(0.37, 0.05, 0.33, M.orange, 0, 0.5, 0));
      body.add(mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.visor, 0, 0.71, 0.03));
      body.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), M.suit, 0, 0.75, 0.03));
      body.add(box(0.2, 0.03, 0.02, M.power, 0, 0.62, 0.165));
      // Ore basket at the back.
      body.add(box(0.28, 0.02, 0.16, M.steelDark, 0, 0.44, -0.24));
      for (const sx of [-1, 1]) body.add(box(0.02, 0.1, 0.16, M.steelLight, sx * 0.14, 0.44, -0.24));
      body.add(box(0.28, 0.1, 0.02, M.steelLight, 0, 0.44, -0.32));
      const load = [0, 1, 2].map(i => { const c = oreChunk(0.06); c.position.set((i - 1) * 0.08, 0.53, -0.24); body.add(c); return c; });
      // Digitigrade legs: thigh forward, shin back, foot.
      const legs = [-1, 1].map(sx => {
        const p = new THREE.Group(); p.position.set(sx * 0.14, 0.45, 0);
        const thigh = box(0.07, 0.24, 0.07, M.steel, 0, -0.22, 0.04); thigh.rotation.x = -0.35;
        const shin = box(0.06, 0.22, 0.06, M.steelLight, 0, -0.43, -0.02); shin.rotation.x = 0.3;
        p.add(thigh, shin, box(0.1, 0.04, 0.16, M.steelDark, 0, -0.45, 0.02));
        root.add(p); return p;
      });
      const arms = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.22, 0.52, 0.06); p.add(box(0.07, 0.07, 0.2, M.steel, 0, -0.035, 0.1)); body.add(p); return p; });
      const bit = mesh(new THREE.ConeGeometry(0.05, 0.18, 8).rotateX(Math.PI / 2), M.steelLight, 0, 0, 0.29);
      arms[1]!.add(box(0.1, 0.1, 0.08, M.orange, 0, -0.05, 0.2), bit);
      arms[0]!.add(box(0.03, 0.08, 0.08, M.steelLight, -0.02, -0.04, 0.23), box(0.03, 0.08, 0.08, M.steelLight, 0.02, -0.04, 0.23));
      return {
        root, body, legs, arms, load, speed: 1.3, toolTip: new THREE.Vector3(0.22, 0.5, 0.55),
        mine(k, on) {
          arms[1]!.rotation.x = on ? 0.35 + Math.sin(k * 16) * 0.05 : 0;
          bit.rotation.z = on ? k * 40 : 0;
        },
      };
    },
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
  rig.root.position.copy(rampFoot).add(new THREE.Vector3(i * 0.5 - 0.5, 0, i * 0.4));
  scene.add(rig.root);
  const el = document.createElement("div");
  el.className = "label";
  el.innerHTML = `<b>${d.key}</b><span>${d.name}</span>`;
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
  r.stride += dt * r.rig.speed * 7;
  return false;
}

function step(r: Runner, dt: number): void {
  const rig = r.rig;
  let walking = false, mining = false;
  if (r.phase === "out") {
    walking = !walkTo(r, r.node, dt, 0.72);
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
  rig.mine(time, mining);
  const s = walking ? Math.sin(r.stride) : 0;
  rig.legs[0]!.rotation.x = s * 0.6; rig.legs[1]!.rotation.x = -s * 0.6;
  if (!mining) { rig.arms[0]!.rotation.x = -s * 0.5; rig.arms[1]!.rotation.x = s * 0.5; }
  rig.body.position.y = walking ? Math.abs(Math.cos(r.stride)) * 0.025 : 0;
  rig.load.forEach((c, i) => { c.visible = i < r.carried; });
}

// ------------------------------------------------------------------ camera, focus

const target = new THREE.Vector3(0.6, 0, 2.2), wantTarget = target.clone();
let zoom = 6.2, wantZoom = 6.2;
const buttons = { fAll: -1, fA: 0, fB: 1, fC: 2 } as const;
const note = document.getElementById("note")!;
let focus = -1;
function setFocus(i: number): void {
  focus = i;
  for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.setAttribute("aria-pressed", String(idx === i));
  if (i < 0) { wantZoom = 6.2; note.textContent = "Shown at the game's default zoom. Pick one to follow it up close."; }
  else { wantZoom = 2.2; const d = DESIGNS[i]!; note.innerHTML = `<b>${d.key} · ${d.name}.</b> ${d.text}`; }
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
    lp.copy(r.rig.root.position); lp.y += 1.0;
    lp.project(camera);
    r.label.style.transform = `translate(${((lp.x + 1) / 2) * w}px, ${((1 - lp.y) / 2) * h}px) translate(-50%, -100%)`;
    r.label.classList.toggle("dim", focus >= 0 && focus !== i);
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
