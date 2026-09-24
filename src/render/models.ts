import * as THREE from "three";

/**
 * Every visible thing is created by name through the ModelLibrary. Today the
 * factories build placeholder low-poly shapes in code; later a factory can
 * return a loaded model instead, without the rest of the game changing.
 *
 * Objects may set `userData.update = (t: number) => void` for idle animation.
 */
export interface ModelParams {
  /** Visual variant (e.g. alternating wall tones). */
  variant?: number;
  /** Size multiplier or height, depending on the model. */
  scale?: number;
  /** Deterministic seed for small random variation. */
  seed?: number;
}
export type ModelFactory = (p: ModelParams) => THREE.Object3D;

export class ModelLibrary {
  private factories = new Map<string, ModelFactory>();
  register(name: string, f: ModelFactory): void { this.factories.set(name, f); }
  create(name: string, p: ModelParams = {}): THREE.Object3D {
    const f = this.factories.get(name);
    if (!f) throw new Error(`Unknown model "${name}"`);
    return f(p);
  }
}

export const hash = (x: number, y: number, s = 0): number => {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Evening palette for the first world. */
export const EVENING = {
  background: "#6c6b98",
  sky: "#b3acd9",
  ground: "#4a4769",
  hemi: 0.6,
  sun: "#ff9a62",
  sunIntensity: 0.9,
  /** Sun position relative to the camera target. Low and from the west: long shadows. */
  sunOffset: [-15, 4.2, 4] as const,
  snow: "#f1f4fa",
  wallA: "#d9573a",
  wallB: "#cc4f34",
  rock: "#5d6379",
  pine: "#2f5d5a",
  pine2: "#2a5451",
  trunk: "#6b4b3a",
  steel: "#4f586b",
  steelLight: "#798399",
  lamp: "#ffb45a",
  crystal: "#4fdcca",
  alien: "#8e5cff",
  path: "#ff7a2f",
} as const;

export const WALL_HEIGHT = 0.55;

export function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const s = new THREE.Shape(), x = -w / 2 + r, y = -d / 2 + r, W = w - 2 * r, D = d - 2 * r;
  s.moveTo(x, y - r); s.lineTo(x + W, y - r); s.quadraticCurveTo(x + W + r, y - r, x + W + r, y);
  s.lineTo(x + W + r, y + D); s.quadraticCurveTo(x + W + r, y + D + r, x + W, y + D + r);
  s.lineTo(x, y + D + r); s.quadraticCurveTo(x - r, y + D + r, x - r, y + D);
  s.lineTo(x - r, y); s.quadraticCurveTo(x - r, y - r, x, y - r);
  const bev = Math.min(r * 0.6, h / 3);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, h - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 3 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bev, 0);
  g.computeVertexNormals();
  return g;
}

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });

/** Shared materials. Some are animated by the view (emissive pulses). */
export function createMaterials() {
  const P = EVENING;
  return {
    snow: std(P.snow, { roughness: 1 }),
    wallA: std(P.wallA),
    wallB: std(P.wallB),
    /** Walls of pieces that can still be picked up: a soft pulse marks them. */
    wallLooseA: std(P.wallA, { emissive: "#ff8a4a", emissiveIntensity: 0.15 }),
    wallLooseB: std(P.wallB, { emissive: "#ff8a4a", emissiveIntensity: 0.15 }),
    wallHover: std("#e8704f", { emissive: "#ffb07a", emissiveIntensity: 0.45 }),
    rock: std(P.rock),
    pine: std(P.pine),
    pine2: std(P.pine2),
    trunk: std(P.trunk),
    steel: std(P.steel, { roughness: 0.6 }),
    steelLight: std(P.steelLight, { roughness: 0.6 }),
    lamp: std("#ffcf85", { emissive: P.lamp, emissiveIntensity: 0.9 }),
    window: std("#ffd79a", { emissive: "#ffa94d", emissiveIntensity: 1.0 }),
    crystal: std("#8ff5e8", { emissive: P.crystal, emissiveIntensity: 0.9, roughness: 0.3 }),
    rift: std("#2a2140", { roughness: 1 }),
    riftRing: std(P.alien, { emissive: P.alien, emissiveIntensity: 0.6, transparent: true }),
    ghostOk: std("#2fbfae", { transparent: true, opacity: 0.5, depthWrite: false, emissive: "#2fbfae", emissiveIntensity: 0.35 }),
    ghostBad: std("#e0445e", { transparent: true, opacity: 0.5, depthWrite: false, emissive: "#e0445e", emissiveIntensity: 0.35 }),
    footOk: new THREE.MeshBasicMaterial({ color: "#2fbfae", transparent: true, opacity: 0.35, depthWrite: false }),
    footBad: new THREE.MeshBasicMaterial({ color: "#e0445e", transparent: true, opacity: 0.35, depthWrite: false }),
    path: new THREE.MeshBasicMaterial({ color: P.path }),
    pathFaint: new THREE.MeshBasicMaterial({ color: "#e9e4ff", transparent: true, opacity: 0.5 }),
    puff: new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    eye: new THREE.MeshBasicMaterial({ color: "#fff6c8" }),
  };
}
export type Materials = ReturnType<typeof createMaterials>;

/** Additive glow sprites give lights a soft halo without a post-processing pass. */
export function createGlows() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.22, "rgba(255,255,255,.5)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mk = (color: string, opacity: number) =>
    new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  return {
    warm: mk("#ffb45a", 0.55),
    window: mk("#ffa94d", 0.35),
    /** Soft pool of lamplight on the snow. Lies flat on the ground, so walls occlude it cleanly. */
    pool: new THREE.MeshBasicMaterial({ map: tex, color: "#ff9a4a", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    cyan: mk("#4fdcca", 0.7),
    violet: mk("#8e5cff", 0.65),
    alien: mk("#9a6cff", 0.4),
  };
}
export type Glows = ReturnType<typeof createGlows>;
const poolGeo = new THREE.PlaneGeometry(1, 1);

export const glowSprite = (m: THREE.SpriteMaterial, s: number): THREE.Sprite => {
  const sp = new THREE.Sprite(m);
  sp.scale.set(s, s, 1);
  return sp;
};

const shadowed = <T extends THREE.Mesh>(m: T, cast = true, receive = true): T => {
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
};

export function createDefaultModels(mat: Materials, glow: Glows): ModelLibrary {
  const lib = new ModelLibrary();
  const geo = {
    wall: roundedBox(0.96, WALL_HEIGHT, 0.96, 0.1),
    cap: roundedBox(0.78, 0.07, 0.78, 0.06),
    lamp: new THREE.BoxGeometry(0.1, 0.1, 0.06),
    window: new THREE.BoxGeometry(0.22, 0.14, 0.03),
    rock: new THREE.DodecahedronGeometry(0.45, 0),
    rockCap: new THREE.DodecahedronGeometry(0.3, 0),
    trunk: new THREE.CylinderGeometry(0.07, 0.09, 0.3, 6),
    cone1: new THREE.ConeGeometry(0.42, 0.55, 7),
    cone2: new THREE.ConeGeometry(0.33, 0.46, 7),
    cone3: new THREE.ConeGeometry(0.22, 0.4, 7),
    coneSnow: new THREE.ConeGeometry(0.11, 0.16, 7),
    body: new THREE.SphereGeometry(0.21, 14, 10),
    eye: new THREE.SphereGeometry(0.045, 8, 6),
  };

  /** One wall cell. Children named "body" so the view can swap its material. */
  lib.register("wall", ({ variant = 0 }) => {
    const g = new THREE.Group();
    const body = shadowed(new THREE.Mesh(geo.wall, variant ? mat.wallB : mat.wallA));
    body.name = "body";
    const cap = shadowed(new THREE.Mesh(geo.cap, mat.snow), false, true);
    cap.position.y = WALL_HEIGHT;
    g.add(body, cap);
    return g;
  });
  lib.register("ghostWall", () => new THREE.Mesh(geo.wall, mat.ghostOk));

  /** Warm lamp mounted on a wall face (faces +z). */
  lib.register("lamp", () => {
    const g = new THREE.Group();
    const l = new THREE.Mesh(geo.lamp, mat.lamp);
    l.position.set(0, 0.36, 0.49);
    // Small halo held off the wall face so it never slices through the block.
    const s = glowSprite(glow.warm, 0.42);
    s.position.set(0, 0.36, 0.78);
    const pool = new THREE.Mesh(poolGeo, glow.pool);
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(2.2, 1.7, 1);
    pool.position.set(0, 0.012, 1.15);
    g.add(l, s, pool);
    return g;
  });
  /** Lit window on a wall face (faces +z). */
  lib.register("window", () => {
    const g = new THREE.Group();
    const w = new THREE.Mesh(geo.window, mat.window);
    w.position.set(0, 0.3, 0.485);
    const s = glowSprite(glow.window, 0.28);
    s.position.set(0, 0.3, 0.72);
    g.add(w, s);
    return g;
  });

  lib.register("rock", ({ scale = 13, seed = 0 }) => {
    const g = new THREE.Group(), k = scale / 13;
    const r = shadowed(new THREE.Mesh(geo.rock, mat.rock));
    r.scale.set(1.05, k * 1.1, 1.05); r.position.y = 0.3 * k; r.rotation.y = hash(seed, 1) * 6;
    const c = shadowed(new THREE.Mesh(geo.rockCap, mat.snow));
    c.scale.set(1.1, 0.35, 1.1); c.position.y = 0.7 * k; c.rotation.y = hash(seed, 2) * 6;
    const r2 = shadowed(new THREE.Mesh(geo.rock, mat.rock));
    r2.scale.setScalar(0.4); r2.position.set(0.3, 0.12, 0.3);
    g.add(r, c, r2);
    return g;
  });

  lib.register("tree", ({ scale = 1, seed = 0 }) => {
    const g = new THREE.Group();
    const parts: [THREE.BufferGeometry, THREE.Material, number][] = [
      [geo.trunk, mat.trunk, 0.15], [geo.cone1, mat.pine, 0.52], [geo.cone2, mat.pine2, 0.82],
      [geo.cone3, mat.pine, 1.08], [geo.coneSnow, mat.snow, 1.24],
    ];
    for (const [gg, m, y] of parts) { const mesh = shadowed(new THREE.Mesh(gg, m)); mesh.position.y = y; g.add(mesh); }
    g.scale.setScalar(scale);
    g.rotation.y = hash(seed, 9) * 6;
    return g;
  });

  lib.register("snowMound", ({ scale = 0.4 }) => {
    const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(scale, 8, 5), mat.snow), false, true);
    m.scale.y = 0.18;
    return m;
  });

  /** The nexus: hex platform with a floating crystal. Centered on its 2x2 footprint. */
  lib.register("nexus", () => {
    const g = new THREE.Group();
    const b1 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.26, 6), mat.steel)); b1.position.y = 0.13;
    const b2 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.7, 0.2, 6), mat.steelLight)); b2.position.y = 0.36;
    const crystal = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), mat.crystal), true, false);
    crystal.scale.y = 1.5;
    const halo = glowSprite(glow.cyan, 2.3);
    const ringMat = new THREE.MeshBasicMaterial({ color: "#2fbfae", transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.025, 6, 40), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.03;
    const light = new THREE.PointLight("#7ff5e6", 6, 5, 2); light.position.y = 1.2;
    g.add(b1, b2, crystal, halo, ring, light);
    let flash = 0;
    g.userData.flash = () => { flash = 0.45; };
    g.userData.update = (t: number, dt: number) => {
      flash = Math.max(0, flash - dt);
      crystal.position.y = 1.15 + Math.sin(t * 2.2) * 0.08;
      crystal.rotation.y = t * 0.8;
      halo.position.y = crystal.position.y;
      const hot = flash > 0 ? 1 : 0;
      mat.crystal.emissiveIntensity = 0.9 * (1 + hot * 1.2);
      light.intensity = 6 * (1 + hot * 0.8);
      halo.scale.setScalar(2.3 * (1 + hot * 0.4));
      const r = (t * 0.8) % 1;
      ring.scale.setScalar(0.8 + r * 0.6);
      ringMat.opacity = 0.6 * (1 - r);
    };
    return g;
  });

  lib.register("rift", () => {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), mat.rift);
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.01;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 32), mat.riftRing);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.01;
    const halo = glowSprite(glow.violet, 1.9); halo.position.y = 0.15;
    const light = new THREE.PointLight(EVENING.alien, 3, 3.5, 2); light.position.y = 0.6;
    g.add(hole, ring, halo, light);
    g.userData.update = (t: number) => {
      const p = (t * 1.4) % 1;
      ring.scale.setScalar(0.7 + p * 0.7);
      mat.riftRing.opacity = 1 - p;
      light.intensity = 3 * (0.75 + 0.25 * Math.sin(t * 4));
    };
    return g;
  });

  /** Alien walker. Faces +z. `userData.body` exposes its material for hit flashes. */
  lib.register("walker", () => {
    const g = new THREE.Group();
    const m = std(EVENING.alien, { flatShading: false, roughness: 0.6, emissive: "#7a4ce6", emissiveIntensity: 0.3 });
    const body = shadowed(new THREE.Mesh(geo.body, m), true, false);
    body.scale.set(1, 0.85, 1);
    const e1 = new THREE.Mesh(geo.eye, mat.eye), e2 = new THREE.Mesh(geo.eye, mat.eye);
    e1.position.set(-0.08, 0.05, 0.17); e2.position.set(0.08, 0.05, 0.17);
    g.add(body, e1, e2, glowSprite(glow.alien, 0.95));
    g.userData.material = m;
    return g;
  });

  return lib;
}
