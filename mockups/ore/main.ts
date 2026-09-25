import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, EVENING } from "../../src/render/models";
import { createRig, RigAnimator } from "../../src/render/rig";
import "./style.css";

// Ore deposit mockup: three styles of deposit set into the ground, each as a 2×2
// and a 3×3, in the game's light. The player rig mines one of them for scale.
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
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 60 });
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ materials

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
const M = {
  bedrock: std("#3a3f52"),
  rock: std("#4e5468"),
  rockLight: std("#646b82"),
  frost: std("#dfe5f0", { roughness: 1 }),
  ore: std("#f2c14e", { emissive: "#e0a030", emissiveIntensity: 0.55, roughness: 0.35 }),
  oreDeep: std("#c98f2a", { emissive: "#b8741c", emissiveIntensity: 0.4, roughness: 0.45 }),
  vein: std("#d9a23a", { emissive: "#c9861f", emissiveIntensity: 0.55, roughness: 0.5 }),
};

// Deterministic randomness so each deposit looks the same every load.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shadowAll = <T extends THREE.Object3D>(o: T): T => {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
};
/** An irregular flat polygon (a slab outline) of radius ~r. */
function slabShape(r: number, rand: () => number, n = 7): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, rr = r * (0.75 + rand() * 0.35);
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return s;
}
/** A slab lying flat, `h` thick, top at y. */
function slab(shape: THREE.Shape, h: number, m: THREE.Material, x: number, y: number, z: number, rot = 0): THREE.Mesh {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: h * 0.3, bevelSize: h * 0.4, bevelSegments: 1 });
  g.rotateX(Math.PI / 2);
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.rotation.y = rot;
  return o;
}
function crystal(s: number, m: THREE.Material, x: number, y: number, z: number, rand: () => number): THREE.Mesh {
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), m);
  c.scale.set(0.7, 1.6, 0.7);
  c.position.set(x, y, z);
  c.rotation.set((rand() - 0.5) * 0.9, rand() * 6, (rand() - 0.5) * 0.9);
  return c;
}

// ------------------------------------------------------------------ the three deposit styles

interface Design { key: string; text: string; build(n: number, seed: number): THREE.Group }

const DESIGNS: Design[] = [
  {
    key: "A",
    text: "A cracked plate of dark bedrock lying flush with the snow, split by glowing gold veins, with small crystal shards pushing up through the cracks. The flattest and most readable: it looks like a patch of ground you could build an extractor straight on.",
    build(n, seed) {
      const g = new THREE.Group(), rand = rng(seed);
      // Bedrock plates in a grid of cracked tiles; the gaps between them glow.
      const tile = n / Math.ceil(n * 1.4);
      const cells = Math.round(n / tile);
      for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
        const cx = -n / 2 + (i + 0.5) * tile + (rand() - 0.5) * 0.06, cz = -n / 2 + (j + 0.5) * tile + (rand() - 0.5) * 0.06;
        const edge = Math.max(Math.abs(cx), Math.abs(cz)) > n / 2 - tile * 0.8;
        g.add(slab(slabShape(tile * 0.52, rand, 6), 0.04 + rand() * 0.03, rand() < 0.3 ? M.rockLight : M.rock, cx, 0.04 + rand() * 0.03, cz, rand() * 6));
        if (edge && rand() < 0.5) g.add(slab(slabShape(tile * 0.3, rand, 5), 0.03, M.frost, cx + (rand() - 0.5) * 0.2, 0.08, cz + (rand() - 0.5) * 0.2));
      }
      // The glowing seam underneath shows through the cracks.
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(n * 0.92, n * 0.92), M.vein);
      seam.rotation.x = -Math.PI / 2; seam.position.y = 0.012;
      g.add(seam);
      for (let i = 0; i < n * n * 1.6; i++) {
        const x = (rand() - 0.5) * n * 0.8, z = (rand() - 0.5) * n * 0.8;
        g.add(crystal(0.05 + rand() * 0.06, rand() < 0.7 ? M.ore : M.oreDeep, x, 0.1 + rand() * 0.05, z, rand));
      }
      return shadowAll(g);
    },
  },
  {
    key: "B",
    text: "A shallow crater: a ring of broken dark rock with frost on its rim, and a bed of gold ore crystals in the bottom. Reads most as a hole in the ground you dig into; the rim gives it a clear edge at game zoom.",
    build(n, seed) {
      const g = new THREE.Group(), rand = rng(seed);
      const R = n / 2 - 0.08;
      // Dark crater floor.
      const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 0.92, 20), M.bedrock);
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; floor.receiveShadow = true;
      g.add(floor);
      // Rim of rock blocks around the edge, tilted outwards, some capped with frost.
      const count = Math.round(10 + n * 5);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand() * 0.2, r = R * (0.88 + rand() * 0.1);
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + rand() * 0.1, 0), rand() < 0.35 ? M.rockLight : M.rock);
        b.scale.set(1.2, 0.55 + rand() * 0.4, 0.9);
        b.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r);
        b.rotation.set(0, -a, (rand() - 0.5) * 0.5);
        g.add(b);
        if (rand() < 0.45) { const f = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), M.frost); f.scale.set(1.3, 0.35, 1); f.position.set(b.position.x, 0.19, b.position.z); g.add(f); }
      }
      // Ore bed: clusters of crystals low in the crater.
      for (let i = 0; i < n * n * 2.2; i++) {
        const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * R * 0.7;
        g.add(crystal(0.06 + rand() * 0.08, rand() < 0.7 ? M.ore : M.oreDeep, Math.cos(a) * r, 0.06 + rand() * 0.06, Math.sin(a) * r, rand));
      }
      return shadowAll(g);
    },
  },
  {
    key: "C",
    text: "Tilted layers of rock breaking up through the snow, like strata pushed out of the ground, with bands of gold ore between the layers. The most geological and alien-planet looking; low slabs so it stays readable and walkable.",
    build(n, seed) {
      const g = new THREE.Group(), rand = rng(seed);
      // Parallel strata across the deposit, each a long low slab tilted up on one side.
      const rows = n + 1, dir = rand() * Math.PI;
      const pivot = new THREE.Group();
      pivot.rotation.y = dir;
      g.add(pivot);
      for (let i = 0; i < rows; i++) {
        const off = -n / 2 + (i + 0.5) * (n / rows);
        const len = n * (0.7 + rand() * 0.25) * Math.sqrt(Math.max(0.2, 1 - (off / (n / 2)) ** 2));
        const w = (n / rows) * 0.62;
        const layer = new THREE.Group();
        layer.position.set(0, 0, off);
        layer.rotation.x = 0.35 + rand() * 0.2;
        const rock = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, w), rand() < 0.4 ? M.rockLight : M.rock);
        rock.position.y = 0.02;
        const band = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.05, w * 0.35), M.ore);
        band.position.set(0, 0.075, -w * 0.3);
        const frost = new THREE.Mesh(new THREE.BoxGeometry(len * (0.3 + rand() * 0.4), 0.03, w * 0.5), M.frost);
        frost.position.set((rand() - 0.5) * len * 0.3, 0.085, w * 0.15);
        layer.add(rock, band, frost);
        pivot.add(layer);
        for (let k = 0; k < 2 + n; k++) pivot.add(crystal(0.05 + rand() * 0.05, M.ore, (rand() - 0.5) * len * 0.8, 0.12, off - w * 0.4, rand));
      }
      // Dark ground where the strata break through.
      const scar = new THREE.Mesh(new THREE.CircleGeometry(n * 0.5, 18), M.bedrock);
      scar.rotation.x = -Math.PI / 2; scar.position.y = 0.008; scar.scale.set(1, 0.9, 1);
      g.add(scar);
      return shadowAll(g);
    },
  },
];

// ------------------------------------------------------------------ stations

interface Station { center: THREE.Vector3; label: HTMLElement }
const stations: Station[] = [];
const labels = document.getElementById("labels")!;
const SPACING = 7;

/** A faint grid outline of the footprint so the 2×2 / 3×3 reads clearly. */
function footprint(n: number, x: number, z: number): THREE.LineSegments {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    pts.push(new THREE.Vector3(i, 0, 0), new THREE.Vector3(i, 0, n), new THREE.Vector3(0, 0, i), new THREE.Vector3(n, 0, i));
  }
  const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18 }));
  l.position.set(x, 0.006, z);
  return l;
}

DESIGNS.forEach((d, i) => {
  const ox = (i - 1) * SPACING - 2, oz = -(i - 1) * SPACING;
  // 2×2 on cells (ox..ox+1, oz..oz+1); 3×3 on cells (ox+3..ox+5, oz-1..oz+1).
  const small = d.build(2, 11 + i * 7);
  small.position.set(ox + 1, 0, oz + 1);
  const big = d.build(3, 29 + i * 5);
  big.position.set(ox + 4.5, 0, oz + 0.5);
  scene.add(small, big, footprint(2, ox, oz), footprint(3, ox + 3, oz - 1));
  const el = document.createElement("div");
  el.className = "label";
  el.innerHTML = `<b>${d.key}</b>`;
  labels.appendChild(el);
  stations.push({ center: new THREE.Vector3(ox + 3, 0, oz + 0.5), label: el });
});

// A wall piece nearby for scale.
scene.add(models.create("wallPiece", { cells: [[-3, 3], [-2, 3], [-1, 3], [0, 3]] }));

// The rig mining the middle 3×3.
const rig = createRig();
const anim = new RigAnimator(rig);
const mid = stations[1]!.center;
// Standing just off the deposit's front corner, facing its centre.
const bigCenter = new THREE.Vector3(mid.x + 1.5, 0, mid.z);
rig.object.position.set(bigCenter.x + 1.7, 0, bigCenter.z + 1.7);
rig.object.rotation.y = Math.atan2(bigCenter.x - rig.object.position.x, bigCenter.z - rig.object.position.z);
scene.add(rig.object);

const deco: [string, number, number, number][] = [
  ["tree", -12, -2, 1.1], ["tree", -11, 5, 0.9], ["tree", 9, -12, 1.0], ["tree", 12, -8, 1.15], ["tree", -2, -10, 0.95],
  ["tree", 5, 9, 1.05], ["tree", -8, 10, 1.0], ["rock", -6, -7, 13], ["rock", 10, 4, 11], ["tree", 14, 1, 0.9],
];
for (const [name, x, z, s] of deco) {
  const m = models.create(name, name === "tree" ? { scale: s, seed: x * 7 + z } : { scale: s, seed: x * 5 + z });
  m.position.set(x + 0.5, 0, z + 0.5);
  scene.add(m);
}

// Sparks where the beam meets the ore.
const sparkGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03), sparkMat = new THREE.MeshBasicMaterial({ color: "#ffe29a" });
const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];

// ------------------------------------------------------------------ camera, focus

const OVERVIEW = new THREE.Vector3(0.5, 0, 0.5);
const target = OVERVIEW.clone(), wantTarget = target.clone();
let zoom = 9.5, wantZoom = 9.5;
const buttons = { fAll: -1, fA: 0, fB: 1, fC: 2 } as const;
const note = document.getElementById("note")!;
let focus = -1;
function setFocus(i: number): void {
  focus = i;
  for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.setAttribute("aria-pressed", String(idx === i));
  if (i < 0) { wantTarget.copy(OVERVIEW); wantZoom = 9.5; note.textContent = "Each style is shown as a 2×2 (left) and a 3×3 (right). The rig mines the middle one."; }
  else { const c = stations[i]!.center; wantTarget.set(c.x, 0, c.z + 0.3); wantZoom = 3.4; note.innerHTML = `<b>${DESIGNS[i]!.key}.</b> ${DESIGNS[i]!.text}`; }
}
for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.addEventListener("click", () => setFocus(idx));
setFocus(-1);
addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

// ------------------------------------------------------------------ snow and loop

const N = 900, H = 18;
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

const clock = new THREE.Clock();
let time = 0;
const tip = new THREE.Vector3(), lp = new THREE.Vector3();
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  anim.update(dt, { speed: 0, topSpeed: 5, grounded: true, vz: 0, jumpSpeed: 5, landed: false, ready: true, mining: true });
  M.ore.emissiveIntensity = 0.5 + Math.sin(time * 2) * 0.08;
  if (Math.random() < dt * 30) {
    rig.object.updateMatrixWorld(true);
    rig.beam.localToWorld(tip.set(0, 0, 1));
    const m = new THREE.Mesh(sparkGeo, sparkMat);
    m.position.copy(tip);
    scene.add(m);
    sparks.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5), life: 0.3 });
  }
  for (const p of sparks) { p.life -= dt; p.v.y -= 6 * dt; p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(Math.max(0.01, p.life / 0.3)); }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i]!.life <= 0) { scene.remove(sparks[i]!.m); sparks.splice(i, 1); }

  const k = 1 - Math.exp(-dt * 5);
  target.lerp(wantTarget, k);
  zoom += (wantZoom - zoom) * k;
  for (let i = 0; i < N; i++) {
    snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
    if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 12;
    const wrap = (v: number, c: number) => ((((v - c + H) % (2 * H)) + 2 * H) % (2 * H)) + c - H;
    snowPos[i * 3] = wrap(snowPos[i * 3]!, target.x);
    snowPos[i * 3 + 2] = wrap(snowPos[i * 3 + 2]!, target.z);
  }
  sg.attributes.position!.needsUpdate = true;

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
  stations.forEach((s, i) => {
    lp.copy(s.center); lp.y += 1.4; lp.project(camera);
    s.label.style.transform = `translate(${((lp.x + 1) / 2) * w}px, ${((1 - lp.y) / 2) * h}px) translate(-50%, -100%)`;
    s.label.classList.toggle("dim", focus >= 0 && focus !== i);
  });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
