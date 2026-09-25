import { Avatar, defaultAvatarTuning, type AvatarInput, type AvatarTuning } from "./avatar";
import { Hotbar } from "./inventory";
import { nodeArea, nodeCellTop, nodeFootprint, nodeMax, ORE_STAGES, stagesLeft, viewGap, type OreKind, type OreNode } from "./ore";
import { computeField, keysOf, type FlowField } from "./pathfinding";
import { pieceCells, SHAPE_IDS, type ShapeId } from "./pieces";
import { Rng } from "./rng";
import { BOLT_SPEED, defaultTuning, TOWER_INFO, towerCells, type Tower, type TowerKind, type Tuning } from "./towers";
import { cellKey, type Cell } from "./types";
import { WALL_DECK, World, type MapDef } from "./world";

/** Random walls delivered at the start of every round. Unused walls carry over. */
export const SUPPLY_PER_ROUND = 3;
export const TICK = 1 / 60;
/** Shots from the ship's own gun carry this as their shooter id (tower ids start at 1). */
export const SHIP_SHOOTER = 0;
/** The avatar collides with the world in eighths of a cell (for the rim around towers). */
export const AVATAR_SUB = 8;
/** Width of the wall rim left around a tower, in eighths of a cell. */
const RIM = 1;

export type Phase = "planning" | "wave" | "over";

export interface HandPiece { uid: number; shape: ShapeId }

export interface PlacedPiece {
  id: number;
  shape: ShapeId;
  rot: number;
  at: Cell;
  cells: Cell[];
  /** Locked pieces are permanent. Unlocked ones can be picked back up this planning phase. */
  locked: boolean;
  /** Stone paid, returned when it's picked back up. */
  paid: number;
  /** Plated with metal: the Armored deck, the only wall towers stand on. */
  metal: boolean;
  /** Metal paid for the plating, returned with the stone on pick-up. */
  plated: number;
}

export interface Walker {
  id: number;
  /** Continuous position; a cell's center is (x + 0.5, y + 0.5). */
  x: number; y: number;
  /** Cell it last stood in, and the cell it's walking to. */
  cx: number; cy: number;
  tx: number; ty: number;
  speed: number;
  hp: number;
  maxHp: number;
  /** Damage from bolts already in flight, so towers don't overkill. */
  pending: number;
  /** Planning-phase practice walkers: shootable, but leaks cost nothing. */
  practice: boolean;
}

/** A bolt in flight. Damage lands when `t` reaches `dur`. */
export interface Shot {
  id: number;
  towerId: number;
  targetId: number;
  damage: number;
  t: number;
  dur: number;
}

export type BlockReason = "occupied" | "walker" | "avatar" | "cuts-off-rift" | "traps-walker" | "stone";

export type PlacementCheck =
  | { ok: true; cells: Cell[]; field: FlowField }
  | { ok: false; cells: Cell[]; reason: BlockReason };

export type TowerBlockReason = "no-wall" | "stone-wall" | "tower-there" | "avatar" | "metal" | "run-over";

export type TowerCheck =
  | { ok: true; cells: Cell[] }
  | { ok: false; cells: Cell[]; reason: TowerBlockReason };

export type GameEvent =
  | { type: "placed"; piece: PlacedPiece }
  | { type: "removed"; piece: PlacedPiece }
  | { type: "walker-arrived"; walker: Walker }
  | { type: "phase"; phase: Phase }
  | { type: "supply"; pieces: HandPiece[] }
  /** A stage broke off a node; `added` is the ore that went into the hotbar. */
  | { type: "node-broke"; node: OreNode; stagesLeft: number; added: number }
  | { type: "node-grew"; node: OreNode }
  | { type: "plated"; piece: PlacedPiece }
  | { type: "tower-built"; tower: Tower }
  | { type: "tower-sold"; tower: Tower; refund: number }
  | { type: "shot"; shot: Shot }
  | { type: "hit"; walker: Walker }
  | { type: "killed"; walker: Walker }
  | { type: "leak"; walker: Walker; hp: number }
  | { type: "avatar-landed" }
  | { type: "reset" };

export const REASON_TEXT: Record<BlockReason, string> = {
  "occupied": "Something is already there",
  "walker": "An enemy is in the way",
  "avatar": "You're standing there",
  "cuts-off-rift": "Enemies must always have a path to the nexus",
  "traps-walker": "That would trap an enemy",
  "stone": "Not enough stone",
};

export const TOWER_REASON_TEXT: Record<TowerBlockReason, string> = {
  "no-wall": "Towers go on top of walls",
  "stone-wall": "Needs metal plating",
  "tower-there": "There's already a tower there",
  "avatar": "You're standing there",
  "metal": "Not enough metal",
  "run-over": "The run is over",
};

export interface GameOptions {
  seed?: number;
  waveSize?: (round: number) => number;
  supply?: number;
  tuning?: Partial<Tuning>;
}

/** All game rules. No graphics. */
export class Game {
  readonly world: World;
  readonly rng: Rng;
  /** Live numbers; the tuning panel edits these directly. */
  readonly tuning: Tuning;
  phase: Phase = "planning";
  /** The wave about to be fought, or being fought; the first wave is round 1. */
  round = 1;
  hand: HandPiece[] = [];
  pieces: PlacedPiece[] = [];
  towers: Tower[] = [];
  walkers: Walker[] = [];
  shots: Shot[] = [];
  /** Ore nodes on the map. */
  nodes: OreNode[] = [];
  /** The player's inventory: the multitool and the ore that pays for walls and towers. */
  hotbar = new Hotbar();
  hp = 0;
  field: FlowField;
  events: GameEvent[] = [];
  /** Spawn practice walkers during planning so rerouting can be watched. */
  testWalkers = false;
  /** The player's avatar. Moves every tick in every phase; never blocks enemies. */
  readonly avatar: Avatar;
  readonly avatarTuning: AvatarTuning = defaultAvatarTuning();
  /** Movement input, set by the input layer. `jump` is consumed by the next tick. */
  avatarInput: AvatarInput = { x: 0, y: 0, jump: false };
  /**
   * Mining input, set by the input layer: the tool is firing, and whether the
   * cursor is on the node's hotspot (a view matter, so the view decides).
   */
  mineInput = { firing: false, onSpot: false };
  /** What mining is doing this tick: the node being mined, and whether the hotbar is too full to take its next chunk. */
  mining: { node: OreNode | null; full: boolean } = { node: null, full: false };

  private nextId = 1;
  private waveLeft = 0;
  private spawnTimer = 0;
  private waveSize: (round: number) => number;
  /** cell key -> id of the tower standing on it */
  private towerCellsMap = new Map<string, number>();

  constructor(map: MapDef, opts: GameOptions = {}) {
    this.world = new World(map);
    this.rng = new Rng(opts.seed ?? Date.now());
    this.waveSize = opts.waveSize ?? (r => 6 + r * 2);
    this.tuning = { ...defaultTuning(), ...opts.tuning };
    if (opts.supply !== undefined) this.tuning.supplyPerRound = opts.supply;
    this.nodes = (map.ore ?? []).map(o => ({ id: this.nextId++, kind: o.kind, x: o.x, y: o.y, amount: nodeMax(o.kind), max: nodeMax(o.kind) }));
    this.syncOre();
    this.field = computeField(this.world);
    const [sx, sy] = map.start ?? map.spawners[0]!;
    this.avatar = new Avatar(sx + 0.5, sy + 0.5);
    this.startRun();
  }

  /**
   * How tall each cell is for the avatar: walls are decks and towers stand on
   * top of them; rocks and ore nodes can be jumped onto; trees can be jumped
   * over (see `standable`); the ship is solid; everything else is snow.
   */
  readonly heightAt = (x: number, y: number): number => {
    if (this.world.isNexus(x, y)) return Infinity;
    const k = cellKey(x, y);
    const terrain = this.world.terrainTop.get(k);
    if (terrain !== undefined) return terrain;
    const oreId = this.world.ore.get(k);
    if (oreId !== undefined) return nodeCellTop(this.nodes.find(n => n.id === oreId)!, x, y);
    const tower = this.towerAt(x, y);
    if (tower) return WALL_DECK + TOWER_INFO[tower.kind].top;
    return this.world.walls.has(k) ? WALL_DECK : 0;
  };

  /** Trees can be cleared by a jump but never stood on. */
  readonly standable = (x: number, y: number): boolean => !this.world.isTree(x, y);

  /**
   * The avatar's view of the world, in eighths of a cell. Everything fills whole
   * cells, except a tower: it leaves a thin rim of wall deck along its outer
   * sides, so you can jump onto the wall next to a tower and then onto the tower.
   */
  readonly heightAtFine = (sx: number, sy: number): number => {
    const S = AVATAR_SUB, cx = Math.floor(sx / S), cy = Math.floor(sy / S);
    const tower = this.towerAt(cx, cy);
    if (tower) {
      const lx = sx - cx * S, ly = sy - cy * S;
      const same = (x: number, y: number) => this.towerAt(x, y) === tower;
      const rim = (lx < RIM && !same(cx - 1, cy)) || (lx >= S - RIM && !same(cx + 1, cy))
        || (ly < RIM && !same(cx, cy - 1)) || (ly >= S - RIM && !same(cx, cy + 1));
      if (rim) return WALL_DECK;
    }
    return this.heightAt(cx, cy);
  };
  readonly standableFine = (sx: number, sy: number): boolean =>
    this.standable(Math.floor(sx / AVATAR_SUB), Math.floor(sy / AVATAR_SUB));


  /** Cells under the avatar's footprint. */
  avatarCells(): Set<string> {
    const a = this.avatar, r = this.avatarTuning.radius, out = new Set<string>();
    for (let y = Math.floor(a.y - r); y <= Math.floor(a.y + r - 1e-4); y++) {
      for (let x = Math.floor(a.x - r); x <= Math.floor(a.x + r - 1e-4); x++) out.add(cellKey(x, y));
    }
    return out;
  }

  /** Walls delivered per round (a tuning knob). */
  get supplyPerRound(): number { return this.tuning.supplyPerRound; }
  set supplyPerRound(n: number) { this.tuning.supplyPerRound = n; }

  private startRun(): void {
    this.hotbar = new Hotbar();
    this.hotbar.add("stone", this.tuning.startStone);
    this.hotbar.add("metal", this.tuning.startMetal);
    this.hp = this.tuning.startHp;
    this.supply();
  }

  /** Start a new run on the same map. Tuning is kept. */
  reset(): void {
    this.world.walls.clear();
    this.towerCellsMap.clear();
    this.hand = []; this.pieces = []; this.towers = []; this.walkers = []; this.shots = [];
    this.round = 1;
    this.phase = "planning";
    this.waveLeft = 0; this.spawnTimer = 0;
    const [sx, sy] = this.world.map.start ?? this.world.map.spawners[0]!;
    this.avatar.place(sx + 0.5, sy + 0.5);
    for (const n of this.nodes) n.amount = n.max;
    this.syncOre();
    this.field = computeField(this.world);
    this.events.push({ type: "reset" });
    this.startRun();
  }

  // ---------------------------------------------------------------- supply

  /** Deliver this round's random walls straight into the hand. */
  private supply(): void {
    const pieces: HandPiece[] = [];
    for (let i = 0; i < this.tuning.supplyPerRound; i++) pieces.push({ uid: this.nextId++, shape: SHAPE_IDS[this.rng.int(SHAPE_IDS.length)]! });
    this.hand.push(...pieces);
    this.events.push({ type: "supply", pieces });
  }

  /** Walls in the hand, per shape. */
  handCount(shape: ShapeId): number { return this.hand.reduce((n, h) => n + (h.shape === shape ? 1 : 0), 0); }

  /** Stone it costs to place a wall of `cells` cells. */
  wallCost(cells: number): number { return cells * this.tuning.wallCost; }

  // ---------------------------------------------------------------- ore

  /** Rebuild which cells the nodes block, from their current stages. */
  private syncOre(): void {
    this.world.ore.clear();
    for (const n of this.nodes) for (const [x, y] of nodeFootprint(n)) this.world.ore.set(cellKey(x, y), n.id);
  }

  /** The node within mining reach of the avatar (the closest, as it looks on screen). */
  nodeInReach(): OreNode | null {
    let best: OreNode | null = null, bestD = this.tuning.reach;
    for (const n of this.nodes) {
      if (n.amount <= 0) continue;
      const d = viewGap(this.avatar.x, this.avatar.y, n);
      if (d <= bestD) { bestD = d; best = n; }
    }
    return best;
  }

  /** Bonus to mining speed with the cursor on a node's hotspot. */
  static readonly HOTSPOT_BONUS = 1.2;

  /**
   * Mine for one tick. Ore comes in whole chunks, one per stage that breaks off;
   * if the next chunk won't fit in the hotbar, mining does nothing.
   */
  private stepMining(dt: number): void {
    const n = this.mineInput.firing && this.hotbar.held === "multitool" ? this.nodeInReach() : null;
    this.mining = { node: n, full: false };
    if (!n) return;
    const stage = stagesLeft(n);
    const floor = (n.max * (stage - 1)) / ORE_STAGES;
    const chunk = Math.round((n.max * stage) / ORE_STAGES) - Math.round(floor);
    if (this.hotbar.room(n.kind) < chunk) { this.mining.full = true; return; }
    const rate = (n.max / Math.max(0.1, this.tuning.mineTime)) * (this.mineInput.onSpot ? Game.HOTSPOT_BONUS : 1);
    n.amount -= Math.min(n.amount - floor, rate * dt);
    if (n.amount > floor + 1e-6) return;
    n.amount = floor;
    const added = this.hotbar.add(n.kind, chunk);
    this.syncOre();
    this.field = computeField(this.world);
    this.events.push({ type: "node-broke", node: n, stagesLeft: stagesLeft(n), added });
  }

  /**
   * Mined-out nodes grow back at the start of a planning phase, if their 3×3 is
   * clear (no walls, not the avatar) and growing wouldn't cut off the rift.
   */
  private regrowNodes(): void {
    const under = this.avatarCells();
    for (const n of this.nodes) {
      if (n.amount > 0) continue;
      const area = nodeArea(n);
      if (area.some(([x, y]) => this.world.walls.has(cellKey(x, y)) || under.has(cellKey(x, y)))) continue;
      const field = computeField(this.world, keysOf(area), area);
      if (this.world.spawners.some(([sx, sy]) => !isFinite(field.at(sx, sy)))) continue;
      n.amount = n.max;
      this.syncOre();
      this.field = computeField(this.world);
      this.events.push({ type: "node-grew", node: n });
    }
  }

  /** Ore of a kind in the hotbar. */
  ore(kind: OreKind): number { return this.hotbar.count(kind); }

  // ---------------------------------------------------------------- placement

  canPlaceNow(): boolean { return this.phase === "planning" || this.phase === "wave"; }

  /** Would placing `shape` at `at` be legal? On success also returns the resulting flow field. */
  checkPlacement(shape: ShapeId, rot: number, at: Cell): PlacementCheck {
    const cells = pieceCells(shape, rot, at);
    for (const [x, y] of cells) if (this.world.isOccupied(x, y)) return { ok: false, cells, reason: "occupied" };
    if (this.ore("stone") < this.wallCost(cells.length)) return { ok: false, cells, reason: "stone" };
    const set = keysOf(cells);
    // A wall can't be dropped on the avatar (only matters while it's below deck height).
    if (this.avatar.z < WALL_DECK) for (const k of this.avatarCells()) if (set.has(k)) return { ok: false, cells, reason: "avatar" };
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
    const paid = this.hotbar.remove("stone", this.wallCost(check.cells.length));
    const piece: PlacedPiece = { id: this.nextId++, shape: held.shape, rot, at, cells: check.cells, locked: this.phase === "wave", paid, metal: false, plated: 0 };
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

  /** A piece can be picked up while unlocked, in planning, with no tower standing on it. */
  canPickUp(piece: PlacedPiece | undefined): piece is PlacedPiece {
    return !!piece && !piece.locked && this.phase === "planning" && !piece.cells.some(([x, y]) => this.towerCellsMap.has(cellKey(x, y)));
  }

  /** Return an unlocked piece to the hand and its stone to the hotbar. Returns the new hand entry. */
  pickUp(pieceId: number): HandPiece | null {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canPickUp(piece)) return null;
    this.pieces.splice(this.pieces.indexOf(piece), 1);
    for (const [x, y] of piece.cells) this.world.walls.delete(cellKey(x, y));
    this.field = computeField(this.world);
    this.hotbar.add("stone", piece.paid);
    if (piece.plated) this.hotbar.add("metal", piece.plated);
    const entry: HandPiece = { uid: this.nextId++, shape: piece.shape };
    this.hand.push(entry);
    this.events.push({ type: "removed", piece });
    return entry;
  }

  /** Can this piece be plated now? Any stone piece, locked or not, while the run is on. */
  canPlate(piece: PlacedPiece | undefined): piece is PlacedPiece {
    return !!piece && !piece.metal && this.canPlaceNow() && this.ore("metal") >= this.tuning.platingCost;
  }

  /**
   * Metal plating: turns a whole stone piece into the Armored deck, which towers
   * can stand on. Same shape and place, so the path doesn't change.
   */
  plate(pieceId: number): boolean {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canPlate(piece)) return false;
    piece.plated = this.hotbar.remove("metal", this.tuning.platingCost);
    piece.metal = true;
    this.events.push({ type: "plated", piece });
    return true;
  }

  /** Undo the most recent unlocked placement. */
  undo(): PlacedPiece | null {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (!p.locked) return this.pickUp(p.id) ? p : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- towers

  towerCost(kind: TowerKind): number { return this.tuning[kind].cost; }

  /** Towers stand on walls only. A footprint may span walls from different pieces. */
  checkTower(kind: TowerKind, at: Cell): TowerCheck {
    const cells = towerCells(kind, at);
    if (!this.canPlaceNow()) return { ok: false, cells, reason: "run-over" };
    for (const [x, y] of cells) if (!this.world.walls.has(cellKey(x, y))) return { ok: false, cells, reason: "no-wall" };
    for (const [x, y] of cells) if (!this.pieceAt(x, y)?.metal) return { ok: false, cells, reason: "stone-wall" };
    for (const [x, y] of cells) if (this.towerCellsMap.has(cellKey(x, y))) return { ok: false, cells, reason: "tower-there" };
    const under = this.avatarCells();
    for (const [x, y] of cells) if (under.has(cellKey(x, y))) return { ok: false, cells, reason: "avatar" };
    if (this.ore("metal") < this.towerCost(kind)) return { ok: false, cells, reason: "metal" };
    return { ok: true, cells };
  }

  buildTower(kind: TowerKind, at: Cell): TowerCheck & { tower?: Tower } {
    const check = this.checkTower(kind, at);
    if (!check.ok) return check;
    const n = TOWER_INFO[kind].size, cost = this.towerCost(kind);
    const tower: Tower = {
      id: this.nextId++, kind, at: [at[0], at[1]], cells: check.cells, cx: at[0] + n / 2, cy: at[1] + n / 2,
      paid: cost, fresh: this.phase === "planning", cooldown: 0, targetId: null,
    };
    this.hotbar.remove("metal", cost);
    this.towers.push(tower);
    for (const [x, y] of tower.cells) this.towerCellsMap.set(cellKey(x, y), tower.id);
    this.events.push({ type: "tower-built", tower });
    return { ...check, tower };
  }

  towerAt(x: number, y: number): Tower | undefined {
    const id = this.towerCellsMap.get(cellKey(x, y));
    return id === undefined ? undefined : this.towers.find(t => t.id === id);
  }

  /** Full price back in the planning phase it was built; a share of it after. */
  sellValue(t: Tower): number {
    return t.fresh ? t.paid : Math.floor(t.paid * this.tuning.sellRefund);
  }

  /** Sell a tower, in planning or mid-wave. Bolts already fired still land. Returns the refund, or null. */
  sellTower(id: number): number | null {
    const t = this.towers.find(x => x.id === id);
    if (!t || !this.canPlaceNow()) return null;
    const refund = this.sellValue(t);
    this.towers.splice(this.towers.indexOf(t), 1);
    for (const [x, y] of t.cells) this.towerCellsMap.delete(cellKey(x, y));
    this.hotbar.add("metal", refund);
    this.events.push({ type: "tower-sold", tower: t, refund });
    return refund;
  }

  // ---------------------------------------------------------------- waves

  startWave(): boolean {
    if (this.phase !== "planning") return false;
    for (const p of this.pieces) p.locked = true;
    for (const t of this.towers) t.fresh = false;
    this.walkers = [];
    this.shots = [];
    this.waveLeft = this.waveSize(this.round);
    this.spawnTimer = 0;
    this.setPhase("wave");
    return true;
  }

  get waveRemaining(): number { return this.waveLeft + this.walkers.length; }

  /** HP of an enemy in the given round. */
  enemyHp(round = this.round): number {
    return Math.max(1, Math.round(this.tuning.enemyHp * this.tuning.enemyHpGrowth ** (round - 1)));
  }

  private spawnWalker(practice: boolean): void {
    const hp = this.enemyHp();
    for (const [sx, sy] of this.world.spawners) {
      this.walkers.push({
        id: this.nextId++, x: sx + 0.5, y: sy + 0.5, cx: sx, cy: sy, tx: sx, ty: sy,
        speed: (1.35 + this.rng.next() * 0.25) * this.tuning.enemySpeed,
        hp, maxHp: hp, pending: 0, practice,
      });
    }
  }

  /**
   * Advance the avatar by one tick. Separate from `step` so the player always
   * moves in real time, whatever the game speed.
   */
  stepAvatar(dt = TICK): void {
    this.avatarTuning.sprint = this.tuning.sprint;
    // Sprint is a travel mode: firing the tool drops back to running speed.
    const input = { ...this.avatarInput, sprint: this.avatarInput.sprint && !this.mineInput.firing };
    this.avatar.step(dt, input, this.heightAtFine, this.avatarTuning, this.standableFine, AVATAR_SUB);
    this.avatarInput.jump = false;
    if (this.avatar.landed) this.events.push({ type: "avatar-landed" });
    // Mining is the player's own action, so it runs on real time too.
    if (this.phase !== "over") this.stepMining(dt);
    else this.mining = { node: null, full: false };
  }

  /** Advance the world (waves, enemies, towers) by one tick. Game speed scales how often this runs. */
  step(dt = TICK): void {
    if (this.phase === "over") return;
    if (this.phase === "wave") {
      this.spawnTimer -= dt;
      if (this.waveLeft > 0 && this.spawnTimer <= 0) { this.spawnWalker(false); this.waveLeft--; this.spawnTimer = 0.9; }
    } else if (this.phase === "planning" && this.testWalkers) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnWalker(true); this.spawnTimer = 1.6; }
    }
    this.moveWalkers(dt);
    // A leak may have ended the run.
    if ((this.phase as Phase) === "over") return;
    this.updateTowers(dt);
    this.updateShots(dt);
    if (this.phase === "wave" && this.waveLeft === 0 && this.walkers.length === 0) {
      this.round++;
      this.setPhase("planning");
      this.supply();
      this.regrowNodes();
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
    if (!arrived.length) return;
    this.walkers = this.walkers.filter(w => !arrived.includes(w));
    for (const w of arrived) {
      this.events.push({ type: "walker-arrived", walker: w });
      if (w.practice || this.phase !== "wave") continue;
      this.hp = Math.max(0, this.hp - 1);
      this.events.push({ type: "leak", walker: w, hp: this.hp });
      if (this.hp === 0) { this.setPhase("over"); return; }
    }
  }

  /**
   * How far a walker still has to go. Lower means more progress; towers shoot
   * the walker with the most progress.
   */
  remaining(w: Walker): number {
    return this.field.at(w.tx, w.ty) + Math.hypot(w.tx + 0.5 - w.x, w.ty + 0.5 - w.y);
  }

  /** The walker a tower would shoot now: in range, not already doomed, most progress. */
  pickTarget(t: Tower): Walker | null { return this.pickTargetFrom(t.cx, t.cy, this.tuning[t.kind].range); }

  /** The ship's centre, where its gun's range is measured from. */
  shipCenter(): { x: number; y: number } {
    const cells = this.world.map.nexus;
    return { x: cells.reduce((a, c) => a + c[0] + 0.5, 0) / cells.length, y: cells.reduce((a, c) => a + c[1] + 0.5, 0) / cells.length };
  }

  /** Same targeting for any gun: in a circle around (cx, cy), not already doomed, most progress. */
  pickTargetFrom(cx: number, cy: number, range: number): Walker | null {
    let best: Walker | null = null, bestR = Infinity;
    for (const w of this.walkers) {
      if (w.pending >= w.hp) continue;
      if (Math.hypot(w.x - cx, w.y - cy) > range) continue;
      const r = this.remaining(w);
      if (r < bestR) { bestR = r; best = w; }
    }
    return best;
  }

  /** The ship's weak gun, fired from its core. */
  shipGun = { cooldown: 0, targetId: null as number | null };

  private updateTowers(dt: number): void {
    const gun = this.shipGun, s = this.tuning.ship, c = this.shipCenter();
    gun.cooldown = Math.max(0, gun.cooldown - dt);
    const st = s.damage > 0 && s.rate > 0 ? this.pickTargetFrom(c.x, c.y, s.range) : null;
    gun.targetId = st?.id ?? null;
    if (st && gun.cooldown <= 0) {
      gun.cooldown = 1 / s.rate;
      const shot: Shot = { id: this.nextId++, towerId: SHIP_SHOOTER, targetId: st.id, damage: s.damage, t: 0, dur: Math.hypot(st.x - c.x, st.y - c.y) / BOLT_SPEED };
      st.pending += shot.damage;
      this.shots.push(shot);
      this.events.push({ type: "shot", shot });
    }
    for (const t of this.towers) {
      t.cooldown = Math.max(0, t.cooldown - dt);
      const target = this.pickTarget(t);
      t.targetId = target?.id ?? null;
      if (!target || t.cooldown > 0) continue;
      const s = this.tuning[t.kind];
      t.cooldown = 1 / s.rate;
      const dist = Math.hypot(target.x - t.cx, target.y - t.cy);
      const shot: Shot = { id: this.nextId++, towerId: t.id, targetId: target.id, damage: s.damage, t: 0, dur: dist / BOLT_SPEED };
      target.pending += shot.damage;
      this.shots.push(shot);
      this.events.push({ type: "shot", shot });
    }
  }

  private updateShots(dt: number): void {
    const landed: Shot[] = [];
    for (const s of this.shots) { s.t += dt; if (s.t >= s.dur) landed.push(s); }
    if (!landed.length) return;
    this.shots = this.shots.filter(s => !landed.includes(s));
    for (const s of landed) {
      const w = this.walkers.find(x => x.id === s.targetId);
      if (!w) continue;
      w.pending -= s.damage;
      w.hp -= s.damage;
      if (w.hp > 0) { this.events.push({ type: "hit", walker: w }); continue; }
      this.walkers.splice(this.walkers.indexOf(w), 1);
      this.events.push({ type: "killed", walker: w });
    }
  }

  setTestWalkers(on: boolean): void {
    this.testWalkers = on;
    if (!on && this.phase === "planning") { this.walkers = []; this.shots = []; }
    this.spawnTimer = 0;
  }

  private setPhase(p: Phase): void {
    if (p === "planning") { this.walkers = []; this.shots = []; this.spawnTimer = 0; }
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
