import * as THREE from "three";
import type { Game, GameEvent, PlacedPiece, Shot } from "../sim/game";
import type { Tower, TowerKind } from "../sim/towers";
import type { Cell } from "../sim/types";
import { createDefaultModels, createGlows, createMaterials, DECK_TOP, EVENING, hash, type Glows, type Materials, type ModelLibrary, type TurretRig } from "./models";

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
  /** Reach of the selected tower. */
  selectedTower: { cx: number; cy: number; range: number } | null;
}

/** Height of the wall deck, where towers stand. */
const TOP = DECK_TOP;

/** Wrap v into [center - half, center + half). */
const wrap = (v: number, center: number, half: number) => ((((v - center + half) % (2 * half)) + 2 * half) % (2 * half)) + center - half;

interface TowerView { obj: THREE.Object3D; rig: TurretRig; recoil: number[]; gun: number; spin: number; drop: number }
interface Bolt { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; walkerId: number; t: number; dur: number }
interface Flash { sprite: THREE.Sprite; life: number; max: number; size: number }

const CAM_OFFSET = new THREE.Vector3(20, 16.33, 20); // ~30° elevation, 45° around: classic iso
const ZOOM_MIN = 3.2, ZOOM_MAX = 11;

interface PieceView { group: THREE.Object3D; drop: number; bodies: THREE.Mesh[]; cells: readonly Cell[] }

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  readonly target = new THREE.Vector3();
  zoom = 6.2;

  private mat: Materials;
  private models: ModelLibrary;
  private sun: THREE.DirectionalLight;
  private pieces = new Map<number, PieceView>();
  private walkers = new Map<number, THREE.Object3D>();
  private towers = new Map<number, TowerView>();
  private bolts: Bolt[] = [];
  private flashes: Flash[] = [];
  private bars = new Map<number, THREE.Group>();
  private glows: Glows;
  private boltGeo = new THREE.SphereGeometry(0.045, 8, 6);
  private boltMat = new THREE.MeshBasicMaterial({ color: "#ffd08a" });
  private barGeo = new THREE.PlaneGeometry(0.5, 0.07);
  private barFillGeo = new THREE.PlaneGeometry(0.5, 0.07).translate(0.25, 0, 0);
  private barBgMat = new THREE.MeshBasicMaterial({ color: "#241f3d" });
  private barFillMat = new THREE.MeshBasicMaterial({ color: "#ff8a5c" });
  private towerGhosts: Record<TowerKind, THREE.Object3D>;
  private rangeRing: THREE.Mesh;
  private rangeDisc: THREE.Mesh;
  private animated: THREE.Object3D[] = [];
  private nexus: THREE.Object3D;
  private ghostCells: THREE.Mesh[] = [];
  private ghostFeet: THREE.Mesh[] = [];
  private dashes: THREE.InstancedMesh;
  private dots: THREE.InstancedMesh;
  private cursor: THREE.LineLoop;
  private grid: THREE.GridHelper;
  private snow: THREE.Points;
  private snowPos: Float32Array;
  private snowSpeed: Float32Array;
  private puffs: { mesh: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private shake = 0;
  private time = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private tmp = new THREE.Object3D();

  constructor(private container: HTMLElement, private game: Game) {
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

    const ghost = (kind: TowerKind) => {
      const o = this.models.create(kind);
      o.traverse(c => { if ((c as THREE.Mesh).isMesh) { const m = c as THREE.Mesh; m.castShadow = false; m.material = this.mat.ghostOk; } });
      o.visible = false;
      this.scene.add(o);
      return o;
    };
    this.towerGhosts = { twin: ghost("twin"), gatling: ghost("gatling") };
    this.rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6, depthWrite: false }));
    this.rangeDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.1, depthWrite: false }));
    this.rangeRing.visible = this.rangeDisc.visible = false;
    this.scene.add(this.rangeRing, this.rangeDisc);
    this.nexus = this.buildNexusAndRifts();

    const dashGeo = new THREE.BoxGeometry(0.16, 0.02, 0.06), dotGeo = new THREE.BoxGeometry(0.05, 0.015, 0.05);
    this.dashes = new THREE.InstancedMesh(dashGeo, this.mat.path, 1500);
    this.dots = new THREE.InstancedMesh(dotGeo, this.mat.pathFaint, 1500);
    this.dashes.frustumCulled = this.dots.frustumCulled = false;
    this.scene.add(this.dashes, this.dots);

    for (let i = 0; i < 4; i++) {
      const g = this.models.create("ghostWall") as THREE.Mesh;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), this.mat.footOk);
      f.rotation.x = -Math.PI / 2;
      this.ghostCells.push(g); this.ghostFeet.push(f);
      this.scene.add(g, f);
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

    // Snowfall around the camera target.
    const N = 1400;
    this.snowPos = new Float32Array(N * 3);
    this.snowSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.snowPos[i * 3] = (Math.random() - 0.5) * 36;
      this.snowPos[i * 3 + 1] = Math.random() * 12;
      this.snowPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
      this.snowSpeed[i] = 0.5 + Math.random() * 0.7;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffffff", size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9 }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);

    // Start centered between the rift and the nexus.
    const n = this.nexusCenter(), s = game.world.spawners[0]!;
    this.target.set((n.x + s[0] + 0.5) / 2 + 1, 0, (n.z + s[1] + 0.5) / 2 + 1);
    this.resize();
  }

  // ------------------------------------------------------------------ setup

  private buildTerrain(): void {
    const w = this.game.world;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.mat.snow);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    for (const r of w.map.rocks) {
      const m = this.models.create("rock", { scale: r.h, seed: r.x * 31 + r.y });
      m.position.set(r.x + 0.5, 0, r.y + 0.5);
      this.scene.add(m);
    }
    for (const t of w.map.trees) {
      const m = this.models.create("tree", { scale: t.s, seed: t.x * 17 + t.y });
      m.position.set(t.x + 0.5, 0, t.y + 0.5);
      this.scene.add(m);
    }
    // Decorative snow drifts away from anything important.
    const b = w.bounds();
    for (let i = 0; i < 90; i++) {
      const x = b.x0 - 6 + hash(i, 1, 7) * (b.x1 - b.x0 + 12), z = b.y0 - 6 + hash(i, 2, 7) * (b.y1 - b.y0 + 12);
      const cx = Math.floor(x), cz = Math.floor(z);
      let near = false;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (w.isNexus(cx + dx, cz + dz) || w.isSpawner(cx + dx, cz + dz)) near = true;
      if (near) continue;
      const m = this.models.create("snowMound", { scale: 0.3 + hash(i, 3, 7) * 0.3 });
      m.position.set(x, 0, z);
      this.scene.add(m);
    }
  }

  private nexusCenter(): THREE.Vector3 {
    const cells = this.game.world.map.nexus;
    const x = cells.reduce((a, c) => a + c[0] + 0.5, 0) / cells.length;
    const z = cells.reduce((a, c) => a + c[1] + 0.5, 0) / cells.length;
    return new THREE.Vector3(x, 0, z);
  }

  private buildNexusAndRifts(): THREE.Object3D {
    const nexus = this.models.create("nexus");
    nexus.position.copy(this.nexusCenter());
    this.scene.add(nexus);
    this.animated.push(nexus);
    for (const [x, y] of this.game.world.spawners) {
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
    const s = this.shake > 0 ? 0.05 : 0;
    this.camera.position.copy(this.target).add(CAM_OFFSET);
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.target.x, 0, this.target.z);
    this.camera.updateMatrixWorld();
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
    this.panBy((right - up) * k, (-right - up) * k);
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

  render(frameDt: number, simDt: number, o: Overlay, events: readonly GameEvent[]): void {
    this.time += frameDt;
    const t = this.time;
    // Sync first so shots from this frame find their towers and targets.
    this.syncPieces(o.hoverPieceId);
    this.syncTowers();
    for (const ev of events) {
      if (ev.type === "placed") this.onPlaced(ev.piece);
      else if (ev.type === "walker-arrived") (this.nexus.userData.flash as () => void)();
      else if (ev.type === "tower-built") { const v = this.towers.get(ev.tower.id); if (v) v.drop = 0.12; }
      else if (ev.type === "shot") this.onShot(ev.shot);
      else if (ev.type === "hit") { const w = this.walkers.get(ev.walker.id); if (w) w.userData.flash = 0.09; }
      else if (ev.type === "killed") this.onKilled(ev.walker.x, ev.walker.y);
      else if (ev.type === "reset") this.clearFx();
    }
    this.syncWalkers(simDt);
    this.aimTowers(simDt);
    this.updateBolts(simDt);
    this.updateGhost(o);
    this.updateTowerGhost(o);
    this.updatePath(o);

    this.cursor.visible = !!o.hoverCell && !o.ghost;
    if (o.hoverCell) this.cursor.position.set(o.hoverCell[0], 0.02, o.hoverCell[1]);
    this.grid.visible = o.showGrid;

    for (const a of this.animated) (a.userData.update as (t: number, dt: number) => void)?.(t, frameDt);
    this.updateFx(frameDt);

    this.shake = Math.max(0, this.shake - frameDt);
    this.placeCamera();
    this.sun.position.set(this.target.x + EVENING.sunOffset[0], EVENING.sunOffset[1], this.target.z + EVENING.sunOffset[2]);
    this.sun.target.position.set(this.target.x, 0, this.target.z);
    const sc = Math.max(16, this.zoom * 2.4);
    Object.assign(this.sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  private onPlaced(p: PlacedPiece): void {
    this.syncPieces(null);
    const v = this.pieces.get(p.id);
    if (v) v.drop = 0.14;
  }

  private buildPiece(p: PlacedPiece): PieceView {
    const group = this.models.create("wallPiece", { cells: p.cells, variant: p.id % 2 });
    const bodies: THREE.Mesh[] = [];
    group.traverse(c => { if (c.name === "body") bodies.push(c as THREE.Mesh); });
    this.scene.add(group);
    return { group, drop: 0, bodies, cells: p.cells };
  }

  private syncPieces(hoverId: number | null): void {
    const alive = new Set<number>();
    for (const p of this.game.pieces) {
      alive.add(p.id);
      let v = this.pieces.get(p.id);
      if (!v) { v = this.buildPiece(p); this.pieces.set(p.id, v); }
      const variant = p.id % 2;
      const m = p.id === hoverId ? this.mat.wallHover : p.locked ? (variant ? this.mat.wallB : this.mat.wallA) : (variant ? this.mat.wallLooseB : this.mat.wallLooseA);
      for (const b of v.bodies) b.material = m;
    }
    for (const [id, v] of this.pieces) if (!alive.has(id)) { this.scene.remove(v.group); this.pieces.delete(id); }
    const pulse = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(this.time * 3));
    this.mat.wallLooseA.emissiveIntensity = this.mat.wallLooseB.emissiveIntensity = pulse;
  }

  private syncWalkers(simDt: number): void {
    const alive = new Set<number>();
    for (const w of this.game.walkers) {
      alive.add(w.id);
      let o = this.walkers.get(w.id);
      if (!o) { o = this.models.create("walker"); this.scene.add(o); this.walkers.set(w.id, o); o.userData.bob = Math.random() * 6; }
      o.userData.bob += simDt * 9;
      o.userData.flash = Math.max(0, ((o.userData.flash as number) ?? 0) - simDt);
      const wm = o.userData.material as THREE.MeshStandardMaterial;
      const hot = (o.userData.flash as number) > 0;
      wm.emissive.set(hot ? "#ffffff" : "#7a4ce6");
      wm.emissiveIntensity = hot ? 0.9 : 0.3;
      this.syncBar(w.id, w.x, w.y, w.hp / w.maxHp);
      o.position.set(w.x, 0.2 + Math.abs(Math.sin(o.userData.bob as number)) * 0.1, w.y);
      const dx = w.tx + 0.5 - w.x, dz = w.ty + 0.5 - w.y;
      if (dx * dx + dz * dz > 1e-6) {
        const want = Math.atan2(dx, dz);
        let d = want - o.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        o.rotation.y += d * Math.min(1, simDt * 14);
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
    b.position.set(x, 0.72, y);
    b.quaternion.copy(this.camera.quaternion);
    b.getObjectByName("fill")!.scale.x = Math.max(0.001, frac);
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
    const v = this.towers.get(s.towerId);
    const target = this.walkers.get(s.targetId);
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

  private onKilled(x: number, y: number): void {
    this.addFlash(new THREE.Vector3(x, 0.25, y), this.glows.kill, 0.9, 0.22);
    this.puff(x, y, 0.15);
  }

  private clearFx(): void {
    for (const b of this.bolts) this.scene.remove(b.mesh);
    for (const f of this.flashes) this.scene.remove(f.sprite);
    this.bolts = []; this.flashes = [];
  }

  private updateTowerGhost(o: Overlay): void {
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

  private updateGhost(o: Overlay): void {
    const g = o.ghost;
    const lift = 0.3 + Math.sin(this.time * 4) * 0.05;
    for (let i = 0; i < 4; i++) {
      const c = g?.cells[i];
      const mesh = this.ghostCells[i]!, foot = this.ghostFeet[i]!;
      mesh.visible = foot.visible = !!c;
      if (!c) continue;
      mesh.position.set(c[0] + 0.5, lift, c[1] + 0.5);
      mesh.material = g!.valid ? this.mat.ghostOk : this.mat.ghostBad;
      foot.position.set(c[0] + 0.5, 0.012, c[1] + 0.5);
      foot.material = g!.valid ? this.mat.footOk : this.mat.footBad;
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

    // Flakes live in the world, not on the camera: they fall and drift on their own,
    // and wrap around the edges of the area around the camera so it never runs out of snow.
    const N = this.snowSpeed.length, H = 18, p = this.snowPos;
    for (let i = 0; i < N; i++) {
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
