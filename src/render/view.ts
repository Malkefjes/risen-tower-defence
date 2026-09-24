import * as THREE from "three";
import type { Game, PlacedPiece } from "../sim/game";
import { cellKey, type Cell } from "../sim/types";
import { createDefaultModels, createGlows, createMaterials, EVENING, hash, type Materials, type ModelLibrary } from "./models";

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
}

const CAM_OFFSET = new THREE.Vector3(20, 16.33, 20); // ~30° elevation, 45° around: classic iso
const LAMP_LIGHTS = 8;
const ZOOM_MIN = 3.2, ZOOM_MAX = 11;

interface PieceView { group: THREE.Group; drop: number; bodies: THREE.Mesh[]; lamp: THREE.Vector3 | null }

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
  private animated: THREE.Object3D[] = [];
  private nexus: THREE.Object3D;
  private lampLights: THREE.PointLight[] = [];
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
    for (let i = 0; i < LAMP_LIGHTS; i++) {
      const l = new THREE.PointLight(P.lamp, 0, 3.8, 2);
      this.lampLights.push(l);
      this.scene.add(l);
    }

    this.buildTerrain();
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

  render(frameDt: number, simDt: number, o: Overlay): void {
    this.time += frameDt;
    const t = this.time;
    for (const ev of this.game.drainEvents()) {
      if (ev.type === "placed") this.onPlaced(ev.piece);
      else if (ev.type === "walker-arrived") (this.nexus.userData.flash as () => void)();
    }
    this.syncPieces(o.hoverPieceId);
    this.syncWalkers(simDt);
    this.updateGhost(o);
    this.updatePath(o);
    this.updateLamps();

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
    const group = new THREE.Group();
    const variant = p.id % 2;
    const bodies: THREE.Mesh[] = [];
    const own = new Set(p.cells.map(([x, y]) => cellKey(x, y)));
    const w = this.game.world;
    for (const [x, y] of p.cells) {
      const cell = this.models.create("wall", { variant });
      cell.position.set(x + 0.5, 0, y + 0.5);
      bodies.push(cell.getObjectByName("body") as THREE.Mesh);
      group.add(cell);
    }
    // Lamp on the first free, camera-facing side of the piece.
    let lamp: THREE.Vector3 | null = null;
    const faces: [number, number, number][] = [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]];
    outer: for (const [x, y] of p.cells) {
      for (const [dx, dy, rot] of faces) {
        if (own.has(cellKey(x + dx, y + dy)) || w.walls.has(cellKey(x + dx, y + dy))) continue;
        const l = this.models.create("lamp");
        l.position.set(x + 0.5, 0, y + 0.5); l.rotation.y = rot;
        group.add(l);
        lamp = new THREE.Vector3(x + 0.5 + dx * 1.1, 0.7, y + 0.5 + dy * 1.1);
        break outer;
      }
    }
    // Windows on some camera-facing sides.
    for (const [x, y] of p.cells) {
      if (hash(x, y, 11) > 0.55) continue;
      const side = !own.has(cellKey(x, y + 1)) ? [0, 0] : !own.has(cellKey(x + 1, y)) ? [1, Math.PI / 2] : null;
      if (!side) continue;
      const win = this.models.create("window");
      win.position.set(x + 0.5, 0, y + 0.5); win.rotation.y = side[1]!;
      group.add(win);
    }
    this.scene.add(group);
    return { group, drop: 0, bodies, lamp };
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

  /** A fixed pool of point lights follows the lamps nearest the view (keeps shaders stable). */
  private updateLamps(): void {
    const lamps: THREE.Vector3[] = [];
    for (const v of this.pieces.values()) if (v.lamp) lamps.push(v.lamp);
    lamps.sort((a, b) => a.distanceToSquared(this.target) - b.distanceToSquared(this.target));
    this.lampLights.forEach((l, i) => {
      const p = lamps[i];
      if (!p) { l.intensity = 0; return; }
      l.position.copy(p);
      l.intensity = 1.6 * (1 + Math.sin(this.time * 7 + i * 2.3) * 0.04 + Math.sin(this.time * 13 + i) * 0.03);
    });
    this.mat.lamp.emissiveIntensity = 0.75 + Math.sin(this.time * 1.6) * 0.2;
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
        v.group.children.forEach(c => { if (c.getObjectByName("body")) this.puff(c.position.x, c.position.z); });
      }
    }
    for (const p of this.puffs) {
      p.life -= dt;
      p.v.y -= 6 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.02) { p.mesh.position.y = 0.02; p.v.set(0, 0, 0); }
      p.mesh.scale.setScalar(Math.max(0.01, p.life / 0.5));
    }
    this.puffs = this.puffs.filter(p => { if (p.life > 0) return true; this.scene.remove(p.mesh); return false; });

    const N = this.snowSpeed.length;
    for (let i = 0; i < N; i++) {
      this.snowPos[i * 3 + 1]! -= this.snowSpeed[i]! * dt;
      this.snowPos[i * 3]! += Math.sin(this.time + i) * 0.12 * dt;
      if (this.snowPos[i * 3 + 1]! < 0) this.snowPos[i * 3 + 1] = 12;
    }
    this.snow.position.set(this.target.x, 0, this.target.z);
    this.snow.geometry.attributes.position!.needsUpdate = true;
  }

  private puff(x: number, z: number): void {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), this.mat.puff);
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 1.2;
      m.position.set(x + Math.cos(a) * 0.45, 0.05, z + Math.sin(a) * 0.45);
      this.scene.add(m);
      this.puffs.push({ mesh: m, v: new THREE.Vector3(Math.cos(a) * s, 1.5 + Math.random() * 1.5, Math.sin(a) * s), life: 0.5 });
    }
  }
}
