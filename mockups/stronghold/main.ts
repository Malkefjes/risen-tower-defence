import * as THREE from "three";
import { createDefaultModels, createGlows, createMaterials, EVENING, roundedBox, type TurretRig } from "../../src/render/models";
import "./style.css";

// Stronghold look mockup: three wall styles and three nexus styles on one small
// base, lit and framed exactly like the game. Walls are built per piece so cells
// of the same piece merge and different pieces keep a visible seam.
THREE.ColorManagement.enabled = false;

type Cell = [number, number];
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
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.5, far: 60 });
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat.snow);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ------------------------------------------------------------------ materials

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, flatShading: true, ...o });
const M = {
  orange: std(EVENING.wallA),
  orange2: std(EVENING.wallB),
  steel: std("#3d4457", { roughness: 0.55 }),
  steelDark: std("#2c3142", { roughness: 0.6 }),
  steelLight: std("#8a94ab", { roughness: 0.5 }),
  deck: std("#4a5266", { roughness: 0.6 }),
  concrete: std("#c3c6d2", { roughness: 0.95 }),
  concreteDark: std("#8f93a4", { roughness: 0.95 }),
  hazard: std("#e8a13a", { roughness: 0.7 }),
  power: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.55, roughness: 0.4 }),
  crystal: std("#8ff5e8", { emissive: "#4fdcca", emissiveIntensity: 0.95, roughness: 0.3 }),
  shield: new THREE.MeshStandardMaterial({ color: "#7ff5e6", emissive: "#4fdcca", emissiveIntensity: 0.35, transparent: true, opacity: 0.22, roughness: 0.2, flatShading: true, depthWrite: false, side: THREE.DoubleSide }),
  shieldLines: new THREE.LineBasicMaterial({ color: "#aefcf2", transparent: true, opacity: 0.45 }),
};

const shadowAll = <T extends THREE.Object3D>(o: T): T => {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).material !== M.shield) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
};
/** Axis-aligned box from world-space bounds. */
function slab(m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.Mesh {
  const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return b;
}

// ------------------------------------------------------------------ piece geometry helpers

const key = (x: number, y: number) => `${x},${y}`;
const SIDES = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] } as const;
type Side = keyof typeof SIDES;

/** Per cell: which sides face outside the piece. Cells of one piece merge; other pieces keep a seam. */
function outline(cells: Cell[]): { x: number; y: number; open: Record<Side, boolean> }[] {
  const own = new Set(cells.map(([x, y]) => key(x, y)));
  return cells.map(([x, y]) => ({
    x, y,
    open: {
      n: !own.has(key(x, y - 1)), s: !own.has(key(x, y + 1)),
      w: !own.has(key(x - 1, y)), e: !own.has(key(x + 1, y)),
    },
  }));
}

/** A cell's box, inset only on the sides that face outside the piece. */
function cellBox(m: THREE.Material, c: { x: number; y: number; open: Record<Side, boolean> }, inset: number, y0: number, y1: number): THREE.Mesh {
  const o = c.open;
  return slab(m, c.x + (o.w ? inset : 0), c.x + 1 - (o.e ? inset : 0), y0, y1, c.y + (o.n ? inset : 0), c.y + 1 - (o.s ? inset : 0));
}

/** A strip hugging one outer face of a cell (trim, bands, light lines). */
function faceStrip(m: THREE.Material, c: { x: number; y: number; open: Record<Side, boolean> }, side: Side, inset: number, depth: number, y0: number, y1: number): THREE.Mesh {
  const o = c.open;
  const x0 = c.x + (o.w ? inset : 0), x1 = c.x + 1 - (o.e ? inset : 0);
  const z0 = c.y + (o.n ? inset : 0), z1 = c.y + 1 - (o.s ? inset : 0);
  const d = depth / 2;
  switch (side) {
    case "n": return slab(m, x0, x1, y0, y1, z0 - d, z0 + d);
    case "s": return slab(m, x0, x1, y0, y1, z1 - d, z1 + d);
    case "w": return slab(m, x0 - d, x0 + d, y0, y1, z0, z1);
    case "e": return slab(m, x1 - d, x1 + d, y0, y1, z0, z1);
  }
}

/** Convex corners of a cell: both adjoining sides face outside. Returns corner points, inset. */
function convexCorners(c: { x: number; y: number; open: Record<Side, boolean> }, inset: number): [number, number][] {
  const o = c.open, out: [number, number][] = [];
  if (o.n && o.w) out.push([c.x + inset, c.y + inset]);
  if (o.n && o.e) out.push([c.x + 1 - inset, c.y + inset]);
  if (o.s && o.w) out.push([c.x + inset, c.y + 1 - inset]);
  if (o.s && o.e) out.push([c.x + 1 - inset, c.y + 1 - inset]);
  return out;
}

// ------------------------------------------------------------------ wall styles

interface WallStyle { key: string; name: string; text: string; top: number; build(cells: Cell[], variant: number): THREE.Object3D }

const WALLS: WallStyle[] = [
  {
    key: "A", name: "Armored deck", top: 0.58,
    text: "Orange armor on a dark steel plinth, topped with a steel gun deck. Cells of one piece fuse into a single hull, with a thin cyan power line along the outside. Heated decks stay clear of snow, so towers stand out.",
    build(cells, variant) {
      const g = new THREE.Group();
      for (const c of outline(cells)) {
        g.add(cellBox(M.steelDark, c, 0.03, 0, 0.12));
        g.add(cellBox(variant ? M.orange2 : M.orange, c, 0.07, 0.1, 0.5));
        g.add(cellBox(M.deck, c, 0.05, 0.5, 0.58));
        g.add(slab(M.steelDark, c.x + 0.22, c.x + 0.78, 0.58, 0.59, c.y + 0.22, c.y + 0.78));
        for (const side of ["n", "s", "w", "e"] as Side[]) {
          if (!c.open[side]) continue;
          g.add(faceStrip(M.power, c, side, 0.07, 0.02, 0.4, 0.43));
          g.add(faceStrip(M.steel, c, side, 0.07, 0.03, 0.12, 0.17));
        }
      }
      return shadowAll(g);
    },
  },
  {
    key: "B", name: "Bunker", top: 0.54,
    text: "Poured concrete in two stepped tiers, like a polar bunker. A hazard band marks the base and a parapet rings the snowy roof. The heaviest, most fortress-like read, with orange kept as an accent.",
    build(cells) {
      const g = new THREE.Group();
      for (const c of outline(cells)) {
        g.add(cellBox(M.concreteDark, c, 0.02, 0, 0.2));
        g.add(cellBox(M.concrete, c, 0.1, 0.2, 0.5));
        g.add(cellBox(mat.snow, c, 0.12, 0.5, 0.52));
        for (const side of ["n", "s", "w", "e"] as Side[]) {
          if (!c.open[side]) continue;
          g.add(faceStrip(M.hazard, c, side, 0.02, 0.025, 0.14, 0.2));
          g.add(faceStrip(M.concrete, c, side, 0.14, 0.08, 0.5, 0.6));
          g.add(faceStrip(M.orange, c, side, 0.1, 0.02, 0.36, 0.4));
        }
      }
      return shadowAll(g);
    },
  },
  {
    key: "C", name: "Prefab frame", top: 0.6,
    text: "The current orange modules, grown up: fused per piece, held in a steel frame with corner posts and top and bottom rails. Snow on the roof keeps the cozy colony feel. The safest step from what's in the game now.",
    build(cells, variant) {
      const g = new THREE.Group();
      const body = variant ? M.orange2 : M.orange;
      for (const c of outline(cells)) {
        g.add(cellBox(body, c, 0.06, 0, 0.52));
        g.add(cellBox(M.steel, c, 0.04, 0.52, 0.56));
        g.add(cellBox(mat.snow, c, 0.1, 0.56, 0.6));
        for (const side of ["n", "s", "w", "e"] as Side[]) {
          if (!c.open[side]) continue;
          g.add(faceStrip(M.steel, c, side, 0.06, 0.04, 0.0, 0.07));
          g.add(faceStrip(M.steelDark, c, side, 0.06, 0.02, 0.22, 0.3));
        }
        for (const [px, pz] of convexCorners(c, 0.06)) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.12), M.steelLight);
          post.position.set(px, 0.31, pz);
          g.add(post);
        }
      }
      return shadowAll(g);
    },
  },
];

// ------------------------------------------------------------------ nexus styles

interface NexusStyle { key: string; name: string; text: string; build(): THREE.Object3D }

const hexPrism = (r: number, h: number, m: THREE.Material, y: number, r2 = r) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, 6), m);
  o.position.y = y + h / 2;
  return o;
};

const NEXUS: NexusStyle[] = [
  {
    key: "A", name: "Reactor core",
    text: "An armored octagonal plinth with four steel pylons caging the crystal. Two cyan rings orbit it. It reads as the power source the whole base is built around.",
    build() {
      const g = new THREE.Group();
      const oct = (r: number, h: number, m: THREE.Material, y: number, r2 = r) => {
        const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, 8), m);
        o.position.y = y + h / 2; o.rotation.y = Math.PI / 8;
        return o;
      };
      g.add(oct(1.0, 0.2, M.steelDark, 0), oct(0.9, 0.16, M.orange, 0.2, 0.82), oct(0.62, 0.08, M.steel, 0.36));
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const p = new THREE.Mesh(roundedBox(0.16, 1.25, 0.16, 0.04), M.steelLight);
        p.position.set(Math.cos(a) * 0.62, 0.36, Math.sin(a) * 0.62);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.2), M.orange);
        cap.position.set(p.position.x, 1.63, p.position.z);
        g.add(p, cap);
      }
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 32), M.steel);
      crown.rotation.x = Math.PI / 2; crown.position.y = 1.6;
      g.add(crown);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), M.crystal);
      crystal.scale.y = 1.5;
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.02, 6, 36), M.power);
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 6, 36), M.power);
      const light = new THREE.PointLight("#7ff5e6", 5, 5, 2); light.position.y = 1;
      g.add(crystal, r1, r2, light);
      g.userData.update = (t: number) => {
        crystal.position.y = 1.0 + Math.sin(t * 2) * 0.06; crystal.rotation.y = t * 0.9;
        r1.position.y = r2.position.y = crystal.position.y;
        r1.rotation.set(Math.PI / 2 + Math.sin(t) * 0.5, t * 0.8, 0);
        r2.rotation.set(Math.PI / 2 - Math.cos(t * 0.8) * 0.6, -t, 0);
      };
      return shadowAll(g);
    },
  },
  {
    key: "B", name: "Spire",
    text: "A stepped hex citadel rising into a tall spire with the crystal at its peak. The tallest thing on the map, a landmark you can find at any zoom. It may cover walls just behind it.",
    build() {
      const g = new THREE.Group();
      g.add(hexPrism(1.02, 0.18, M.steelDark, 0), hexPrism(0.86, 0.22, M.orange, 0.18, 0.78), hexPrism(0.62, 0.2, M.steel, 0.4, 0.56));
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), M.power);
        w.position.set(Math.cos(a) * 0.8, 0.3, Math.sin(a) * 0.8);
        w.rotation.y = -a + Math.PI / 2;
        g.add(w);
      }
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, 1.5, 6), M.steelLight);
      spire.position.y = 0.6 + 0.75;
      const collar = hexPrism(0.26, 0.1, M.orange, 1.1, 0.22);
      const tip = hexPrism(0.16, 0.08, M.steel, 2.1, 0.12);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), M.crystal);
      crystal.scale.y = 1.6;
      const light = new THREE.PointLight("#7ff5e6", 4, 5, 2); light.position.y = 2.4;
      g.add(spire, collar, tip, crystal, light);
      g.userData.update = (t: number) => {
        crystal.position.y = 2.5 + Math.sin(t * 2) * 0.05; crystal.rotation.y = t * 0.9;
      };
      return shadowAll(g);
    },
  },
  {
    key: "C", name: "Shield dome",
    text: "A low armored ring under a faceted cyan shield, with the crystal inside and four emitters holding the shield up. It says \"protect this\" and stays low, so it never hides the walls around it.",
    build() {
      const g = new THREE.Group();
      g.add(hexPrism(1.02, 0.16, M.steelDark, 0), hexPrism(0.94, 0.12, M.orange, 0.16, 0.9));
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.14, 12), M.steel);
      pad.position.y = 0.35;
      g.add(pad);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.14), M.steelLight);
        e.position.set(Math.cos(a) * 0.82, 0.45, Math.sin(a) * 0.82);
        const tipE = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), M.power);
        tipE.position.set(e.position.x, 0.68, e.position.z);
        g.add(e, tipE);
      }
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), M.crystal);
      crystal.scale.y = 1.4;
      const domeGeo = new THREE.SphereGeometry(0.86, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      const dome = new THREE.Mesh(domeGeo, M.shield);
      dome.position.y = 0.28;
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(domeGeo, 1), M.shieldLines);
      lines.position.y = 0.28;
      const light = new THREE.PointLight("#7ff5e6", 4, 5, 2); light.position.y = 0.8;
      g.add(crystal, dome, lines, light);
      g.userData.update = (t: number) => {
        crystal.position.y = 0.75 + Math.sin(t * 2) * 0.05; crystal.rotation.y = t * 0.9;
        M.shield.opacity = 0.2 + Math.sin(t * 1.6) * 0.05;
        dome.rotation.y = lines.rotation.y = t * 0.1;
      };
      shadowAll(g);
      dome.castShadow = false;
      return g;
    },
  },
];

// ------------------------------------------------------------------ base layout

/** A small fortress around the nexus: pieces of each shape, with turrets on some. */
const PIECES: Cell[][] = [
  [[-3, -2], [-2, -2], [-1, -2], [-3, -1]],   // L
  [[1, -3], [2, -3], [3, -3], [4, -3]],        // I
  [[4, 0], [5, 0], [4, 1], [5, 1]],            // O (gatling)
  [[6, -1], [6, 0], [6, 1], [6, 2]],           // I beside the O: shows the seam between pieces
  [[0, 4], [1, 4], [2, 4], [1, 5]],            // T
  [[-2, 1], [-1, 1], [-3, 2], [-2, 2]],        // S
  [[4, 3], [4, 4], [4, 5], [3, 5]],            // J
];
const TURRETS: { kind: "twin" | "gatling"; x: number; y: number }[] = [
  { kind: "twin", x: -1.5, y: -1.5 }, { kind: "twin", x: 2.5, y: -2.5 }, { kind: "gatling", x: 5, y: 1 },
  { kind: "twin", x: 1.5, y: 4.5 }, { kind: "twin", x: -1.5, y: 1.5 }, { kind: "twin", x: 4.5, y: 4.5 },
];
const NEXUS_AT = new THREE.Vector3(1, 0, 1);

let wallGroup = new THREE.Group();
let nexusObj: THREE.Object3D = new THREE.Group();
const turrets: { obj: THREE.Object3D; rig: TurretRig; x: number; y: number; cd: number; gun: number; recoil: number[]; spin: number; rate: number; range: number }[] = [];

for (const t of TURRETS) {
  const obj = models.create(t.kind);
  obj.position.set(t.x, 0.58, t.y);
  scene.add(obj);
  const rig = obj.userData.rig as TurretRig;
  turrets.push({ obj, rig, x: t.x, y: t.y, cd: Math.random(), gun: 0, recoil: rig.guns.map(() => 0), spin: 0, rate: t.kind === "gatling" ? 8 : 2.5, range: t.kind === "gatling" ? 5 : 4 });
}

let wallIdx = 0, nexusIdx = 0;
function applyWalls(i: number): void {
  wallIdx = i;
  scene.remove(wallGroup);
  wallGroup = new THREE.Group();
  PIECES.forEach((cells, pi) => wallGroup.add(WALLS[i]!.build(cells, pi % 2)));
  scene.add(wallGroup);
  for (const t of turrets) t.obj.position.y = WALLS[i]!.top;
  refresh();
}
function applyNexus(i: number): void {
  nexusIdx = i;
  scene.remove(nexusObj);
  nexusObj = NEXUS[i]!.build();
  nexusObj.position.copy(NEXUS_AT);
  scene.add(nexusObj);
  refresh();
}
const note = document.getElementById("note")!;
function refresh(): void {
  WALLS.forEach((w, i) => document.getElementById(`w${w.key}`)!.setAttribute("aria-pressed", String(i === wallIdx)));
  NEXUS.forEach((n, i) => document.getElementById(`n${n.key}`)!.setAttribute("aria-pressed", String(i === nexusIdx)));
  const w = WALLS[wallIdx]!, n = NEXUS[nexusIdx]!;
  note.innerHTML = `<span><b>Walls ${w.key} · ${w.name}.</b> ${w.text}</span><span><b>Nexus ${n.key} · ${n.name}.</b> ${n.text}</span>`;
}
WALLS.forEach((w, i) => document.getElementById(`w${w.key}`)!.addEventListener("click", () => applyWalls(i)));
NEXUS.forEach((n, i) => document.getElementById(`n${n.key}`)!.addEventListener("click", () => applyNexus(i)));

// Scenery.
const deco: [string, number, number, number][] = [
  ["tree", -8, -6, 1.1], ["tree", -9, 0, 0.9], ["tree", 9, -7, 1.0], ["tree", 11, 2, 1.15], ["tree", -3, 10, 0.95],
  ["tree", 7, 10, 1.05], ["tree", -10, 6, 1.0], ["tree", 3, -10, 0.9], ["rock", -6, 7, 13], ["rock", 10, -3, 11],
  ["rock", -7, -9, 12], ["rock", 9, 7, 14], ["tree", 12, 8, 1.0], ["tree", -2, -10, 1.1],
];
for (const [name, x, z, s] of deco) {
  const m = models.create(name, name === "tree" ? { scale: s, seed: x * 7 + z } : { scale: s, seed: x * 5 + z });
  m.position.set(x + 0.5, 0, z + 0.5);
  scene.add(m);
}
const rift = models.create("rift");
rift.position.set(-7.5, 0, -4.5);
scene.add(rift);

// ------------------------------------------------------------------ aliens and combat

/** Aliens circle the base so every side's turrets get to fire. */
interface Alien { obj: THREE.Object3D; mat: THREE.MeshStandardMaterial; a: number; flash: number }
const aliens: Alien[] = [];
for (let i = 0; i < 6; i++) {
  const obj = models.create("walker");
  scene.add(obj);
  aliens.push({ obj, mat: obj.userData.material as THREE.MeshStandardMaterial, a: (i / 6) * Math.PI * 2, flash: 0 });
}
const RX = 7.2, RZ = 6.6;

const boltGeo = new THREE.SphereGeometry(0.045, 8, 6);
const boltMat = new THREE.MeshBasicMaterial({ color: "#ffd08a" });
const bolts: { mesh: THREE.Mesh; from: THREE.Vector3; target: Alien; t: number; dur: number }[] = [];
const flashes: { s: THREE.Sprite; life: number; size: number }[] = [];
const tmp = new THREE.Vector3();

function step(dt: number, t: number): void {
  for (const a of aliens) {
    a.a += dt * 0.16;
    const x = NEXUS_AT.x + Math.cos(a.a) * RX, z = NEXUS_AT.z + Math.sin(a.a) * RZ;
    a.obj.rotation.y = Math.atan2(-Math.sin(a.a) * RX, Math.cos(a.a) * RZ);
    a.obj.position.set(x, 0.2 + Math.abs(Math.sin(t * 6 + a.a * 9)) * 0.05, z);
    a.flash = Math.max(0, a.flash - dt);
    a.mat.emissive.set(a.flash > 0 ? "#ffffff" : "#7a4ce6");
    a.mat.emissiveIntensity = a.flash > 0 ? 0.9 : 0.3;
  }
  for (const tu of turrets) {
    let best: Alien | null = null, bd = Infinity;
    for (const a of aliens) {
      const d = Math.hypot(a.obj.position.x - tu.x, a.obj.position.z - tu.y);
      if (d < tu.range && d < bd) { bd = d; best = a; }
    }
    tu.cd -= dt;
    if (best) {
      const want = Math.atan2(best.obj.position.x - tu.x, best.obj.position.z - tu.y);
      let d = want - tu.rig.yaw.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      tu.rig.yaw.rotation.y += d * Math.min(1, dt * 10);
      if (tu.cd <= 0 && Math.abs(d) < 0.3) {
        tu.cd = 1 / tu.rate;
        const i = tu.gun++ % tu.rig.guns.length, g = tu.rig.guns[i]!;
        tu.recoil[i] = 1; tu.spin = 1;
        tu.obj.updateMatrixWorld(true);
        const from = tu.rig.yaw.localToWorld(g.muzzle.clone());
        const s = new THREE.Sprite(glows.muzzle); s.position.copy(from); s.scale.setScalar(0.35); scene.add(s);
        flashes.push({ s, life: 0.07, size: 0.35 });
        const m = new THREE.Mesh(boltGeo, boltMat); m.position.copy(from); scene.add(m);
        bolts.push({ mesh: m, from, target: best, t: 0, dur: from.distanceTo(best.obj.position) / 14 });
      }
    }
    tu.rig.guns.forEach((g, i) => { tu.recoil[i] = Math.max(0, tu.recoil[i]! - dt * 7); g.obj.position.z = g.rest - tu.rig.kick * tu.recoil[i]! ** 2; });
    tu.spin = Math.max(0, tu.spin - dt * 1.5);
    if (tu.rig.spinner) tu.rig.spinner.rotation.z += dt * 28 * tu.spin;
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]!;
    b.t += dt;
    tmp.copy(b.target.obj.position).setY(0.25);
    b.mesh.position.lerpVectors(b.from, tmp, Math.min(1, b.t / b.dur));
    if (b.t >= b.dur) { scene.remove(b.mesh); bolts.splice(i, 1); b.target.flash = 0.09; }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]!;
    f.life -= dt;
    f.s.scale.setScalar(f.size * Math.max(0.01, f.life / 0.07));
    if (f.life <= 0) { scene.remove(f.s); flashes.splice(i, 1); }
  }
  (rift.userData.update as ((t: number) => void) | undefined)?.(t);
  (nexusObj.userData.update as ((t: number) => void) | undefined)?.(t);
}

// ------------------------------------------------------------------ snow, camera, loop

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

const target = new THREE.Vector3(2.3, 0, 2.1);
function resize(): void { renderer.setSize(container.clientWidth, container.clientHeight); }
addEventListener("resize", resize);
resize();

// Scroll to zoom in on details.
let zoom = 6.6;
renderer.domElement.addEventListener("wheel", e => { e.preventDefault(); zoom = Math.min(9, Math.max(2.6, zoom * Math.exp(e.deltaY * 0.0012))); }, { passive: false });

applyWalls(0);
applyNexus(0);

const clock = new THREE.Clock();
let time = 0;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function frame(): void {
  const dt = Math.min(0.05, clock.getDelta());
  time += dt;
  step(dt, time);
  if (!reduce) {
    for (let i = 0; i < N; i++) {
      snowPos[i * 3 + 1]! -= snowSpeed[i]! * dt;
      snowPos[i * 3]! += Math.sin(time * 0.7 + i) * dt * 0.15;
      if (snowPos[i * 3 + 1]! < 0) snowPos[i * 3 + 1] = 12;
    }
    sg.attributes.position!.needsUpdate = true;
  }
  const a = container.clientWidth / Math.max(1, container.clientHeight);
  const z = a < 1.2 ? zoom * (1.3 / Math.max(0.5, a)) : zoom;
  Object.assign(camera, { left: -z * a, right: z * a, top: z, bottom: -z });
  camera.updateProjectionMatrix();
  camera.position.copy(target).add(CAM_OFFSET);
  camera.lookAt(target.x, 0, target.z);
  sun.position.set(target.x + EVENING.sunOffset[0], EVENING.sunOffset[1], target.z + EVENING.sunOffset[2]);
  sun.target.position.set(target.x, 0, target.z);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
