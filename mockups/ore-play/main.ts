import * as THREE from "three";
import { createMaterials, EVENING } from "../../src/render/models";
import { createOreNode, type OreNodeModel } from "../../src/render/ore";
import { createRig, RigAnimator } from "../../src/render/rig";
import { Avatar, defaultAvatarTuning } from "../../src/sim/avatar";
import "./style.css";

// Ore playground: a 2×2 and a 3×3 ore node on the snow and the player rig.
// WASD runs, Space jumps, hold the left mouse button next to a node to mine it.
// Nodes break in three stages; an empty node comes back after a while (for testing).
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
scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 60 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ ore nodes

interface Node { x: number; y: number; n: number; amount: number; max: number; model: OreNodeModel; emptyFor: number }
const nodes: Node[] = [
  { x: -3, y: -1, n: 2, amount: 40, max: 40, model: createOreNode(2, 7), emptyFor: 0 },
  { x: 2, y: -2, n: 3, amount: 100, max: 100, model: createOreNode(3, 23), emptyFor: 0 },
];
for (const nd of nodes) {
  nd.model.object.position.set(nd.x + nd.n / 2, 0, nd.y + nd.n / 2);
  nd.model.setAmount(1);
  scene.add(nd.model.object);
}
const nodeAt = (x: number, y: number) => nodes.find(nd => nd.amount > 0 && x >= nd.x && x < nd.x + nd.n && y >= nd.y && y < nd.y + nd.n);
// Nodes are solid; everything else is snow.
const heightAt = (x: number, y: number) => (nodeAt(x, y) ? Infinity : 0);

/** The node within reach of the avatar (edge distance), if any. */
const REACH = 0.8;
function nodeInReach(): Node | null {
  let best: Node | null = null, bestD = REACH;
  for (const nd of nodes) {
    if (nd.amount <= 0) continue;
    const dx = Math.max(nd.x - avatar.x, 0, avatar.x - (nd.x + nd.n));
    const dy = Math.max(nd.y - avatar.y, 0, avatar.y - (nd.y + nd.n));
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = nd; }
  }
  return best;
}

// ------------------------------------------------------------------ avatar and rig

const T = defaultAvatarTuning();
const avatar = new Avatar(0.5, 3.5);
const rig = createRig();
scene.add(rig.object);
const anim = new RigAnimator(rig);

const MINE_RATE = 12; // ore per second
const RESPAWN = 20; // seconds an empty node stays gone
let carried = 0;

// ------------------------------------------------------------------ input

const keys = new Set<string>();
let jumpQueued = false;
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); if (!e.repeat) jumpQueued = true; return; }
  keys.add(k);
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => { keys.clear(); mouseDown = false; });
let mouseDown = false;
renderer.domElement.addEventListener("pointerdown", e => { if (e.button === 0) mouseDown = true; });
addEventListener("pointerup", e => { if (e.button === 0) mouseDown = false; });
renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); wantZoom = Math.min(10, Math.max(2, wantZoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

const K = Math.SQRT1_2;
function moveInput(): { x: number; y: number } {
  let r = 0, u = 0;
  if (keys.has("d")) r += 1;
  if (keys.has("a")) r -= 1;
  if (keys.has("w")) u += 1;
  if (keys.has("s")) u -= 1;
  const x = (r - u) * K, y = (-r - u) * K, l = Math.hypot(x, y);
  return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}

// ------------------------------------------------------------------ effects

const sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
const sparkMat = new THREE.MeshBasicMaterial({ color: "#ffe29a" });
const chipMat = new THREE.MeshStandardMaterial({ color: "#d9a441", flatShading: true });
const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
let shake = 0;
/** A rock breaking off: a burst of ore chunks and a small shake. */
function breakBurst(at: THREE.Vector3): void {
  shake = Math.max(shake, 0.12);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(chunkGeo, Math.random() < 0.5 ? chipMat : rockMat);
    m.position.copy(at);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    scene.add(m);
    sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3), life: 0.9 });
  }
}
const chunkGeo = new THREE.DodecahedronGeometry(0.06, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: "#3f3a36", flatShading: true });
/** Does the avatar stand in this node's footprint (so it can't respawn on top of them)? */
function nodeUnderAvatar(nd: Node): boolean {
  const r = T.radius;
  return avatar.x + r > nd.x && avatar.x - r < nd.x + nd.n && avatar.y + r > nd.y && avatar.y - r < nd.y + nd.n;
}
function spark(at: THREE.Vector3, chip: boolean): void {
  const m = new THREE.Mesh(sparkGeo, chip ? chipMat : sparkMat);
  m.position.copy(at);
  scene.add(m);
  sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.4, (Math.random() - 0.5) * 2), life: chip ? 0.6 : 0.3 });
}

const N = 800, H = 15;
const snowPos = new Float32Array(N * 3), snowSpeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 2 * H; snowPos[i * 3 + 1] = Math.random() * 12; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 2 * H;
  snowSpeed[i] = 0.5 + Math.random() * 0.7;
}
const sg = new THREE.BufferGeometry();
sg.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
snow.frustumCulled = false;
scene.add(snow);
const wrap = (v: number, c: number) => ((((v - c + H) % (2 * H)) + 2 * H) % (2 * H)) + c - H;

// ------------------------------------------------------------------ loop

const hud = document.getElementById("speed")!;
const TICK = 1 / 60;
const prev = { x: avatar.x, y: avatar.y, z: avatar.z, facing: avatar.facing };
const target = new THREE.Vector3(avatar.x, 0, avatar.y);
let acc = 0, last = performance.now(), time = 0, zoom = 3.6, wantZoom = 3.6;
const tip = new THREE.Vector3();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;

  // Mining: hold E within reach of a node. You stand still while mining.
  const node = nodeInReach();
  const mining = !!node && mouseDown;

  acc += dt;
  let landed = false;
  while (acc >= TICK) {
    prev.x = avatar.x; prev.y = avatar.y; prev.z = avatar.z; prev.facing = avatar.facing;
    const m = mining ? { x: 0, y: 0 } : moveInput();
    avatar.step(TICK, { x: m.x, y: m.y, jump: jumpQueued && !mining }, heightAt, T);
    jumpQueued = false;
    landed ||= avatar.landed;
    if (mining && node) {
      const got = Math.min(node.amount, MINE_RATE * TICK);
      node.amount -= got;
      carried += got;
      for (const p of node.model.setAmount(node.amount / node.max)) breakBurst(p);
    }
    acc -= TICK;
  }
  // Empty nodes come back after a while.
  for (const nd of nodes) {
    if (nd.amount > 0) continue;
    nd.emptyFor += dt;
    if (nd.emptyFor >= RESPAWN && !nodeUnderAvatar(nd)) { nd.amount = nd.max; nd.emptyFor = 0; nd.model.setAmount(1); }
  }
  shake = Math.max(0, shake - dt);
  const alpha = acc / TICK;
  const rx = prev.x + (avatar.x - prev.x) * alpha, ry = prev.y + (avatar.y - prev.y) * alpha;
  rig.object.position.set(rx, prev.z + (avatar.z - prev.z) * alpha, ry);
  if (mining && node) {
    // Turn to face the node's centre.
    const want = Math.atan2(node.x + node.n / 2 - rx, node.y + node.n / 2 - ry);
    let d = want - avatar.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    avatar.facing += d * Math.min(1, dt * 12);
    rig.object.rotation.y = avatar.facing;
  } else {
    const df = Math.atan2(Math.sin(avatar.facing - prev.facing), Math.cos(avatar.facing - prev.facing));
    rig.object.rotation.y = prev.facing + df * alpha;
  }
  anim.update(dt, {
    speed: avatar.speed, topSpeed: T.speed, grounded: avatar.grounded, vz: avatar.vz,
    jumpSpeed: (2 * T.jumpHeight) / T.jumpRise, landed, ready: mining, mining,
  });

  if (mining && Math.random() < dt * 40) {
    rig.object.updateMatrixWorld(true);
    rig.beam.localToWorld(tip.set(0, 0, 1));
    spark(tip, Math.random() < 0.3);
  }
  for (const p of sparks) { p.life -= dt; p.v.y -= 7 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < 0.02) { p.m.position.y = 0.02; p.v.set(0, 0, 0); } p.m.scale.setScalar(Math.max(0.01, Math.min(1, p.life / 0.3))); }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i]!.life <= 0) { scene.remove(sparks[i]!.m); sparks.splice(i, 1); }

  const left = node ? `  ·  node ${Math.ceil(node.amount)} / ${node.max}` : "";
  hud.textContent = `Ore ${Math.floor(carried)}${left}`;

  const k = 1 - Math.exp(-dt * 4);
  target.x += (rx - target.x) * k; target.z += (ry - target.z) * k;
  zoom += (wantZoom - zoom) * (1 - Math.exp(-dt * 8));
  for (let i = 0; i < N; i++) {
    snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
    if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 12;
    snowPos[i * 3] = wrap(snowPos[i * 3]!, target.x);
    snowPos[i * 3 + 2] = wrap(snowPos[i * 3 + 2]!, target.z);
  }
  sg.attributes.position!.needsUpdate = true;

  const a = container.clientWidth / Math.max(1, container.clientHeight);
  Object.assign(camera, { left: -zoom * a, right: zoom * a, top: zoom, bottom: -zoom });
  camera.updateProjectionMatrix();
  camera.position.copy(target).add(CAM_OFFSET);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * 0.06; camera.position.y += (Math.random() - 0.5) * 0.06; }
  camera.lookAt(target.x, 0, target.z);
  sun.position.set(EVENING.sunOffset[0], EVENING.sunOffset[1], EVENING.sunOffset[2]);
  sun.target.position.set(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
