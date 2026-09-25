import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, roundedBox, type TurretRig } from "../../src/render/models";
import type { ShipRig } from "../../src/render/ship";
import "./style.css";

// Exo-rig mockup: three piloted rigs for the avatar, next to the real Rocket, each running
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

// ------------------------------------------------------------------ the three rigs

/** What the loop animates. Models face +z. */
interface Rig {
  root: THREE.Group;
  body: THREE.Object3D;
  /** Ore carried: chunks shown in order as the load grows. */
  load: THREE.Object3D[];
  /** Pose for a walk cycle: `s` is the stride phase. */
  walk(s: number, walking: boolean): void;
  /** Mining pose; `t` is the clock. */
  mine(t: number, on: boolean): void;
  speed: number;
  /** Label height above the ground. */
  height: number;
}

interface Design { key: string; name: string; text: string; build(): Rig }

/** A jointed leg: hip → thigh → knee → shin → foot. Knee bends forward or back. */
function leg(parent: THREE.Object3D, x: number, y: number, thigh: number, shin: number, w: number, back: boolean, footLen: number) {
  const hip = new THREE.Group(); hip.position.set(x, y, 0);
  hip.add(mesh(new THREE.SphereGeometry(w * 0.75, 8, 6), M.steelDark));
  const th = box(w, thigh, w, M.steel, 0, -thigh, 0);
  hip.add(th);
  const knee = new THREE.Group(); knee.position.y = -thigh; hip.add(knee);
  knee.add(mesh(new THREE.SphereGeometry(w * 0.62, 8, 6), M.orange));
  knee.add(box(w * 0.85, shin, w * 0.85, M.steelLight, 0, -shin, 0));
  const ankle = new THREE.Group(); ankle.position.y = -shin; knee.add(ankle);
  ankle.add(box(w * 1.3, 0.04, footLen, M.steelDark, 0, -0.02, footLen * 0.25));
  ankle.add(box(w * 1.3, 0.03, footLen * 0.3, M.orange, 0, 0.0, footLen * 0.62));
  parent.add(hip);
  // Rest pose: digitigrade legs kick the knee forward and the shin back.
  const rest = back ? { hip: -0.45, knee: 0.9 } : { hip: 0.12, knee: -0.24 };
  const pose = (swing: number, lift: number) => {
    hip.rotation.x = rest.hip + swing;
    knee.rotation.x = rest.knee + (back ? lift : -lift);
    ankle.rotation.x = -(hip.rotation.x + knee.rotation.x);
  };
  pose(0, 0);
  return pose;
}

const DESIGNS: Design[] = [
  {
    key: "A", name: "Strider",
    text: "A refined two-legged walker: an egg-shaped white cockpit with a big dark canopy, an orange band and a cyan headlight strip, on bird-like jointed legs. A drill arm and a claw at the shoulders, an ore pod on the back. Light and agile.",
    build() {
      const root = new THREE.Group(), body = new THREE.Group();
      root.add(body);
      const pod = mesh(new THREE.SphereGeometry(0.25, 16, 12), M.suit, 0, 0.72, 0);
      pod.scale.set(1, 0.85, 1.12);
      body.add(pod);
      const canopy = mesh(new THREE.SphereGeometry(0.2, 16, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.18, Math.PI * 0.42), M.visor, 0, 0.74, 0.08);
      canopy.scale.set(1, 0.85, 1.12);
      body.add(canopy);
      const band = mesh(new THREE.TorusGeometry(0.25, 0.022, 6, 24), M.orange, 0, 0.68, 0);
      band.rotation.x = Math.PI / 2; band.scale.set(1, 1.12, 1);
      body.add(band);
      body.add(box(0.16, 0.025, 0.03, M.power, 0, 0.6, 0.27));
      body.add(box(0.012, 0.16, 0.012, M.steelLight, -0.1, 0.9, -0.08), mesh(new THREE.SphereGeometry(0.02, 6, 4), M.orange, -0.1, 1.07, -0.08));
      body.add(rbox(0.2, 0.1, 0.18, 0.03, M.steelDark, 0, 0.47, -0.02));
      // Ore pod on the back.
      body.add(rbox(0.26, 0.16, 0.14, 0.04, M.steel, 0, 0.62, -0.3));
      const load = [0, 1, 2].map(i => { const c = oreChunk(0.05); c.position.set((i - 1) * 0.07, 0.8, -0.3); body.add(c); return c; });
      // Arms at the shoulders.
      const drillArm = new THREE.Group(); drillArm.position.set(0.27, 0.68, 0.04);
      drillArm.add(box(0.07, 0.07, 0.16, M.steel, 0, -0.035, 0.06), box(0.09, 0.09, 0.09, M.orange, 0, -0.045, 0.17));
      const bit = mesh(new THREE.ConeGeometry(0.04, 0.16, 8).rotateX(Math.PI / 2), M.steelLight, 0, 0, 0.29);
      drillArm.add(bit);
      const clawArm = new THREE.Group(); clawArm.position.set(-0.27, 0.68, 0.04);
      clawArm.add(box(0.06, 0.06, 0.18, M.steel, 0, -0.03, 0.07));
      for (const sx of [-1, 1]) clawArm.add(box(0.02, 0.06, 0.08, M.steelLight, sx * 0.025, -0.03, 0.19));
      body.add(drillArm, clawArm);
      const legs = [-1, 1].map(sx => leg(root, sx * 0.13, 0.48, 0.2, 0.24, 0.06, true, 0.16));
      return {
        root, body, load, speed: 1.6, height: 1.2,
        walk(s, on) {
          const a = on ? Math.sin(s) * 0.45 : 0, lift = (k: number) => (on ? Math.max(0, Math.sin(k)) * 0.5 : 0);
          legs[0]!(a, lift(s + Math.PI / 2)); legs[1]!(-a, lift(s - Math.PI / 2));
          body.position.y = on ? Math.abs(Math.cos(s)) * 0.03 : 0;
          body.rotation.z = on ? Math.sin(s) * 0.04 : 0;
        },
        mine(t, on) {
          drillArm.rotation.x = on ? 0.35 + Math.sin(t * 16) * 0.05 : 0;
          bit.rotation.z = on ? t * 40 : 0;
          clawArm.rotation.x = on ? 0.2 : 0;
        },
      };
    },
  },
  {
    key: "B", name: "Loader",
    text: "An open-frame power loader: the pilot sits visible inside an orange roll cage, driving chunky hydraulic legs and two long arms, a drill and a grab. An ore bin on the back. Industrial and honest: you see the person doing the work.",
    build() {
      const root = new THREE.Group(), body = new THREE.Group();
      root.add(body);
      // Seat and pilot.
      body.add(box(0.26, 0.06, 0.22, M.steelDark, 0, 0.42, -0.02));
      body.add(box(0.26, 0.26, 0.05, M.steelDark, 0, 0.48, -0.13));
      body.add(mesh(new THREE.CapsuleGeometry(0.07, 0.08, 4, 8), M.suit, 0, 0.58, 0));
      body.add(mesh(new THREE.SphereGeometry(0.075, 12, 8), M.suit, 0, 0.74, 0.01));
      body.add(box(0.09, 0.035, 0.02, M.visor, 0, 0.73, 0.07));
      // Roll cage: orange tubes.
      for (const [x, z] of [[-0.16, 0.12], [0.16, 0.12], [-0.16, -0.16], [0.16, -0.16]] as const) body.add(box(0.035, 0.46, 0.035, M.orange, x, 0.42, z));
      body.add(box(0.36, 0.035, 0.035, M.orange, 0, 0.86, 0.12), box(0.36, 0.035, 0.035, M.orange, 0, 0.86, -0.16));
      body.add(box(0.035, 0.035, 0.31, M.orange, -0.16, 0.86, -0.02), box(0.035, 0.035, 0.31, M.orange, 0.16, 0.86, -0.02));
      body.add(box(0.14, 0.02, 0.02, M.power, 0, 0.84, 0.14));
      // Chassis and ore bin.
      body.add(rbox(0.34, 0.12, 0.3, 0.03, M.steel, 0, 0.3, -0.02));
      body.add(box(0.3, 0.14, 0.12, M.steelDark, 0, 0.36, -0.26));
      body.add(box(0.3, 0.02, 0.12, M.steelLight, 0, 0.5, -0.26));
      const load = [0, 1, 2].map(i => { const c = oreChunk(0.05); c.position.set((i - 1) * 0.08, 0.53, -0.26); body.add(c); return c; });
      // Hydraulic arms from the top of the cage.
      const arm = (sx: number) => {
        const g = new THREE.Group(); g.position.set(sx * 0.2, 0.8, 0.08);
        g.add(box(0.07, 0.07, 0.24, M.orange, 0, -0.035, 0.1));
        const fore = new THREE.Group(); fore.position.set(0, 0, 0.22); g.add(fore);
        fore.add(box(0.06, 0.22, 0.06, M.steel, 0, -0.22, 0));
        body.add(g);
        return { g, fore };
      };
      const R = arm(1), L = arm(-1);
      const bit = mesh(new THREE.ConeGeometry(0.045, 0.16, 8), M.steelLight, 0, -0.3, 0);
      bit.rotation.x = Math.PI;
      R.fore.add(box(0.09, 0.08, 0.09, M.steelDark, 0, -0.26, 0), bit);
      L.fore.add(box(0.12, 0.03, 0.08, M.steelLight, 0, -0.25, 0.03), box(0.12, 0.08, 0.02, M.steelLight, 0, -0.25, 0.07));
      const legs = [-1, 1].map(sx => leg(root, sx * 0.14, 0.3, 0.14, 0.14, 0.08, false, 0.2));
      return {
        root, body, load, speed: 1.3, height: 1.15,
        walk(s, on) {
          const a = on ? Math.sin(s) * 0.35 : 0, lift = (k: number) => (on ? Math.max(0, Math.sin(k)) * 0.45 : 0);
          legs[0]!(a, lift(s + Math.PI / 2)); legs[1]!(-a, lift(s - Math.PI / 2));
          body.position.y = on ? Math.abs(Math.cos(s)) * 0.025 : 0;
          if (on) { R.g.rotation.x = Math.sin(s) * 0.12; L.g.rotation.x = -Math.sin(s) * 0.12; }
        },
        mine(t, on) {
          if (!on) { R.fore.rotation.x = 0; L.fore.rotation.x = 0; bit.rotation.y = 0; return; }
          R.g.rotation.x = 0.1; R.fore.rotation.x = -0.9 + Math.sin(t * 14) * 0.08;
          L.g.rotation.x = 0; L.fore.rotation.x = -0.5;
          bit.rotation.y = t * 40;
        },
      };
    },
  },
  {
    key: "C", name: "Crab",
    text: "A low four-legged walker: a white hull with orange side panels and a dark cockpit dome up front, a drill boom that swings down to the rock, and an ore hopper on top. The most stable and alien-planet looking silhouette.",
    build() {
      const root = new THREE.Group(), body = new THREE.Group();
      root.add(body);
      body.add(rbox(0.46, 0.18, 0.5, 0.07, M.suit, 0, 0.36, 0));
      for (const sx of [-1, 1]) body.add(box(0.02, 0.1, 0.36, M.orange, sx * 0.235, 0.4, 0));
      body.add(rbox(0.3, 0.08, 0.36, 0.03, M.steelDark, 0, 0.3, 0));
      const dome = mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.visor, 0, 0.54, 0.1);
      dome.scale.set(1, 0.9, 1.1);
      body.add(dome, box(0.2, 0.025, 0.02, M.power, 0, 0.46, 0.25));
      // Ore hopper on top, behind the dome.
      body.add(box(0.24, 0.08, 0.16, M.steel, 0, 0.54, -0.14));
      const load = [0, 1, 2].map(i => { const c = oreChunk(0.05); c.position.set((i - 1) * 0.07, 0.68, -0.14); body.add(c); return c; });
      // Drill boom hanging off the front.
      const boom = new THREE.Group(); boom.position.set(0, 0.4, 0.25); body.add(boom);
      boom.add(box(0.07, 0.07, 0.22, M.orange, 0, -0.035, 0.1));
      const tipG = new THREE.Group(); tipG.position.set(0, 0, 0.21); boom.add(tipG);
      tipG.add(box(0.06, 0.16, 0.06, M.steel, 0, -0.16, 0));
      const bit = mesh(new THREE.ConeGeometry(0.04, 0.14, 8), M.steelLight, 0, -0.22, 0);
      bit.rotation.x = Math.PI;
      tipG.add(bit);
      // Four spider legs.
      const legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => {
        const hip = new THREE.Group(); hip.position.set(sx! * 0.2, 0.36, sz! * 0.18); body.add(hip);
        // Splay front legs forward and back legs backward.
        hip.rotation.y = -sx! * sz! * 0.4;
        const upper = new THREE.Group(); hip.add(upper);
        upper.rotation.z = -sx! * 0.7;
        upper.add(box(0.05, 0.05, 0.05, M.steelDark, 0, -0.025, 0));
        const u = box(0.2, 0.05, 0.05, M.steel, sx! * 0.1, -0.025, 0); upper.add(u);
        const knee = new THREE.Group(); knee.position.set(sx! * 0.2, 0, 0); upper.add(knee);
        knee.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), M.orange));
        const lower = box(0.045, 0.34, 0.045, M.steelLight, 0, -0.34, 0);
        knee.add(lower);
        knee.rotation.z = sx! * 0.75;
        return { upper, sx: sx!, sz: sz! };
      });
      return {
        root, body, load, speed: 1.2, height: 1.0,
        walk(s, on) {
          legs.forEach((l, i) => {
            const ph = s + (i === 0 || i === 3 ? 0 : Math.PI);
            l.upper.rotation.z = -l.sx * (0.7 + (on ? Math.max(0, Math.sin(ph)) * 0.35 : 0));
            l.upper.rotation.y = on ? Math.cos(ph) * 0.3 : 0;
          });
          body.position.y = on ? Math.abs(Math.sin(s * 2)) * 0.015 : 0;
        },
        mine(t, on) {
          boom.rotation.x = on ? 0.5 + Math.sin(t * 12) * 0.06 : 0;
          tipG.rotation.x = on ? -0.3 : 0;
          bit.rotation.y = on ? t * 40 : 0;
          body.rotation.x = on ? 0.06 : 0;
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
  // A touch bigger than life so the rig reads at the game's default zoom.
  rig.root.scale.setScalar(1.25);
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
    lp.copy(r.rig.root.position); lp.y += r.rig.height * 1.25;
    lp.project(camera);
    r.label.style.transform = `translate(${((lp.x + 1) / 2) * w}px, ${((1 - lp.y) / 2) * h}px) translate(-50%, -100%)`;
    r.label.classList.toggle("dim", focus >= 0 && focus !== i);
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
