import { computeField, keysOf, type FlowField } from "./pathfinding";
import { pieceCells, SHAPE_IDS, type ShapeId } from "./pieces";
import { Rng } from "./rng";
import { cellKey, type Cell } from "./types";
import { World, type MapDef } from "./world";

export const HAND_SIZE = 3;
export const OPENING_DRAFTS = 3;
export const DRAFT_OPTIONS = 3;
export const TICK = 1 / 60;

export type Phase = "draft" | "planning" | "wave";

export interface HandPiece { uid: number; shape: ShapeId }

export interface PlacedPiece {
  id: number;
  shape: ShapeId;
  rot: number;
  at: Cell;
  cells: Cell[];
  /** Locked pieces are permanent. Unlocked ones can be picked back up this planning phase. */
  locked: boolean;
}

export interface Walker {
  id: number;
  /** Continuous position; a cell's center is (x + 0.5, y + 0.5). */
  x: number; y: number;
  /** Cell it last stood in, and the cell it's walking to. */
  cx: number; cy: number;
  tx: number; ty: number;
  speed: number;
}

export interface Draft {
  options: ShapeId[];
  opening: boolean;
}

export type BlockReason = "occupied" | "walker" | "cuts-off-rift" | "traps-walker";

export type PlacementCheck =
  | { ok: true; cells: Cell[]; field: FlowField }
  | { ok: false; cells: Cell[]; reason: BlockReason };

export type GameEvent =
  | { type: "placed"; piece: PlacedPiece }
  | { type: "removed"; piece: PlacedPiece }
  | { type: "walker-arrived"; walker: Walker }
  | { type: "phase"; phase: Phase };

export const REASON_TEXT: Record<BlockReason, string> = {
  "occupied": "Something is already there",
  "walker": "An enemy is in the way",
  "cuts-off-rift": "Enemies must always have a path to the nexus",
  "traps-walker": "That would trap an enemy",
};

export interface GameOptions { seed?: number; waveSize?: (round: number) => number }

/** All game rules for the placement prototype (Phase 1, step 1). No graphics. */
export class Game {
  readonly world: World;
  readonly rng: Rng;
  phase: Phase = "draft";
  /** Rounds completed; the first wave is round 1. */
  round = 1;
  hand: HandPiece[] = [];
  draft: Draft | null = null;
  openingDraftsLeft = OPENING_DRAFTS;
  pieces: PlacedPiece[] = [];
  walkers: Walker[] = [];
  field: FlowField;
  events: GameEvent[] = [];
  /** Spawn practice walkers during planning so rerouting can be watched. */
  testWalkers = false;

  private nextId = 1;
  private waveLeft = 0;
  private spawnTimer = 0;
  private waveSize: (round: number) => number;

  constructor(map: MapDef, opts: GameOptions = {}) {
    this.world = new World(map);
    this.rng = new Rng(opts.seed ?? Date.now());
    this.waveSize = opts.waveSize ?? (r => 6 + r * 2);
    this.field = computeField(this.world);
    this.openDraft(true);
  }

  // ---------------------------------------------------------------- drafting

  private openDraft(opening: boolean): void {
    this.draft = { options: this.rng.pickDistinct(SHAPE_IDS, DRAFT_OPTIONS), opening };
    this.setPhase("draft");
  }

  get handFull(): boolean { return this.hand.length >= HAND_SIZE; }

  /**
   * Take draft option `index`. With a full hand, `discardUid` names the held
   * piece to give up. Returns false if the pick can't happen yet.
   */
  pickDraft(index: number, discardUid?: number): boolean {
    const d = this.draft;
    if (this.phase !== "draft" || !d) return false;
    const shape = d.options[index];
    if (!shape) return false;
    if (this.handFull) {
      const i = this.hand.findIndex(h => h.uid === discardUid);
      if (i < 0) return false;
      this.hand.splice(i, 1);
    }
    this.hand.push({ uid: this.nextId++, shape });
    this.afterDraft();
    return true;
  }

  skipDraft(): void {
    if (this.phase !== "draft") return;
    this.afterDraft();
  }

  private afterDraft(): void {
    const opening = this.draft?.opening ?? false;
    this.draft = null;
    if (opening && --this.openingDraftsLeft > 0) { this.openDraft(true); return; }
    this.setPhase("planning");
  }

  // ---------------------------------------------------------------- placement

  canPlaceNow(): boolean { return this.phase === "planning" || this.phase === "wave"; }

  /** Would placing `shape` at `at` be legal? On success also returns the resulting flow field. */
  checkPlacement(shape: ShapeId, rot: number, at: Cell): PlacementCheck {
    const cells = pieceCells(shape, rot, at);
    for (const [x, y] of cells) if (this.world.isOccupied(x, y)) return { ok: false, cells, reason: "occupied" };
    const set = keysOf(cells);
    for (const w of this.walkers) {
      if (set.has(cellKey(w.cx, w.cy)) || set.has(cellKey(w.tx, w.ty))) return { ok: false, cells, reason: "walker" };
    }
    const field = computeField(this.world, set, cells);
    for (const [sx, sy] of this.world.spawners) if (!isFinite(field.at(sx, sy))) return { ok: false, cells, reason: "cuts-off-rift" };
    for (const w of this.walkers) if (!isFinite(field.at(w.tx, w.ty))) return { ok: false, cells, reason: "traps-walker" };
    return { ok: true, cells, field };
  }

  /** Place a held piece. Pieces placed during a wave lock immediately. */
  place(handUid: number, rot: number, at: Cell): PlacementCheck & { piece?: PlacedPiece } {
    const hi = this.hand.findIndex(h => h.uid === handUid);
    const held = this.hand[hi];
    if (!this.canPlaceNow() || !held) return { ok: false, cells: [], reason: "occupied" };
    const check = this.checkPlacement(held.shape, rot, at);
    if (!check.ok) return check;
    this.hand.splice(hi, 1);
    const piece: PlacedPiece = { id: this.nextId++, shape: held.shape, rot, at, cells: check.cells, locked: this.phase === "wave" };
    this.pieces.push(piece);
    for (const [x, y] of piece.cells) this.world.walls.set(cellKey(x, y), piece.id);
    this.field = computeField(this.world);
    this.events.push({ type: "placed", piece });
    return { ...check, piece };
  }

  pieceAt(x: number, y: number): PlacedPiece | undefined {
    const id = this.world.walls.get(cellKey(x, y));
    return id === undefined ? undefined : this.pieces.find(p => p.id === id);
  }

  canPickUp(piece: PlacedPiece | undefined): piece is PlacedPiece {
    return !!piece && !piece.locked && this.phase === "planning" && !this.handFull;
  }

  /** Return an unlocked piece to the hand. Returns the new hand entry. */
  pickUp(pieceId: number): HandPiece | null {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canPickUp(piece)) return null;
    this.pieces.splice(this.pieces.indexOf(piece), 1);
    for (const [x, y] of piece.cells) this.world.walls.delete(cellKey(x, y));
    this.field = computeField(this.world);
    const entry: HandPiece = { uid: this.nextId++, shape: piece.shape };
    this.hand.push(entry);
    this.events.push({ type: "removed", piece });
    return entry;
  }

  /** Undo the most recent unlocked placement. */
  undo(): PlacedPiece | null {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (!p.locked) return this.pickUp(p.id) ? p : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- waves

  startWave(): boolean {
    if (this.phase !== "planning") return false;
    for (const p of this.pieces) p.locked = true;
    this.walkers = [];
    this.waveLeft = this.waveSize(this.round);
    this.spawnTimer = 0;
    this.setPhase("wave");
    return true;
  }

  get waveRemaining(): number { return this.waveLeft + this.walkers.length; }

  private spawnWalker(): void {
    for (const [sx, sy] of this.world.spawners) {
      this.walkers.push({ id: this.nextId++, x: sx + 0.5, y: sy + 0.5, cx: sx, cy: sy, tx: sx, ty: sy, speed: 1.35 + this.rng.next() * 0.25 });
    }
  }

  /** Advance the simulation by one fixed tick. */
  step(dt = TICK): void {
    if (this.phase === "wave") {
      this.spawnTimer -= dt;
      if (this.waveLeft > 0 && this.spawnTimer <= 0) { this.spawnWalker(); this.waveLeft--; this.spawnTimer = 0.9; }
    } else if (this.phase === "planning" && this.testWalkers) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnWalker(); this.spawnTimer = 1.6; }
    }
    this.moveWalkers(dt);
    if (this.phase === "wave" && this.waveLeft === 0 && this.walkers.length === 0) {
      this.round++;
      this.openDraft(false);
    }
  }

  private moveWalkers(dt: number): void {
    const arrived: Walker[] = [];
    for (const w of this.walkers) {
      let budget = w.speed * dt;
      while (budget > 0) {
        const gx = w.tx + 0.5, gy = w.ty + 0.5, dx = gx - w.x, dy = gy - w.y, L = Math.hypot(dx, dy);
        if (L <= budget) {
          w.x = gx; w.y = gy; budget -= L; w.cx = w.tx; w.cy = w.ty;
          if (this.world.isNexus(w.cx, w.cy)) { arrived.push(w); break; }
          const n = this.field.next(w.cx, w.cy);
          if (!n) break;
          [w.tx, w.ty] = n;
        } else {
          w.x += (dx / L) * budget; w.y += (dy / L) * budget; budget = 0;
        }
      }
    }
    if (arrived.length) {
      this.walkers = this.walkers.filter(w => !arrived.includes(w));
      for (const w of arrived) this.events.push({ type: "walker-arrived", walker: w });
    }
  }

  setTestWalkers(on: boolean): void {
    this.testWalkers = on;
    if (!on && this.phase === "planning") this.walkers = [];
    this.spawnTimer = 0;
  }

  private setPhase(p: Phase): void {
    if (p === "planning") { this.walkers = []; this.spawnTimer = 0; }
    this.phase = p;
    this.events.push({ type: "phase", phase: p });
  }

  /** Current route from each rift to the nexus. */
  routes(field: FlowField = this.field): Cell[][] {
    return this.world.spawners.map(s => field.trace(s));
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
