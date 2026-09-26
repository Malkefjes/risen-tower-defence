import * as THREE from "three";
import type { Game } from "../sim/game";
import { TOWER_TOP } from "../sim/towers";
import { cellKey } from "../sim/types";
import { DECK_TOP, type Materials } from "./models";

/**
 * The colony's lights: the base glows warmer the more you build, a warm island in the
 * blue evening; anything unsupplied stays dark. Three looks while Erik picks:
 *
 * - A · Warm glow: warm pools on the snow round towers, the ship and smelters, a faint
 *   wash along supplied walls, and a small lamp on each tower.
 * - B · Cyan power: the plated walls' power lines glow bright, towers carry cyan status
 *   lights, and faint cyan pools lie under them.
 * - C · Lanterns: a small lantern on each supplied wall piece with a warm pool under it,
 *   and a big warm floodlight pool at the ship.
 *
 * Pools don't add light (bright snow would wash out to white): they tint the snow, drawn
 * in bulk (one instanced mesh per colour), refreshed a few times a second.
 */
export type LightLook = "off" | "a" | "b" | "c";

const WARM = "#ffb46e", CYAN = "#5fe6d6";

let poolTex: THREE.Texture | undefined;
function poolTexture(): THREE.Texture {
  if (poolTex) return poolTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!, rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.5, "rgba(255,255,255,.6)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return (poolTex = new THREE.CanvasTexture(c));
}

/** Soft coloured discs on the ground, drawn as one instanced mesh. */
class Pools {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  private n = 0;
  constructor(color: string, opacity: number, max = 800) {
    const mat = new THREE.MeshBasicMaterial({ color, map: poolTexture(), transparent: true, opacity, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
  }
  begin(): void { this.n = 0; }
  add(x: number, y: number, z: number, radius: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(radius * 2, radius * 2, 1));
    this.mesh.setMatrixAt(this.n++, this.m);
  }
  end(): void { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
}

export class ColonyLights {
  look: LightLook = "off";
  private root = new THREE.Group();
  private warm = new Pools(WARM, 0.55);
  private cyan = new Pools(CYAN, 0.4);
  private lamps: THREE.Sprite[] = [];
  private lanternPost: THREE.InstancedMesh;
  private lanternLamp: THREE.InstancedMesh;
  private t = 0;
  private powerBase: number;

  constructor(scene: THREE.Scene, private mat: Materials, private glows: { muzzle: THREE.SpriteMaterial; cyan: THREE.SpriteMaterial }) {
    this.root.add(this.warm.mesh, this.cyan.mesh);
    const post = new THREE.CylinderGeometry(0.025, 0.03, 0.34, 5).translate(0, 0.17, 0);
    const lamp = new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, 0.39, 0);
    this.lanternPost = new THREE.InstancedMesh(post, mat.gunDark, 400);
    this.lanternLamp = new THREE.InstancedMesh(lamp, new THREE.MeshStandardMaterial({ color: "#ffd9a8", emissive: WARM, emissiveIntensity: 1.4 }), 400);
    for (const m of [this.lanternPost, this.lanternLamp]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; this.root.add(m); }
    this.powerBase = mat.power.emissiveIntensity;
    scene.add(this.root);
  }

  setLook(look: LightLook): void { this.look = look; this.t = 0; }

  update(game: Game, dt: number): void {
    // A gentle flicker on the lamps; the layout itself refreshes a few times a second.
    const flick = 0.9 + 0.1 * Math.sin(performance.now() / 180);
    for (const s of this.lamps) s.material.opacity = (s.userData.base as number) * flick;
    this.mat.power.emissiveIntensity = this.look === "b" ? 1.5 : this.powerBase;
    if ((this.t -= dt) > 0) return;
    this.t = 0.4;
    this.rebuild(game);
  }

  private rebuild(game: Game): void {
    this.warm.begin(); this.cyan.begin();
    for (const s of this.lamps) { this.root.remove(s); s.material.dispose(); }
    this.lamps = [];
    let lanterns = 0;
    const look = this.look;
    const on = (x: number, y: number) => game.supplied.has(cellKey(x, y));
    const lamp = (x: number, y: number, z: number, size: number, cyan: boolean, base = 0.85) => {
      const s = new THREE.Sprite((cyan ? this.glows.cyan : this.glows.muzzle).clone());
      s.position.set(x, y, z);
      s.scale.setScalar(size);
      s.userData.base = base;
      this.root.add(s);
      this.lamps.push(s);
    };
    if (look !== "off" && !game.shipDown) {
      const cells = game.world.map.ship, sx = cells.reduce((a, c) => a + c[0] + 0.5, 0) / cells.length, sz = cells.reduce((a, c) => a + c[1] + 0.5, 0) / cells.length;
      if (look === "a") this.warm.add(sx, 0.03, sz, 4.2);
      if (look === "b") this.cyan.add(sx, 0.03, sz, 3.6);
      if (look === "c") this.warm.add(sx, 0.03, sz, 5.5);
      for (const t of game.towers) {
        if (!t.cells.some(([x, y]) => on(x, y))) continue;
        const top = DECK_TOP + TOWER_TOP[t.size - 1]!;
        if (look === "a") { this.warm.add(t.cx, 0.03, t.cy, 1.3 + t.size * 0.5); lamp(t.cx, top + 0.12, t.cy, 0.35 + t.size * 0.08, false); }
        if (look === "b") { this.cyan.add(t.cx, 0.03, t.cy, 1.1 + t.size * 0.4); lamp(t.cx, top + 0.1, t.cy, 0.28 + t.size * 0.06, true); }
      }
      for (const s of game.smelters) {
        if (!s.cells.some(([x, y]) => on(x, y))) continue;
        if (look === "a" || look === "c") this.warm.add(s.cx, 0.03, s.cy, 2.2);
      }
      for (const p of game.pieces) {
        if (!game.pieceSupplied(p) || !p.cells.length) continue;
        const cx = p.cells.reduce((a, c) => a + c[0] + 0.5, 0) / p.cells.length, cz = p.cells.reduce((a, c) => a + c[1] + 0.5, 0) / p.cells.length;
        // Wall pools reach past the wall onto the snow beside it.
        if (look === "a") for (const [x, y] of p.cells) this.warm.add(x + 0.5, 0.03, y + 0.5, 1.5);
        if (look === "b" && p.metal) for (const [x, y] of p.cells) this.cyan.add(x + 0.5, 0.03, y + 0.5, 1.4);
        if (look === "c") {
          // A lantern on the piece's cell nearest its middle, on the deck.
          const [lx, ly] = p.cells.reduce((b, c) => Math.hypot(c[0] + 0.5 - cx, c[1] + 0.5 - cz) < Math.hypot(b[0] + 0.5 - cx, b[1] + 0.5 - cz) ? c : b);
          if (game.towerAt(lx, ly)) continue;
          const m = new THREE.Matrix4().makeTranslation(lx + 0.5, DECK_TOP, ly + 0.5);
          if (lanterns < 400) { this.lanternPost.setMatrixAt(lanterns, m); this.lanternLamp.setMatrixAt(lanterns, m); lanterns++; }
          this.warm.add(lx + 0.5, 0.03, ly + 0.5, 1.8);
          lamp(lx + 0.5, DECK_TOP + 0.4, ly + 0.5, 0.5, false, 0.75);
        }
      }
    }
    this.lanternPost.count = this.lanternLamp.count = lanterns;
    this.lanternPost.instanceMatrix.needsUpdate = this.lanternLamp.instanceMatrix.needsUpdate = true;
    this.warm.end(); this.cyan.end();
  }
}
