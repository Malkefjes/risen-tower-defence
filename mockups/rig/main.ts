import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, EVENING, roundedBox } from "../../src/render/models";
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
function limb(parent: THREE.Object3D, x: number, y: number, upper: number, lower: number, w: number) {
  const top = new THREE.Group(); top.position.set(x, y, 0); parent.add(top);
  top.add(mesh(new THREE.SphereGeometry(w * 0.6, 10, 8), M.steel));
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
const TORSO_W = 2 * HIP_W + LEG_W, TORSO_D = 0.15, WAIST_H = 0.08, TORSO_H = 0.26;
const TORSO_Y = HIP_Y + WAIST_H * 0.5, TORSO_TOP = TORSO_Y + TORSO_H;
const ARM_W = 0.062, UPPER_ARM = 0.17, FOREARM = 0.16;

function buildRig() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);

  // Waist and torso: the torso is exactly as wide as the hips and legs.
  body.add(rbox(TORSO_W * 0.85, WAIST_H, TORSO_D * 0.85, 0.02, M.steelDark, 0, HIP_Y - WAIST_H * 0.5, 0));
  body.add(rbox(TORSO_W, TORSO_H, TORSO_D, 0.045, M.suit, 0, TORSO_Y, 0));
  const chestZ = TORSO_D / 2 + bulge(0.045, TORSO_H);
  body.add(box(TORSO_W * 0.62, 0.1, 0.02, M.orange, 0, TORSO_Y + 0.12, chestZ));
  body.add(box(TORSO_W * 0.4, 0.018, 0.012, M.power, 0, TORSO_Y + 0.07, chestZ + 0.002));

  // A short neck, then a square helmet with a front visor.
  const NECK_H = 0.04;
  body.add(mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.014, 12), M.steel, 0, TORSO_TOP + 0.007, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.03, 0.034, NECK_H, 10), M.steelDark, 0, TORSO_TOP + NECK_H / 2, 0));
  const HW = 0.13, HH = 0.12, headY = TORSO_TOP + NECK_H - 0.005;
  body.add(rbox(HW, HH, HW, 0.028, M.suit, 0, headY, 0));
  body.add(box(HW * 0.84, 0.042, 0.02, M.power, 0, headY + HH * 0.45, HW / 2 + bulge(0.028, HH)));

  // Backpack: its top is flush with the top of the torso; round cyan core and three ore canisters.
  const PACK_H = 0.24, PACK_D = 0.08;
  const backZ = -TORSO_D / 2 - bulge(0.045, TORSO_H) - PACK_D / 2 - bulge(0.025, PACK_H);
  const packFace = backZ - PACK_D / 2 - bulge(0.025, PACK_H);
  body.add(rbox(TORSO_W * 0.95, PACK_H, PACK_D, 0.025, M.steel, 0, TORSO_TOP - PACK_H, backZ));
  body.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 14).rotateX(Math.PI / 2), M.power, 0, TORSO_TOP - 0.065, packFace - 0.005));
  const load = [-1, 0, 1].map(i => { const c = box(0.04, 0.055, 0.02, M.ore, i * 0.05, TORSO_TOP - PACK_H + 0.035, packFace - 0.008); body.add(c); return c; });

  // Legs with boots.
  const legs = [-1, 1].map(sx => {
    const l = limb(root, sx * HIP_W, HIP_Y, THIGH, SHIN, LEG_W);
    l.end.add(rbox(LEG_W * 1.1, FOOT_H, 0.14, 0.015, M.steelDark, 0, -FOOT_H, 0.025));
    l.end.add(box(LEG_W * 1.12, FOOT_H * 0.55, 0.04, M.orange, 0, -FOOT_H, 0.08));
    return l;
  });
  // Arms from the top corners of the torso.
  const arms = [-1, 1].map(sx => limb(body, sx * (TORSO_W / 2 + ARM_W / 2), TORSO_TOP - 0.03, UPPER_ARM, FOREARM, ARM_W));
  const bit = mesh(new THREE.ConeGeometry(ARM_W * 0.5, 0.12, 8), M.steelLight, 0, -0.1, 0);
  bit.rotation.x = Math.PI;
  arms[1]!.end.add(box(ARM_W * 1.2, ARM_W, ARM_W * 1.2, M.orange, 0, -ARM_W * 0.8, 0), bit);
  for (const dx of [-1, 0, 1]) arms[0]!.end.add(box(0.014, 0.05, 0.02, M.steelDark, dx * 0.019, -0.05, 0.01));

  return { root, body, legs, arms, bit, load };
}

const rig = buildRig();
rig.root.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
// In the game the rig would be shown about 30% larger than life, so it reads at the default zoom.
const SCALE = 1.3;
rig.root.scale.setScalar(SCALE);
scene.add(rig.root);

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

type Pose = "walk" | "idle" | "mine";
let pose: Pose = "walk";

/**
 * Walk in place. Each leg swings forward and back; the knee bends while the leg
 * travels forward (the lift), and the body dips at mid-stride and rises when a
 * leg passes under it. The hip drops to match the knee bend, so feet never sink.
 */
function animate(t: number): void {
  const s = t * 7;
  const { legs, arms, body, bit } = rig;
  if (pose === "walk") {
    [0, 1].forEach(i => {
      const ph = s + i * Math.PI;
      const swing = Math.sin(ph) * 0.42;
      const lift = Math.max(0, Math.cos(ph)) * 0.85;
      poseLeg(legs[i]!, -swing, lift + 0.08);
    });
    poseArm(arms[0]!, Math.sin(s) * 0.45, -0.35);
    poseArm(arms[1]!, Math.sin(s + Math.PI) * 0.45, -0.35);
    body.position.y = -0.012 + Math.abs(Math.sin(s)) * 0.02;
    body.rotation.set(0.04, Math.sin(s) * 0.05, 0);
  } else if (pose === "idle") {
    poseLeg(legs[0]!, 0, 0.06); poseLeg(legs[1]!, 0, 0.06);
    poseArm(arms[0]!, 0.05, -0.2); poseArm(arms[1]!, 0.05, -0.2);
    body.position.y = Math.sin(t * 2) * 0.004;
    body.rotation.set(0, 0, 0);
  } else {
    poseLeg(legs[0]!, -0.3, 0.3); poseLeg(legs[1]!, 0.25, 0.1);
    poseArm(arms[1]!, -1.3 + Math.sin(t * 14) * 0.05, -0.2);
    poseArm(arms[0]!, -0.6, -0.7);
    body.position.y = -0.02;
    body.rotation.set(0.14, -0.1, 0);
  }
  // Keep the lowest foot on the snow: drop the rig by how much the bent legs got shorter.
  if (pose !== "idle") {
    const planted = Math.min(...legs.map(l => {
      const a = l.top.rotation.x, b = a + l.mid.rotation.x;
      return HIP_Y - FOOT_H - (THIGH * Math.cos(a) + SHIN * Math.cos(b));
    }));
    rig.root.position.y = -planted * SCALE;
  } else rig.root.position.y = 0;
  bit.rotation.y = pose === "mine" ? t * 40 : 0;
  rig.load.forEach((c, i) => { c.visible = pose === "mine" ? i < Math.floor((t % 3) / 0.75) : true; });
}

// Rocket nearby for scale.
const ship = models.create("ship");
ship.position.set(-3.5, 0, -2.5);
scene.add(ship);
for (const [name, x, z, s] of [["tree", -6, 3, 1.0], ["tree", 4, -5, 1.1], ["rock", 3, 3, 12], ["tree", 6, 2, 0.9]] as const) {
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
(["walk", "idle", "mine"] as Pose[]).forEach(p => {
  const id = `p${p[0]!.toUpperCase()}${p.slice(1)}`;
  document.getElementById(id)!.addEventListener("click", () => { pose = p; press(["pWalk", "pIdle", "pMine"], id); });
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

const clock = new THREE.Clock();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let time = 0, zoom = 1.1, heading = Math.PI / 4;
const tip = new THREE.Vector3();

function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  (ship.userData.update as (t: number) => void)(time);
  if (spinning) heading += dt * 0.5;
  rig.root.rotation.y = heading;
  animate(time);

  if (pose === "mine" && Math.random() < dt * 30) {
    rig.root.updateMatrixWorld(true);
    rig.bit.getWorldPosition(tip);
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

  zoom += ((closeUp ? 1.3 : 6.2) - zoom) * (1 - Math.exp(-dt * 4));
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  const z = a < 1.2 ? zoom * (1.35 / Math.max(0.5, a)) : zoom;
  Object.assign(camera, { left: -z * a, right: z * a, top: z, bottom: -z });
  camera.updateProjectionMatrix();
  const look = new THREE.Vector3(0, closeUp ? 0.6 : 0, 0);
  camera.position.copy(look).add(CAM_OFFSET);
  camera.lookAt(look);
  sun.position.set(EVENING.sunOffset[0], EVENING.sunOffset[1], EVENING.sunOffset[2]);
  sun.target.position.set(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
