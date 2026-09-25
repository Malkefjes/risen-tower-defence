import * as THREE from "three";
import { createMaterials, EVENING } from "../../src/render/models";
import { createOreNode, type NodeKind, type OreNodeModel } from "../../src/render/ore";
import { createRig, RigAnimator } from "../../src/render/rig";
import { Avatar, defaultAvatarTuning } from "../../src/sim/avatar";
import "./style.css";

// Ore playground: stone and metal nodes (one size, 3×3) on the snow and the player rig.
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

const NODE_YIELD: Record<NodeKind, number> = { stone: 1000, metal: 500 };
interface Node {
  x: number; y: number; n: number; kind: NodeKind; amount: number; max: number; model: OreNodeModel; emptyFor: number;
  /** The node's mining hotspot: appears on the first hit, moves only when a stage breaks off. */
  spot: THREE.Vector3 | null;
}
const node = (x: number, y: number, n: number, kind: NodeKind, seed: number): Node => {
  const max = NODE_YIELD[kind];
  return { x, y, n, kind, amount: max, max, model: createOreNode(n, seed, kind), emptyFor: 0, spot: null };
};
// One node size (3×3), like Rust. Stone on the left, metal on the right.
const nodes: Node[] = [
  node(-4, -3, 3, "stone", 23), node(-4, 2, 3, "stone", 5),
  node(3, -3, 3, "metal", 31), node(3, 2, 3, "metal", 13),
];
for (const nd of nodes) {
  nd.model.object.position.set(nd.x + nd.n / 2, 0, nd.y + nd.n / 2);
  nd.model.setAmount(1);
  scene.add(nd.model.object);
}
/**
 * Cells a node still blocks, shrinking as it breaks: the full 3×3, then a plus
 * shape (centre and its four neighbours), then only the centre cell.
 */
function blocks(nd: Node, x: number, y: number): boolean {
  if (nd.amount <= 0) return false;
  const dx = x - (nd.x + 1), dy = y - (nd.y + 1);
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false;
  const f = nd.amount / nd.max;
  if (f > 2 / 3) return true;
  if (f > 1 / 3) return Math.abs(dx) + Math.abs(dy) <= 1;
  return dx === 0 && dy === 0;
}
const nodeAt = (x: number, y: number) => nodes.find(nd => blocks(nd, x, y));
// Nodes are solid; everything else is snow.
const heightAt = (x: number, y: number) => (nodeAt(x, y) ? Infinity : 0);

/**
 * The node within reach of the avatar: a fixed circle around the node's centre,
 * the same from every side and at every stage (reaches the corners of a full 3×3).
 */
const REACH = 2.5;
function nodeInReach(): Node | null {
  let best: Node | null = null, bestD = REACH;
  for (const nd of nodes) {
    if (nd.amount <= 0) continue;
    const d = Math.hypot(avatar.x - (nd.x + nd.n / 2), avatar.y - (nd.y + nd.n / 2));
    if (d <= bestD) { bestD = d; best = nd; }
  }
  return best;
}

// ------------------------------------------------------------------ avatar and rig

const T = defaultAvatarTuning();
const avatar = new Avatar(0.5, 1.5);
const rig = createRig();
scene.add(rig.object);
const anim = new RigAnimator(rig);

/** Yield per node, and mining rate per second: a node takes the same time to mine out either way. */
const MINE_TIME = 25 / 3; // seconds per node (about 2.8 s per break stage)
const RESPAWN = 20; // seconds an empty node stays gone
/** Mining speed while the cursor is on the hotspot, and how long it takes hits before it hops. */
const HOTSPOT_BONUS = 1.2, HOTSPOT_RADIUS = 0.32;
const carried: Record<NodeKind, number> = { stone: 0, metal: 0 };

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
const mouse = new THREE.Vector2(-9, -9);
renderer.domElement.addEventListener("pointermove", e => {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
});
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

// ------------------------------------------------------------------ hotspot

/** A shiny glint on the node: mining with the cursor on it is faster. It hops after a few hits, like Rust's. */
const glintTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,.9)"); rg.addColorStop(0.08, "rgba(255,248,225,.75)"); rg.addColorStop(0.28, "rgba(255,230,170,.18)"); rg.addColorStop(1, "rgba(255,230,170,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  // A four-point star so it reads as a glint, not just a blob.
  g.fillStyle = "rgba(255,255,255,.7)";
  g.beginPath(); g.moveTo(32, 2); g.lineTo(35, 29); g.lineTo(62, 32); g.lineTo(35, 35); g.lineTo(32, 62); g.lineTo(29, 35); g.lineTo(2, 32); g.lineTo(29, 29); g.closePath(); g.fill();
  return new THREE.CanvasTexture(c);
})();
// Drawn on top of everything, so the rocks can never hide it.
const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
glint.visible = false;
glint.renderOrder = 5;
scene.add(glint);
// Targeted: an expanding ring around the glint.
const ringTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,1)"; g.lineWidth = 3;
  g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
})();
const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: "#7ff5e6", transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
ring.visible = false;
ring.renderOrder = 5;
scene.add(ring);
const IDLE_TINT = new THREE.Color("#ffffff"), HIT_TINT = new THREE.Color("#7ff5e6");
let targetW = 0, glintSpin = 0;
/** The glint shown for the node in reach; glides when that node's spot moves. */
const hotspot = { node: null as Node | null, pos: new THREE.Vector3(), from: new THREE.Vector3(), move: 1 };
const raycaster = new THREE.Raycaster();

/** Give the node a new hotspot on one of its remaining rocks, preferring the side facing the camera. */
function placeSpot(nd: Node): void {
  const pts = nd.model.surfacePoints();
  if (!pts.length) { nd.spot = null; return; }
  const toCam = CAM_OFFSET.clone().normalize();
  const c = new THREE.Vector3(nd.x + nd.n / 2, 0, nd.y + nd.n / 2);
  const good = pts.filter(p => p.clone().sub(c).setY(0).dot(toCam) > -0.1 && (!nd.spot || p.distanceTo(nd.spot) > 0.35));
  const list = good.length ? good : pts;
  nd.spot = list[Math.floor(Math.random() * list.length)]!.clone();
}

/** Is the cursor on the hotspot of this node? */
function cursorOnHotspot(nd: Node): boolean {
  raycaster.setFromCamera(mouse, camera);
  const hit = raycaster.intersectObject(nd.model.object, true)[0];
  if (!nd.spot) return false;
  if (hit && hit.point.distanceTo(hotspot.pos) < HOTSPOT_RADIUS) return true;
  // Also accept aiming straight at the glint itself.
  const onScreen = hotspot.pos.clone().project(camera);
  return Math.hypot(onScreen.x - mouse.x, (onScreen.y - mouse.y) * (container.clientHeight / container.clientWidth)) < 0.012;
}

// ------------------------------------------------------------------ effects

const sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
const sparkMat = new THREE.MeshBasicMaterial({ color: "#e8f4ff" });
const chipMat = new THREE.MeshStandardMaterial({ color: "#adb8c6", metalness: 0.7, roughness: 0.25, flatShading: true });
const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
let shake = 0;
/** A rock breaking off: a burst of ore chunks and a small shake. */
function breakBurst(at: THREE.Vector3, kind: NodeKind): void {
  shake = Math.max(shake, 0.12);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(chunkGeo, kind === "metal" ? chipMat : rockMat);
    m.position.copy(at);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    scene.add(m);
    sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3), life: 0.9 });
  }
}
const chunkGeo = new THREE.DodecahedronGeometry(0.06, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: "#4a4f5c", flatShading: true });
/** Does the avatar stand in this node's footprint (so it can't respawn on top of them)? */
function nodeUnderAvatar(nd: Node): boolean {
  const r = T.radius;
  // Respawning restores the full 3×3, so keep it clear of the avatar.
  return avatar.x + r > nd.x && avatar.x - r < nd.x + nd.n && avatar.y + r > nd.y && avatar.y - r < nd.y + nd.n;
}
/** A spark (cyan when it comes off the hotspot), or a small chip of the node's material. */
const cyanSparkMat = new THREE.MeshBasicMaterial({ color: "#7ff5e6" });
function spark(at: THREE.Vector3, chip: NodeKind | null, cyan = false): void {
  const m = new THREE.Mesh(sparkGeo, cyan ? cyanSparkMat : chip === "metal" ? chipMat : chip === "stone" ? rockMat : sparkMat);
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
  const target_ = nodeInReach();
  const mining = !!target_ && mouseDown;
  // The first hit on a node reveals its hotspot.
  if (mining && target_ && !target_.spot) placeSpot(target_);
  if (target_ !== hotspot.node) { hotspot.node = target_; if (target_?.spot) { hotspot.pos.copy(target_.spot); hotspot.move = 1; } }
  const onSpot = !!target_ && cursorOnHotspot(target_);

  acc += dt;
  let landed = false;
  while (acc >= TICK) {
    prev.x = avatar.x; prev.y = avatar.y; prev.z = avatar.z; prev.facing = avatar.facing;
    const m = mining ? { x: 0, y: 0 } : moveInput();
    avatar.step(TICK, { x: m.x, y: m.y, jump: jumpQueued && !mining }, heightAt, T);
    jumpQueued = false;
    landed ||= avatar.landed;
    if (mining && target_) {
      const got = Math.min(target_.amount, (target_.max / MINE_TIME) * (onSpot ? HOTSPOT_BONUS : 1) * TICK);
      target_.amount -= got;
      carried[target_.kind] += got;
      const broke = target_.model.setAmount(target_.amount / target_.max);
      for (const p of broke) breakBurst(p, target_.kind);
      // A stage broke off: the hotspot moves to one of the rocks that are left.
      if (broke.length && target_.amount > 0) { hotspot.from.copy(hotspot.pos); hotspot.move = 0; placeSpot(target_); }
    }
    acc -= TICK;
  }
  // Empty nodes come back after a while.
  for (const nd of nodes) {
    if (nd.amount > 0) continue;
    nd.emptyFor += dt;
    if (nd.emptyFor >= RESPAWN && !nodeUnderAvatar(nd)) { nd.amount = nd.max; nd.emptyFor = 0; nd.spot = null; nd.model.setAmount(1); }
  }
  shake = Math.max(0, shake - dt);
  const alpha = acc / TICK;
  const rx = prev.x + (avatar.x - prev.x) * alpha, ry = prev.y + (avatar.y - prev.y) * alpha;
  rig.object.position.set(rx, prev.z + (avatar.z - prev.z) * alpha, ry);
  if (mining && target_) {
    // Turn to face the node's centre.
    const want = Math.atan2(target_.x + target_.n / 2 - rx, target_.y + target_.n / 2 - ry);
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
    spark(tip, Math.random() < 0.3 ? target_!.kind : null);
  }
  for (const p of sparks) { p.life -= dt; p.v.y -= 7 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < 0.02) { p.m.position.y = 0.02; p.v.set(0, 0, 0); } p.m.scale.setScalar(Math.max(0.01, Math.min(1, p.life / 0.3))); }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i]!.life <= 0) { scene.remove(sparks[i]!.m); sparks.splice(i, 1); }

  // The glint glides to its new spot, and flares while it's being hit.
  hotspot.move = Math.min(1, hotspot.move + dt * 5);
  if (target_?.spot) hotspot.pos.lerpVectors(hotspot.from, target_.spot, 1 - (1 - hotspot.move) ** 2);
  // Two clear states: idle (small, soft white) and targeted (bright cyan, bigger, spinning, with a ring).
  glint.visible = !!target_?.spot && target_.amount > 0;
  targetW += ((onSpot ? 1 : 0) - targetW) * Math.min(1, dt * 14);
  glint.position.copy(hotspot.pos).add(new THREE.Vector3(0, -0.05, 0));
  glint.scale.setScalar((0.3 + 0.2 * targetW) * (1 + Math.sin(time * (6 + 10 * targetW)) * 0.1));
  glint.material.color.copy(IDLE_TINT).lerp(HIT_TINT, targetW);
  glint.material.opacity = 0.6 + 0.4 * targetW;
  glintSpin += dt * (0.8 + 5 * targetW);
  glint.material.rotation = glintSpin;
  ring.visible = glint.visible && targetW > 0.05;
  const rp = (time * 1.8) % 1;
  ring.position.copy(glint.position);
  ring.scale.setScalar(0.25 + rp * 0.45);
  ring.material.opacity = (1 - rp) * 0.8 * targetW;
  if (mining && onSpot && Math.random() < dt * 25) spark(glint.position, null, true);

  const left = target_ ? `  ·  node ${Math.ceil(target_.amount)} / ${target_.max}` : "";
  hud.textContent = `Stone ${Math.floor(carried.stone)}  ·  Metal ${Math.floor(carried.metal)}${left}`;

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
