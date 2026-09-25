import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, EVENING } from "../../src/render/models";
import { createRig, RigAnimator } from "../../src/render/rig";
import { stoneWallPiece, type StoneLook } from "../../src/render/stoneWall";
import { Avatar, defaultAvatarTuning } from "../../src/sim/avatar";
import { pieceCells, SHAPE_IDS, type ShapeId } from "../../src/sim/pieces";
import { cellKey, type Cell } from "../../src/sim/types";
import { WALL_DECK } from "../../src/sim/world";
import { BuildWheel, type WheelItem } from "../../src/ui/buildWheel";
import { pieceIcon } from "../../src/ui/hud";
import "./style.css";

// Wall playground: every piece is placed as a stone wall; right-click holds open a
// wheel on that wall with Metal plating, which turns the whole piece into the
// Armored deck (the wall towers stand on). Stone looks C, C1, C2 to pick from.

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
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 0.5, far: 60 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ walls

interface Piece { id: number; shape: ShapeId; cells: Cell[]; metal: boolean; obj: THREE.Object3D | null }
const pieces: Piece[] = [];
/** cell -> piece id */
const walls = new Map<string, number>();
let nextId = 1;
let look: StoneLook = "C";
const LOOK_KEY = "risen.walls.stoneLook";
try { const l = localStorage.getItem(LOOK_KEY); if (l === "C" || l === "C1" || l === "C2") look = l; } catch { /* storage blocked */ }

/** Walls fuse only with walls of the same material, so stone and metal meet at a clean seam. */
function rebuildWalls(): void {
  for (const p of pieces) {
    if (p.obj) { scene.remove(p.obj); p.obj.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose(); }); }
    const joins = (x: number, y: number) => { const id = walls.get(cellKey(x, y)); return id !== undefined && pieces.find(q => q.id === id)!.metal === p.metal; };
    p.obj = p.metal ? models.create("wallPiece", { cells: p.cells, joins }) : stoneWallPiece(look, p.cells, joins);
    scene.add(p.obj);
  }
}
function placePiece(shape: ShapeId, rot: number, at: Cell): boolean {
  const cells = pieceCells(shape, rot, at);
  if (cells.some(([x, y]) => walls.has(cellKey(x, y)))) return false;
  if (avatar.z < WALL_DECK && cells.some(([x, y]) => underAvatar(x, y))) return false;
  const p: Piece = { id: nextId++, shape, cells, metal: false, obj: null };
  pieces.push(p);
  for (const [x, y] of cells) walls.set(cellKey(x, y), p.id);
  rebuildWalls();
  drop(p);
  return true;
}
function undoLast(): void {
  const p = pieces.pop();
  if (!p) return;
  for (const [x, y] of p.cells) walls.delete(cellKey(x, y));
  if (p.obj) scene.remove(p.obj);
  rebuildWalls();
}
/** A little drop and a flash of snow when a piece lands or gets plated. */
const drops: { p: Piece; t: number }[] = [];
function drop(p: Piece): void { drops.push({ p, t: 0.14 }); }

// ------------------------------------------------------------------ avatar

const T = defaultAvatarTuning();
const avatar = new Avatar(0.5, 4.5);
const heightAt = (x: number, y: number) => (walls.has(cellKey(x, y)) ? WALL_DECK : 0);
const rig = createRig();
scene.add(rig.object);
const anim = new RigAnimator(rig);
function underAvatar(x: number, y: number): boolean {
  const r = T.radius;
  return avatar.x + r > x && avatar.x - r < x + 1 && avatar.y + r > y && avatar.y - r < y + 1;
}

// ------------------------------------------------------------------ input

const keys = new Set<string>();
let jumpQueued = false;
const mousePx = { x: -1, y: -1 };
const mouseNdc = new THREE.Vector2(-9, -9);
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function cursorCell(): Cell | null {
  raycaster.setFromCamera(mouseNdc, camera);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(groundPlane, p)) return null;
  return [Math.floor(p.x), Math.floor(p.z)];
}
/** The wall piece under the cursor (its deck, or the ground cell under it). */
function pieceUnderCursor(): Piece | null {
  raycaster.setFromCamera(mouseNdc, camera);
  const hit = raycaster.intersectObjects(pieces.map(p => p.obj!).filter(Boolean), true)[0];
  const pt = hit?.point;
  const c = pt ? [Math.floor(pt.x - hit.face!.normal.x * 0.01), Math.floor(pt.z - hit.face!.normal.z * 0.01)] : cursorCell();
  const id = c ? walls.get(cellKey(c[0]!, c[1]!)) : undefined;
  return id === undefined ? null : pieces.find(p => p.id === id) ?? null;
}

/** Held wall shape (infinite here), and its rotation. */
let held: { shape: ShapeId; rot: number } | null = null;
const wheel = new BuildWheel(document.getElementById("app")!);
let wheelKind: "walls" | "mods" | null = null;
let modTarget: Piece | null = null;
const sized = (svg: string) => svg.replace("<svg ", '<svg width="40" height="40" ');
const PLATING_ICON = `<svg viewBox="0 0 44 44"><rect x="6" y="20" width="32" height="14" rx="2" fill="#d9573a" stroke="#f08a66"/><rect x="5" y="14" width="34" height="7" rx="2" fill="#4a5266"/><rect x="8" y="26" width="28" height="2" fill="#7ff5e6"/><rect x="6" y="33" width="32" height="3" fill="#2c3142"/></svg>`;
function wheelItems(): WheelItem[] {
  if (wheelKind === "walls") return SHAPE_IDS.map(sh => ({ icon: sized(pieceIcon(sh)), off: false }));
  return [{ icon: sized(PLATING_ICON), off: !modTarget || modTarget.metal }];
}
function closeWheel(): void {
  const i = wheel.picked();
  if (i !== null) {
    if (wheelKind === "walls") held = { shape: SHAPE_IDS[i]!, rot: held?.rot ?? 0 };
    else if (modTarget && !modTarget.metal) { modTarget.metal = true; rebuildWalls(); drop(modTarget); }
  }
  wheel.hide(); wheelKind = null; modTarget = null;
}

addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === " ") { e.preventDefault(); if (!e.repeat) jumpQueued = true; return; }
  if (k === "q" && !e.repeat) { wheelKind = "walls"; wheel.show(wheelItems()); return; }
  if (k === "r" && held) { held.rot = (held.rot + 1) % 4; return; }
  if (k === "escape" || k === "1") { held = null; return; }
  if (k === "z") { undoLast(); return; }
  keys.add(k);
});
addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === "q" && wheelKind === "walls") closeWheel();
});
addEventListener("blur", () => { keys.clear(); if (wheelKind) { wheel.hide(); wheelKind = null; } });
renderer.domElement.addEventListener("pointermove", e => {
  const r = renderer.domElement.getBoundingClientRect();
  mousePx.x = e.clientX; mousePx.y = e.clientY;
  mouseNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
});
renderer.domElement.addEventListener("contextmenu", e => e.preventDefault());
renderer.domElement.addEventListener("pointerdown", e => {
  if (e.button === 2) {
    if (held) { held.rot = (held.rot + 1) % 4; return; }
    // Right-click on a wall: hold to keep its modification wheel open.
    const p = pieceUnderCursor();
    if (p) { modTarget = p; wheelKind = "mods"; wheel.show(wheelItems()); }
    return;
  }
  if (e.button === 0 && held) {
    const c = cursorCell();
    if (c) placePiece(held.shape, held.rot, c);
  }
});
addEventListener("pointerup", e => { if (e.button === 2 && wheelKind === "mods") closeWheel(); });
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); wantZoom = Math.min(10, Math.max(2.5, wantZoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
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

// ------------------------------------------------------------------ look picker

const looksEl = document.getElementById("looks")!;
function drawLooks(): void {
  looksEl.innerHTML = (["C", "C1", "C2"] as StoneLook[]).map(l => `<button class="chip" data-look="${l}" aria-pressed="${look === l}">${l}</button>`).join("");
}
looksEl.addEventListener("click", e => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  look = b.dataset.look as StoneLook;
  try { localStorage.setItem(LOOK_KEY, look); } catch { /* storage blocked */ }
  drawLooks(); rebuildWalls();
});
drawLooks();

// A few pieces to start with, so the looks can be compared straight away: stone, and one plated.
placePiece("L", 0, [-3, 1]); placePiece("I", 0, [2, 1]); placePiece("T", 2, [-2, 7]); placePiece("O", 0, [3, 6]);
pieces[3]!.metal = true;
rebuildWalls();
drops.length = 0;

// ------------------------------------------------------------------ ghost, snow, loop

const ghostOk = new THREE.MeshStandardMaterial({ color: "#d9573a", transparent: true, opacity: 0.5, depthWrite: false, emissive: "#ff8a4a", emissiveIntensity: 0.35 });
const ghostBad = new THREE.MeshStandardMaterial({ color: "#8a8599", transparent: true, opacity: 0.45, depthWrite: false });
const ghost = new THREE.Group();
scene.add(ghost);
for (let i = 0; i < 4; i++) ghost.add(new THREE.Mesh(new THREE.BoxGeometry(0.92, WALL_DECK, 0.92), ghostOk));

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

const TICK = 1 / 60;
const prev = { x: avatar.x, y: avatar.y, z: avatar.z, facing: avatar.facing };
const target = new THREE.Vector3(avatar.x, 0, avatar.y);
let acc = 0, last = performance.now(), zoom = 4.2, wantZoom = 4.2;
const tmp = new THREE.Vector3();

function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let landed = false;
  while (acc >= TICK) {
    prev.x = avatar.x; prev.y = avatar.y; prev.z = avatar.z; prev.facing = avatar.facing;
    const m = moveInput();
    avatar.step(TICK, { x: m.x, y: m.y, jump: jumpQueued, sprint: keys.has("shift") }, heightAt, T);
    jumpQueued = false;
    landed ||= avatar.landed;
    acc -= TICK;
  }
  const alpha = acc / TICK;
  const rx = prev.x + (avatar.x - prev.x) * alpha, ry = prev.y + (avatar.y - prev.y) * alpha;
  rig.object.position.set(rx, prev.z + (avatar.z - prev.z) * alpha, ry);
  const df = Math.atan2(Math.sin(avatar.facing - prev.facing), Math.cos(avatar.facing - prev.facing));
  rig.object.rotation.y = prev.facing + df * alpha;
  anim.update(dt, { speed: avatar.speed, topSpeed: T.speed, grounded: avatar.grounded, vz: avatar.vz, jumpSpeed: (2 * T.jumpHeight) / T.jumpRise, landed, ready: !!held, mining: false });

  // Ghost of the held piece under the cursor: orange if it fits, grey if not.
  const c = held && !wheel.open ? cursorCell() : null;
  const cells = c && held ? pieceCells(held.shape, held.rot, c) : [];
  const ok = cells.length > 0 && !cells.some(([x, y]) => walls.has(cellKey(x, y)) || (avatar.z < WALL_DECK && underAvatar(x, y)));
  ghost.children.forEach((g, i) => {
    const cell = cells[i];
    g.visible = !!cell;
    if (!cell) return;
    g.position.set(cell[0] + 0.5, WALL_DECK / 2 + 0.25 + Math.sin(now / 250) * 0.04, cell[1] + 0.5);
    (g as THREE.Mesh).material = ok ? ghostOk : ghostBad;
  });

  for (const d of drops) { d.t = Math.max(0, d.t - dt); if (d.p.obj) d.p.obj.position.y = 0.35 * (d.t / 0.14) ** 2; }
  for (let i = drops.length - 1; i >= 0; i--) if (drops[i]!.t <= 0) drops.splice(i, 1);

  // The wheel: walls on the character; modifications on the wall that was right-clicked.
  if (wheel.open) {
    const at = wheelKind === "mods" && modTarget
      ? tmp.set(modTarget.cells.reduce((a, q) => a + q[0] + 0.5, 0) / modTarget.cells.length, WALL_DECK, modTarget.cells.reduce((a, q) => a + q[1] + 0.5, 0) / modTarget.cells.length)
      : tmp.copy(rig.object.position).setY(rig.object.position.y + 0.45);
    at.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    wheel.update(wheelItems(), rect.left + (at.x + 1) / 2 * rect.width, rect.top + (1 - at.y) / 2 * rect.height, mousePx.x, mousePx.y);
  }

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
  camera.lookAt(target.x, 0, target.z);
  sun.position.set(target.x + EVENING.sunOffset[0], EVENING.sunOffset[1], target.z + EVENING.sunOffset[2]);
  sun.target.position.set(target.x, 0, target.z);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
