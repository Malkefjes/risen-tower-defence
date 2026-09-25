import { Avatar, defaultAvatarTuning, type AvatarInput, type AvatarTuning } from "./avatar";
import { Hotbar, Inventory, type ItemKind } from "./inventory";
import { gapTo, newSmelter, smelt, smelterCells, type Smelter } from "./smelter";
import { nodeArea, nodeCellTop, nodeFootprint, nodeMax, ORE_STAGES, stagesLeft, viewGap, type OreNode } from "./ore";
import { computeField, keysOf, type FlowField } from "./pathfinding";
import { pieceCells, type ShapeId } from "./pieces";
import { Rng } from "./rng";
import { BOLT_SPEED, defaultTuning, TOWER_INFO, towerCells, type Tower, type TowerKind, type Tuning } from "./towers";
import { cellKey, type Cell } from "./types";
import { WALL_DECK, World, type MapDef } from "./world";

export const TICK = 1 / 60;
/** Average enemy walking speed, cells per second (before `tuning.enemySpeed`). */
export const ENEMY_SPEED = 1.475;
/** Seconds between enemies of one pack climbing out. */
export const PACK_STAGGER = 0.25;
/** Shots from the ship's own gun carry this as their shooter id (tower ids start at 1). */
export const SHIP_SHOOTER = 0;
/** The avatar collides with the world in eighths of a cell (for the rim around towers). */
export const AVATAR_SUB = 8;
/** A tree's trunk, in eighths of its cell: the part that blocks the player. */
const TRUNK_LO = 2, TRUNK_HI = 6;
/** Width of the wall rim left around a tower, in eighths of a cell. */
const RIM = 1;

export type Phase = "planning" | "wave" | "over";

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
  /** Position before the last tick, so the view can draw between ticks. */
  px?: number; py?: number;
  /** Its own line through each tile, -1 to 1 (scaled by `tuning.laneSpread` in the view). */
  lane?: number;
  /** Cell it last stood in, and the cell it's walking to. */
  cx: number; cy: number;
  tx: number; ty: number;
  speed: number;
  hp: number;
  maxHp: number;
  /** Damage from bolts already in flight, so towers don't overkill. */
  pending: number;
  /** Planning-phase practice walkers: shootable, but do no damage (they vanish on reaching a target). */
  practice: boolean;
  /** The target cell it's clawing (it stands still meanwhile), or none while walking. */
  attacking?: string | null;
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

export type TowerBlockReason = "no-wall" | "stone-wall" | "tower-there" | "avatar" | "alloy" | "run-over";

export type SmelterBlockReason = "occupied" | "walker" | "avatar" | "cuts-off-rift" | "traps-walker" | "stone" | "metal" | "run-over";

export type SmelterCheck =
  | { ok: true; cells: Cell[]; field: FlowField }
  | { ok: false; cells: Cell[]; reason: SmelterBlockReason };

/** How close the player must be to a smelter to use it: the gap to its footprint, in cells. */
export const SMELTER_REACH = 1.6;

export type TowerCheck =
  | { ok: true; cells: Cell[] }
  | { ok: false; cells: Cell[]; reason: TowerBlockReason };

export type GameEvent =
  | { type: "placed"; piece: PlacedPiece }
  | { type: "removed"; piece: PlacedPiece }
  | { type: "phase"; phase: Phase }
  /** A stage broke off a node; `added` is the ore that went into the hotbar. */
  | { type: "node-broke"; node: OreNode; stagesLeft: number; added: number }
  | { type: "node-grew"; node: OreNode }
  | { type: "plated"; piece: PlacedPiece }
  | { type: "tower-built"; tower: Tower }
  | { type: "tower-sold"; tower: Tower; refund: number }
  | { type: "smelter-built"; smelter: Smelter }
  /** The raid clock reached its warning: the active caves stir. */
  | { type: "raid-warning" }
  | { type: "smelter-removed"; smelter: Smelter }
  | { type: "shot"; shot: Shot }
  | { type: "hit"; walker: Walker }
  | { type: "killed"; walker: Walker }
  /** The ship's HP hit 0: it's a wreck now, and the run goes on. */
  | { type: "ship-destroyed" }
  /** A smelter's HP hit 0: it's gone, with what was in it. */
  | { type: "smelter-destroyed"; smelter: Smelter }
  /** Enemies chewed through a wall cell: it's gone, and so is any tower standing on it. */
  | { type: "wall-broken"; piece: PlacedPiece; cell: Cell }
  | { type: "tower-destroyed"; tower: Tower }
  | { type: "repaired"; piece: PlacedPiece }
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

export const SMELTER_REASON_TEXT: Record<SmelterBlockReason, string> = {
  "occupied": "Something is already there",
  "walker": "An enemy is in the way",
  "avatar": "You're standing there",
  "cuts-off-rift": "Enemies must always have a path to the ship",
  "traps-walker": "That would trap an enemy",
  "stone": "Not enough stone",
  "metal": "Not enough raw metal",
  "run-over": "The run is over",
};

export const TOWER_REASON_TEXT: Record<TowerBlockReason, string> = {
  "no-wall": "Towers go on top of walls",
  "stone-wall": "Needs metal plating",
  "tower-there": "There's already a tower there",
  "avatar": "You're standing there",
  "alloy": "Not enough alloy",
  "run-over": "The run is over",
};

export interface GameOptions {
  seed?: number;
  waveSize?: (round: number) => number;
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
  pieces: PlacedPiece[] = [];
  towers: Tower[] = [];
  smelters: Smelter[] = [];
  walkers: Walker[] = [];
  shots: Shot[] = [];
  /** Ore nodes on the map. */
  nodes: OreNode[] = [];
  /** The player's inventory: the multitool and the ore that pays for walls and towers. */
  hotbar = new Hotbar();
  /** The ship's HP. */
  hp = 0;
  /** The ship was destroyed: a wreck that still blocks, its gun silent. The run goes on. */
  shipDown = false;
  field: FlowField;
  events: GameEvent[] = [];
  /** Spawn practice walkers during planning so rerouting can be watched. */
  testWalkers = false;
  /**
   * Seconds (game time) until the next raid, while calm. Runs down on its own; your
   * activity takes time off it (`noise`), but never into the fixed warning at the end.
   */
  raidIn = 0;
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
  /** Enemies each active cave still has to send this wave. */
  private waveLeft = 0;
  /** Enemies of packs already under way, each waiting to climb out of its cave. */
  private packQueue: { at: Cell; delay: number; speed: number }[] = [];
  private spawnTimer = 0;
  private waveSize: (round: number) => number;
  /** cell key -> id of the tower standing on it */
  private towerCellsMap = new Map<string, number>();

  constructor(map: MapDef, opts: GameOptions = {}) {
    this.world = new World(map);
    this.rng = new Rng(opts.seed ?? Date.now());
    this.waveSize = opts.waveSize ?? (r => 6 + r * 2);
    this.tuning = { ...defaultTuning(), ...opts.tuning };
    this.nodes = (map.ore ?? []).map(o => ({ id: this.nextId++, kind: o.kind, x: o.x, y: o.y, amount: nodeMax(o.kind), max: nodeMax(o.kind) }));
    this.syncOre();
    this.syncWallWeights();
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
    if (this.world.buildings.has(k)) return Infinity;
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
    // Trees and crystal block you only at the trunk (the middle half of the cell), so
    // you can weave through a forest; enemies still treat the whole cell as blocked.
    if (this.world.isTree(cx, cy)) {
      const lx = sx - cx * S, ly = sy - cy * S;
      return lx >= TRUNK_LO && lx < TRUNK_HI && ly >= TRUNK_LO && ly < TRUNK_HI ? this.heightAt(cx, cy) : 0;
    }
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

  private startRun(): void {
    this.hotbar = new Hotbar();
    this.hotbar.add("stone", this.tuning.startStone);
    this.hotbar.add("metal", this.tuning.startMetal);
    this.hotbar.add("alloy", this.tuning.startAlloy);
    this.hp = this.tuning.startHp;
    this.shipDown = false;
    for (const k of this.world.nexus) this.world.targets.add(k);
    this.raidIn = this.tuning.raidGrace;
  }

  /** The last stretch before a raid: fixed, the caves stir and show where it comes from. */
  get raidWarned(): boolean { return this.phase === "planning" && this.raidIn <= this.tuning.raidWarning; }

  /** Activity makes noise the planet hears: it brings the next raid closer, but never into its warning. */
  noise(seconds: number): void {
    if (this.phase !== "planning" || seconds <= 0) return;
    const floor = this.tuning.raidWarning;
    if (this.raidIn > floor) this.raidIn = Math.max(floor, this.raidIn - seconds);
  }

  /** Start a new run on the same map. Tuning is kept. */
  reset(): void {
    this.world.walls.clear();
    this.world.buildings.clear();
    this.world.targets.clear();
    this.world.wallHp.clear();
    this.towerCellsMap.clear();
    this.smelters = [];
    this.pieces = []; this.towers = []; this.walkers = []; this.shots = [];
    this.round = 1;
    this.phase = "planning";
    this.waveLeft = 0; this.spawnTimer = 0; this.packQueue = [];
    const [sx, sy] = this.world.map.start ?? this.world.map.spawners[0]!;
    this.avatar.place(sx + 0.5, sy + 0.5);
    for (const n of this.nodes) n.amount = n.max;
    this.syncOre();
    this.field = computeField(this.world);
    this.events.push({ type: "reset" });
    this.startRun();
  }

  // ---------------------------------------------------------------- walls

  /** Stone it costs to place a wall of `cells` cells. */
  wallCost(cells: number): number { return cells * this.tuning.wallCost; }

  /** Stone for one piece of a shape: walls are bought with stone as they go down. */
  shapeCost(shape: ShapeId): number { return this.wallCost(pieceCells(shape, 0, [0, 0]).length); }

  /** Is there stone for this shape? */
  canAffordShape(shape: ShapeId): boolean { return this.ore("stone") >= this.shapeCost(shape); }

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
    this.noise(n.kind === "metal" ? this.tuning.noiseMetal : this.tuning.noiseStone);
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
      if (area.some(([x, y]) => this.world.walls.has(cellKey(x, y)) || this.world.buildings.has(cellKey(x, y)) || under.has(cellKey(x, y)))) continue;
      const field = computeField(this.world, keysOf(area), area);
      if (this.world.targets.size && this.world.spawners.some(([sx, sy]) => !isFinite(field.at(sx, sy)))) continue;
      n.amount = n.max;
      this.syncOre();
      this.field = computeField(this.world);
      this.events.push({ type: "node-grew", node: n });
    }
  }

  /** How much of an item (stone, raw metal, alloy) is in the hotbar. */
  ore(kind: ItemKind): number { return this.hotbar.count(kind); }

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
    const field = computeField(this.world, set, cells, this.tuning.wallHp);
    // With nothing left to attack there is no path to keep open.
    // (Walls can be chewed through, so they never truly seal a path; terrain can.)
    if (this.world.targets.size) {
      for (const [sx, sy] of this.world.spawners) if (!isFinite(field.at(sx, sy))) return { ok: false, cells, reason: "cuts-off-rift" };
      for (const w of this.walkers) if (!isFinite(field.at(w.tx, w.ty))) return { ok: false, cells, reason: "traps-walker" };
    }
    return { ok: true, cells, field };
  }

  /** Buy and place a piece, paying its stone. Pieces placed during a wave lock immediately. */
  place(shape: ShapeId, rot: number, at: Cell): PlacementCheck & { piece?: PlacedPiece } {
    if (!this.canPlaceNow()) return { ok: false, cells: [], reason: "occupied" };
    const check = this.checkPlacement(shape, rot, at);
    if (!check.ok) return check;
    const paid = this.hotbar.remove("stone", this.wallCost(check.cells.length));
    const piece: PlacedPiece = { id: this.nextId++, shape, rot, at, cells: check.cells, locked: this.phase === "wave", paid, metal: false, plated: 0 };
    this.pieces.push(piece);
    for (const [x, y] of piece.cells) { this.world.walls.set(cellKey(x, y), piece.id); this.world.wallHp.set(cellKey(x, y), this.tuning.wallHp); }
    this.field = computeField(this.world);
    this.events.push({ type: "placed", piece });
    this.noise(this.tuning.noiseWall);
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

  /** Take up an unlocked piece, refunding its stone (and plating metal). Returns its shape. */
  pickUp(pieceId: number): ShapeId | null {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canPickUp(piece)) return null;
    this.pieces.splice(this.pieces.indexOf(piece), 1);
    for (const [x, y] of piece.cells) { this.world.walls.delete(cellKey(x, y)); this.world.wallHp.delete(cellKey(x, y)); }
    this.field = computeField(this.world);
    this.hotbar.add("stone", piece.paid);
    if (piece.plated) this.hotbar.add("alloy", piece.plated);
    this.events.push({ type: "removed", piece });
    return piece.shape;
  }

  /** Can this piece be plated now? Any stone piece, locked or not, while the run is on. */
  canPlate(piece: PlacedPiece | undefined): piece is PlacedPiece {
    return !!piece && !piece.metal && this.canPlaceNow() && this.ore("alloy") >= this.tuning.platingCost;
  }

  /**
   * Metal plating: turns a whole stone piece into the Armored deck, which towers
   * can stand on. Same shape and place, so the path doesn't change.
   */
  plate(pieceId: number): boolean {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canPlate(piece)) return false;
    piece.plated = this.hotbar.remove("alloy", this.tuning.platingCost);
    // Plating toughens the whole piece, keeping each cell's share of damage.
    for (const [x, y] of piece.cells) {
      const k = cellKey(x, y);
      this.world.wallHp.set(k, (this.world.wallHp.get(k) ?? this.tuning.wallHp) * this.tuning.platedHpMult);
    }
    piece.metal = true;
    this.field = computeField(this.world);
    this.events.push({ type: "plated", piece });
    return true;
  }

  /** Full HP of one cell of this piece: stone, or plated (tougher). */
  wallMaxHp(piece: PlacedPiece): number { return this.tuning.wallHp * (piece.metal ? this.tuning.platedHpMult : 1); }

  /** HP left in a piece and its full HP, over the cells it still has. */
  pieceHp(piece: PlacedPiece): { hp: number; max: number } {
    const max = this.wallMaxHp(piece);
    let hp = 0;
    for (const [x, y] of piece.cells) hp += this.world.wallHp.get(cellKey(x, y)) ?? max;
    return { hp, max: max * piece.cells.length };
  }

  /** Stone to repair a piece: its share of the wall price for the HP it's missing (broken cells are gone). */
  repairCost(piece: PlacedPiece): number {
    const { hp, max } = this.pieceHp(piece);
    return max > hp ? Math.ceil(((max - hp) / max) * this.wallCost(piece.cells.length)) : 0;
  }

  canRepair(piece: PlacedPiece | undefined): piece is PlacedPiece {
    return !!piece && this.canPlaceNow() && this.repairCost(piece) > 0 && this.ore("stone") >= this.repairCost(piece);
  }

  /** Repair a piece to full HP for stone, even mid-raid. */
  repair(pieceId: number): boolean {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canRepair(piece)) return false;
    this.hotbar.remove("stone", this.repairCost(piece));
    const max = this.wallMaxHp(piece);
    for (const [x, y] of piece.cells) this.world.wallHp.set(cellKey(x, y), max);
    this.field = computeField(this.world);
    this.events.push({ type: "repaired", piece });
    return true;
  }

  /** Path weights for walls follow the tuning: chew time (at the most clawers) as walking distance. */
  private syncWallWeights(): void {
    const t = this.tuning;
    this.world.defaultWallHp = t.wallHp;
    this.world.hpToCost = (ENEMY_SPEED * t.enemySpeed) / (Math.max(1, t.wallClawers) * Math.max(0.01, t.enemyDamage));
  }

  /** Enemies chewed a wall cell to 0: it's gone, and so is any tower that stood on it. */
  private breakWall(key: string): void {
    const id = this.world.walls.get(key);
    const piece = this.pieces.find(p => p.id === id);
    this.world.walls.delete(key);
    this.world.wallHp.delete(key);
    const [x, y] = key.split(",").map(Number) as [number, number];
    if (piece) {
      piece.cells = piece.cells.filter(([cx, cy]) => cx !== x || cy !== y);
      if (!piece.cells.length) this.pieces.splice(this.pieces.indexOf(piece), 1);
    }
    const tower = this.towerAt(x, y);
    if (tower) {
      this.towers.splice(this.towers.indexOf(tower), 1);
      for (const [tx, ty] of tower.cells) this.towerCellsMap.delete(cellKey(tx, ty));
      this.events.push({ type: "tower-destroyed", tower });
    }
    this.field = computeField(this.world);
    if (piece) this.events.push({ type: "wall-broken", piece, cell: [x, y] });
  }

  /** Undo the most recent unlocked placement. */
  undo(): PlacedPiece | null {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (!p.locked) return this.pickUp(p.id) ? p : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- smelters

  /** Can a smelter go down with its top-left cell at `at`? Open ground only, paid in stone and raw metal. */
  checkSmelter(at: Cell): SmelterCheck {
    const cells = smelterCells(at);
    if (!this.canPlaceNow()) return { ok: false, cells, reason: "run-over" };
    for (const [x, y] of cells) if (this.world.isOccupied(x, y)) return { ok: false, cells, reason: "occupied" };
    const set = keysOf(cells);
    for (const k of this.avatarCells()) if (set.has(k)) return { ok: false, cells, reason: "avatar" };
    for (const w of this.walkers) if (set.has(cellKey(w.cx, w.cy)) || set.has(cellKey(w.tx, w.ty))) return { ok: false, cells, reason: "walker" };
    if (this.ore("stone") < this.tuning.smelterStone) return { ok: false, cells, reason: "stone" };
    if (this.ore("metal") < this.tuning.smelterMetal) return { ok: false, cells, reason: "metal" };
    const field = computeField(this.world, set, cells);
    // With nothing left to attack there is no path to keep open.
    if (this.world.targets.size) {
      for (const [sx, sy] of this.world.spawners) if (!isFinite(field.at(sx, sy))) return { ok: false, cells, reason: "cuts-off-rift" };
      for (const w of this.walkers) if (!isFinite(field.at(w.tx, w.ty))) return { ok: false, cells, reason: "traps-walker" };
    }
    return { ok: true, cells, field };
  }

  buildSmelter(at: Cell): SmelterCheck & { smelter?: Smelter } {
    const check = this.checkSmelter(at);
    if (!check.ok) return check;
    const paid = { stone: this.hotbar.remove("stone", this.tuning.smelterStone), metal: this.hotbar.remove("metal", this.tuning.smelterMetal) };
    const s = newSmelter(this.nextId++, at, paid, this.tuning.smelterHp);
    this.smelters.push(s);
    for (const [x, y] of s.cells) { this.world.buildings.set(cellKey(x, y), s.id); this.world.targets.add(cellKey(x, y)); }
    this.field = computeField(this.world);
    this.events.push({ type: "smelter-built", smelter: s });
    this.noise(this.tuning.noiseBuild);
    return { ...check, smelter: s };
  }

  smelterAt(x: number, y: number): Smelter | undefined {
    const id = this.world.buildings.get(cellKey(x, y));
    return id === undefined ? undefined : this.smelters.find(s => s.id === id);
  }

  /** Is the player close enough to use this smelter? */
  canUseSmelter(s: Smelter): boolean {
    return this.phase !== "over" && gapTo(s, this.avatar.x, this.avatar.y) <= SMELTER_REACH;
  }

  /**
   * Take a smelter down: its full price back, plus everything inside it. Only when
   * you're next to it, and only if the hotbar can hold all of it, so nothing is lost.
   */
  removeSmelter(id: number): "ok" | "far" | "full" {
    const s = this.smelters.find(x => x.id === id);
    if (!s || !this.canUseSmelter(s)) return "far";
    const back: [ItemKind, number][] = [["stone", s.paid.stone], ["metal", s.paid.metal],
      ...[...s.input.slots, ...s.output.slots].filter(x => !!x).map(x => [x!.kind, x!.count] as [ItemKind, number])];
    const trial = new Inventory(this.hotbar.slots.length);
    this.hotbar.slots.forEach((x, i) => { trial.slots[i] = x ? { ...x } : null; });
    for (const [kind, n] of back) if (trial.add(kind, n) < n) return "full";
    for (const [kind, n] of back) this.hotbar.add(kind, n);
    this.dropSmelter(s);
    this.events.push({ type: "smelter-removed", smelter: s });
    return "ok";
  }

  /** Take a smelter off the map (removed or destroyed): its cells free up and paths change. */
  private dropSmelter(s: Smelter): void {
    this.smelters.splice(this.smelters.indexOf(s), 1);
    for (const [x, y] of s.cells) { this.world.buildings.delete(cellKey(x, y)); this.world.targets.delete(cellKey(x, y)); }
    this.field = computeField(this.world);
  }

  /** An enemy claws what's at `key`: a wall cell, the ship or a smelter. At 0 HP it's destroyed. */
  private damageTarget(key: string, amount: number): void {
    if (this.world.walls.has(key)) {
      const hp = (this.world.wallHp.get(key) ?? this.world.defaultWallHp) - amount;
      if (hp > 0) this.world.wallHp.set(key, hp);
      else this.breakWall(key);
      return;
    }
    if (this.world.nexus.has(key)) {
      if (this.shipDown) return;
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp > 0) return;
      this.shipDown = true;
      for (const k of this.world.nexus) this.world.targets.delete(k);
      this.field = computeField(this.world);
      this.events.push({ type: "ship-destroyed" });
      return;
    }
    const [x, y] = key.split(",").map(Number) as [number, number];
    const s = this.smelterAt(x, y);
    if (!s) return;
    s.hp = Math.max(0, s.hp - amount);
    if (s.hp > 0) return;
    this.dropSmelter(s);
    this.events.push({ type: "smelter-destroyed", smelter: s });
  }

  /** Put a hotbar slot's raw metal into a smelter (as much as fits). Only raw metal goes in. Returns how much moved. */
  smelterPut(id: number, hotbarSlot: number): number {
    const s = this.smelters.find(x => x.id === id), stack = this.hotbar.slots[hotbarSlot];
    if (!s || !this.canUseSmelter(s) || stack?.kind !== "metal") return 0;
    const n = s.input.add("metal", Math.min(stack.count, s.input.room("metal")));
    stack.count -= n;
    if (!stack.count) this.hotbar.slots[hotbarSlot] = null;
    return n;
  }

  /** Take one of the smelter's slots into the hotbar (as much as fits). `from` is "input" or "output". Returns how much moved. */
  smelterTake(id: number, from: "input" | "output", slot: number): number {
    const s = this.smelters.find(x => x.id === id);
    const inv = s ? s[from] : null, stack = inv?.slots[slot];
    if (!s || !inv || !stack || !this.canUseSmelter(s)) return 0;
    const n = this.hotbar.add(stack.kind, Math.min(stack.count, this.hotbar.room(stack.kind)));
    stack.count -= n;
    if (!stack.count) inv.slots[slot] = null;
    return n;
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
    if (this.ore("alloy") < this.towerCost(kind)) return { ok: false, cells, reason: "alloy" };
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
    this.hotbar.remove("alloy", cost);
    this.towers.push(tower);
    for (const [x, y] of tower.cells) this.towerCellsMap.set(cellKey(x, y), tower.id);
    this.events.push({ type: "tower-built", tower });
    this.noise(this.tuning.noiseBuild);
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
    this.hotbar.add("alloy", refund);
    this.events.push({ type: "tower-sold", tower: t, refund });
    return refund;
  }

  // ---------------------------------------------------------------- waves

  /** Start the raid now. The raid clock does this when it runs out (tests call it directly). */
  startWave(): boolean {
    if (this.phase !== "planning") return false;
    for (const p of this.pieces) p.locked = true;
    for (const t of this.towers) t.fresh = false;
    this.walkers = [];
    this.shots = [];
    this.waveLeft = this.waveSize(this.round);
    this.packQueue = [];
    this.spawnTimer = 0;
    this.setPhase("wave");
    return true;
  }

  get waveRemaining(): number { return this.waveLeft * this.activeSpawners().length + this.packQueue.length + this.walkers.length; }

  /** HP of an enemy in the given round. */
  enemyHp(round = this.round): number {
    return Math.max(1, Math.round(this.tuning.enemyHp * this.tuning.enemyHpGrowth ** (round - 1)));
  }

  /** A walking speed within ±speedSpread of the average: one per pack, so a pack moves as one. */
  private rollSpeed(): number {
    return ENEMY_SPEED * (1 + (this.rng.next() * 2 - 1) * this.tuning.speedSpread) * this.tuning.enemySpeed;
  }

  /** One enemy climbs out of a cave, with its pack's speed and its own line. */
  private spawnWalker(at: Cell, practice: boolean, speed = this.rollSpeed()): void {
    const [sx, sy] = at, hp = this.enemyHp();
    this.walkers.push({
      id: this.nextId++, x: sx + 0.5, y: sy + 0.5, cx: sx, cy: sy, tx: sx, ty: sy,
      speed,
      hp, maxHp: hp, pending: 0, practice, lane: this.rng.next() * 2 - 1,
    });
  }

  /** Send the next pack from every active cave: its enemies climb out one after another. */
  private sendPack(): void {
    const t = this.tuning, lo = Math.max(1, Math.round(Math.min(t.packMin, t.packMax))), hi = Math.max(lo, Math.round(t.packMax));
    const size = Math.min(this.waveLeft, lo + this.rng.int(hi - lo + 1));
    for (const at of this.activeSpawners()) {
      const speed = this.rollSpeed();
      for (let i = 0; i < size; i++) this.packQueue.push({ at, delay: i * PACK_STAGGER, speed });
    }
    this.waveLeft -= size;
    this.spawnTimer = t.packGap + size * PACK_STAGGER;
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
    this.syncWallWeights();
    if (this.phase === "wave") {
      this.spawnTimer -= dt;
      if (this.waveLeft > 0 && this.spawnTimer <= 0) this.sendPack();
      for (const q of this.packQueue) if ((q.delay -= dt) <= 0) this.spawnWalker(q.at, false, q.speed);
      this.packQueue = this.packQueue.filter(q => q.delay > 0);
    } else if (this.phase === "planning") {
      // The raid clock: it runs down on its own, faster while a smelter works.
      const warnedBefore = this.raidWarned;
      if (this.smelters.some(s => s.working)) this.noise(dt * this.tuning.smeltNoise);
      this.raidIn -= dt;
      if (!warnedBefore && this.raidWarned) this.events.push({ type: "raid-warning" });
      if (this.raidIn <= 0) { this.startWave(); return; }
      if (this.testWalkers) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) { for (const at of this.activeSpawners()) this.spawnWalker(at, true); this.spawnTimer = 1.6; }
      }
    }
    this.moveWalkers(dt);
    // A leak may have ended the run.
    if ((this.phase as Phase) === "over") return;
    for (const s of this.smelters) smelt(s, dt, this.tuning.smeltRate);
    this.updateTowers(dt);
    this.updateShots(dt);
    if (this.phase === "wave" && this.waveLeft === 0 && this.packQueue.length === 0 && this.walkers.length === 0) {
      this.round++;
      this.setPhase("planning");
      this.raidIn = this.tuning.raidInterval;
      this.regrowNodes();
    }
  }

  /**
   * Enemies walk the flow field to the nearest target. Next to one, they stop and
   * claw it until it's destroyed, then walk on to the next. With nothing left to go
   * for, they burrow back underground.
   */
  private moveWalkers(dt: number): void {
    const gone: Walker[] = [];
    /** Enemies clawing each wall cell this tick: only `wallClawers` of them do damage. */
    const clawing = new Map<string, number>();
    for (const w of this.walkers) {
      w.px = w.x; w.py = w.y;
      if (!this.world.targets.size) { gone.push(w); continue; }
      if (w.attacking) {
        const k = w.attacking;
        if (this.world.targets.has(k)) { this.damageTarget(k, this.tuning.enemyDamage * dt); continue; }
        // Chewing a wall: keep at it while it's still the quickest way on.
        const n = this.world.walls.has(k) ? this.field.next(w.cx, w.cy) : null;
        if (n && cellKey(n[0], n[1]) === k) {
          const c = clawing.get(k) ?? 0;
          if (c < this.tuning.wallClawers) { clawing.set(k, c + 1); if (!w.practice) this.damageTarget(k, this.tuning.enemyDamage * dt); }
          continue;
        }
        w.attacking = null; // gone, or no longer in the way: walk on from here
      }
      let budget = w.speed * dt;
      while (budget > 0) {
        const gx = w.tx + 0.5, gy = w.ty + 0.5, dx = gx - w.x, dy = gy - w.y, L = Math.hypot(dx, dy);
        if (L <= budget) {
          w.x = gx; w.y = gy; budget -= L; w.cx = w.tx; w.cy = w.ty;
          const t = this.world.targetNextTo(w.cx, w.cy);
          if (t) { if (w.practice) gone.push(w); else w.attacking = t; break; }
          const n = this.field.next(w.cx, w.cy);
          if (!n) break;
          // The quickest way on is through a wall: stop here and chew it.
          if (this.world.walls.has(cellKey(n[0], n[1]))) { w.attacking = cellKey(n[0], n[1]); break; }
          [w.tx, w.ty] = n;
        } else {
          w.x += (dx / L) * budget; w.y += (dy / L) * budget; budget = 0;
        }
      }
    }
    if (gone.length) this.walkers = this.walkers.filter(w => !gone.includes(w));
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
    // A wrecked ship's gun is silent.
    const st = !this.shipDown && s.damage > 0 && s.rate > 0 ? this.pickTargetFrom(c.x, c.y, s.range) : null;
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
    if (p === "planning") { this.walkers = []; this.shots = []; this.packQueue = []; this.spawnTimer = 0; }
    this.phase = p;
    this.events.push({ type: "phase", phase: p });
  }

  /**
   * The caves that send enemies: the few nearest the ship by walking distance
   * (`tuning.activeCaves`). A big world has caves everywhere; the far ones stay quiet.
   */
  activeSpawners(): Cell[] {
    const n = Math.max(1, Math.round(this.tuning.activeCaves));
    if (this.world.spawners.length <= n) return this.world.spawners;
    return [...this.world.spawners].sort((a, b) => this.field.at(a[0], a[1]) - this.field.at(b[0], b[1])).slice(0, n);
  }

  /** Current route from each active cave to the ship. */
  routes(field: FlowField = this.field): Cell[][] {
    return this.activeSpawners().map(s => field.trace(s));
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
