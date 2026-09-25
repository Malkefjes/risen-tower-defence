import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, roundedBox } from "../../src/render/models";
import "./style.css";

// Player rig B2, revised: no shoulder pads, torso as wide as the hips, backpack
// flush with the top of the torso, square helmet with visors. The rig walks in
// place on a slow turntable so every side can be judged; the Rocket stands
// nearby for scale.
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
const models = createDefaultModels(mat, createGlows());

scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 60 });
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
  orange: std(EVENING.wallA),
  steel: std("#3d4457", { roughness: 0.55 }),
  steelDark: std("#2c3142", { roughness: 0.6 }),
  steelLight: std("#8a94ab", { roughness: 0.5 }),
  power: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.8, roughness: 0.4 }),
  ore: std("#f3c75a", { emissive: "#d9962a", emissiveIntensity: 0.35, roughness: 0.4 }),
};
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
/** Box standing on y (y is its bottom). */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
/**
 * Rounded box standing on y. Its bevel pushes the sides out a little past w and d,
 * so details on a face must sit `bulge(r, h)` further out to show.
 */
const bulge = (r: number, h: number) => Math.min(r * 0.6, h / 3) * 0.8;
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(roundedBox(w, h, d, r), m, x, y, z);

// ------------------------------------------------------------------ the rig

/** A limb hanging from a pivot: upper segment, joint, lower segment. */
function limb(parent: THREE.Object3D, x: number, y: number, upper: number, lower: number, w: number, z = 0, joint = 0.6) {
  const top = new THREE.Group(); top.position.set(x, y, z); parent.add(top);
  top.add(mesh(new THREE.SphereGeometry(w * joint, 10, 8), M.steel));
  top.add(rbox(w, upper, w, w * 0.25, M.suit, 0, -upper, 0));
  const mid = new THREE.Group(); mid.position.y = -upper; top.add(mid);
  mid.add(mesh(new THREE.SphereGeometry(w * 0.55, 10, 8), M.steel));
  mid.add(rbox(w * 0.92, lower, w * 0.92, w * 0.22, M.steelDark, 0, -lower, 0));
  mid.add(box(w * 1.02, 0.055, w * 1.02, M.orange, 0, -lower * 0.55, 0));
  const end = new THREE.Group(); end.position.y = -lower; mid.add(end);
  return { top, mid, end };
}

// Proportions. Leg length (thigh + shin + foot) equals hip height, so feet sit on the snow.
const THIGH = 0.21, SHIN = 0.2, FOOT_H = 0.045, HIP_Y = THIGH + SHIN + FOOT_H;
const HIP_W = 0.065, LEG_W = 0.075;
const WAIST_H = 0.08, TORSO_H = 0.26;
const TORSO_Y = HIP_Y + WAIST_H * 0.5, TORSO_TOP = TORSO_Y + TORSO_H;
/** Visible torso width: in line with the outer edges of the hips. */
/** Hips: the outer edges of the legs. The pelvis and torso are exactly this wide. */
const HIPS_W = 2 * HIP_W + LEG_W + 2 * 0.009;
const HIPS_D = 0.127;
/** Pelvis depth, and the visible depth (with bevel) that the torso matches. */
/**
 * A rounded box scaled to an exact outer size. Its bevel makes a plain roundedBox
 * come out a little bigger than asked, so measure it and scale it to fit.
 */
function exactBox(w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = roundedBox(w, h, d, r);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.scale(w / (b.max.x - b.min.x), 1, d / (b.max.z - b.min.z));
  return mesh(g, m, x, y, z);
}
const ARM_W = 0.062, UPPER_ARM = 0.17, FOREARM = 0.16;

function buildRig() {
  // `body` is the upper-body pivot at hip height, so leaning and twisting turn the torso
  // over the hips instead of sliding it off them. Its parts live in `torso`, in rig space.
  const root = new THREE.Group(), body = new THREE.Group(), torso = new THREE.Group();
  body.position.y = HIP_Y + HIP_Y;
  torso.position.y = -HIP_Y;
  body.add(torso);
  root.add(body);

  // Pelvis: part of the hips (not the torso), centred over both hip joints.
  root.add(exactBox(HIPS_W, WAIST_H, HIPS_D, 0.045, M.steelDark, 0, HIP_Y - WAIST_H * 0.5, 0));

  // Torso: exactly as wide as the hips and legs.
  // The rounded box's bevel bulges past its width, so subtract it: the torso's visible width matches the hips.
  // Same visible depth as the pelvis.
  torso.add(exactBox(HIPS_W, TORSO_H, HIPS_D, 0.045, M.suit, 0, TORSO_Y, 0));

  // A short neck, then a square helmet with a front visor.
  const NECK_H = 0.04;
  torso.add(mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.014, 12), M.steel, 0, TORSO_TOP + 0.007, 0));
  torso.add(mesh(new THREE.CylinderGeometry(0.03, 0.034, NECK_H, 10), M.steelDark, 0, TORSO_TOP + NECK_H / 2, 0));
  const HW = 0.13, HH = 0.12, headY = TORSO_TOP + NECK_H - 0.005;
  torso.add(rbox(HW, HH, HW, 0.028, M.suit, 0, headY, 0));
  torso.add(box(HW * 0.84, 0.042, 0.02, M.power, 0, headY + HH * 0.45, HW / 2 + bulge(0.028, HH)));

  // Backpack: its top is flush with the top of the torso; round cyan core and three ore canisters.
  const PACK_H = 0.2, PACK_D = 0.065;
  const backZ = -HIPS_D / 2 - PACK_D / 2;
  const packFace = backZ - PACK_D / 2;
  torso.add(exactBox(HIPS_W * 0.8, PACK_H, PACK_D, 0.025, M.steel, 0, TORSO_TOP - PACK_H, backZ));
  torso.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 14).rotateX(Math.PI / 2), M.power, 0, TORSO_TOP - 0.06, packFace - 0.005));
  const load: THREE.Object3D[] = [];

  // Legs with boots.
  const legs = [-1, 1].map(sx => {
    // Hip joints sit in the middle of the pelvis.
    const l = limb(root, sx * HIP_W, HIP_Y, THIGH, SHIN, LEG_W, 0, 0.5);
    l.end.add(rbox(LEG_W * 1.1, FOOT_H, 0.14, 0.015, M.steelDark, 0, -FOOT_H, 0.025));
    l.end.add(box(LEG_W * 1.12, FOOT_H * 0.55, 0.04, M.orange, 0, -FOOT_H, 0.08));
    return l;
  });
  // Arms from the top corners of the torso.
  const arms = [-1, 1].map(sx => limb(torso, sx * (HIPS_W / 2 + ARM_W / 2), TORSO_TOP - 0.03, UPPER_ARM, FOREARM, ARM_W));
  // Multitool: a blocky prefab tool gun locked to the wrist, pointing straight on along the forearm.
  const tool = new THREE.Group();
  tool.position.y = -0.03;
  tool.rotation.x = Math.PI / 2;
  arms[1]!.end.add(tool);
  tool.add(box(0.03, 0.06, 0.035, M.steelDark, 0, -0.035, -0.015));            // grip, in the hand
  tool.add(rbox(0.05, 0.055, 0.16, 0.012, M.suit, 0, 0.015, 0.035));            // body
  for (const sx of [-1, 1]) tool.add(box(0.004, 0.028, 0.08, M.orange, sx * (0.025 + bulge(0.012, 0.055)), 0.028, 0.03)); // side panels
  tool.add(box(0.034, 0.034, 0.06, M.steelDark, 0, 0.025, 0.14));               // barrel
  const emitter = box(0.024, 0.024, 0.012, M.power, 0, 0.03, 0.175);            // cyan emitter
  tool.add(emitter);
  const beam = mesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), M.power, 0, 0.042, 0.18);
  beam.scale.z = 0.3;
  beam.visible = false;
  tool.add(beam);
  const bit = beam;

  return { root, body, legs, arms, bit, load, tool, beam, emitter };
}

const rig = buildRig();
rig.root.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
// In the game the rig would be shown about 30% larger than life, so it reads at the default zoom.
const SCALE = 1.3;
rig.root.scale.setScalar(SCALE);
// The mover places the rig in the world (position, heading, jump height);
// rig.root inside it only carries the small foot-planting correction.
const mover = new THREE.Group();
mover.add(rig.root);
scene.add(mover);

/** Stance and swing for one leg: hip swing, knee bend (backwards), foot kept level. */
function poseLeg(l: ReturnType<typeof limb>, swing: number, bend: number): void {
  l.top.rotation.x = swing;
  l.mid.rotation.x = bend;
  l.end.rotation.x = -(swing + bend);
}
function poseArm(l: ReturnType<typeof limb>, swing: number, bend: number): void {
  l.top.rotation.x = swing;
  l.mid.rotation.x = bend;
}

type Pose = "run" | "idle" | "mine" | "build" | "jump" | "hop";
let pose: Pose = "run";

/**
 * Walk in place. Each leg swings forward and back; the knee bends while the leg
 * travels forward (the lift), and the body dips at mid-stride and rises when a
 * leg passes under it. The hip drops to match the knee bend, so feet never sink.
 */
let rootY = 0;
/** Smooth minimum: like Math.min, but eases between the two instead of switching with a jolt. */
const softMin = (a: number, b: number, k = 40) => -Math.log(Math.exp(-k * a) + Math.exp(-k * b)) / k;

/** Jump timing, as fractions of JUMP_TIME: crouch, then air, then the landing crouch. */
const JUMP_TIME = 0.8, CROUCH_END = 0.2, LAND_START = 0.78;
/** Height of the arc above the straight line between take-off and landing. */
const JUMP_ARC = 0.42;
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

/** Jump pose for k in 0..1. Returns how far through the airborne part it is (0..1), for the arc. */
function jumpPose(k: number): number {
  const { legs, arms, body } = rig;
  let crouch = 0, air = 0;
  if (k < CROUCH_END) crouch = smooth(k / CROUCH_END);
  else if (k < LAND_START) air = (k - CROUCH_END) / (LAND_START - CROUCH_END);
  else crouch = 0.75 * (1 - smooth((k - LAND_START) / (1 - LAND_START)));
  if (k < CROUCH_END || k >= LAND_START) {
    // Crouch: thighs forward, knees bent, lean in, arms swing back.
    poseLeg(legs[0]!, -0.55 * crouch, 1.1 * crouch); poseLeg(legs[1]!, -0.55 * crouch, 1.1 * crouch);
    poseArm(arms[0]!, 0.7 * crouch, -0.3); poseArm(arms[1]!, 0.7 * crouch, -0.3);
    body.rotation.set(0.28 * crouch, 0, 0);
  } else {
    // Airborne: legs tuck up, then reach down for the landing; arms swing up and forward.
    const tuck = Math.sin(Math.PI * Math.min(1, air * 1.15));
    poseLeg(legs[0]!, -0.2 - 0.5 * tuck, 0.25 + 1.0 * tuck);
    poseLeg(legs[1]!, -0.1 - 0.45 * tuck, 0.2 + 0.9 * tuck);
    poseArm(arms[0]!, -0.9 * tuck - 0.1, -0.4); poseArm(arms[1]!, -0.9 * tuck - 0.1, -0.4);
    body.rotation.set(0.1, 0, 0);
  }
  body.position.y = HIP_Y + 0;
  return k < CROUCH_END ? 0 : k < LAND_START ? air : 1;
}

let jumpK = -1;
/** Running-jump progress 0..1 while leaping in the wall-hop loop, else -1. */
let leapK = -1;
const LEAP_BLEND = 0.3;
/** Part of a leap spent in the air, and the arc height above the line between take-off and landing. */
const LEAP_AIR: [number, number] = [0.12, 0.9];
const LEAP_ARC = 0.32;
/** The run cycle at time t. */
function runPose(t: number): void {
  const { legs, arms, body } = rig;
  const r = t * RUN_CADENCE;
    [0, 1].forEach(i => {
      const ph = r + i * Math.PI;
      // Long stride: the hip swings well forward and back.
      const hip = -Math.sin(ph) * 0.6;
      // The knee folds as the leg swings through (heel kicks up behind), and stays soft in stance.
      const fold = 1.3 * ((1 + Math.cos(ph - 0.45)) / 2) ** 2;
      poseLeg(legs[i]!, hip, 0.1 + fold);
    });
    // Arms pump opposite the legs with the elbows bent.
    poseArm(arms[0]!, Math.sin(r) * 0.6 - 0.1, -1.25);
    poseArm(arms[1]!, -Math.sin(r) * 0.6 - 0.1, -1.25);
    // Forward lean and a little counter-twist; the body sits steady relative to the hips.
    body.position.y = HIP_Y + 0;
    body.rotation.set(0.14, Math.sin(r) * 0.06, 0);
}

/** Every animated joint value, so two poses can be blended. */
function capturePose(): number[] {
  const { legs, arms, body } = rig;
  const joints = [...legs.flatMap(l => [l.top, l.mid, l.end]), ...arms.flatMap(a => [a.top, a.mid])];
  return [...joints.map(j => j.rotation.x), body.rotation.x, body.rotation.y, body.position.y];
}
function applyPose(v: number[]): void {
  const { legs, arms, body } = rig;
  const joints = [...legs.flatMap(l => [l.top, l.mid, l.end]), ...arms.flatMap(a => [a.top, a.mid])];
  joints.forEach((j, i) => { j.rotation.x = v[i]!; });
  const n = joints.length;
  body.rotation.x = v[n]!; body.rotation.y = v[n + 1]!; body.position.y = v[n + 2]!;
}

/** Running leap for k in 0..1: drive one knee up, trailing leg stretched back, then reach down to land. */
function leapPose(k: number): void {
  const { legs, arms, body } = rig;
  const reach = smooth((k - 0.45) / 0.45);
  poseLeg(legs[0]!, -0.75 + 0.35 * reach, 1.15 - 0.8 * reach);
  poseLeg(legs[1]!, 0.45 - 0.7 * reach, 0.55 - 0.25 * reach);
  poseArm(arms[0]!, 0.45 - 0.3 * reach, -1.2);
  poseArm(arms[1]!, -0.7 + 0.4 * reach, -1.2);
  body.rotation.set(0.2, 0, 0);
  body.position.y = HIP_Y;
}

/** Run cycle speed (radians per second of the stride phase), flight bounce and matching ground speed. */
const RUN_CADENCE = 9.5, RUN_BOUNCE = 0.025, RUN_SPEED = 1.8;

function animate(t: number, dt: number): void {
  const { legs, arms, body } = rig;
  if (jumpK >= 0) {
    jumpPose(jumpK);
  } else if (pose === "run" || pose === "hop") {
    runPose(t);
    if (leapK >= 0) {
      // Running jump: blend from the run into the leap and back, so the stride never stops.
      const a = capturePose();
      leapPose(leapK);
      const b = capturePose();
      const w = smooth(leapK / LEAP_BLEND) * smooth((1 - leapK) / LEAP_BLEND);
      applyPose(a.map((v, i) => v + (b[i]! - v) * w));
    }
  } else if (pose === "idle") {

    poseLeg(legs[0]!, 0, 0.06); poseLeg(legs[1]!, 0, 0.06);
    poseArm(arms[0]!, 0.05, -0.2); poseArm(arms[1]!, 0.05, -0.2);
    body.position.y = HIP_Y + Math.sin(t * 2) * 0.004;
    body.rotation.set(0, 0, 0);
  } else if (pose === "build") {
    // Tool at the ready, aimed where a piece is being placed.
    poseLeg(legs[0]!, -0.12, 0.14); poseLeg(legs[1]!, 0.1, 0.08);
    poseArm(arms[1]!, -0.95 + Math.sin(t * 3) * 0.03, -0.35);
    poseArm(arms[0]!, -0.35, -0.8);
    body.position.y = HIP_Y + -0.008;
    body.rotation.set(0.06, -0.06, 0);
  } else {
    poseLeg(legs[0]!, -0.3, 0.3); poseLeg(legs[1]!, 0.25, 0.1);
    poseArm(arms[1]!, -1.25 + Math.sin(t * 14) * 0.02, -0.25);
    poseArm(arms[0]!, -0.6, -0.7);
    body.position.y = HIP_Y + -0.02;
    body.rotation.set(0.14, -0.1, 0);
  }
  // Keep the lower foot on the snow, eased so the hand-over between feet has no jolt.
  const drops = legs.map(l => {
    const a = l.top.rotation.x, b = a + l.mid.rotation.x;
    return HIP_Y - FOOT_H - (THIGH * Math.cos(a) + SHIN * Math.cos(b));
  });
  const airborne = (jumpK >= CROUCH_END && jumpK < LAND_START) || (leapK >= LEAP_AIR[0] && leapK < LEAP_AIR[1]);
  const grounded = jumpK >= 0 ? !airborne : pose !== "idle" && pose !== "build";
  let target = grounded ? -softMin(drops[0]!, drops[1]!) * SCALE : 0;
  // Running: a short, rounded flight between steps. Lowest at mid-stance, highest mid-flight.
  if (jumpK < 0 && !airborne && (pose === "run" || pose === "hop")) target += RUN_BOUNCE * (1 - Math.cos(2 * t * RUN_CADENCE)) / 2;
  rootY += (target - rootY) * Math.min(1, dt * (jumpK >= 0 ? 40 : 14));
  rig.root.position.y = rootY;
  rig.beam.visible = pose === "mine";
  rig.beam.scale.z = 0.28 + Math.sin(t * 40) * 0.02;
}

// Rocket nearby for scale.
const ship = models.create("ship");
ship.position.set(-3.5, 0, -2.5);
scene.add(ship);
for (const [name, x, z, s] of [["tree", -6, 3, 1.0], ["tree", 4, -5, 1.1], ["rock", -1, 6, 12], ["tree", 6, 2, 0.9]] as const) {
  const m = models.create(name, name === "tree" ? { scale: s, seed: x * 7 + z } : { scale: s, seed: x * 5 + z });
  m.position.set(x + 0.5, 0, z + 0.5);
  scene.add(m);
}

// Sparks in front of the drill while mining.
const sparkGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025), sparkMat = new THREE.MeshBasicMaterial({ color: "#ffe29a" });
const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];

// ------------------------------------------------------------------ controls

let spinning = true, closeUp = true;
const press = (ids: string[], on: string) => ids.forEach(id => document.getElementById(id)!.setAttribute("aria-pressed", String(id === on)));
(["run", "idle", "mine", "build", "jump", "hop"] as Pose[]).forEach(p => {
  const id = `p${p[0]!.toUpperCase()}${p.slice(1)}`;
  document.getElementById(id)!.addEventListener("click", () => { pose = p; hopT = 0; inPlaceT = 0; press(["pRun", "pIdle", "pMine", "pBuild", "pJump", "pHop"], id); });
});
document.getElementById("zClose")!.addEventListener("click", () => { closeUp = true; press(["zClose", "zGame"], "zClose"); });
document.getElementById("zGame")!.addEventListener("click", () => { closeUp = false; press(["zClose", "zGame"], "zGame"); });
document.getElementById("spin")!.addEventListener("click", e => { spinning = !spinning; (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(spinning)); });

addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

// ------------------------------------------------------------------ snow and loop

const N = 600;
const snowPos = new Float32Array(N * 3), snowSpeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 24; snowPos[i * 3 + 1] = Math.random() * 10; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 24;
  snowSpeed[i] = 0.5 + Math.random() * 0.7;
}
const sg = new THREE.BufferGeometry();
sg.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
scene.add(Object.assign(new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 })), { frustumCulled: false }));

// ------------------------------------------------------------------ wall hop

// An Armored deck wall to jump on: an I piece at cells (0..3, 0).
const hopWall = models.create("wallPiece", { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], variant: 0 });
hopWall.position.set(4, 0, 3);
scene.add(hopWall);
const W = (x: number, z: number) => new THREE.Vector3(4 + x, 0, 3 + z);
type Leg = { kind: "walk" | "jump"; from: THREE.Vector3; to: THREE.Vector3; h0: number; h1: number; dur: number };
const hopPath: Leg[] = (() => {
  const g = 0, d = DECK_TOP;
  const pts: [string, THREE.Vector3, THREE.Vector3, number, number][] = [
    ["walk", W(-1.2, 2.0), W(0.4, 1.45), g, g],
    ["jump", W(0.4, 1.45), W(0.8, 0.5), g, d],
    ["walk", W(0.8, 0.5), W(3.3, 0.5), d, d],
    ["jump", W(3.3, 0.5), W(4.2, 1.2), d, g],
    ["walk", W(4.2, 1.2), W(3.2, 2.4), g, g],
    ["walk", W(3.2, 2.4), W(-1.2, 2.0), g, g],
  ];
  return pts.map(([kind, from, to, h0, h1]) => ({
    kind: kind as Leg["kind"], from, to, h0, h1,
    // Leaps are timed at running speed (with a floor), so the rig never slows down for them.
    dur: kind === "jump" ? Math.max(0.5, from.distanceTo(to) / RUN_SPEED) : from.distanceTo(to) / RUN_SPEED,
  }));
})();
const hopTotal = hopPath.reduce((a, l) => a + l.dur, 0);
let hopT = 0, hopHeading = 0, inPlaceT = 0;

/** Place the mover along the hop path; sets jumpK while jumping. */
function followHop(dt: number): void {
  hopT = (hopT + dt) % hopTotal;
  let t = hopT, leg = hopPath[0]!;
  for (const l of hopPath) { if (t < l.dur) { leg = l; break; } t -= l.dur; }
  const k = t / leg.dur;
  jumpK = -1;
  // Constant forward speed through runs and leaps alike.
  mover.position.lerpVectors(leg.from, leg.to, k);
  if (leg.kind === "walk") {
    leapK = -1;
    mover.position.y = leg.h0;
  } else {
    leapK = k;
    // Airborne between push-off and touch-down; before and after, the feet are on the start or end surface.
    const u = Math.min(1, Math.max(0, (k - LEAP_AIR[0]) / (LEAP_AIR[1] - LEAP_AIR[0])));
    mover.position.y = leg.h0 + (leg.h1 - leg.h0) * u + 4 * LEAP_ARC * u * (1 - u);
  }
  const dir = new THREE.Vector3().subVectors(leg.to, leg.from);
  const want = Math.atan2(dir.x, dir.z);
  let d = want - hopHeading;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  hopHeading += d * Math.min(1, dt * 8);
  mover.rotation.y = hopHeading;
}

const clock = new THREE.Clock();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let time = 0, zoom = 1.1, heading = Math.PI / 4;
const tip = new THREE.Vector3();

function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  (ship.userData.update as (t: number) => void)(time);
  if (spinning) heading += dt * 0.5;
  if (pose === "hop") {
    followHop(dt);
  } else {
    mover.position.set(0, 0, 0);
    mover.rotation.y = heading;
    leapK = -1;
    if (pose === "jump") {
      // Jump in place, then stand for a moment.
      inPlaceT = (inPlaceT + dt) % (JUMP_TIME + 0.6);
      jumpK = inPlaceT < JUMP_TIME ? inPlaceT / JUMP_TIME : -1;
      const u = jumpK >= 0 ? jumpPose(jumpK) : 0;
      mover.position.y = 4 * JUMP_ARC * u * (1 - u);
    } else jumpK = -1;
  }
  animate(time, dt);

  if (pose === "mine" && Math.random() < dt * 30) {
    rig.root.updateMatrixWorld(true);
    rig.beam.localToWorld(tip.set(0, 0, 1));
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.position.copy(tip);
    scene.add(m);
    sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5), life: 0.3 });
  }
  for (const p of sparks) { p.life -= dt; p.v.y -= 6 * dt; p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(Math.max(0.01, p.life / 0.3)); }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i]!.life <= 0) { scene.remove(sparks[i]!.m); sparks.splice(i, 1); }

  if (!reduce) {
    for (let i = 0; i < N; i++) {
      snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
      if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 10;
    }
    sg.attributes.position!.needsUpdate = true;
  }

  zoom += ((closeUp ? (pose === "hop" ? 2.6 : 1.3) : 6.2) - zoom) * (1 - Math.exp(-dt * 4));
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  const z = a < 1.2 ? zoom * (1.35 / Math.max(0.5, a)) : zoom;
  Object.assign(camera, { left: -z * a, right: z * a, top: z, bottom: -z });
  camera.updateProjectionMatrix();
  const look = pose === "hop" ? new THREE.Vector3(5.6, closeUp ? 0.4 : 0, 4.4) : new THREE.Vector3(0, closeUp ? 0.6 : 0, 0);
  camera.position.copy(look).add(CAM_OFFSET);
  camera.lookAt(look);
  sun.position.set(EVENING.sunOffset[0], EVENING.sunOffset[1], EVENING.sunOffset[2]);
  sun.target.position.set(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
