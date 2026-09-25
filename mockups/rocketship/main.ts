import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, roundedBox, type TurretRig } from "../../src/render/models";
import "./style.css";

// The chosen ship, the Rocket, on its own: three fins (one front-centre), the engine
// core in an open cage mid-body, and a cargo door that is also the ramp. It
// lands with the door shut, then the door swings down into a ramp.
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
  hull: std("#e4e8f0", { roughness: 0.6 }),
  hullShade: std("#c3c9d6", { roughness: 0.65 }),
  orange: std(EVENING.wallA),
  orangeDark: std("#a8432d"),
  steel: std("#3d4457", { roughness: 0.55 }),
  steelDark: std("#2c3142", { roughness: 0.6 }),
  steelLight: std("#8a94ab", { roughness: 0.5 }),
  visor: std("#1d2233", { roughness: 0.25 }),
  power: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.6, roughness: 0.4 }),
  crystal: std("#8ff5e8", { emissive: "#4fdcca", emissiveIntensity: 0.95, roughness: 0.3 }),
  print: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.2, roughness: 0.4 }),
  /** Warm light spilling from the open bay. */
  bayLight: std("#ffd79a", { emissive: "#ffa94d", emissiveIntensity: 0, roughness: 0.6 }),
};

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
/** Box standing on y (y is its bottom). */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const cyl = (r0: number, r1: number, h: number, m: THREE.Material, y: number) => mesh(new THREE.CylinderGeometry(r1, r0, h, 20), m, 0, y + h / 2, 0);
const shadowAll = <T extends THREE.Object3D>(o: T): T => {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
};

// ------------------------------------------------------------------ the rocket

/**
 * Built with its front facing local +z; the whole group is turned 45° so the
 * front faces the camera. Three fins: one in the middle of the front, two
 * behind. The cargo bay sits front-left of the front fin, the fabricator with
 * its console front-right, both at walking height.
 */
function buildRocket() {
  const g = new THREE.Group();
  const R = 0.72;
  /** The lower body is wider than the rest: a sturdier base. */
  const RL = 0.86;
  /** Direction on the hull at local angle `a` (0 = +x, 90° = +z, the front). */
  const facing = (a: number) => { const o = new THREE.Group(); o.rotation.y = Math.PI / 2 - a; g.add(o); return o; };
  const deg = Math.PI / 180;

  // Three fins double as landing legs: front centre, back-left, back-right.
  [90, 210, 330].forEach((d, i) => {
    const a = d * deg;
    const s = new THREE.Shape();
    [[RL - 0.05, 0.55], [RL + 0.5, 0], [RL + 0.62, 0], [RL + 0.42, 0.9], [RL - 0.05, 1.7]].forEach(([x, y], k) => (k ? s.lineTo(x!, y!) : s.moveTo(x!, y!)));
    // The front fin faces the camera end-on, so it's built heavier to keep its mass.
    const t = i === 0 ? 0.2 : 0.12;
    const fg = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    fg.translate(0, 0, -t / 2);
    const f = new THREE.Mesh(fg, i === 0 ? M.orange : M.orangeDark);
    f.rotation.y = -a;
    g.add(f);
    // A steel leading edge so the front fin reads as a fin when seen end-on.
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), M.steel);
    edge.position.set(Math.cos(a) * (RL + 0.56), 0.025, Math.sin(a) * (RL + 0.56));
    g.add(edge);
  });

  // Engine bells underneath, between the fins.
  for (const d of [30, 150, 270]) { // under the hull, between the fins
    const b = new THREE.Group();
    b.add(mesh(new THREE.CylinderGeometry(0.13, 0.28, 0.36, 12, 1, true), M.steelDark, 0, 0.18, 0));
    b.add(mesh(new THREE.CircleGeometry(0.25, 12).rotateX(Math.PI / 2), M.power, 0, 0.02, 0));
    b.position.set(Math.cos(d * deg) * 0.3, 0.1, Math.sin(d * deg) * 0.3);
    g.add(b);
  }

  // Lower body.
  g.add(cyl(RL * 0.9, RL, 0.12, M.steelDark, 0.28));
  g.add(cyl(RL, RL, 0.82, M.hull, 0.4));
  g.add(cyl(RL + 0.02, RL + 0.02, 0.1, M.orange, 1.12));
  // Shoulder from the wide base up to the core deck.
  g.add(cyl(RL, R + 0.03, 0.14, M.hullShade, 1.22));
  const face = RL - 0.03;

  // Cargo bay, front-left: a dark recess in an orange frame with a warm light inside.
  const bay = facing(135 * deg);
  const bayW = 0.5, bayY0 = 0.4, bayH = 0.64;
  bay.add(box(bayW, bayH, 0.1, M.steelDark, 0, bayY0, face - 0.02));
  bay.add(box(bayW - 0.08, 0.04, 0.05, M.bayLight, 0, bayY0 + bayH - 0.1, face + 0.02));
  bay.add(box(bayW + 0.12, 0.07, 0.1, M.orange, 0, bayY0 + bayH, face + 0.03));
  for (const sx of [-1, 1]) bay.add(box(0.07, bayH, 0.1, M.orange, sx * (bayW / 2 + 0.03), bayY0, face + 0.03));
  // The door is the ramp: hinged at the sill, it swings out and down to the snow.
  const door = new THREE.Group();
  door.position.set(0, bayY0, face + 0.06);
  const panel = box(bayW, bayH, 0.06, M.hullShade, 0, 0, 0);
  panel.position.z = 0.03;
  door.add(panel);
  for (let k = 0; k < 4; k++) door.add(box(bayW * 0.8, 0.02, 0.02, M.steelLight, 0, 0.1 + k * 0.13, 0.065));
  for (const sx of [-1, 1]) door.add(box(0.04, bayH, 0.03, M.orange, sx * (bayW / 2 - 0.02), 0, 0.07));
  bay.add(door);
  const openAngle = Math.PI / 2 + Math.asin(Math.min(1, bayY0 / bayH));

  // Fabricator, front-right: print hatch with a pulsing plate, a console screen and a gantry arm.
  const fab = facing(45 * deg);
  fab.add(box(0.5, 0.6, 0.1, M.steelDark, 0, 0.42, face - 0.02));
  fab.add(box(0.56, 0.07, 0.1, M.orange, 0, 1.02, face + 0.03));
  fab.add(box(0.56, 0.05, 0.1, M.orange, 0, 0.38, face + 0.03));
  fab.add(box(0.34, 0.2, 0.03, M.print, 0, 0.5, face + 0.04));
  const screen = box(0.3, 0.18, 0.03, M.visor, 0, 0.78, face + 0.04);
  fab.add(screen);
  for (let k = 0; k < 3; k++) fab.add(box(0.2 - k * 0.05, 0.015, 0.01, M.power, -0.03 + k * 0.025, 0.82 + k * 0.035, face + 0.06));
  const arm = new THREE.Group();
  arm.add(box(0.05, 0.05, 0.34, M.steelLight, 0, 0, 0.17));
  arm.add(box(0.05, 0.14, 0.05, M.steelLight, 0, -0.12, 0.32));
  arm.position.set(0.16, 1.1, face);
  fab.add(arm);

  // Open core section: the Reactor cage.
  g.add(cyl(R + 0.03, R + 0.03, 0.06, M.steel, 1.34));
  const core = new THREE.Group();
  core.add(mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.12, 12), M.steel, 0, 0.06, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    core.add(mesh(roundedBox(0.12, 0.95, 0.12, 0.03), M.steelLight, Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5));
    core.add(box(0.16, 0.06, 0.16, M.orange, Math.cos(a) * 0.5, 1.02, Math.sin(a) * 0.5));
  }
  const crystal = mesh(new THREE.OctahedronGeometry(0.24, 0), M.crystal);
  crystal.scale.y = 1.5;
  const ring = mesh(new THREE.TorusGeometry(0.36, 0.018, 6, 28), M.power);
  const coreLight = new THREE.PointLight("#7ff5e6", 1.4, 2.6, 2);
  coreLight.position.y = 0.6;
  core.add(crystal, ring, coreLight);
  core.position.y = 1.38;
  g.add(core);

  // Upper body with a porthole, then the nose.
  g.add(cyl(R + 0.03, R + 0.03, 0.08, M.steel, 2.46));
  g.add(cyl(R, R, 0.78, M.hull, 2.54));
  g.add(cyl(R + 0.02, R + 0.02, 0.1, M.orange, 3.08));
  facing(90 * deg).add(mesh(new THREE.CircleGeometry(0.13, 14), M.visor, 0, 2.86, R + 0.01));
  g.add(mesh(new THREE.ConeGeometry(R, 1.05, 20), M.hull, 0, 3.32 + 0.525, 0));
  g.add(mesh(new THREE.ConeGeometry(0.2, 0.3, 20), M.orange, 0, 4.28, 0));

  shadowAll(g);
  return {
    group: g, bay, door, openAngle, bayY0, face,
    /** How far from the hull the open ramp touches the snow. */
    reach: Math.sqrt(Math.max(0, bayH ** 2 - bayY0 ** 2)),
    update(t: number) {
      crystal.position.y = 0.55 + Math.sin(t * 2) * 0.04;
      crystal.rotation.y = t * 0.9;
      ring.position.y = crystal.position.y;
      ring.rotation.set(Math.PI / 2 + Math.sin(t) * 0.5, t * 0.8, 0);
    },
  };
}

function colonist(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh(new THREE.CapsuleGeometry(0.11, 0.18, 4, 8), M.hull, 0, 0.23, 0));
  body.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), M.hull, 0, 0.47, 0));
  body.add(box(0.13, 0.05, 0.04, M.visor, 0, 0.42, 0.08));
  body.add(box(0.16, 0.2, 0.08, M.orange, 0, 0.12, -0.12));
  const legs = [-1, 1].map(sx => { const l = box(0.06, 0.1, 0.07, M.steelDark, sx * 0.05, 0, 0); body.add(l); return l; });
  g.add(body);
  g.userData.legs = legs;
  return shadowAll(g);
}

// ------------------------------------------------------------------ scene

// The 3×3 footprint covers cells (-1..1, -1..1); its center is (0.5, 0.5).
const CENTER = new THREE.Vector3(0.5, 0, 0.5);
const rocket = buildRocket();
rocket.group.position.copy(CENTER);
rocket.group.rotation.y = Math.PI / 4;
scene.add(rocket.group);

// Footprint marker on the snow, faint.
const foot = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.12, depthWrite: false }));
foot.rotation.x = -Math.PI / 2;
foot.position.set(CENTER.x, 0.006, CENTER.z);
scene.add(foot);

const pieces: [number, number][][] = [
  [[-3, -2], [-3, -1], [-3, 0], [-3, 1]],
  [[-1, -3], [0, -3], [1, -3], [2, -3]],
  [[3, -1], [4, -1], [4, 0], [4, 1]],
];
pieces.forEach((cells, pi) => scene.add(models.create("wallPiece", { cells, variant: pi % 2 })));
const twins = [[-2.5, -1.5], [1.5, -2.5]].map(([x, z]) => {
  const t = models.create("twin");
  t.position.set(x!, DECK_TOP, z!);
  scene.add(t);
  return t.userData.rig as TurretRig;
});

const deco: [string, number, number, number][] = [
  ["tree", -7, -4, 1.1], ["tree", -6, 3, 0.9], ["tree", 6, -6, 1.0], ["tree", 7, 3, 1.15], ["tree", -2, 7, 0.95],
  ["rock", -5, -7, 13], ["rock", 7, -2, 11], ["rock", 3, 6, 12], ["tree", 9, -8, 1.0], ["tree", -9, 7, 1.05],
];
for (const [name, x, z, s] of deco) {
  const m = models.create(name, name === "tree" ? { scale: s, seed: x * 7 + z } : { scale: s, seed: x * 5 + z });
  m.position.set(x + 0.5, 0, z + 0.5);
  scene.add(m);
}

// The colonist arrives by drop pod earlier; here it just stands by the console for scale.
const guy = colonist();
guy.position.set(CENTER.x + 1.45, 0, CENTER.z + 1.0);
guy.rotation.y = -Math.PI * 0.6;
scene.add(guy);

// ------------------------------------------------------------------ the landing sequence

const thruster = new THREE.Sprite(glows.cyan);
scene.add(thruster);
const puffGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09), puffMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
const puffs: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
function burst(x: number, z: number, r: number, n: number, speed: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, rr = r + Math.random() * 0.25, sp = speed * (0.6 + Math.random() * 0.8);
    const m = new THREE.Mesh(puffGeo, puffMat);
    m.position.set(x + Math.cos(a) * rr, 0.05, z + Math.sin(a) * rr);
    scene.add(m);
    puffs.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 1 + Math.random() * 1.4, Math.sin(a) * sp), life: 0.7 });
  }
}

const DROP = 10, DESCENT = 2.6, HOLD = 0.5, OPEN = 1.0;
let t0 = 0, time = 0, shake = 0, touched = false, clunked = false;
let doorManual: number | null = null;

/** Height and door opening 0..1, from the time since landing began. */
function sequence(since: number): { y: number; door: number; thrust: boolean } {
  if (since < DESCENT) {
    const k = since / DESCENT, e = 1 - (1 - k) ** 3;
    return { y: DROP * (1 - e), door: 0, thrust: true };
  }
  const after = since - DESCENT - HOLD;
  const door = Math.min(1, Math.max(0, after / OPEN));
  return { y: 0, door, thrust: false };
}

function land(): void {
  t0 = time; touched = false; clunked = false; doorManual = null;
}
document.getElementById("land")!.addEventListener("click", land);
document.getElementById("door")!.addEventListener("click", () => {
  const s = sequence(time - t0);
  const cur = doorManual ?? s.door;
  doorManual = cur > 0.5 ? 0 : 1;
});

const tmp = new THREE.Vector3();
/** Point in the rocket's local space to world space. */
/** Point in the cargo bay's local space to world space. */
const local = (x: number, y: number, z: number) => rocket.bay.localToWorld(tmp.set(x, y, z)).clone();

// ------------------------------------------------------------------ snow, camera, loop

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

const target = new THREE.Vector3(-0.3, 0, -0.3);
let zoom = 4.4;
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.min(9, Math.max(2.4, zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

const clock = new THREE.Clock();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  rocket.update(time);

  const s = sequence(time - t0);
  rocket.group.position.y = s.y;
  rocket.group.updateMatrixWorld(true);
  thruster.visible = s.thrust;
  thruster.position.set(CENTER.x, s.y + 0.1, CENTER.z);
  thruster.scale.setScalar(2.2 + Math.sin(time * 40) * 0.2);
  if (!touched && !s.thrust) { touched = true; shake = 0.28; burst(CENTER.x, CENTER.z, 1.4, 30, 2.2); }

  // Door: shut while flying, then swings out and down into a ramp.
  const d = ease(doorManual ?? s.door);
  rocket.door.rotation.x = d * rocket.openAngle;
  M.bayLight.emissiveIntensity = d * 1.2;
  if (!clunked && s.door >= 1 && doorManual === null) {
    clunked = true; shake = 0.1;
    const tip = local(0, 0.02, rocket.face + 0.06 + rocket.reach);
    burst(tip.x, tip.z, 0.15, 8, 0.8);
  }

  // Fabricator pulse and idle turrets.
  M.print.emissiveIntensity = 0.2 + Math.max(0, 1 - ((time % 3) / 0.5)) * 1.3;
  for (const r of twins) r.yaw.rotation.y = Math.sin(time * 0.5) * 0.9 + 0.8;

  for (const p of puffs) { p.life -= dt; p.v.y -= 5 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < 0.03) { p.m.position.y = 0.03; p.v.multiplyScalar(0.8); } p.m.scale.setScalar(Math.max(0.01, p.life / 0.7)); }
  for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i]!.life <= 0) { scene.remove(puffs[i]!.m); puffs.splice(i, 1); }

  if (!reduce) {
    for (let i = 0; i < N; i++) {
      snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
      snowPos[i * 3]! += Math.sin(time * 0.7 + i) * dt * 0.15;
      if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 12;
    }
    sg.attributes.position!.needsUpdate = true;
  }
  snow.position.set(target.x, 0, target.z);

  const a = container.clientWidth / Math.max(1, container.clientHeight);
  const z = a < 1.2 ? zoom * (1.35 / Math.max(0.5, a)) : zoom;
  Object.assign(camera, { left: -z * a, right: z * a, top: z, bottom: -z });
  camera.updateProjectionMatrix();
  shake = Math.max(0, shake - dt);
  const sh = shake > 0 ? 0.05 : 0;
  camera.position.copy(target).add(CAM_OFFSET);
  camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh;
  camera.lookAt(target.x, 0, target.z);
  sun.position.set(target.x + EVENING.sunOffset[0], EVENING.sunOffset[1], target.z + EVENING.sunOffset[2]);
  sun.target.position.set(target.x, 0, target.z);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
land();
requestAnimationFrame(frame);
