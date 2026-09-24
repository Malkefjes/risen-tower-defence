import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, EVENING, roundedBox, WALL_HEIGHT } from "../../src/render/models";
import "./style.css";

// Turret design mockup. Reuses the game's own models, palette, light and camera
// so the three designs are judged in the look they'll actually live in.
THREE.ColorManagement.enabled = false;

const CAM_OFFSET = new THREE.Vector3(20, 16.33, 20);
const TOP = WALL_HEIGHT + 0.07;

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
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true, ...o });
const M = {
  gun: std("#3d4457", { roughness: 0.55 }),
  gunDark: std("#2c3142", { roughness: 0.6 }),
  plate: std("#8a94ab", { roughness: 0.55 }),
  plateLight: std("#b4bccd", { roughness: 0.5 }),
  accent: std(EVENING.wallA),
  accentDark: std("#a8432d"),
  cyan: std("#8ff5e8", { emissive: "#4fdcca", emissiveIntensity: 1.1, roughness: 0.3 }),
  warmEye: std("#ffd79a", { emissive: "#ffa94d", emissiveIntensity: 1.2 }),
};

const shadow = <T extends THREE.Object3D>(o: T): T => {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
};
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
/** Cylinder lying along +z (a barrel). */
const barrelGeo = (r: number, len: number, seg = 8) => {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
};

// ------------------------------------------------------------------ turrets

interface Turret {
  root: THREE.Group;
  /** Rotates to face the target. Models face +z. */
  yaw: THREE.Group;
  /** Barrels recoil along -z; `muzzle` is the tip in yaw space. */
  guns: { obj: THREE.Object3D; rest: number; muzzle: THREE.Vector3 }[];
  /** Optional part that spins while firing (gatling cluster). */
  spinner?: THREE.Object3D;
  rate: number;
  range: number;
  bolt: "warm" | "cyan";
  boltSize: number;
  /** Fire all guns at once, or alternate. */
  salvo: boolean;
  glowParts?: THREE.MeshStandardMaterial;
}

function turret(yaw: THREE.Group, base: THREE.Object3D, rest: Omit<Turret, "root" | "yaw">): Turret {
  const root = new THREE.Group();
  root.add(base, yaw);
  shadow(root);
  return { root, yaw, ...rest };
}

/** A: Sentry. Squat drum, boxy head, one barrel. The classic. */
function sentry(big: boolean): Turret {
  const k = big ? 1.8 : 1;
  const base = new THREE.Group();
  base.add(mesh(new THREE.CylinderGeometry(0.3 * k, 0.34 * k, 0.1 * k, 12), M.gunDark, 0, 0.05 * k, 0));
  base.add(mesh(new THREE.CylinderGeometry(0.22 * k, 0.26 * k, 0.1 * k, 12), M.gun, 0, 0.15 * k, 0));
  const yaw = new THREE.Group();
  yaw.position.y = 0.2 * k;
  const head = mesh(roundedBox(0.4 * k, 0.24 * k, 0.44 * k, 0.06 * k), M.plate, 0, 0, -0.02 * k);
  const stripe = mesh(new THREE.BoxGeometry(0.41 * k, 0.05 * k, 0.3 * k), M.accent, 0, 0.14 * k, -0.04 * k);
  const eye = mesh(new THREE.BoxGeometry(0.14 * k, 0.04 * k, 0.02 * k), M.warmEye, 0.08 * k, 0.16 * k, 0.2 * k);
  yaw.add(head, stripe, eye);
  const guns: Turret["guns"] = [];
  const g = new THREE.Group();
  g.add(mesh(barrelGeo(0.05 * k, 0.42 * k), M.gunDark));
  g.add(mesh(barrelGeo(0.07 * k, 0.08 * k), M.gun, 0, 0, 0.36 * k));
  if (big) {
    g.add(mesh(barrelGeo(0.075 * k, 0.1 * k), M.accent, 0, 0, 0.12 * k));
    const plate = mesh(new THREE.BoxGeometry(0.08 * k, 0.28 * k, 0.36 * k), M.plateLight);
    const p2 = plate.clone();
    plate.position.set(0.24 * k, 0.1 * k, -0.02 * k); p2.position.set(-0.24 * k, 0.1 * k, -0.02 * k);
    yaw.add(plate, p2);
  }
  g.position.set(0, 0.1 * k, 0.18 * k);
  yaw.add(g);
  guns.push({ obj: g, rest: g.position.z, muzzle: new THREE.Vector3(0, 0.1 * k, 0.64 * k) });
  return turret(yaw, base, { guns, rate: big ? 1.3 : 1.7, range: big ? 5.5 : 4, bolt: "warm", boltSize: big ? 0.16 : 0.09, salvo: true });
}

/** B: Twin. Hex mount, wedge head with orange colony panels, paired barrels that alternate. Big one is a 4-barrel gatling. */
function twin(big: boolean): Turret {
  const k = big ? 1.8 : 1;
  const base = new THREE.Group();
  base.add(mesh(new THREE.CylinderGeometry(0.32 * k, 0.36 * k, 0.12 * k, 6), M.gun, 0, 0.06 * k, 0));
  base.add(mesh(new THREE.CylinderGeometry(0.2 * k, 0.24 * k, 0.08 * k, 6), M.gunDark, 0, 0.16 * k, 0));
  const yaw = new THREE.Group();
  yaw.position.y = 0.2 * k;
  const headGeo = new THREE.CylinderGeometry(0.22 * k, 0.28 * k, 0.22 * k, 6);
  headGeo.scale(1, 1, 1.15);
  const head = mesh(headGeo, M.accent, 0, 0.08 * k, -0.04 * k);
  const cap = mesh(new THREE.CylinderGeometry(0.16 * k, 0.22 * k, 0.06 * k, 6), M.plateLight, 0, 0.22 * k, -0.04 * k);
  const visor = mesh(new THREE.BoxGeometry(0.2 * k, 0.05 * k, 0.03 * k), M.gunDark, 0, 0.13 * k, 0.24 * k);
  yaw.add(head, cap, visor);
  const guns: Turret["guns"] = [];
  let spinner: THREE.Object3D | undefined;
  if (!big) {
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.add(mesh(barrelGeo(0.035, 0.4), M.gunDark));
      g.add(mesh(barrelGeo(0.05, 0.1), M.gun, 0, 0, 0.02));
      g.position.set(sx * 0.1, 0.08, 0.14);
      yaw.add(g);
      guns.push({ obj: g, rest: g.position.z, muzzle: new THREE.Vector3(sx * 0.1, 0.08, 0.56) });
    }
  } else {
    const housing = mesh(barrelGeo(0.2, 0.22, 10), M.gun, 0, 0.08 * k, 0.2 * k);
    yaw.add(housing);
    const cluster = new THREE.Group();
    cluster.position.set(0, 0.08 * k, 0.2 * k + 0.2);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      cluster.add(mesh(barrelGeo(0.055, 0.75), M.gunDark, Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0));
    }
    cluster.add(mesh(barrelGeo(0.2, 0.05, 10), M.accent, 0, 0, 0.5));
    cluster.add(mesh(barrelGeo(0.19, 0.04, 10), M.plateLight, 0, 0, 0.7));
    yaw.add(cluster);
    spinner = cluster;
    guns.push({ obj: cluster, rest: cluster.position.z, muzzle: new THREE.Vector3(0, 0.08 * k, 0.2 * k + 0.98) });
    const ammo = mesh(roundedBox(0.16 * k, 0.16 * k, 0.24 * k, 0.03 * k), M.accentDark, 0.3 * k, 0.04 * k, -0.08 * k);
    yaw.add(ammo);
  }
  return turret(yaw, base, { guns, spinner, rate: big ? 7 : 3.6, range: big ? 5 : 3.6, bolt: "warm", boltSize: big ? 0.08 : 0.07, salvo: false });
}

/** C: Lance. Steel dome with a cyan eye and a long coil rail. Slow, heavy cyan bolts that echo the nexus. */
function lance(big: boolean): Turret {
  const k = big ? 1.8 : 1;
  const base = new THREE.Group();
  base.add(mesh(new THREE.CylinderGeometry(0.34 * k, 0.36 * k, 0.07 * k, 16), M.gunDark, 0, 0.035 * k, 0));
  const ring = mesh(new THREE.TorusGeometry(0.3 * k, 0.025 * k, 6, 24), M.cyan, 0, 0.075 * k, 0);
  ring.rotation.x = Math.PI / 2;
  base.add(ring);
  const yaw = new THREE.Group();
  yaw.position.y = 0.08 * k;
  const dome = mesh(new THREE.SphereGeometry(0.28 * k, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.plateLight);
  const band = mesh(new THREE.CylinderGeometry(0.285 * k, 0.285 * k, 0.05 * k, 14), M.gun, 0, 0.03 * k, 0);
  const eye = mesh(new THREE.BoxGeometry(0.16 * k, 0.035 * k, 0.04 * k), M.cyan, 0, 0.14 * k, 0.23 * k);
  eye.rotation.x = -0.5;
  yaw.add(dome, band, eye);
  const g = new THREE.Group();
  const railLen = big ? 1.5 : 0.62;
  g.add(mesh(new THREE.BoxGeometry(0.035 * k, 0.03 * k, railLen), M.gunDark, 0.035 * k, 0, railLen / 2));
  g.add(mesh(new THREE.BoxGeometry(0.035 * k, 0.03 * k, railLen), M.gunDark, -0.035 * k, 0, railLen / 2));
  const coils = big ? 3 : 2;
  for (let i = 0; i < coils; i++) {
    const c = mesh(new THREE.TorusGeometry(0.075 * k, 0.018 * k, 6, 12), i === coils - 1 ? M.cyan : M.gun, 0, 0, railLen * (0.25 + 0.3 * i));
    g.add(c);
  }
  if (big) {
    const fin = mesh(new THREE.BoxGeometry(0.03 * k, 0.16 * k, 0.3 * k), M.accent, 0, 0.26 * k, -0.06 * k);
    yaw.add(fin);
    const cell = mesh(new THREE.OctahedronGeometry(0.07 * k, 0), M.cyan, 0, 0.36 * k, -0.06 * k);
    cell.scale.y = 1.4;
    yaw.add(cell);
  }
  g.position.set(0, 0.1 * k, 0.12 * k);
  yaw.add(g);
  const guns = [{ obj: g, rest: g.position.z, muzzle: new THREE.Vector3(0, 0.1 * k, 0.12 * k + railLen) }];
  return turret(yaw, base, { guns, rate: big ? 0.55 : 0.8, range: big ? 7 : 5, bolt: "cyan", boltSize: big ? 0.2 : 0.11, salvo: true, glowParts: M.cyan });
}

// ------------------------------------------------------------------ stations

const DESIGNS = [
  { key: "A", name: "Sentry", make: sentry, text: "The classic. One barrel, steady shots. Reads instantly as a gun." },
  { key: "B", name: "Twin", make: twin, text: "Paired barrels in orange colony plating. The 2×2 becomes a spinning 4-barrel gatling." },
  { key: "C", name: "Lance", make: lance, text: "A dome with a coil rail and a cyan eye, matching the nexus tech. Slow, heavy bolts." },
] as const;

interface Station { center: THREE.Vector3; turrets: Turret[]; label: HTMLElement }
const stations: Station[] = [];
const turrets: Turret[] = [];
const labels = document.getElementById("labels")!;

/**
 * Local layout per station: two I pieces stacked (a 2×2 turret spans both),
 * and an L piece carrying a 1×1 turret.
 */
const PIECES: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[5, -1], [5, 0], [5, 1], [6, 1]],
];
const SPACING = 6;

DESIGNS.forEach((d, i) => {
  const ox = (i - 1) * SPACING - 3, oz = -(i - 1) * SPACING - 0.5;
  PIECES.forEach((cells, pi) => {
    for (const [x, z] of cells) {
      const w = models.create("wall", { variant: pi % 2 });
      w.position.set(ox + x + 0.5, 0, oz + z + 0.5);
      scene.add(w);
    }
  });
  const big = d.make(true);
  big.root.position.set(ox + 2, TOP, oz + 1);
  const small = d.make(false);
  small.root.position.set(ox + 5.5, TOP, oz - 0.5);
  for (const t of [big, small]) {
    t.yaw.rotation.y = Math.PI * 0.25;
    scene.add(t.root);
    turrets.push(t);
  }
  const el = document.createElement("div");
  el.className = "label";
  el.innerHTML = `<b>${d.key}</b><span>${d.name}</span>`;
  labels.appendChild(el);
  stations.push({ center: new THREE.Vector3(ox + 3.5, 0, oz + 0.5), turrets: [big, small], label: el });
});

// Scenery from the game's own model library.
const deco: [string, number, number, number][] = [
  ["tree", -12, -2, 1.1], ["tree", -11, 3, 0.9], ["tree", 8, -12, 1.0], ["tree", 11, -9, 1.15], ["tree", -3, -9, 0.95],
  ["tree", 3, 9, 1.05], ["tree", -8, 10, 1.0], ["tree", 13, 2, 0.9], ["rock", -6, -6, 13], ["rock", 9, 5, 11], ["rock", 1, -4, 12],
  ["rock", -13, 8, 14], ["tree", -1, 13, 1.1], ["tree", 15, -4, 1.0],
];
for (const [name, x, z, s] of deco) {
  const m = models.create(name, name === "tree" ? { scale: s, seed: x * 7 + z } : { scale: s, seed: x * 5 + z });
  m.position.set(x + 0.5, 0, z + 0.5);
  scene.add(m);
}
for (let i = 0; i < 40; i++) {
  const m = models.create("snowMound", { scale: 0.3 + ((i * 37) % 10) / 30 });
  m.position.set(((i * 53) % 34) - 17, 0, ((i * 29) % 34) - 17);
  if (Math.abs(m.position.x + m.position.z) < 9) continue;
  scene.add(m);
}

// ------------------------------------------------------------------ aliens

/** Aliens walk a lane in front of the stations, back and forth along the screen. */
const LANE_DIR = new THREE.Vector3(1, 0, -1).normalize();
const LANE_ORIGIN = new THREE.Vector3(1.3, 0, 2.6);
const LANE_HALF = 13;
interface Alien { obj: THREE.Object3D; mat: THREE.MeshStandardMaterial; s: number; speed: number; flash: number }
const aliens: Alien[] = [];
for (let i = 0; i < 4; i++) {
  const obj = models.create("walker");
  scene.add(obj);
  aliens.push({ obj, mat: obj.userData.material as THREE.MeshStandardMaterial, s: -LANE_HALF + i * 6.5, speed: 1.4 + i * 0.12, flash: 0 });
}
function laneAt(s: number, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(LANE_ORIGIN).addScaledVector(LANE_DIR, s);
}

// ------------------------------------------------------------------ bolts and fx

const boltMat = {
  warm: new THREE.MeshBasicMaterial({ color: "#ffd08a" }),
  cyan: new THREE.MeshBasicMaterial({ color: "#aefcf2" }),
};
const flashTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.3, "rgba(255,255,255,.45)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const flashMat = {
  warm: new THREE.SpriteMaterial({ map: flashTex, color: "#ffb45a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  cyan: new THREE.SpriteMaterial({ map: flashTex, color: "#4fdcca", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
};
const boltGeo = new THREE.SphereGeometry(1, 8, 6);
interface Bolt { mesh: THREE.Mesh; from: THREE.Vector3; target: Alien; t: number; dur: number }
interface Flash { sprite: THREE.Sprite; life: number; max: number; size: number }
const bolts: Bolt[] = [];
const flashes: Flash[] = [];

function addFlash(pos: THREE.Vector3, kind: "warm" | "cyan", size: number, life = 0.12): void {
  const sp = new THREE.Sprite(flashMat[kind].clone());
  sp.position.copy(pos);
  scene.add(sp);
  flashes.push({ sprite: sp, life, max: life, size });
}

const state = new Map<Turret, { cd: number; gun: number; recoil: number[]; spin: number }>();
for (const t of turrets) state.set(t, { cd: Math.random(), gun: 0, recoil: t.guns.map(() => 0), spin: 0 });

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function updateTurrets(dt: number): void {
  for (const t of turrets) {
    const st = state.get(t)!;
    const pos = t.root.getWorldPosition(tmp);
    let best: Alien | null = null, bestD = Infinity;
    for (const a of aliens) {
      const d = Math.hypot(a.obj.position.x - pos.x, a.obj.position.z - pos.z);
      // "Most progress" in the mockup: the one furthest along the lane.
      if (d <= t.range && (best === null || a.s > best.s)) { best = a; bestD = d; }
    }
    void bestD;
    st.cd -= dt;
    st.spin = Math.max(0, st.spin - dt * 2);
    if (best) {
      const want = Math.atan2(best.obj.position.x - pos.x, best.obj.position.z - pos.z);
      let diff = want - t.yaw.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      t.yaw.rotation.y += diff * Math.min(1, dt * 9);
      if (Math.abs(diff) < 0.25 && st.cd <= 0) {
        st.cd = 1 / t.rate;
        st.spin = 1;
        const idx = t.salvo ? t.guns.map((_, i) => i) : [st.gun++ % t.guns.length];
        for (const i of idx) {
          const g = t.guns[i]!;
          st.recoil[i] = 1;
          const from = g.muzzle.clone();
          t.yaw.localToWorld(from);
          addFlash(from, t.bolt, t.boltSize * 4);
          const m = new THREE.Mesh(boltGeo, boltMat[t.bolt]);
          m.scale.setScalar(t.boltSize * 0.5);
          m.position.copy(from);
          scene.add(m);
          const dist = from.distanceTo(best.obj.position);
          bolts.push({ mesh: m, from, target: best, t: 0, dur: dist / (t.bolt === "cyan" ? 9 : 14) });
        }
      }
    } else {
      t.yaw.rotation.y += dt * 0.25;
    }
    t.guns.forEach((g, i) => {
      st.recoil[i] = Math.max(0, st.recoil[i]! - dt * 7);
      const kick = t.boltSize * 0.9;
      g.obj.position.z = g.rest - kick * st.recoil[i]! ** 2;
    });
    if (t.spinner) t.spinner.rotation.z += dt * 30 * st.spin;
  }
}

function updateBolts(dt: number): void {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]!;
    b.t += dt;
    const p = Math.min(1, b.t / b.dur);
    tmp2.copy(b.target.obj.position); tmp2.y = 0.2;
    b.mesh.position.lerpVectors(b.from, tmp2, p);
    if (p >= 1) {
      scene.remove(b.mesh);
      bolts.splice(i, 1);
      b.target.flash = 0.12;
      addFlash(tmp2, b.mesh.material === boltMat.cyan ? "cyan" : "warm", 0.5, 0.15);
    }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]!;
    f.life -= dt;
    const k = Math.max(0, f.life / f.max);
    f.sprite.scale.setScalar(f.size * (0.6 + 0.4 * k));
    f.sprite.material.opacity = k;
    if (f.life <= 0) { scene.remove(f.sprite); f.sprite.material.dispose(); flashes.splice(i, 1); }
  }
}

function updateAliens(dt: number, t: number): void {
  for (const a of aliens) {
    a.s += a.speed * dt;
    if (a.s > LANE_HALF) a.s -= LANE_HALF * 2;
    laneAt(a.s, a.obj.position);
    a.obj.position.y = 0.2 + Math.abs(Math.sin(t * 6 + a.s)) * 0.05;
    a.obj.rotation.y = Math.atan2(LANE_DIR.x, LANE_DIR.z);
    a.flash = Math.max(0, a.flash - dt);
    a.mat.emissive.set(a.flash > 0 ? "#ffffff" : "#7a4ce6");
    a.mat.emissiveIntensity = a.flash > 0 ? 0.9 : 0.3;
  }
}

// ------------------------------------------------------------------ snow

const N = 900;
const snowPos = new Float32Array(N * 3), snowSpeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 36;
  snowPos[i * 3 + 1] = Math.random() * 12;
  snowPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
  snowSpeed[i] = 0.5 + Math.random() * 0.7;
}
const sg = new THREE.BufferGeometry();
sg.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
snow.frustumCulled = false;
scene.add(snow);

// ------------------------------------------------------------------ camera and focus

const target = new THREE.Vector3(0, 0, 0);
const wantTarget = new THREE.Vector3(0, 0, 0);
let zoom = 7.6, wantZoom = 7.6;
const OVERVIEW = { target: new THREE.Vector3(0.6, 0, 0.6), zoom: 7.6 };
wantTarget.copy(OVERVIEW.target); target.copy(OVERVIEW.target);

function fitZoom(base: number): number {
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  // Keep all three stations in view on narrow screens.
  return a < 1.2 ? base * (1.35 / Math.max(0.5, a)) : base;
}

const buttons = { fAll: -1, fA: 0, fB: 1, fC: 2 } as const;
const note = document.getElementById("note")!;
const DEFAULT_NOTE = note.textContent ?? "";
let focus = -1;
function setFocus(i: number): void {
  focus = i;
  for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.setAttribute("aria-pressed", String(idx === i));
  if (i < 0) { wantTarget.copy(OVERVIEW.target); wantZoom = OVERVIEW.zoom; note.textContent = DEFAULT_NOTE; }
  else {
    const c = stations[i]!.center;
    wantTarget.set(c.x + 0.4, 0, c.z + 0.9);
    wantZoom = 3.4;
    const d = DESIGNS[i]!;
    note.innerHTML = `<b>${d.key} · ${d.name}.</b> ${d.text}`;
  }
}
for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.addEventListener("click", () => setFocus(idx));
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === "a") setFocus(0); else if (k === "b") setFocus(1); else if (k === "c") setFocus(2);
  else if (k === "escape" || k === "0") setFocus(-1);
});
renderer.domElement.addEventListener("click", e => {
  // Clicking a station focuses it; clicking elsewhere returns to the overview.
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
  let best = -1, bestD = 3.2;
  stations.forEach((s, i) => { const d = Math.hypot(p.x - s.center.x, p.z - s.center.z); if (d < bestD) { bestD = d; best = i; } });
  setFocus(best === focus ? -1 : best);
});

function resize(): void {
  renderer.setSize(container.clientWidth, container.clientHeight);
}
addEventListener("resize", resize);
resize();

// ------------------------------------------------------------------ loop

const clock = new THREE.Clock();
let time = 0;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  updateAliens(dt, time);
  updateTurrets(dt);
  updateBolts(dt);

  if (!reduce) {
    for (let i = 0; i < N; i++) {
      snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
      snowPos[i * 3]! += Math.sin(time * 0.7 + i) * dt * 0.15;
      if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 12;
    }
    sg.attributes.position!.needsUpdate = true;
  }
  snow.position.set(target.x, 0, target.z);

  const ease = 1 - Math.exp(-dt * 5);
  target.lerp(wantTarget, ease);
  zoom += (fitZoom(wantZoom) - zoom) * ease;
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  Object.assign(camera, { left: -zoom * a, right: zoom * a, top: zoom, bottom: -zoom });
  camera.updateProjectionMatrix();
  camera.position.copy(target).add(CAM_OFFSET);
  camera.lookAt(target.x, 0, target.z);
  camera.updateMatrixWorld();

  sun.position.set(target.x + EVENING.sunOffset[0], EVENING.sunOffset[1], target.z + EVENING.sunOffset[2]);
  sun.target.position.set(target.x, 0, target.z);

  // Labels float above each station's 2×2 turret.
  const w = container.clientWidth, h = container.clientHeight;
  stations.forEach((s, i) => {
    tmp.copy(s.turrets[0]!.root.position); tmp.y += 1.5;
    tmp.project(camera);
    s.label.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
    s.label.classList.toggle("dim", focus >= 0 && focus !== i);
  });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
