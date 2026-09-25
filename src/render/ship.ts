import * as THREE from "three";
import { roundedBox } from "./models";
import { colonyOrange } from "./palette";

/**
 * The player's ship, the Rocket (3×3 footprint). Picked by Erik from
 * mockups/rocketship. Palette: white hull, colony orange, dark steel, cyan core.
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true, ...o });

export function createShipMaterials() {
  return {
    hull: std("#e4e8f0", { roughness: 0.6 }),
    hullShade: std("#c3c9d6", { roughness: 0.65 }),
    orange: colonyOrange(),
    orangeDark: colonyOrange(),
    steel: std("#3d4457", { roughness: 0.55 }),
    steelDark: std("#2c3142", { roughness: 0.6 }),
    steelLight: std("#8a94ab", { roughness: 0.5 }),
    visor: std("#1d2233", { roughness: 0.25 }),
    power: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.6, roughness: 0.4 }),
    crystal: std("#8ff5e8", { emissive: "#4fdcca", emissiveIntensity: 0.95, roughness: 0.3 }),
    /** Fabricator print plate: pulses when a wall is printed. */
    print: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.2, roughness: 0.4 }),
    /** Warm light inside the cargo bay, lit while the door is open. */
    bayLight: std("#ffd79a", { emissive: "#ffa94d", emissiveIntensity: 0, roughness: 0.6 }),
  };
}
export type ShipMaterials = ReturnType<typeof createShipMaterials>;

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

/**
 * Built with its front facing local +z; the whole group is turned 45° so the
 * front faces the camera. Three fins: one in the middle of the front, two
 * behind. The cargo bay sits front-left of the front fin, the fabricator with
 * its console front-right, both at walking height.
 */
export function buildRocket(M: ShipMaterials) {
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

  // Nose: a steel cap on the core cage, the orange stripe, then straight into the cone.
  g.add(cyl(R + 0.03, R + 0.03, 0.08, M.steel, 2.46));
  g.add(cyl(R + 0.02, R + 0.02, 0.1, M.orange, 2.54));
  g.add(mesh(new THREE.ConeGeometry(R, 1.05, 20), M.hull, 0, 2.64 + 0.525, 0));
  g.add(mesh(new THREE.ConeGeometry(0.2, 0.3, 20), M.orange, 0, 3.6, 0));

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

/** What the view needs to animate the ship. */
export type ShipRig = ReturnType<typeof buildRocket> & { materials: ShipMaterials };

/**
 * The ship as a model: centered on its 3×3 footprint, front turned toward the
 * camera. `userData.rig` exposes the door and core for animation.
 */
export function shipModel(): THREE.Object3D {
  const materials = createShipMaterials();
  const rocket = buildRocket(materials);
  const root = new THREE.Group();
  rocket.group.rotation.y = Math.PI / 4;
  root.add(rocket.group);
  root.userData.rig = { ...rocket, materials } satisfies ShipRig;
  // The core flashes when an enemy reaches the ship.
  let flash = 0;
  root.userData.flash = () => { flash = 0.45; };
  root.userData.update = (t: number, dt = 0) => {
    rocket.update(t);
    flash = Math.max(0, flash - dt);
    materials.crystal.emissiveIntensity = 0.95 * (1 + (flash > 0 ? 1.4 : 0));
  };
  return root;
}
