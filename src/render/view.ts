import * as THREE from "three";
import { SHIP_SHOOTER, type Game, type GameEvent, type PlacedPiece, type Shot } from "../sim/game";
import type { GeneratedWorld } from "../sim/worldgen";
import { caveLook, type Cave } from "./caveLooks";
import { enemyLook, type Enemy } from "./enemyLooks";
import { MiningView } from "./mining";
import { refineryLook, type Refinery } from "./refineryLooks";
import { buildScenery } from "./scenery";
import { stoneWallMaterials, stoneWallPiece } from "./stoneWall";
import { createRig, RigAnimator, type Rig } from "./rig";
import type { ShipRig } from "./ship";
import type { Tower, TowerKind } from "../sim/towers";
import type { Cell } from "../sim/types";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, type Glows, type Materials, type ModelLibrary, type TurretRig } from "./models";

// Author colors as plain hex and light the way the mockups did.
THREE.ColorManagement.enabled = false;

/** What the input layer wants drawn on top of the game state this frame. */
export interface Overlay {
  ghost: { cells: Cell[]; valid: boolean } | null;
  /** Route to show as the main (orange) path. */
  route: Cell[][];
  /** Current route shown faintly while a preview differs from it. */
  faintRoute: Cell[][] | null;
  hoverCell: Cell | null;
  hoverPieceId: number | null;
  showPath: boolean;
  showGrid: boolean;
  /** Tower being placed: footprint, validity and reach. */
  towerGhost: { kind: TowerKind; cells: Cell[]; valid: boolean; cx: number; cy: number; range: number } | null;
  /** Smelter being placed: footprint and whether it fits. */
  smelterGhost: { cells: Cell[]; valid: boolean; cx: number; cy: number } | null;
  /** Reach of the selected tower. */
  selectedTower: { cx: number; cy: number; range: number } | null;
  /** The avatar has its tool raised (holding a wall or tower to place). */
  toolReady: boolean;
}

/** Height of the wall deck, where towers stand. */
const TOP = DECK_TOP;

/** Wrap v into [center - half, center + half). */
const wrap = (v: number, center: number, half: number) => ((((v - center + half) % (2 * half)) + 2 * half) % (2 * half)) + center - half;

interface TowerView { obj: THREE.Object3D; rig: TurretRig; recoil: number[]; gun: number; spin: number; drop: number }
interface Bolt { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; walkerId: number; t: number; dur: number }
interface Flash { sprite: THREE.Sprite; life: number; max: number; size: number }

/** Smelters turn their window to face the camera. */
const SMELTER_TURN = Math.PI / 4;
const CAM_OFFSET = new THREE.Vector3(20, 16.33, 20); // ~30° elevation, 45° around: classic iso
/** How tightly the camera follows the avatar (Erik's playground tuning). */
const FOLLOW = 4;
/** Ship landing: descent, then a pause, then the cargo door opens. */
const LAND_DROP = 10, LAND_DESCENT = 2.6, LAND_HOLD = 0.5, LAND_OPEN = 1.0;
// Light space, for snapping the shadow camera to its texels (steady shadows while the camera moves).
const LIGHT_DIR = new THREE.Vector3(-EVENING.sunOffset[0], -EVENING.sunOffset[1], -EVENING.sunOffset[2]).normalize();
const LIGHT_DIST = Math.hypot(...EVENING.sunOffset);
const LIGHT_RIGHT = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LIGHT_DIR).normalize();
const LIGHT_UP = new THREE.Vector3().crossVectors(LIGHT_DIR, LIGHT_RIGHT).normalize();
const ZOOM_MIN = 3.2, ZOOM_MAX = 14;
/**
 * Snow: flakes per square cell that look right at the default zoom (1400 over
 * ±18 cells), and a snow field wide enough for the most zoomed-out view.
 */
const SNOW_ZOOM = 6.2, SNOW_DENSITY = 1400 / (36 * 36), SNOW_FIELD = Math.ceil(18 * ZOOM_MAX / SNOW_ZOOM);
/** Height of the ship's core crystal above the ground, where its gun fires from. */
const SHIP_CORE_Y = 1.95;
/** How far the torso may twist from the legs toward where the tool aims (radians). */
const TWIST_MAX = 1.9;
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface PieceView { group: THREE.Object3D; drop: number; bodies: THREE.Mesh[]; cells: readonly Cell[] }

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  readonly target = new THREE.Vector3();
  zoom = 6.2;
  /** The camera follows the avatar until the player pans away. */
  following = true;
  /** Where the camera is gliding to (the ship, after H), if anywhere. */
  private camGoal: THREE.Vector3 | null = null;
  private rig: Rig;
  private rigAnim: RigAnimator;
  /** Ore nodes, hotspot glint and mining sparks. */
  readonly mining: MiningView;
  /** The cursor, in normalized device coordinates (set by the input layer). */
  private pointer = new THREE.Vector2(-9, -9);
  private twist = 0;
  private tip = new THREE.Vector3();
  private shipLand = 0;

  private mat: Materials;
  private models: ModelLibrary;
  private sun: THREE.DirectionalLight;
  private pieces = new Map<number, PieceView>();
  private wallSig = "";
  private walkers = new Map<number, THREE.Object3D>();
  private towers = new Map<number, TowerView>();
  private bolts: Bolt[] = [];
  private flashes: Flash[] = [];
  private bars = new Map<number, THREE.Group>();
  private glows: Glows;
  private boltGeo = new THREE.SphereGeometry(0.045, 8, 6);
  private boltMat = new THREE.MeshBasicMaterial({ color: "#ffd08a" });
  /** The ship's gun fires cyan bolts from its reactor core. */
  private shipBoltMat = new THREE.MeshBasicMaterial({ color: "#7ff5e6" });
  private barGeo = new THREE.PlaneGeometry(0.5, 0.07);
  private barFillGeo = new THREE.PlaneGeometry(0.5, 0.07).translate(0.25, 0, 0);
  private barBgMat = new THREE.MeshBasicMaterial({ color: "#241f3d" });
  private barFillMat = new THREE.MeshBasicMaterial({ color: "#e0262b" });
  private towerGhosts: Record<TowerKind, THREE.Object3D>;
  private smelterGhost: THREE.Object3D;
  private smelters = new Map<number, Refinery>();
  /** Caves by their mouth cell, for stirring when a raid is near. */
  /** 0..1 how far the ship has slumped into a wreck. */
  private wreck = 0;
  private wreckPuff = 0;
  private lastShipHp = Infinity;
  private shipHitCd = 0;
  private debrisMat = new THREE.MeshStandardMaterial({ color: "#4a5266", roughness: 0.8, flatShading: true });
  private stoneDebrisMat = new THREE.MeshStandardMaterial({ color: "#8d8a99", roughness: 0.9, flatShading: true });
  /** HP bars over damaged buildings: the ship (key -1) and smelters (their ids). */
  private buildingBars = new Map<number, THREE.Group>();
  private caveByMouth = new Map<string, { obj: THREE.Object3D; home: THREE.Vector3; mouth: [number, number]; puffT: number }>();
  private dust: { mesh: THREE.Mesh; v: THREE.Vector3; life: number; max: number }[] = [];
  private dustGeo = new THREE.IcosahedronGeometry(0.12, 0);
  private rangeRing: THREE.Mesh;
  private rangeDisc: THREE.Mesh;
  private animated: THREE.Object3D[] = [];
  private nexus: THREE.Object3D;
  /** Blueprint of the wall being placed: the stone wall's own shape, see-through. */
  private wallGhost: THREE.Object3D | null = null;
  private wallGhostSig = "";
  private wallGhostOk = new THREE.MeshStandardMaterial({ color: "#7d8292", transparent: true, opacity: 0.72, depthWrite: false, emissive: "#5d6270", emissiveIntensity: 0.25, flatShading: true });
  private wallGhostBad = new THREE.MeshStandardMaterial({ color: "#e0445e", transparent: true, opacity: 0.5, depthWrite: false, emissive: "#e0445e", emissiveIntensity: 0.35, flatShading: true });
  private wallFootOk = new THREE.MeshBasicMaterial({ color: "#6a6f7c", transparent: true, opacity: 0.35, depthWrite: false });
  private ghostFeet: THREE.Mesh[] = [];
  private dashes: THREE.InstancedMesh;
  private dots: THREE.InstancedMesh;
  private cursor: THREE.LineLoop;
  private grid: THREE.GridHelper;
  private snow: THREE.Points;
  private snowPos: Float32Array;
  private snowSpeed: Float32Array;
  private puffs: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private gore: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private goreGeo = new THREE.IcosahedronGeometry(0.025, 1);
  private goreMat = new THREE.MeshStandardMaterial({ color: "#b3152a", roughness: 0.6, emissive: "#5a0612", emissiveIntensity: 0.4 });
  private shake = 0;
  private time = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmp = new THREE.Object3D();
  private tmpV = new THREE.Vector3();

  constructor(private container: HTMLElement, private game: Game, private gen?: GeneratedWorld) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.mat = createMaterials();
    const glows = createGlows();
    this.glows = glows;
    this.models = createDefaultModels(this.mat, glows);

    const P = EVENING;
    this.scene.background = new THREE.Color(P.background);
    this.scene.add(new THREE.HemisphereLight(P.sky, P.ground, P.hemi * Math.PI * 0.62));
    this.sun = new THREE.DirectionalLight(P.sun, P.sunIntensity * Math.PI * 0.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.5, far: 60 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);

    this.buildTerrain();
    this.mining = new MiningView(this.scene, this.camera, game);

    const ghost = (kind: TowerKind) => {
      const o = this.models.create(kind);
      o.traverse(c => { if ((c as THREE.Mesh).isMesh) { const m = c as THREE.Mesh; m.castShadow = false; m.material = this.mat.ghostOk; } });
      o.visible = false;
      this.scene.add(o);
      return o;
    };
    this.towerGhosts = { twin: ghost("twin"), gatling: ghost("gatling") };
    this.smelterGhost = refineryLook("A").object;
    this.smelterGhost.rotation.y = SMELTER_TURN;
    this.smelterGhost.traverse(c => { if ((c as THREE.Mesh).isMesh) { const m = c as THREE.Mesh; m.castShadow = false; m.material = this.mat.ghostOk; } });
    this.smelterGhost.visible = false;
    this.scene.add(this.smelterGhost);
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false }));
    this.rangeDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.1, depthWrite: false }));
    this.rangeRing.visible = this.rangeDisc.visible = false;
    this.scene.add(this.rangeRing, this.rangeDisc);
    this.nexus = this.buildNexusAndRifts();
    this.rig = createRig();
    this.rigAnim = new RigAnimator(this.rig);
    this.scene.add(this.rig.object);

    const dashGeo = new THREE.BoxGeometry(0.16, 0.02, 0.06), dotGeo = new THREE.BoxGeometry(0.05, 0.015, 0.05);
    this.dashes = new THREE.InstancedMesh(dashGeo, this.mat.path, 1500);
    this.dots = new THREE.InstancedMesh(dotGeo, this.mat.pathFaint, 1500);
    this.dashes.frustumCulled = this.dots.frustumCulled = false;
    this.scene.add(this.dashes, this.dots);

    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), this.mat.footOk);
      f.rotation.x = -Math.PI / 2;
      this.ghostFeet.push(f);
      this.scene.add(f);
    }

    const sq = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.04, 0, 0.04), new THREE.Vector3(0.96, 0, 0.04), new THREE.Vector3(0.96, 0, 0.96), new THREE.Vector3(0.04, 0, 0.96),
    ]);
    this.cursor = new THREE.LineLoop(sq, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 }));
    this.scene.add(this.cursor);

    this.grid = new THREE.GridHelper(120, 120, "#9d98c4", "#9d98c4");
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.45;
    this.grid.position.y = 0.004;
    this.scene.add(this.grid);

    // Snowfall around the camera target: enough flakes for the most zoomed-in view,
    // spread evenly over the whole field (see the snow in updateFx).
    const N = Math.ceil(SNOW_DENSITY * (SNOW_ZOOM / ZOOM_MIN) ** 2 * (2 * SNOW_FIELD) ** 2);
    this.snowPos = new Float32Array(N * 3);
    this.snowSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * 2 * SNOW_FIELD;
      this.snowPos[i * 3 + 1] = Math.random() * 12;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * 2 * SNOW_FIELD;
      this.snowSpeed[i] = 0.5 + Math.random() * 0.7;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);

    // Start on the avatar.
    this.target.set(game.avatar.x, 0, game.avatar.y);
    this.resize();
  }

  // ------------------------------------------------------------------ setup

  private buildTerrain(): void {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), this.mat.snow);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    // Everything that never moves, per chunk and merged (few draws, off-screen chunks skipped).
    for (const g of buildScenery(this.game.world.map, this.models, this.gen, this.gen?.seed ?? 1)) this.scene.add(g);
  }

  private nexusCenter(): THREE.Vector3 {
    const cells = this.game.world.map.nexus;
    const x = cells.reduce((a, c) => a + c[0] + 0.5, 0) / cells.length;
    const z = cells.reduce((a, c) => a + c[1] + 0.5, 0) / cells.length;
    return new THREE.Vector3(x, 0, z);
  }

  private buildNexusAndRifts(): THREE.Object3D {
    const nexus = this.models.create("ship");
    nexus.position.copy(this.nexusCenter());
    this.scene.add(nexus);
    this.animated.push(nexus);
    // Cave exits: the model's mouth faces +z, turned to face the way the cave opens.
    const caves = this.game.world.map.caves ?? [];
    caves.forEach((c, i) => {
      const cave: Cave = caveLook("A", (this.gen?.seed ?? 1) * 97 + i);
      cave.object.position.set(c.x + 0.5, 0, c.y + 0.5);
      cave.object.rotation.y = Math.atan2(c.dir[0], c.dir[1]);
      this.scene.add(cave.object);
      // Keyed by the cave's mouth, the cell enemies climb out of (the spawner).
      this.caveByMouth.set(`${c.x + c.dir[0] * 2},${c.y + c.dir[1] * 2}`, { obj: cave.object, home: cave.object.position.clone(), mouth: [c.x + c.dir[0] * 2 + 0.5, c.y + c.dir[1] * 2 + 0.5], puffT: 0 });
    });
    // Maps without caves (tests, older maps) keep the old rift marker.
    if (!caves.length) for (const [x, y] of this.game.world.spawners) {
      const r = this.models.create("rift");
      r.position.set(x + 0.5, 0, y + 0.5);
      this.scene.add(r);
      this.animated.push(r);
    }
    return nexus;
  }

  // ------------------------------------------------------------------ camera

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.applyZoom();
  }

  private applyZoom(): void {
    const el = this.renderer.domElement, a = el.clientWidth / Math.max(1, el.clientHeight);
    Object.assign(this.camera, { left: -this.zoom * a, right: this.zoom * a, top: this.zoom, bottom: -this.zoom });
    this.camera.updateProjectionMatrix();
  }

  private placeCamera(): void {
    const s = this.shake > 0 || this.mining.shake > 0 ? 0.05 : 0;
    this.camera.position.copy(this.target).add(CAM_OFFSET);
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.target.x, 0, this.target.z);
    this.camera.updateMatrixWorld();
  }

  /** Where the cursor is on screen (client pixels), for aiming the tool. */
  setPointer(clientX: number, clientY: number): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  /** Screen position (client pixels) of a world point (x east, y up, z south). */
  screenOf(x: number, y: number, z: number): { x: number; y: number } {
    const r = this.renderer.domElement.getBoundingClientRect(), p = this.tmpV.set(x, y, z).project(this.camera);
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  /** Where the character is on screen (client pixels), a little above the feet: the build wheel's centre. */
  avatarScreen(): { x: number; y: number } {
    const o = this.rig.object.position;
    return this.screenOf(o.x, o.y + 0.45, o.z);
  }

  /** Is the cursor on the hotspot of the node in reach? */
  cursorOnHotspot(): boolean {
    const el = this.renderer.domElement;
    return this.mining.onHotspot(this.pointer, this.game.nodeInReach(), el.clientWidth / Math.max(1, el.clientHeight));
  }

  /** Point on the horizontal plane at height `y` under a screen position, or null. */
  pickAtHeight(clientX: number, clientY: number, y: number): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.placeCamera();
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null;
  }

  /** Is the ship under this screen position? */
  shipAt(clientX: number, clientY: number): boolean {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.placeCamera();
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.raycaster.intersectObject(this.nexus, true).length > 0) return true;
    // The core cage is open, so also count any point over the ship's footprint, up its height.
    const p = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    for (let y = 0; y <= 3.5; y += 0.25) {
      plane.constant = -y;
      if (this.raycaster.ray.intersectPlane(plane, p) && this.game.world.isNexus(Math.floor(p.x), Math.floor(p.z))) return true;
    }
    return false;
  }

  /** Ground point under a screen position, or null. */
  pickGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.placeCamera();
    this.raycaster.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, p) ? p : null;
  }

  /** A pan by the player: stops following the avatar. */
  userPan(dx: number, dz: number): void {
    this.following = false;
    this.camGoal = null;
    this.panBy(dx, dz);
  }

  /** Follow the avatar again (C). */
  followAvatar(): void { this.following = true; this.camGoal = null; }

  /** Glide to the ship and stay there (H). */
  lookAtShip(): void { this.following = false; this.camGoal = this.nexusCenter(); }

  panBy(dx: number, dz: number): void {
    this.target.x += dx;
    this.target.z += dz;
    const b = this.game.world.bounds();
    this.target.x = Math.min(b.x1 + 4, Math.max(b.x0 - 4, this.target.x));
    this.target.z = Math.min(b.y1 + 4, Math.max(b.y0 - 4, this.target.z));
  }

  /** Pan along the screen: right/up in screen space, in world units. */
  panScreen(right: number, up: number): void {
    // Screen right on the ground is (1,0,-1)/√2; screen up is (-1,0,-1)/√2 for this camera.
    const k = Math.SQRT1_2;
    this.userPan((right - up) * k, (-right - up) * k);
  }

  /** Zoom keeping the ground point under the cursor fixed. */
  zoomAt(factor: number, clientX: number, clientY: number): void {
    const before = this.pickGround(clientX, clientY);
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * factor));
    this.applyZoom();
    const after = this.pickGround(clientX, clientY);
    if (before && after) this.panBy(before.x - after.x, before.z - after.z);
  }

  // ------------------------------------------------------------------ frame

  /** `alpha` is how far the simulation is between its last tick and the next (0..1). */
  render(frameDt: number, simDt: number, o: Overlay, events: readonly GameEvent[], alpha = 1, worldDt = simDt, worldAlpha = 1): void {
    this.time += frameDt;
    const t = this.time;
    // Sync first so shots from this frame find their towers and targets.
    this.syncPieces(o.hoverPieceId);
    this.syncTowers();
    this.syncSmelters(t);
    this.syncBuildingBars();
    for (const ev of events) {
      if (ev.type === "placed" || ev.type === "plated") this.onPlaced(ev.piece);
      else if (ev.type === "smelter-destroyed") this.onKilled(ev.smelter.cx, ev.smelter.cy, 26, this.debrisMat);
      else if (ev.type === "wall-broken") { for (const [x, y] of ev.piece.cells) this.onKilled(x + 0.5, y + 0.5, 12, this.stoneDebrisMat); this.shake = Math.max(this.shake, 0.12); }
      else if (ev.type === "tower-destroyed") this.onKilled(ev.tower.cx, ev.tower.cy, 22, this.debrisMat);
      else if (ev.type === "tower-built") { const v = this.towers.get(ev.tower.id); if (v) v.drop = 0.12; }
      else if (ev.type === "shot") this.onShot(ev.shot);
      else if (ev.type === "hit") { const w = this.walkers.get(ev.walker.id); if (w) w.userData.flash = 0.09; }
      else if (ev.type === "killed") this.onKilled(ev.walker.x, ev.walker.y);
      else if (ev.type === "reset") { this.clearFx(); this.shipLand = 0; this.wreck = 0; this.followAvatar(); }
    }
    this.mining.onEvents(events);
    const landed = events.some(e => e.type === "avatar-landed");
    this.syncWalkers(worldDt, worldAlpha);
    this.aimTowers(simDt);
    this.updateBolts(simDt);
    this.updateGhost(o);
    this.updateTowerGhost(o);
    this.updatePath(o);

    this.cursor.visible = !!o.hoverCell && !o.ghost;
    if (o.hoverCell) this.cursor.position.set(o.hoverCell[0], 0.02, o.hoverCell[1]);
    this.grid.visible = o.showGrid;

    for (const a of this.animated) (a.userData.update as (t: number, dt: number) => void)?.(t, frameDt);
    this.stirCaves(t, frameDt);
    this.updateShipLanding(frameDt);
    this.updateAvatar(frameDt, alpha, landed, o.toolReady);
    this.updateFx(frameDt);

    // Camera: follow the avatar, or glide to a goal, or stay where the player panned.
    const a = this.rig.object.position;
    const k = 1 - Math.exp(-frameDt * FOLLOW);
    if (this.following) { this.target.x += (a.x - this.target.x) * k; this.target.z += (a.z - this.target.z) * k; }
    else if (this.camGoal) {
      this.target.x += (this.camGoal.x - this.target.x) * k; this.target.z += (this.camGoal.z - this.target.z) * k;
      if (Math.hypot(this.camGoal.x - this.target.x, this.camGoal.z - this.target.z) < 0.01) this.camGoal = null;
    }

    this.shake = Math.max(0, this.shake - frameDt);
    this.placeCamera();
    const sc = Math.max(16, this.zoom * 2.4);
    Object.assign(this.sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc });
    this.sun.shadow.camera.updateProjectionMatrix();
    // Snap the sun to the shadow map's texel grid so shadows don't shimmer while the camera slides.
    const texel = (2 * sc) / this.sun.shadow.mapSize.x, p = this.tmpV.set(this.target.x, 0, this.target.z);
    const u = Math.round(p.dot(LIGHT_RIGHT) / texel) * texel, v = Math.round(p.dot(LIGHT_UP) / texel) * texel, w = p.dot(LIGHT_DIR);
    const snapped = p.set(0, 0, 0).addScaledVector(LIGHT_RIGHT, u).addScaledVector(LIGHT_UP, v).addScaledVector(LIGHT_DIR, w);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(LIGHT_DIR, -LIGHT_DIST);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Draw the avatar between the last two sim ticks, and animate it every frame.
   * While the tool fires, the legs keep running where you steer and the torso
   * twists toward the aim; standing still, the whole rig turns to face it.
   */
  private updateAvatar(dt: number, alpha: number, landed: boolean, ready: boolean): void {
    const av = this.game.avatar, T = this.game.avatarTuning;
    const firing = this.game.mineInput.firing;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const rx = lerp(av.prevX, av.x), rz = lerp(av.prevY, av.y);
    const node = this.game.nodeInReach();
    const aim = this.mining.aimPoint(this.pointer, node, new THREE.Vector3(rx + Math.sin(av.facing), 0, rz + Math.cos(av.facing)));
    const aimYaw = Math.atan2(aim.x - rx, aim.z - rz);
    if (firing && av.speed < 0.3) av.facing += wrapAngle(aimYaw - av.facing) * Math.min(1, dt * 10);
    const df = wrapAngle(av.facing - av.prevFacing);
    this.rig.object.position.set(rx, lerp(av.prevZ, av.z), rz);
    this.rig.object.rotation.y = av.prevFacing + df * alpha;
    this.rigAnim.update(dt, {
      speed: av.speed, topSpeed: T.speed, grounded: av.grounded, vz: av.vz,
      jumpSpeed: (2 * T.jumpHeight) / T.jumpRise, landed, ready: ready || firing, mining: firing,
    });
    const want = firing ? Math.max(-TWIST_MAX, Math.min(TWIST_MAX, wrapAngle(aimYaw - this.rig.object.rotation.y))) : 0;
    this.twist += (want - this.twist) * Math.min(1, dt * 14);
    this.rig.body.rotation.y += this.twist;
    this.rig.object.updateMatrixWorld(true);
    this.rig.beam.localToWorld(this.tip.set(0, 0, 1));
    this.mining.update(dt, node, firing, this.game.mineInput.onSpot, firing ? this.tip : null);
  }

  /** The ship comes down with its door shut, lands with a snow burst, then opens the ramp. */
  private updateShipLanding(dt: number): void {
    const rig = this.nexus.userData.rig as ShipRig;
    const before = this.shipLand;
    this.shipLand += dt;
    const t = this.shipLand, c = this.nexusCenter();
    const k = Math.min(1, t / LAND_DESCENT);
    this.nexus.position.set(c.x, LAND_DROP * (1 - (1 - (1 - k) ** 3)), c.z);
    // Destroyed: it slumps and lists into a dark, smoking wreck (it still blocks).
    const down = this.game.shipDown;
    (this.nexus.userData.setWrecked as (on: boolean) => void)(down);
    this.wreck = down ? Math.min(1, this.wreck + dt * 1.5) : 0;
    const w = 1 - (1 - this.wreck) ** 3;
    this.nexus.position.y -= 0.35 * w;
    this.nexus.rotation.set(0.16 * w, 0, -0.12 * w);
    if (down && (this.wreckPuff -= dt) <= 0) { this.wreckPuff = 0.18; this.spawnDust(c.x + (Math.random() - 0.5) * 1.6, c.z + (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 0.6, "#3a3642"); }
    // Enemies clawing it: the core flashes now and then.
    if (!down && this.game.hp < this.lastShipHp && (this.shipHitCd -= dt) <= 0) { this.shipHitCd = 0.35; (this.nexus.userData.flash as () => void)(); }
    this.lastShipHp = this.game.hp;
    const open = Math.min(1, Math.max(0, (t - LAND_DESCENT - LAND_HOLD) / LAND_OPEN));
    const e = open < 0.5 ? 2 * open * open : 1 - (-2 * open + 2) ** 2 / 2;
    rig.door.rotation.x = e * rig.openAngle;
    rig.materials.bayLight.emissiveIntensity = e * 1.2;
    if (before < LAND_DESCENT && t >= LAND_DESCENT) {
      this.shake = 0.25;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; this.puff(c.x + Math.cos(a) * 1.3, c.z + Math.sin(a) * 1.3, 0.3); }
    }
  }

  private onPlaced(p: PlacedPiece): void {
    this.syncPieces(null);
    const v = this.pieces.get(p.id);
    if (v) v.drop = 0.14;
  }

  private buildPiece(p: PlacedPiece): PieceView {
    // Walls fuse only with walls of the same material, so stone and metal meet at a clean seam.
    const joins = (x: number, y: number) => this.game.pieceAt(x, y)?.metal === p.metal;
    const group = p.metal ? this.models.create("wallPiece", { cells: p.cells, joins }) : stoneWallPiece(p.cells, joins);
    const bodies: THREE.Mesh[] = [];
    group.traverse(c => { if (c.name === "body") bodies.push(c as THREE.Mesh); });
    this.scene.add(group);
    return { group, drop: 0, bodies, cells: p.cells };
  }

  private syncPieces(hoverId: number | null): void {
    // Walls fuse with their neighbours, so when the set of walls changes, rebuild every piece.
    const sig = this.game.pieces.map(p => p.id + (p.metal ? "m" : "") + ":" + p.cells.length).join(",");
    if (sig !== this.wallSig) {
      this.wallSig = sig;
      for (const [id, v] of this.pieces) {
        this.scene.remove(v.group);
        v.group.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose(); });
        const p = this.game.pieces.find(q => q.id === id);
        if (!p) { this.pieces.delete(id); continue; }
        const fresh = this.buildPiece(p);
        fresh.drop = v.drop;
        fresh.group.position.y = v.group.position.y;
        this.pieces.set(id, fresh);
      }
    }
    const stone = stoneWallMaterials();
    for (const p of this.game.pieces) {
      let v = this.pieces.get(p.id);
      if (!v) { v = this.buildPiece(p); this.pieces.set(p.id, v); }
      const m = p.metal
        ? (p.id === hoverId ? this.mat.wallHover : p.locked ? this.mat.wallA : this.mat.wallLooseA)
        : (p.id === hoverId ? stone.hover : p.locked ? stone.base : stone.loose);
      for (const b of v.bodies) b.material = m;
    }
    // Walls that can still be picked up breathe slightly brighter than locked ones.
    const breath = 0.5 + 0.5 * Math.sin(this.time * 3);
    this.mat.wallLooseA.emissiveIntensity = 0.17 + 0.13 * breath;
    stone.loose.emissiveIntensity = 0.08 + 0.14 * breath;
  }

  /**
   * Enemies are leapers: they climb up out of the cave mouth, walk with their stride, flash when hit.
   * Drawn between the last two ticks (`alpha`) and animated on the world's clock every frame
   * (`dt`, 0 while paused), so they move smoothly at any refresh rate.
   */
  private syncWalkers(dt: number, alpha: number): void {
    const alive = new Set<number>();
    for (const w of this.game.walkers) {
      alive.add(w.id);
      let o = this.walkers.get(w.id);
      if (!o) {
        const e = enemyLook("C");
        o = e.object;
        o.userData.enemy = e;
        o.userData.t = Math.random() * 10;
        o.userData.from = [w.x, w.y];
        o.rotation.y = Math.atan2(w.tx + 0.5 - w.x, w.ty + 0.5 - w.y);
        this.scene.add(o);
        this.walkers.set(w.id, o);
      }
      const e = o.userData.enemy as Enemy;
      o.userData.t += dt;
      o.userData.flash = Math.max(0, ((o.userData.flash as number) ?? 0) - dt);
      e.flash((o.userData.flash as number) > 0 ? 1 : 0);
      // Clawing a building: it stands still, faces it and lunges; otherwise it walks.
      e.update(o.userData.t as number, !w.attacking);
      const [ax, az] = w.attacking ? w.attacking.split(",").map(Number) as [number, number] : [0, 0];
      const dx = w.attacking ? ax + 0.5 - w.x : w.tx + 0.5 - w.x, dz = w.attacking ? az + 0.5 - w.y : w.ty + 0.5 - w.y;
      if (dx * dx + dz * dz > 1e-6) {
        const want = Math.atan2(dx, dz);
        let d = want - o.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        o.rotation.y += d * Math.min(1, dt * 8);
      }
      // Its own line through each tile: off the centre line to its right or left. It turns
      // with the (eased) heading, so it swings round smoothly at corners.
      const side = (w.lane ?? 0) * this.game.tuning.laneSpread, r = o.rotation.y;
      const cx = (w.px ?? w.x) + (w.x - (w.px ?? w.x)) * alpha, cy = (w.py ?? w.y) + (w.y - (w.py ?? w.y)) * alpha;
      const x = cx + Math.cos(r) * side, y = cy - Math.sin(r) * side;
      this.syncBar(w.id, x, y, w.hp / w.maxHp);
      // Climbing out: below the snow at the mouth, up on it half a cell out.
      const [fx, fy] = o.userData.from as [number, number], out = Math.hypot(cx - fx, cy - fy);
      o.position.set(x, -0.25 * Math.max(0, 1 - out / 0.5), y);
      if (w.attacking) {
        // A quick lunge toward what it's clawing, several times a second.
        const lunge = Math.max(0, Math.sin((o.userData.t as number) * 9 + w.id)) * 0.12;
        o.position.x += Math.sin(o.rotation.y) * lunge;
        o.position.z += Math.cos(o.rotation.y) * lunge;
      }
    }
    for (const [id, o] of this.walkers) if (!alive.has(id)) { this.scene.remove(o); this.walkers.delete(id); }
    for (const [id, b] of this.bars) if (!alive.has(id)) { this.scene.remove(b); this.bars.delete(id); }
  }

  /** Small HP bar over a damaged walker, facing the camera. */
  private syncBar(id: number, x: number, y: number, frac: number): void {
    let b = this.bars.get(id);
    if (!b) {
      b = new THREE.Group();
      const bg = new THREE.Mesh(this.barGeo, this.barBgMat);
      const fill = new THREE.Mesh(this.barFillGeo, this.barFillMat);
      fill.position.set(-0.25, 0, 0.001);
      fill.name = "fill";
      b.add(bg, fill);
      b.renderOrder = 5;
      this.scene.add(b);
      this.bars.set(id, b);
    }
    b.visible = frac < 0.999;
    b.position.set(x, 0.62, y);
    b.quaternion.copy(this.camera.quaternion);
    b.getObjectByName("fill")!.scale.x = Math.max(0.001, frac);
  }

  // ------------------------------------------------------------------ caves

  /**
   * A raid is near: during the warning the active caves tremble and breathe dust
   * out of their mouths, so you can see where it will come from.
   */
  private stirCaves(t: number, dt: number): void {
    const stir = this.game.raidWarned;
    const active = new Set(stir ? this.game.activeSpawners().map(([x, y]) => `${x},${y}`) : []);
    for (const [key, c] of this.caveByMouth) {
      if (!active.has(key)) { c.obj.position.copy(c.home); continue; }
      c.obj.position.set(c.home.x + Math.sin(t * 43) * 0.012, c.home.y + Math.abs(Math.sin(t * 31)) * 0.01, c.home.z + Math.cos(t * 37) * 0.012);
      if ((c.puffT -= dt) > 0) continue;
      c.puffT = 0.12 + Math.random() * 0.12;
      this.spawnDust(c.mouth[0] + (Math.random() - 0.5) * 0.6, c.mouth[1] + (Math.random() - 0.5) * 0.6, 0.1, "#6d6878");
    }
    for (const d of this.dust) {
      d.life -= dt;
      d.mesh.position.addScaledVector(d.v, dt);
      const k = Math.max(0, d.life / d.max);
      d.mesh.scale.setScalar(1 + (1 - k) * 1.6);
      (d.mesh.material as THREE.MeshStandardMaterial).opacity = 0.55 * k;
    }
    this.dust = this.dust.filter(d => {
      if (d.life > 0) return true;
      this.scene.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
      return false;
    });
  }

  /** A puff of dust or smoke that rises, grows and fades. */
  private spawnDust(x: number, z: number, y: number, color: string): void {
    const m = new THREE.Mesh(this.dustGeo, new THREE.MeshStandardMaterial({ color, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }));
    m.position.set(x, y, z);
    m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    this.scene.add(m);
    this.dust.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4), life: 1.4, max: 1.4 });
  }

  /** HP bars over damaged buildings (the ship and smelters), wider than an enemy's. */
  private syncBuildingBars(): void {
    const want = new Map<number, { x: number; y: number; z: number; frac: number }>();
    if (!this.game.shipDown && this.game.hp < this.game.tuning.startHp) {
      const c = this.nexusCenter();
      want.set(-1, { x: c.x, y: 3.4, z: c.z, frac: this.game.hp / this.game.tuning.startHp });
    }
    for (const s of this.game.smelters) if (s.hp < s.maxHp) want.set(s.id, { x: s.cx, y: 3.3, z: s.cy, frac: s.hp / s.maxHp });
    // Damaged walls: one bar per piece, over its middle (piece ids never clash with smelter ids).
    for (const p of this.game.pieces) {
      const { hp, max } = this.game.pieceHp(p);
      if (hp >= max || !p.cells.length) continue;
      const cx = p.cells.reduce((a, c) => a + c[0] + 0.5, 0) / p.cells.length, cz = p.cells.reduce((a, c) => a + c[1] + 0.5, 0) / p.cells.length;
      want.set(p.id, { x: cx, y: TOP + 0.75, z: cz, frac: hp / max });
    }
    for (const [id, w] of want) {
      let b = this.buildingBars.get(id);
      if (!b) {
        b = new THREE.Group();
        const bg = new THREE.Mesh(this.barGeo, this.barBgMat), fill = new THREE.Mesh(this.barFillGeo, this.barFillMat);
        fill.position.set(-0.25, 0, 0.001);
        fill.name = "fill";
        b.add(bg, fill);
        b.scale.set(2.4, 1.6, 1);
        b.renderOrder = 5;
        this.scene.add(b);
        this.buildingBars.set(id, b);
      }
      b.position.set(w.x, w.y, w.z);
      b.quaternion.copy(this.camera.quaternion);
      b.getObjectByName("fill")!.scale.x = Math.max(0.001, w.frac);
    }
    for (const [id, b] of this.buildingBars) if (!want.has(id)) { this.scene.remove(b); this.buildingBars.delete(id); }
  }

  // ------------------------------------------------------------------ smelters

  /** Smelters: the furnace model, glowing and smoking only while it smelts. */
  private syncSmelters(t: number): void {
    const alive = new Set<number>();
    for (const s of this.game.smelters) {
      alive.add(s.id);
      let v = this.smelters.get(s.id);
      if (!v) {
        v = refineryLook("A");
        v.object.position.set(s.cx, 0, s.cy);
        v.object.rotation.y = SMELTER_TURN;
        this.scene.add(v.object);
        this.smelters.set(s.id, v);
      }
      v.update(t, s.working);
    }
    for (const [id, v] of this.smelters) if (!alive.has(id)) { this.scene.remove(v.object); this.smelters.delete(id); }
  }

  // ------------------------------------------------------------------ towers

  private syncTowers(): void {
    const alive = new Set<number>();
    for (const t of this.game.towers) {
      alive.add(t.id);
      if (this.towers.has(t.id)) continue;
      const obj = this.models.create(t.kind);
      obj.position.set(t.cx, TOP, t.cy);
      obj.rotation.y = Math.PI * 0.75;
      this.scene.add(obj);
      const rig = obj.userData.rig as TurretRig;
      this.towers.set(t.id, { obj, rig, recoil: rig.guns.map(() => 0), gun: 0, spin: 0, drop: 0 });
    }
    for (const [id, v] of this.towers) if (!alive.has(id)) { this.scene.remove(v.obj); this.towers.delete(id); }
  }

  /** Turn each turret toward its target; ease recoil and barrel spin. */
  private aimTowers(dt: number): void {
    const byId = new Map<number, Tower>(this.game.towers.map(t => [t.id, t]));
    for (const [id, v] of this.towers) {
      const t = byId.get(id);
      const target = t?.targetId != null ? this.walkers.get(t.targetId) : undefined;
      if (t && target) {
        // The rig's yaw is local to the tower root, which may itself be turned.
        const want = Math.atan2(target.position.x - t.cx, target.position.z - t.cy) - v.obj.rotation.y;
        let d = want - v.rig.yaw.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        v.rig.yaw.rotation.y += d * Math.min(1, dt * 12);
      }
      v.rig.guns.forEach((g, i) => {
        v.recoil[i] = Math.max(0, v.recoil[i]! - dt * 7);
        g.obj.position.z = g.rest - v.rig.kick * v.recoil[i]! ** 2;
      });
      v.spin = Math.max(0, v.spin - dt * 1.5);
      if (v.rig.spinner) v.rig.spinner.rotation.z += dt * 28 * v.spin;
    }
  }

  private onShot(s: Shot): void {
    const target = this.walkers.get(s.targetId);
    if (s.towerId === SHIP_SHOOTER) {
      // From the crystal in the ship's core cage.
      const from = this.nexus.position.clone().setY(this.nexus.position.y + SHIP_CORE_Y);
      this.addFlash(from, this.glows.cyan, 0.6, 0.12);
      const mesh = new THREE.Mesh(this.boltGeo, this.shipBoltMat);
      mesh.position.copy(from);
      this.scene.add(mesh);
      const to = target ? target.position.clone().setY(0.25) : from.clone();
      this.bolts.push({ mesh, from, to, walkerId: s.targetId, t: 0, dur: Math.max(0.02, s.dur) });
      return;
    }
    const v = this.towers.get(s.towerId);
    if (!v) return;
    const i = v.gun++ % v.rig.guns.length;
    const g = v.rig.guns[i]!;
    v.recoil[i] = 1;
    v.spin = 1;
    v.obj.updateMatrixWorld(true);
    const from = v.rig.yaw.localToWorld(g.muzzle.clone());
    this.addFlash(from, this.glows.muzzle, v.rig.spinner ? 0.45 : 0.32, 0.07);
    const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    const to = target ? target.position.clone().setY(0.25) : from.clone();
    this.bolts.push({ mesh, from, to, walkerId: s.targetId, t: 0, dur: Math.max(0.02, s.dur) });
  }

  private updateBolts(dt: number): void {
    for (const b of this.bolts) {
      b.t += dt;
      const w = this.walkers.get(b.walkerId);
      if (w) b.to.set(w.position.x, 0.25, w.position.z);
      b.mesh.position.lerpVectors(b.from, b.to, Math.min(1, b.t / b.dur));
    }
    this.bolts = this.bolts.filter(b => { if (b.t < b.dur) return true; this.scene.remove(b.mesh); return false; });
    for (const f of this.flashes) {
      f.life -= dt;
      f.sprite.scale.setScalar(f.size * Math.max(0.01, f.life / f.max));
    }
    this.flashes = this.flashes.filter(f => { if (f.life > 0) return true; this.scene.remove(f.sprite); return false; });
  }

  private addFlash(at: THREE.Vector3, m: THREE.SpriteMaterial, size: number, life: number): void {
    const sprite = new THREE.Sprite(m);
    sprite.position.copy(at);
    sprite.scale.setScalar(size);
    this.scene.add(sprite);
    this.flashes.push({ sprite, life, max: life, size });
  }

  /** A killed enemy simply bursts into a small spray of red dots. */
  private onKilled(x: number, y: number, n = 10, mat: THREE.Material = this.goreMat): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.goreGeo, mat);
      m.position.set(x, 0.18, y);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 0.8;
      this.gore.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * sp, 0.8 + Math.random(), Math.sin(a) * sp), life: 0.6 });
    }
  }

  private clearFx(): void {
    for (const b of this.bolts) this.scene.remove(b.mesh);
    for (const f of this.flashes) this.scene.remove(f.sprite);
    this.bolts = []; this.flashes = [];
  }

  private updateTowerGhost(o: Overlay): void {
    const sg = o.smelterGhost;
    this.smelterGhost.visible = !!sg;
    if (sg) {
      this.smelterGhost.position.set(sg.cx, 0.12 + Math.sin(this.time * 4) * 0.03, sg.cy);
      const m = sg.valid ? this.mat.ghostOk : this.mat.ghostBad;
      this.smelterGhost.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = m; });
      for (let i = 0; i < 4; i++) {
        const c = sg.cells[i]!, foot = this.ghostFeet[i]!;
        foot.visible = true;
        foot.position.set(c[0] + 0.5, 0.012, c[1] + 0.5);
        foot.material = sg.valid ? this.mat.footOk : this.mat.footBad;
      }
    }
    const g = o.towerGhost;
    for (const [kind, obj] of Object.entries(this.towerGhosts)) {
      obj.visible = !!g && g.kind === kind;
      if (!obj.visible || !g) continue;
      obj.position.set(g.cx, TOP + 0.12 + Math.sin(this.time * 4) * 0.03, g.cy);
      const m = g.valid ? this.mat.ghostOk : this.mat.ghostBad;
      obj.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = m; });
    }
    if (g) {
      for (let i = 0; i < 4; i++) {
        const c = g.cells[i], foot = this.ghostFeet[i]!;
        foot.visible = !!c;
        if (!c) continue;
        const onWall = this.game.world.walls.has(`${c[0]},${c[1]}`);
        foot.position.set(c[0] + 0.5, onWall ? TOP + 0.01 : 0.012, c[1] + 0.5);
        foot.material = g.valid ? this.mat.footOk : this.mat.footBad;
      }
    }
    const r = g ?? o.selectedTower;
    this.rangeRing.visible = this.rangeDisc.visible = !!r;
    if (r) {
      this.rangeRing.position.set(r.cx, 0.035, r.cy);
      this.rangeDisc.position.set(r.cx, 0.03, r.cy);
      this.rangeRing.scale.setScalar(r.range);
      this.rangeDisc.scale.setScalar(r.range);
    }
  }

  /** The wall blueprint: always a stone wall (every wall is placed as stone), grey if it fits, red if not. */
  private updateGhost(o: Overlay): void {
    const g = o.ghost;
    const sig = g ? g.cells.map(c => c.join(",")).join(";") : "";
    if (sig !== this.wallGhostSig) {
      this.wallGhostSig = sig;
      if (this.wallGhost) {
        this.scene.remove(this.wallGhost);
        this.wallGhost.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose(); });
        this.wallGhost = null;
      }
      if (g) {
        this.wallGhost = stoneWallPiece(g.cells);
        this.wallGhost.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = false; });
        this.scene.add(this.wallGhost);
      }
    }
    if (this.wallGhost && g) {
      this.wallGhost.position.y = 0.3 + Math.sin(this.time * 4) * 0.05;
      const m = g.valid ? this.wallGhostOk : this.wallGhostBad;
      this.wallGhost.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = m; });
    }
    for (let i = 0; i < 4; i++) {
      const c = g?.cells[i], foot = this.ghostFeet[i]!;
      foot.visible = !!c;
      if (!c) continue;
      foot.position.set(c[0] + 0.5, 0.012, c[1] + 0.5);
      foot.material = g!.valid ? this.wallFootOk : this.mat.footBad;
    }
  }

  private layPath(inst: THREE.InstancedMesh, routes: Cell[][], spacing: number, offset: number): number {
    let n = 0;
    const max = inst.instanceMatrix.count;
    for (const route of routes) {
      let carry = offset;
      for (let i = 1; i < route.length; i++) {
        const ax = route[i - 1]![0] + 0.5, az = route[i - 1]![1] + 0.5, bx = route[i]![0] + 0.5, bz = route[i]![1] + 0.5;
        const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
        for (let s = carry; s < L && n < max; s += spacing) {
          this.tmp.position.set(ax + (dx * s) / L, 0.03, az + (dz * s) / L);
          this.tmp.rotation.set(0, -Math.atan2(dz, dx), 0);
          this.tmp.updateMatrix();
          inst.setMatrixAt(n++, this.tmp.matrix);
        }
        carry = (((carry - L) % spacing) + spacing) % spacing;
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    return n;
  }

  private updatePath(o: Overlay): void {
    if (!o.showPath) { this.dashes.count = 0; this.dots.count = 0; return; }
    const off = (this.time * 0.9) % 0.3;
    this.dashes.count = this.layPath(this.dashes, o.route, 0.3, 0.3 - off);
    this.dots.count = o.faintRoute ? this.layPath(this.dots, o.faintRoute, 0.25, 0) : 0;
  }

  private updateFx(dt: number): void {
    // Drop animation for freshly placed pieces, ending in a thunk.
    for (const v of this.pieces.values()) {
      if (v.drop <= 0) continue;
      v.drop = Math.max(0, v.drop - dt);
      const k = v.drop / 0.14;
      v.group.position.y = 0.35 * k * k;
      if (v.drop === 0) {
        this.shake = 0.15;
        for (const [x, y] of v.cells) this.puff(x + 0.5, y + 0.5);
      }
    }
    for (const v of this.towers.values()) {
      if (v.drop <= 0) continue;
      v.drop = Math.max(0, v.drop - dt);
      const k = v.drop / 0.12;
      v.obj.position.y = TOP + 0.3 * k * k;
    }
    for (const p of this.puffs) {
      p.life -= dt;
      p.v.y -= 6 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.v.set(0, 0, 0); }
      p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.5));
    }
    this.puffs = this.puffs.filter(p => { if (p.life > 0) return true; this.scene.remove(p.mesh); return false; });
    for (const p of this.gore) {
      p.life -= dt; p.v.y -= 7 * dt; p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.v.set(0, 0, 0); }
      p.mesh.scale.setScalar(Math.max(0.01, Math.min(1, p.life / 0.3)));
    }
    this.gore = this.gore.filter(p => { if (p.life > 0) return true; this.scene.remove(p.mesh); return false; });

    // Flakes live in the world, not on the camera: they fall and drift on their own,
    // and wrap around the edges of the area around the camera so it never runs out of snow.
    // Snow always falls the same way; zoom only changes how many flakes are drawn,
    // fewer when zoomed out, so the snow looks equally dense on screen.
    const p = this.snowPos, H = SNOW_FIELD;
    const n = Math.min(this.snowSpeed.length, Math.round(SNOW_DENSITY * (SNOW_ZOOM / this.zoom) ** 2 * (2 * H) ** 2));
    this.snow.geometry.setDrawRange(0, n);
    for (let i = 0; i < n; i++) {
      p[i * 3 + 1]! -= this.snowSpeed[i]! * dt;
      p[i * 3]! += Math.sin(this.time + i) * 0.12 * dt;
      if (p[i * 3 + 1]! < 0) p[i * 3 + 1] = 12;
      p[i * 3] = wrap(p[i * 3]!, this.target.x, H);
      p[i * 3 + 2] = wrap(p[i * 3 + 2]!, this.target.z, H);
    }
    this.snow.geometry.attributes.position!.needsUpdate = true;
  }

  private puff(x: number, z: number, spread = 0.45): void {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), this.mat.puff);
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 1.2;
      m.position.set(x + Math.cos(a) * spread, 0.05, z + Math.sin(a) * spread);
      this.scene.add(m);
      this.puffs.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * s, 1.5 + Math.random() * 1.5, Math.sin(a) * s), life: 0.5 });
    }
  }
}
