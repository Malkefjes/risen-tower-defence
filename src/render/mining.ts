import * as THREE from "three";
import type { Game, GameEvent } from "../sim/game";
import { NODE_SIZE, type OreNode } from "../sim/ore";
import { createOreNode, type OreNodeModel } from "./ore";

/**
 * Everything the player sees while mining: the node
 * models breaking stage by stage, chunk bursts, the hotspot glint on the node
 * in reach, and sparks off the multitool's beam.
 */

/** How close to the hotspot the cursor must be to count as on it (world units on the node, and a share of the screen). */
const HOTSPOT_RADIUS = 0.42, HOTSPOT_SCREEN = 0.018;
/** Camera offset direction, for putting hotspots on the side that faces the player. */
const TO_CAMERA = new THREE.Vector3(20, 16.33, 20).normalize();

interface NodeView { model: OreNodeModel; spot: THREE.Vector3 | null }
interface Bit { m: THREE.Mesh; v: THREE.Vector3; life: number }

function spriteTexture(draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  draw(c.getContext("2d")!);
  return new THREE.CanvasTexture(c);
}

export class MiningView {
  private nodes = new Map<number, NodeView>();
  private glint: THREE.Sprite;
  private ring: THREE.Sprite;
  private bits: Bit[] = [];
  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** The node whose glint is shown, and where the glint is gliding from/to. */
  private shown: OreNode | null = null;
  private spotPos = new THREE.Vector3();
  private spotFrom = new THREE.Vector3();
  private spotMove = 1;
  private targetW = 0;
  private spin = 0;
  private time = 0;
  private sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
  private chunkGeo = new THREE.DodecahedronGeometry(0.06, 0);
  private sparkMat = new THREE.MeshBasicMaterial({ color: "#e8f4ff" });
  private whiteMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  private stoneMat = new THREE.MeshStandardMaterial({ color: "#4a4f5c", flatShading: true });
  private metalMat = new THREE.MeshStandardMaterial({ color: "#adb8c6", metalness: 0.7, roughness: 0.25, flatShading: true });
  /** A stage broke off: the view shakes the camera a little. */
  shake = 0;

  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private game: Game) {
    for (const n of game.nodes) {
      const model = createOreNode(NODE_SIZE, n.id * 7919 + n.x * 31 + n.y, n.kind);
      model.object.position.set(n.x + NODE_SIZE / 2, 0, n.y + NODE_SIZE / 2);
      scene.add(model.object);
      this.nodes.set(n.id, { model, spot: null });
    }
    // Drawn on top of everything, so the rocks can never hide it.
    const glintTex = spriteTexture(g => {
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, "rgba(255,255,255,.9)"); rg.addColorStop(0.08, "rgba(255,248,225,.75)"); rg.addColorStop(0.28, "rgba(255,230,170,.18)"); rg.addColorStop(1, "rgba(255,230,170,0)");
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
      // A four-point star so it reads as a glint, not just a blob.
      g.fillStyle = "rgba(255,255,255,.7)";
      g.beginPath(); g.moveTo(32, 2); g.lineTo(35, 29); g.lineTo(62, 32); g.lineTo(35, 35); g.lineTo(32, 62); g.lineTo(29, 35); g.lineTo(2, 32); g.lineTo(29, 29); g.closePath(); g.fill();
    });
    const ringTex = spriteTexture(g => { g.strokeStyle = "#fff"; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.stroke(); });
    const sprite = (map: THREE.Texture) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
      s.visible = false; s.renderOrder = 5; scene.add(s);
      return s;
    };
    this.glint = sprite(glintTex);
    this.ring = sprite(ringTex);
  }

  /** The node's model, for aiming at it. */
  private view(n: OreNode): NodeView { return this.nodes.get(n.id)!; }

  /** Give the node a new hotspot on one of its remaining rocks, preferring the side facing the camera. */
  private placeSpot(n: OreNode): void {
    const v = this.view(n), pts = v.model.surfacePoints();
    if (!pts.length) { v.spot = null; return; }
    const c = new THREE.Vector3(n.x + NODE_SIZE / 2, 0, n.y + NODE_SIZE / 2);
    const good = pts.filter(p => p.clone().sub(c).setY(0).dot(TO_CAMERA) > -0.1 && (!v.spot || p.distanceTo(v.spot) > 0.35));
    const list = good.length ? good : pts;
    v.spot = list[Math.floor(Math.random() * list.length)]!.clone();
  }

  /** Where the tool points: the node in reach under the cursor (or its middle), else the cursor on the ground. */
  aimPoint(ndc: THREE.Vector2, node: OreNode | null, fallback: THREE.Vector3): THREE.Vector3 {
    this.raycaster.setFromCamera(ndc, this.camera);
    if (node) {
      const hit = this.raycaster.intersectObject(this.view(node).model.object, true)[0];
      return hit ? hit.point : new THREE.Vector3(node.x + NODE_SIZE / 2, 0.4, node.y + NODE_SIZE / 2);
    }
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, p) ?? fallback;
  }

  /** Is the cursor on this node's hotspot? */
  onHotspot(ndc: THREE.Vector2, node: OreNode | null, aspect: number): boolean {
    const v = node && this.view(node);
    if (!v?.spot || this.shown !== node) return false;
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(v.model.object, true)[0];
    if (hit && hit.point.distanceTo(this.spotPos) < HOTSPOT_RADIUS) return true;
    // Also accept aiming straight at the glint itself.
    const s = this.spotPos.clone().project(this.camera);
    return Math.hypot(s.x - ndc.x, (s.y - ndc.y) / aspect) < HOTSPOT_SCREEN;
  }

  /** Stage breaks and regrowth, from the game's events. */
  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === "node-grew") { const v = this.view(e.node); v.spot = null; v.model.setAmount(1); }
      if (e.type === "reset") for (const n of this.game.nodes) { const v = this.view(n); v.spot = null; v.model.setAmount(1); }
      if (e.type !== "node-broke") continue;
      // Nudged down a hair, so a node sitting exactly on a stage line shows that stage broken.
      const broke = this.view(e.node).model.setAmount((e.node.amount - 1e-6) / e.node.max);
      for (const p of broke) this.burst(p, e.node.kind === "metal");
      if (e.stagesLeft > 0 && this.shown === e.node) { this.spotFrom.copy(this.spotPos); this.spotMove = 0; this.placeSpot(e.node); }
    }
  }

  /**
   * Per frame. `node`: the node in reach; `firing`: the tool is on; `onSpot`:
   * the cursor is on the hotspot; `tip`: the end of the beam, in world space.
   */
  update(dt: number, node: OreNode | null, firing: boolean, onSpot: boolean, tip: THREE.Vector3 | null): void {
    this.time += dt;
    const mining = firing && !!node;
    // The first hit on a node reveals its hotspot.
    if (mining && node && !this.view(node).spot) this.placeSpot(node);
    if (node !== this.shown) {
      this.shown = node;
      const spot = node && this.view(node).spot;
      if (spot) { this.spotPos.copy(spot); this.spotMove = 1; }
    }
    const spot = node ? this.view(node).spot : null;
    this.spotMove = Math.min(1, this.spotMove + dt * 5);
    if (spot) this.spotPos.lerpVectors(this.spotFrom, spot, 1 - (1 - this.spotMove) ** 2);

    // Two clear states: idle (small, soft) and targeted (bright, bigger, spinning, with a ring).
    const g = this.glint, r = this.ring;
    g.visible = !!spot && !!node && node.amount > 0;
    this.targetW += ((onSpot ? 1 : 0) - this.targetW) * Math.min(1, dt * 14);
    g.position.copy(this.spotPos).y -= 0.05;
    g.scale.setScalar((0.3 + 0.2 * this.targetW) * (1 + Math.sin(this.time * (6 + 10 * this.targetW)) * 0.1));
    g.material.opacity = 0.6 + 0.4 * this.targetW;
    this.spin += dt * (0.8 + 5 * this.targetW);
    g.material.rotation = this.spin;
    r.visible = g.visible && this.targetW > 0.05;
    const rp = (this.time * 1.8) % 1;
    r.position.copy(g.position);
    r.scale.setScalar(0.25 + rp * 0.45);
    r.material.opacity = (1 - rp) * 0.8 * this.targetW;
    if (mining && onSpot && Math.random() < dt * 25) this.spark(g.position, this.whiteMat, 0.3);

    if (firing && tip && Math.random() < dt * (mining ? 40 : 12)) {
      const chip = mining && Math.random() < 0.3 ? (node!.kind === "metal" ? this.metalMat : this.stoneMat) : null;
      this.spark(tip, chip ?? this.sparkMat, chip ? 0.6 : 0.3);
    }
    for (const b of this.bits) {
      b.life -= dt; b.v.y -= 7 * dt; b.m.position.addScaledVector(b.v, dt);
      if (b.m.position.y < 0.02) { b.m.position.y = 0.02; b.v.set(0, 0, 0); }
      b.m.scale.setScalar(Math.max(0.01, Math.min(1, b.life / 0.3)));
    }
    this.bits = this.bits.filter(b => { if (b.life > 0) return true; this.scene.remove(b.m); return false; });
    this.shake = Math.max(0, this.shake - dt);
  }

  /** A rock breaking off: a burst of ore chunks and a small shake. */
  private burst(at: THREE.Vector3, metal: boolean): void {
    this.shake = Math.max(this.shake, 0.12);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(this.chunkGeo, metal ? this.metalMat : this.stoneMat);
      m.position.copy(at);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.scene.add(m);
      this.bits.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3), life: 0.9 });
    }
  }

  private spark(at: THREE.Vector3, mat: THREE.Material, life: number): void {
    const m = new THREE.Mesh(this.sparkGeo, mat);
    m.position.copy(at);
    this.scene.add(m);
    this.bits.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 2, 0.8 + Math.random() * 1.4, (Math.random() - 0.5) * 2), life });
  }
}
