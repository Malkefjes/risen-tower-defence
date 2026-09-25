import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, EVENING } from "../../src/render/models";
import { createRig, RigAnimator } from "../../src/render/rig";
import "./style.css";

// Ore crater mockup: three takes on the crater deposit with raw ore rock, each as a 2×2
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
// ------------------------------------------------------------------ raw ore

/** A mesh placed at x, y, z. */
const at = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, y, z); return m; };

/** Raw ore: dull, metallic gold that needs processing, not a gem. */
const O = {
  body: std("#3f3a36", { roughness: 0.9 }),
  bodyWarm: std("#4d4238", { roughness: 0.9 }),
  gold: std("#d9a441", { metalness: 0.4, roughness: 0.45, emissive: "#8a5a14", emissiveIntensity: 0.4 }),
  goldBright: std("#efc25c", { metalness: 0.45, roughness: 0.35, emissive: "#a36b18", emissiveIntensity: 0.45 }),
};

/** A lump of ore-bearing rock: dark stone with gold flecks and a vein band across it. `rich` lumps are mostly gold. */
function oreLump(r: number, rand: () => number, x: number, z: number, sink = 0.35, rich = false): THREE.Group {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rich ? O.gold : rand() < 0.5 ? O.body : O.bodyWarm);
  rock.scale.set(1.15, 0.7 + rand() * 0.3, 1);
  rock.rotation.set(rand(), rand() * 6, rand());
  g.add(rock);
  // Gold flecks on the surface: small flat plates pressed onto the rock.
  const flecks = rich ? 0 : 5 + Math.floor(rand() * 4);
  for (let i = 0; i < flecks; i++) {
    const th = rand() * Math.PI * 2, ph = 0.3 + rand() * 1.1;
    const n = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const f = new THREE.Mesh(new THREE.BoxGeometry(r * (0.45 + rand() * 0.45), r * 0.1, r * (0.25 + rand() * 0.3)), rand() < 0.35 ? O.goldBright : O.gold);
    f.position.copy(n).multiplyScalar(r * 0.78);
    f.position.y *= rock.scale.y;
    f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    f.rotateY(rand() * 3);
    g.add(f);
  }
  g.position.set(x, r * (0.7 - sink), z);
  return g;
}

/** The crater rim shared by all three: broken dark rock with frost, around a dark floor. */
function craterRim(n: number, rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const R = n / 2 - 0.08;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 0.92, 20), M.bedrock);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01;
  g.add(floor);
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
  return g;
}

interface Design { key: string; text: string; build(n: number, seed: number): THREE.Group }

const DESIGNS: Design[] = [
  {
    key: "B1",
    text: "The crater holds one big ore body: a mound of dark rock pushing up from the floor, streaked and flecked with dull gold. Reads as a single mass you drill into, and it can visibly shrink as it's mined out.",
    build(n, seed) {
      const rand = rng(seed), g = craterRim(n, rand);
      const R = n / 2 - 0.08;
      // A central mound built from overlapping lumps, biggest in the middle.
      const lumps = Math.round(4 + n * 3);
      for (let i = 0; i < lumps; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * R * 0.45;
        const size = (0.26 + rand() * 0.14) * (1 - d / R) * (n / 2.4 + 0.35);
        g.add(oreLump(size, rand, Math.cos(a) * d, Math.sin(a) * d, 0.3));
        if (rand() < 0.6) g.add(oreLump(size * 0.35, rand, Math.cos(a) * d + (rand() - 0.5) * 0.2, Math.sin(a) * d + (rand() - 0.5) * 0.2, 0.1, true));
      }
      return shadowAll(g);
    },
  },
  {
    key: "B2",
    text: "The crater floor is a bed of broken ore rubble: many fist-sized lumps of dark rock with gold in them, half buried, like the ground was cracked open. Reads as loose raw material to shovel up.",
    build(n, seed) {
      const rand = rng(seed), g = craterRim(n, rand);
      const R = n / 2 - 0.08;
      for (let i = 0; i < n * n * 5; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * R * 0.78;
        g.add(oreLump(0.07 + rand() * 0.07, rand, Math.cos(a) * d, Math.sin(a) * d, 0.45, rand() < 0.35));
      }
      return shadowAll(g);
    },
  },
  {
    key: "B3",
    text: "The crater cuts into an ore seam: one side is a raised rock face with a thick gold vein running through it, and broken ore chunks lie at its foot. Reads most like a mine face, and gives the deposit a clear front to work from.",
    build(n, seed) {
      const rand = rng(seed), g = craterRim(n, rand);
      const R = n / 2 - 0.08;
      // A curved face along the back of the crater, layered, with a gold vein.
      const segs = Math.round(3 + n * 2);
      for (let i = 0; i < segs; i++) {
        const a = Math.PI * (1.05 + (i / (segs - 1)) * 0.9), r = R * 0.62;
        const seg = new THREE.Group();
        seg.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        seg.rotation.y = -a + Math.PI / 2;
        const h = 0.28 + rand() * 0.12 + n * 0.03;
        seg.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.42, h, 0.3), rand() < 0.5 ? O.body : O.bodyWarm), 0, h / 2, 0));
        seg.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.1, 0.31), O.gold), 0, h * 0.45, 0));
        seg.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.32), O.goldBright), (rand() - 0.5) * 0.15, h * 0.7, 0));
        seg.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.32), M.frost), 0, h + 0.01, 0));
        g.add(seg);
      }
      // Broken chunks in front of the face.
      for (let i = 0; i < n * 3; i++) {
        const a = Math.PI * (1.1 + rand() * 0.8), d = R * (0.2 + rand() * 0.3);
        g.add(oreLump(0.08 + rand() * 0.08, rand, Math.cos(a) * d, Math.sin(a) * d, 0.35, rand() < 0.4));
      }
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
