import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, roundedBox, type TurretRig } from "../../src/render/models";
import "./style.css";

// Rocket mockup: three rocket-like takes on the Lander on a 3×3 footprint, in the
// game's own light, next to Armored deck walls, a Twin and a colonist for scale.
// Every ship has an engine core (the heart), a cargo bay facing +z (ore drop-off)
// and a fabricator bay facing +x (prints walls). Both faces point at the camera.
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
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 60 });
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ materials (the locked palette)

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
  /** Fabricator print plate: pulses when a wall is printed. */
  print: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.2, roughness: 0.4 }),
};

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(roundedBox(w, h, d, r), m, x, y, z);
const shadowAll = <T extends THREE.Object3D>(o: T): T => {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
};

/** The engine core: crystal in a cage of pylons with an orbiting ring. Shared by all three ships. */
function engineCore(scale: number, pylons = 4): { group: THREE.Group; update: (t: number) => void } {
  const g = new THREE.Group();
  const k = scale;
  g.add(mesh(new THREE.CylinderGeometry(0.5 * k, 0.56 * k, 0.12 * k, 8), M.steel, 0, 0.06 * k, 0));
  for (let i = 0; i < pylons; i++) {
    const a = Math.PI / 4 + (i * Math.PI * 2) / pylons;
    g.add(rbox(0.1 * k, 0.8 * k, 0.1 * k, 0.03 * k, M.steelLight, Math.cos(a) * 0.4 * k, 0.1 * k, Math.sin(a) * 0.4 * k));
    g.add(box(0.14 * k, 0.06 * k, 0.14 * k, M.orange, Math.cos(a) * 0.4 * k, 0.9 * k, Math.sin(a) * 0.4 * k));
  }
  const crown = mesh(new THREE.TorusGeometry(0.4 * k, 0.025 * k, 6, 28), M.steel, 0, 0.93 * k, 0);
  crown.rotation.x = Math.PI / 2;
  const crystal = mesh(new THREE.OctahedronGeometry(0.2 * k, 0), M.crystal);
  crystal.scale.y = 1.5;
  const ring = mesh(new THREE.TorusGeometry(0.3 * k, 0.015 * k, 6, 28), M.power);
  const light = new THREE.PointLight("#7ff5e6", 1.2 * k, 2.2 * k, 2);
  light.position.y = 0.6 * k;
  g.add(crown, crystal, ring, light);
  return {
    group: g,
    update: (t: number) => {
      crystal.position.y = (0.52 + Math.sin(t * 2) * 0.04) * k;
      crystal.rotation.y = t * 0.9;
      ring.position.y = crystal.position.y;
      ring.rotation.set(Math.PI / 2 + Math.sin(t) * 0.5, t * 0.8, 0);
    },
  };
}

/** Cargo bay on the +z face: a dark opening in an orange frame, with a ramp down to the snow. */
function cargoBay(width: number, height: number, faceZ: number, floorY: number): THREE.Group {
  const g = new THREE.Group();
  g.add(box(width, height, 0.06, M.steelDark, 0, floorY, faceZ));
  g.add(box(width + 0.12, 0.07, 0.1, M.orange, 0, floorY + height, faceZ + 0.02));
  g.add(box(0.07, height, 0.1, M.orange, -width / 2 - 0.03, floorY, faceZ + 0.02));
  g.add(box(0.07, height, 0.1, M.orange, width / 2 + 0.03, floorY, faceZ + 0.02));
  const len = Math.hypot(0.55, floorY);
  const ramp = mesh(new THREE.BoxGeometry(width, 0.05, len), M.steel);
  ramp.position.set(0, floorY / 2, faceZ + 0.275);
  ramp.rotation.x = Math.atan2(floorY, 0.55);
  g.add(ramp);
  for (const sx of [-1, 1]) g.add(box(0.05, 0.03, len * 0.9, M.orange, sx * (width / 2 - 0.05), floorY / 2 + 0.01, faceZ + 0.275).rotateX(Math.atan2(floorY, 0.55)));
  return g;
}

/** Fabricator bay on the +x face: a hatch with a print plate that pulses, and a gantry arm. */
function fabricator(faceX: number, y: number, depth: number): { group: THREE.Group } {
  const g = new THREE.Group();
  g.add(box(0.08, 0.5, depth, M.steelDark, faceX, y, 0));
  g.add(box(0.1, 0.07, depth + 0.1, M.orange, faceX + 0.02, y + 0.5, 0));
  g.add(box(0.1, 0.07, depth + 0.1, M.orange, faceX + 0.02, y - 0.07, 0));
  g.add(box(0.03, 0.3, depth * 0.6, M.print, faceX + 0.05, y + 0.1, 0));
  const arm = new THREE.Group();
  arm.add(box(0.5, 0.06, 0.06, M.steelLight, 0.25, 0, 0));
  arm.add(box(0.06, 0.18, 0.06, M.steelLight, 0.5, -0.12, 0));
  arm.position.set(faceX, y + 0.62, 0);
  g.add(arm);
  return { group: g };
}

// ------------------------------------------------------------------ the three ships

interface ShipDesign { key: string; name: string; text: string; build(): { group: THREE.Group; update: (t: number) => void; height: number } }

/** A flat fin from a 2D outline (x outward, y up), extruded to `t` thick, turned to face angle `a`. */
function fin(points: [number, number][], t: number, m: THREE.Material, a: number): THREE.Mesh {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  const o = new THREE.Mesh(g, m);
  o.rotation.y = -a;
  return o;
}

/** Engine bell pointing down, with a cyan glow inside. */
function bell(r: number, h: number, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r * 0.45, r, h, 12, 1, true), M.steelDark, 0, h / 2, 0));
  g.add(mesh(new THREE.CircleGeometry(r * 0.9, 12).rotateX(Math.PI / 2), M.power, 0, 0.02, 0));
  g.position.set(x, y, z);
  return g;
}

/** A band of cyan windows around a cylinder: the core glowing through the hull. */
function coreBand(r: number, y: number, h: number, count: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.PI / count;
    const w = box(r * 0.42, h, 0.04, M.crystal, Math.cos(a) * r, y, Math.sin(a) * r);
    w.rotation.y = -a + Math.PI / 2;
    g.add(w);
  }
  return g;
}

const SHIPS: ShipDesign[] = [
  {
    key: "A", name: "Rocket",
    text: "A classic upright rocket standing on three orange fins, nose cone on top, engine bells glowing underneath. The engine core sits in an open cage mid-body. The most iconic, and the tallest: it will hide a little of the maze behind it.",
    build() {
      const g = new THREE.Group();
      const R = 0.72;
      // Three fins double as landing legs: left, right and back, so none is edge-on to the camera.
      for (let i = 0; i < 3; i++) {
        const a = (3 * Math.PI) / 4 + (i * Math.PI) / 2;
        const f = fin([[R - 0.05, 0.6], [R + 0.62, 0], [R + 0.72, 0], [R + 0.5, 0.9], [R - 0.05, 1.7]], 0.1, i % 2 ? M.orangeDark : M.orange, a);
        g.add(f);
      }
      g.add(bell(0.3, 0.4, 0.28, 0.12, 0.28), bell(0.3, 0.4, -0.28, 0.12, -0.28), bell(0.3, 0.4, 0.28, 0.12, -0.28), bell(0.3, 0.4, -0.28, 0.12, 0.28));
      g.add(mesh(new THREE.CylinderGeometry(R, R * 0.9, 0.2, 16), M.steelDark, 0, 0.5, 0));
      // Lower body, an open core section (the Reactor cage), upper body and nose.
      g.add(mesh(new THREE.CylinderGeometry(R, R, 0.75, 16), M.hull, 0, 0.975, 0));
      g.add(mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.14, 16), M.orange, 0, 1.0, 0));
      g.add(mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.08, 16), M.steel, 0, 1.39, 0));
      const core = engineCore(1.2);
      core.group.position.y = 1.35;
      g.add(core.group);
      g.add(mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, 0.08, 16), M.steel, 0, 2.47, 0));
      g.add(mesh(new THREE.CylinderGeometry(R, R, 0.7, 16), M.hull, 0, 2.86, 0));
      g.add(mesh(new THREE.CylinderGeometry(R + 0.02, R + 0.02, 0.1, 16), M.orange, 0, 2.7, 0));
      g.add(mesh(new THREE.ConeGeometry(R, 1.0, 16), M.hull, 0, 3.71, 0));
      g.add(mesh(new THREE.ConeGeometry(0.2, 0.3, 16), M.orange, 0, 4.13, 0));
      g.add(mesh(new THREE.CircleGeometry(0.13, 12), M.visor, 0, 2.95, R + 0.01));
      // Cargo hatch at the base with a ramp; fabricator pod on the side.
      g.add(cargoBay(0.5, 0.42, R - 0.02, 0.62));
      const pod = new THREE.Group();
      pod.add(rbox(0.5, 0.55, 0.6, 0.06, M.hullShade, R + 0.1, 0.6, 0));
      pod.add(box(0.06, 0.42, 0.44, M.steelDark, R + 0.36, 0.66, 0));
      pod.add(box(0.03, 0.24, 0.3, M.print, R + 0.4, 0.74, 0));
      pod.add(box(0.07, 0.05, 0.5, M.orange, R + 0.37, 1.1, 0));
      g.add(pod);
      return { group: shadowAll(g), update: core.update, height: 4.3 };
    },
  },
  {
    key: "B", name: "Capsule lander",
    text: "The Lander you liked, reshaped as a capsule: a wide conical body on four legs, a domed nose with a small spike, side thruster pods, engine bells underneath and the core glowing through a ring of windows. Medium height, reads as a spacecraft.",
    build() {
      const g = new THREE.Group();
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const pad = mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.06, 10), M.steelDark, sx * 1.22, 0.03, sz * 1.22);
        const foot = new THREE.Vector3(sx * 1.22, 0.05, sz * 1.22), hip = new THREE.Vector3(sx * 0.72, 0.62, sz * 0.72);
        const dir = hip.clone().sub(foot);
        const strut = mesh(new THREE.BoxGeometry(0.1, dir.length(), 0.1), M.steelLight);
        strut.position.copy(foot).addScaledVector(dir, 0.5);
        strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        g.add(pad, strut);
      }
      g.add(bell(0.34, 0.4, 0, 0.14, 0), bell(0.22, 0.3, 0.45, 0.24, 0), bell(0.22, 0.3, -0.45, 0.24, 0));
      g.add(mesh(new THREE.CylinderGeometry(1.0, 1.08, 0.22, 16), M.steelDark, 0, 0.62, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.62, 1.08, 1.2, 16), M.hull, 0, 1.33, 0));
      g.add(mesh(new THREE.CylinderGeometry(1.0, 1.02, 0.12, 16), M.orange, 0, 0.93, 0));
      g.add(coreBand(0.86, 1.08, 0.18, 10));
      g.add(mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.1, 16), M.orange, 0, 1.96, 0));
      g.add(mesh(new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hullShade, 0, 2.0, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6), M.steelLight, 0, 2.85, 0));
      const visor = box(0.5, 0.12, 0.06, M.visor, 0, 1.6, 0);
      visor.position.set(0.52, 1.6, 0.52); visor.rotation.set(-0.35, Math.PI / 4, 0, "YXZ");
      g.add(visor);
      // Thruster pods on the sides.
      for (const a of [Math.PI * 0.75, -Math.PI * 0.25 - Math.PI / 2]) {
        const p = rbox(0.24, 0.5, 0.24, 0.05, M.steel, Math.cos(a) * 0.95, 1.1, Math.sin(a) * 0.95);
        g.add(p, box(0.26, 0.06, 0.26, M.orange, Math.cos(a) * 0.95, 1.45, Math.sin(a) * 0.95));
      }
      g.add(cargoBay(0.62, 0.36, 1.02, 0.66));
      g.add(fabricator(1.02, 0.72, 0.5).group);
      return { group: shadowAll(g), update: () => {}, height: 3.0 };
    },
  },
  {
    key: "C", name: "Dropship",
    text: "A winged dropship resting on landing gear: pointed nose, swept wings with VTOL engine pods, twin tail fins, and the core glowing in the main engine at the back. Rear ramp for cargo. Clearly a spaceship, and the lowest of the three.",
    build() {
      const g = new THREE.Group();
      // Fuselage side profile (z forward = -z nose), extruded across x.
      const prof = new THREE.Shape();
      prof.moveTo(1.4, 0.5); prof.lineTo(1.4, 1.3); prof.lineTo(0.2, 1.45); prof.lineTo(-0.9, 1.15); prof.lineTo(-1.5, 0.75); prof.lineTo(-1.2, 0.5); prof.lineTo(1.4, 0.5);
      const fus = new THREE.ExtrudeGeometry(prof, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 1 });
      fus.translate(0, 0, -0.45);
      fus.rotateY(Math.PI / 2);
      g.add(mesh(fus, M.hull));
      // Orange stripe and cockpit.
      const stripe = new THREE.Shape();
      stripe.moveTo(1.42, 0.95); stripe.lineTo(1.42, 1.07); stripe.lineTo(-1.1, 1.0); stripe.lineTo(-1.25, 0.88);
      const sg = new THREE.ExtrudeGeometry(stripe, { depth: 1.08, bevelEnabled: false });
      sg.translate(0, 0, -0.54); sg.rotateY(Math.PI / 2);
      g.add(mesh(sg, M.orange));
      const cockpit = box(0.6, 0.16, 0.5, M.visor, 0, 1.1, -1.05);
      cockpit.rotation.x = 0.45;
      g.add(cockpit);
      // Swept wings with engine pods.
      for (const sx of [-1, 1]) {
        const w = new THREE.Shape();
        w.moveTo(0, 0.6); w.lineTo(1.1, 0.2); w.lineTo(1.25, -0.25); w.lineTo(0, -0.7);
        const wg = new THREE.ExtrudeGeometry(w, { depth: 0.08, bevelEnabled: false });
        wg.rotateX(Math.PI / 2);
        const wing = mesh(wg, M.hullShade, sx * 0.45, 0.85, 0.2);
        wing.scale.x = sx;
        g.add(wing);
        g.add(rbox(0.36, 0.34, 0.8, 0.08, M.steel, sx * 1.35, 0.72, 0.2));
        g.add(box(0.38, 0.06, 0.4, M.orange, sx * 1.35, 1.06, 0.1));
        g.add(bell(0.16, 0.18, sx * 1.35, 0.55, 0.05), bell(0.16, 0.18, sx * 1.35, 0.55, 0.38));
        const tail = fin([[0, 0], [0.5, 0], [0.62, 0.55], [0.45, 0.55]], 0.06, M.orange, 0);
        tail.rotation.set(0, Math.PI / 2, sx * 0.25);
        tail.position.set(sx * 0.32, 1.3, 1.45);
        g.add(tail);
      }
      // Main engine with the core glowing inside.
      g.add(mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 12).rotateX(Math.PI / 2), M.steelDark, 0, 0.95, 1.55));
      g.add(mesh(new THREE.CircleGeometry(0.28, 12), M.crystal, 0, 0.95, 1.71));
      // Landing gear.
      for (const [x, z] of [[0, -1.0], [-0.5, 0.9], [0.5, 0.9]] as const) {
        g.add(box(0.07, 0.5, 0.07, M.steelLight, x, 0.05, z), mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.05, 10), M.steelDark, x, 0.03, z));
      }
      // Rear ramp for cargo (faces +z), side hatch for the fabricator (+x).
      g.add(cargoBay(0.6, 0.46, 1.5, 0.5));
      g.add(fabricator(0.53, 0.62, 0.5).group);
      return { group: shadowAll(g), update: () => {}, height: 1.9 };
    },
  },
];

// ------------------------------------------------------------------ colonist (for scale)

function colonist(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CapsuleGeometry(0.11, 0.18, 4, 8), M.hull, 0, 0.23, 0));
  g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8), M.hull, 0, 0.47, 0));
  g.add(box(0.13, 0.05, 0.04, M.visor, 0, 0.44, 0.08));
  g.add(box(0.16, 0.2, 0.08, M.orange, 0, 0.2, -0.12));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.1, 0.07, M.steelDark, sx * 0.05, 0, 0));
  return shadowAll(g);
}

// ------------------------------------------------------------------ stations

interface Station { ship: THREE.Group; update: (t: number) => void; center: THREE.Vector3; height: number; label: HTMLElement; landT: number }
const stations: Station[] = [];
const labels = document.getElementById("labels")!;
const turrets: { obj: THREE.Object3D; rig: TurretRig }[] = [];
const SPACING = 6;

SHIPS.forEach((d, i) => {
  // The 3×3 footprint covers cells (cx-1..cx+1, cz-1..cz+1).
  const cx = (i - 1) * SPACING, cz = -(i - 1) * SPACING;
  const center = new THREE.Vector3(cx + 0.5, 0, cz + 0.5);
  const built = d.build();
  built.group.position.copy(center);
  scene.add(built.group);
  // Walls and a Twin beside the ship, for size.
  const pieces: [number, number][][] = [
    [[cx - 3, cz - 2], [cx - 3, cz - 1], [cx - 3, cz], [cx - 3, cz + 1]],
    [[cx - 1, cz - 3], [cx, cz - 3], [cx + 1, cz - 3], [cx + 2, cz - 3]],
  ];
  pieces.forEach((cells, pi) => scene.add(models.create("wallPiece", { cells, variant: pi })));
  const tw = models.create("twin");
  tw.position.set(cx - 2.5, DECK_TOP, cz - 1.5);
  scene.add(tw);
  turrets.push({ obj: tw, rig: tw.userData.rig as TurretRig });
  const c = colonist();
  c.position.set(cx + 0.9, 0, cz + 2.6);
  c.rotation.y = Math.PI * 0.9;
  scene.add(c);

  const el = document.createElement("div");
  el.className = "label";
  el.innerHTML = `<b>${d.key}</b><span>${d.name}</span>`;
  labels.appendChild(el);
  stations.push({ ship: built.group, update: built.update, center, height: built.height, label: el, landT: -1 });
});

// Scenery from the game's model library.
const deco: [string, number, number, number][] = [
  ["tree", -12, -2, 1.1], ["tree", -11, 4, 0.9], ["tree", 8, -12, 1.0], ["tree", 11, -8, 1.15], ["tree", -3, -10, 0.95],
  ["tree", 4, 9, 1.05], ["tree", -8, 10, 1.0], ["tree", 13, 2, 0.9], ["rock", -6, -6, 13], ["rock", 9, 5, 11],
  ["rock", 2, -5, 12], ["rock", -2, 5, 11], ["tree", 15, -4, 1.0],
];
for (const [name, x, z, s] of deco) {
  const m = models.create(name, name === "tree" ? { scale: s, seed: x * 7 + z } : { scale: s, seed: x * 5 + z });
  m.position.set(x + 0.5, 0, z + 0.5);
  scene.add(m);
}

// ------------------------------------------------------------------ landing

const puffGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
const puffMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
const puffs: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
const thrusters = stations.map(() => {
  const s = new THREE.Sprite(glows.cyan);
  s.visible = false;
  scene.add(s);
  return s;
});
let shake = 0;
const LAND_TIME = 2.4, DROP = 9;

function land(): void {
  stations.forEach((s, i) => { if (focus < 0 || focus === i) s.landT = 0; });
}
function touchdown(s: Station): void {
  shake = 0.25;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2, r = 1.5 + Math.random() * 0.3, sp = 1.4 + Math.random() * 1.6;
    const m = new THREE.Mesh(puffGeo, puffMat);
    m.position.set(s.center.x + Math.cos(a) * r, 0.05, s.center.z + Math.sin(a) * r);
    scene.add(m);
    puffs.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 1.2 + Math.random() * 1.4, Math.sin(a) * sp), life: 0.7 });
  }
}

// ------------------------------------------------------------------ camera, focus, labels

const target = new THREE.Vector3(0.8, 0, 0.8), wantTarget = target.clone();
let zoom = 7.8, wantZoom = 7.8;
const OVERVIEW = { target: new THREE.Vector3(0.8, 0, 0.8), zoom: 7.8 };
const buttons = { fAll: -1, fA: 0, fB: 1, fC: 2 } as const;
const note = document.getElementById("note")!;
let focus = -1;
function setFocus(i: number): void {
  focus = i;
  for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.setAttribute("aria-pressed", String(idx === i));
  if (i < 0) {
    wantTarget.copy(OVERVIEW.target); wantZoom = OVERVIEW.zoom;
    note.textContent = "Cargo bay faces front-left, fabricator bay front-right. The colonist is about the avatar's size.";
  } else {
    const c = stations[i]!.center;
    const lift = stations[i]!.height * 0.18;
    wantTarget.set(c.x - 0.3 - lift, 0, c.z + 0.2 - lift); wantZoom = 3.6 + stations[i]!.height * 0.15;
    const d = SHIPS[i]!;
    note.innerHTML = `<b>${d.key} · ${d.name}.</b> ${d.text}`;
  }
}
for (const [id, idx] of Object.entries(buttons)) document.getElementById(id)!.addEventListener("click", () => setFocus(idx));
document.getElementById("land")!.addEventListener("click", land);
renderer.domElement.addEventListener("click", e => {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
  let best = -1, bd = 3.5;
  stations.forEach((s, i) => { const d = Math.hypot(p.x - s.center.x, p.z - s.center.z); if (d < bd) { bd = d; best = i; } });
  setFocus(best === focus ? -1 : best);
});
setFocus(-1);

addEventListener("resize", () => renderer.setSize(container.clientWidth, container.clientHeight));
renderer.setSize(container.clientWidth, container.clientHeight);

// ------------------------------------------------------------------ snow and loop

const N = 900;
const snowPos = new Float32Array(N * 3), snowSpeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  snowPos[i * 3] = (Math.random() - 0.5) * 36; snowPos[i * 3 + 1] = Math.random() * 12; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
  snowSpeed[i] = 0.5 + Math.random() * 0.7;
}
const sg = new THREE.BufferGeometry();
sg.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
snow.frustumCulled = false;
scene.add(snow);

const clock = new THREE.Clock();
let time = 0, printT = 0;
const tmp = new THREE.Vector3();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  for (const s of stations) s.update(time);

  // Landing: ease down with a cyan thruster glow, then a snow burst and a small shake.
  stations.forEach((s, i) => {
    const th = thrusters[i]!;
    if (s.landT < 0) { s.ship.position.y = 0; th.visible = false; return; }
    s.landT += dt;
    const k = Math.min(1, s.landT / LAND_TIME);
    const e = 1 - (1 - k) ** 3;
    s.ship.position.y = DROP * (1 - e);
    th.visible = k < 1;
    th.position.set(s.center.x, s.ship.position.y + 0.15, s.center.z);
    th.scale.setScalar(1.6 + Math.sin(time * 40) * 0.15);
    if (k >= 1) { s.landT = -1; touchdown(s); }
  });
  for (const p of puffs) { p.life -= dt; p.v.y -= 5 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < 0.03) { p.m.position.y = 0.03; p.v.multiplyScalar(0.8); } p.m.scale.setScalar(Math.max(0.01, p.life / 0.7)); }
  for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i]!.life <= 0) { scene.remove(puffs[i]!.m); puffs.splice(i, 1); }

  // Fabricator pulse, as if a wall piece was printed.
  printT += dt;
  const pulse = Math.max(0, 1 - ((printT % 3) / 0.5));
  M.print.emissiveIntensity = 0.2 + pulse * 1.3;

  // The Twins idle-sweep.
  for (const t of turrets) t.rig.yaw.rotation.y = Math.sin(time * 0.5) * 0.9 + 0.8;

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
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  const fit = a < 1.2 ? wantZoom * (1.35 / Math.max(0.5, a)) : wantZoom;
  zoom += (fit - zoom) * ease;
  Object.assign(camera, { left: -zoom * a, right: zoom * a, top: zoom, bottom: -zoom });
  camera.updateProjectionMatrix();
  shake = Math.max(0, shake - dt);
  const sh = shake > 0 ? 0.06 : 0;
  camera.position.copy(target).add(CAM_OFFSET);
  camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh;
  camera.lookAt(target.x, 0, target.z);
  camera.updateMatrixWorld();
  sun.position.set(target.x + EVENING.sunOffset[0], EVENING.sunOffset[1], target.z + EVENING.sunOffset[2]);
  sun.target.position.set(target.x, 0, target.z);

  const w = container.clientWidth, h = container.clientHeight;
  stations.forEach((s, i) => {
    tmp.copy(s.center); tmp.y = s.ship.position.y + s.height + 0.3;
    tmp.project(camera);
    s.label.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
    s.label.classList.toggle("dim", focus >= 0 && focus !== i);
  });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
