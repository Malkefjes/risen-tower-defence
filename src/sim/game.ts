import { Avatar, defaultAvatarTuning, type AvatarInput, type AvatarTuning } from "./avatar";
import { Hotbar, Inventory, type ItemKind } from "./inventory";
import { gapTo, newSmelter, smelt, smelterCells, type Smelter } from "./smelter";
import { nodeArea, nodeCellTop, nodeFootprint, nodeMax, ORE_STAGES, stagesLeft, viewGap, type OreNode } from "./ore";
import { computeField, keysOf, type FlowField } from "./pathfinding";
import { pieceCells, type ShapeId } from "./pieces";
import { Rng } from "./rng";
import { ENEMY_INFO, ENEMY_KINDS, throughArmour, type EnemyKind, type EnemyStats } from "./enemies";
import { BOLT_SPEED, footprint, missileTime, SLUG_SPEED, TOWER_INFO, TOWER_TOP, type Tower, type TowerKind, type TowerStats } from "./towers";
import { mergeTuning, type Tuning, type TuningPatch } from "./tuning";
import { cellKey, parseKey, type Cell } from "./types";
import { WALL_DECK, World, type MapDef } from "./world";

export const TICK = 1 / 60;
/** Shots from the ship's own gun carry this as their shooter id (tower ids start at 1). */
export const SHIP_SHOOTER = 0;
/** The avatar collides with the world in eighths of a cell (for the rim around towers). */
export const AVATAR_SUB = 8;
/** A tree's trunk, in eighths of its cell: the part that blocks the player. */
const TRUNK_LO = 2, TRUNK_HI = 6;
/** Width of the wall rim left around a tower, in eighths of a cell. */
const RIM = 1;

/** Calm (the raid clock runs; code name "planning") or a raid ("wave"). A run never ends by itself. */
export type Phase = "planning" | "wave";

export interface PlacedPiece {
  id: number;
  shape: ShapeId;
  rot: number;
  at: Cell;
  cells: Cell[];
  /** Locked pieces stay. Unlocked ones (placed this calm) can be picked back up. */
  locked: boolean;
  /** Stone paid, returned when it's picked back up. */
  paid: number;
  /** Plated with metal: the Armored deck, the only wall towers stand on. */
  metal: boolean;
  /** Alloy paid for the plating, returned with the stone on pick-up. */
  plated: number;
}

export interface Walker {
  id: number;
  kind: EnemyKind;
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
  /** Practice walkers (calm, test walkers on): shootable, but do no damage (they vanish on reaching a target). */
  practice: boolean;
  /** Seconds it stays Heavy (slowed): set while in a Radome's field, then running out. */
  heavy?: number;
  /** The target cell it's clawing (it stands still meanwhile), or none while walking. */
  attacking?: string | null;
}

/** A bolt or missile in flight. Damage lands when `t` reaches `dur`. */
export interface Shot {
  id: number;
  towerId: number;
  targetId: number;
  damage: number;
  t: number;
  dur: number;
  /** Blast radius: every enemy this close to where it lands is hit (0 = only the target). */
  radius: number;
  /** Where it lands: the target's position, followed while the target lives. */
  x: number; y: number;
}

export type BlockReason = "occupied" | "walker" | "avatar" | "stone" | "out-of-range" | "unconnected";

export type PlacementCheck =
  | { ok: true; cells: Cell[]; field: FlowField }
  | { ok: false; cells: Cell[]; reason: BlockReason };

export type TowerBlockReason = "no-wall" | "stone-wall" | "tower-there" | "avatar" | "alloy" | "max-size";

export type SmelterBlockReason = "occupied" | "walker" | "avatar" | "seals-path" | "traps-walker" | "stone" | "metal" | "out-of-range" | "unconnected";

export type SmelterCheck =
  | { ok: true; cells: Cell[]; field: FlowField }
  | { ok: false; cells: Cell[]; reason: SmelterBlockReason };

/** How close the player must be to a smelter to use it: the gap to its footprint, in cells. */
export const SMELTER_REACH = 1.6;
/** Slots in the ship's inventory. */
export const SHIP_SLOTS = 24;

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
  | { type: "tower-grown"; tower: Tower }
  | { type: "tower-sold"; tower: Tower; refund: number }
  | { type: "smelter-built"; smelter: Smelter }
  /** The raid clock reached its warning: the active caves stir. */
  | { type: "raid-warning" }
  | { type: "smelter-removed"; smelter: Smelter }
  | { type: "shot"; shot: Shot }
  /** A tree was cut down: its cell is open ground. */
  | { type: "tree-felled"; x: number; y: number }
  /** A missile burst at (x, y), hitting everything within `radius`. */
  | { type: "blast"; x: number; y: number; radius: number; towerId: number }
  | { type: "hit"; walker: Walker }
  | { type: "killed"; walker: Walker }
  /** The ship's HP hit 0: it's a wreck now, and the run goes on. */
  | { type: "ship-destroyed" }
  /** A smelter's HP hit 0: it's gone, with what was in it. */
  | { type: "smelter-destroyed"; smelter: Smelter }
  /** Enemies chewed through a wall piece: the whole shape is gone, and so is any tower on it. */
  | { type: "wall-broken"; piece: PlacedPiece }
  | { type: "tower-destroyed"; tower: Tower }
  | { type: "repaired"; piece: PlacedPiece }
  | { type: "avatar-landed" }
  | { type: "reset" };

export const REASON_TEXT: Record<BlockReason, string> = {
  "out-of-range": "Too far from the ship",
  "unconnected": "Must connect to your walls",
  "occupied": "Something is already there",
  "walker": "An enemy is in the way",
  "avatar": "You're standing there",
  "stone": "Not enough stone",
};

export const SMELTER_REASON_TEXT: Record<SmelterBlockReason, string> = {
  "occupied": "Something is already there",
  "walker": "An enemy is in the way",
  "avatar": "You're standing there",
  "seals-path": "That would seal off the enemies' path",
  "traps-walker": "That would trap an enemy",
  "stone": "Not enough stone",
  "metal": "Not enough raw metal",
  "out-of-range": "Too far from the ship",
  "unconnected": "Must connect to your walls",
};

export const TOWER_REASON_TEXT: Record<TowerBlockReason, string> = {
  "no-wall": "Towers go on top of walls",
  "stone-wall": "Needs metal plating",
  "tower-there": "There's already a tower there",
  "avatar": "You're standing there",
  "alloy": "Not enough alloy",
  "max-size": "It can't grow any bigger",
};

/** One pack of a raid: `size` enemies of a type, sent from every active cave. */
export interface RaidPack { kind: EnemyKind; size: number }

export interface GameOptions {
  seed?: number;
  waveSize?: (round: number) => number;
  /** Numbers that differ from the defaults, at any depth. */
  tuning?: TuningPatch;
  /**
   * Supply rules for building: walls and buildings must be within the ship's supply
   * radius and connected to it through walls. On in the game; off by default so rule
   * tests about other things can put walls anywhere.
   */
  supply?: boolean;
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
  /** The player's inventory: the multitool, stone, raw metal and alloy. */
  hotbar = new Hotbar();
  /** The ship's HP. */
  hp = 0;
  /** The ship was destroyed: a wreck that still blocks, its gun silent. The run goes on. */
  shipDown = false;
  /** Building needs supply (see GameOptions.supply). */
  readonly supplyRule: boolean;
  /**
   * Wall and building cells that are supplied: within the ship's radius and connected
   * to it through walls or buildings (touching counts, corners too).
   */
  supplied = new Set<string>();
  /** The ship's own inventory (24 slots): storage, and what it takes upkeep from. Lost if the ship is destroyed. */
  shipStore = new Inventory(SHIP_SLOTS);
  /** Upkeep owed but not yet taken (whole pieces are taken as they add up), per resource. */
  private owed = { stone: 0, alloy: 0 };
  /** The ship could pay its last upkeep. When it can't, everything it supplies decays. */
  upkeepPaid = true;
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
  /** The tool's trigger, the cursor on a node's hotspot, and the cell under the cursor (for picking a tree). */
  mineInput: { firing: boolean; onSpot: boolean; aim?: Cell } = { firing: false, onSpot: false };
  /** The tree being cut down and how far along (0 to 1), or null. */
  chop: { x: number; y: number; progress: number } | null = null;
  /** What mining is doing this tick: the node being mined, and whether the hotbar is too full to take its next chunk. */
  mining: { node: OreNode | null; full: boolean } = { node: null, full: false };

  private nextId = 1;
  /** Enemies each active cave still has to send this wave. */
  /** The packs of this raid still to come (each is sent from every active cave). */
  private plan: RaidPack[] = [];
  private planSize = 0;
  /** Seeds each raid's plan, so the warning shows the raid that then comes. */
  private planSeed: number;
  /** Enemies of packs already under way, each waiting to climb out of its cave. */
  private packQueue: { at: Cell; delay: number; speed: number; kind: EnemyKind }[] = [];
  private spawnTimer = 0;
  private waveSize: (round: number) => number;
  /** Raid size per active cave, in Grunts: `raidBase` plus `raidStep` a raid, unless a test gives its own. */
  private customWaveSize: ((round: number) => number) | undefined;
  /** cell key -> id of the tower standing on it */
  private towerCellsMap = new Map<string, number>();

  constructor(map: MapDef, opts: GameOptions = {}) {
    this.world = new World(map);
    this.rng = new Rng(opts.seed ?? Date.now());
    this.planSeed = (opts.seed ?? Date.now()) >>> 0;
    this.customWaveSize = opts.waveSize;
    this.waveSize = r => this.customWaveSize ? this.customWaveSize(r) : this.tuning.raidBase + this.tuning.raidStep * (r - 1);
    this.tuning = mergeTuning(opts.tuning);
    this.supplyRule = opts.supply ?? false;
    this.nodes = (map.ore ?? []).map(o => ({ id: this.nextId++, kind: o.kind, x: o.x, y: o.y, amount: nodeMax(o.kind), max: nodeMax(o.kind) }));
    this.syncOre();
    this.syncWallWeights();
    this.field = computeField(this.world);
    this.syncSupply();
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
    if (this.world.isShip(x, y)) return Infinity;
    const k = cellKey(x, y);
    if (this.world.buildings.has(k)) return Infinity;
    const terrain = this.world.terrainTop.get(k);
    if (terrain !== undefined) return terrain;
    const oreId = this.world.ore.get(k);
    if (oreId !== undefined) return nodeCellTop(this.nodes.find(n => n.id === oreId)!, x, y);
    const tower = this.towerAt(x, y);
    if (tower) return WALL_DECK + TOWER_TOP[tower.size - 1]!;
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
    for (const k of this.world.ship) this.world.targets.add(k);
    this.raidIn = this.tuning.raidGrace;
    this.shipStore = new Inventory(SHIP_SLOTS);
    this.shipStore.add("stone", this.tuning.shipStartStone);
    this.owed = { stone: 0, alloy: 0 };
    this.upkeepPaid = true;
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
    this.world.regrowTrees();
    this.chop = null;
    this.world.walls.clear();
    this.world.buildings.clear();
    this.world.targets.clear();
    this.world.pieceHp.clear();
    this.towerCellsMap.clear();
    this.smelters = [];
    this.pieces = []; this.towers = []; this.walkers = []; this.shots = [];
    this.round = 1;
    this.phase = "planning";
    this.plan = []; this.spawnTimer = 0; this.packQueue = [];
    const [sx, sy] = this.world.map.start ?? this.world.map.spawners[0]!;
    this.avatar.place(sx + 0.5, sy + 0.5);
    for (const n of this.nodes) n.amount = n.max;
    this.syncOre();
    this.refresh();
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
    const tool = this.mineInput.firing && this.hotbar.held === "multitool";
    const n = tool ? this.nodeInReach() : null;
    this.mining = { node: n, full: false };
    if (!n) { this.stepChop(tool, dt); return; }
    this.chop = null;
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
    this.refresh();
    this.events.push({ type: "node-broke", node: n, stagesLeft: stagesLeft(n), added });
    this.noise(n.kind === "metal" ? this.tuning.noiseMetal : this.tuning.noiseStone);
  }

  /**
   * The tree to cut: in reach of the avatar (the gap from its position to the cell,
   * within `reach`) and under the cursor or next to it, the nearest to the cursor.
   */
  treeInReach(aim?: Cell): Cell | null {
    const { x, y } = this.avatar, reach = this.tuning.reach, r = Math.ceil(reach) + 1;
    let best: Cell | null = null, bestD = Infinity;
    for (let cy = Math.floor(y) - r; cy <= Math.floor(y) + r; cy++) for (let cx = Math.floor(x) - r; cx <= Math.floor(x) + r; cx++) {
      if (!this.world.isTree(cx, cy)) continue;
      const gap = Math.hypot(Math.max(cx - x, 0, x - (cx + 1)), Math.max(cy - y, 0, y - (cy + 1)));
      if (gap > reach) continue;
      // With a cursor, only the tree it points at (or right next to it).
      const d = aim ? Math.hypot(cx - aim[0], cy - aim[1]) : gap;
      if (aim && d > 1.5) continue;
      if (d < bestD) { bestD = d; best = [cx, cy]; }
    }
    return best;
  }

  /** Cut at the tree in reach while the tool fires; it falls after `chopTime`. Moving to another tree starts over. */
  private stepChop(tool: boolean, dt: number): void {
    const t = tool ? this.treeInReach(this.mineInput.aim) : null;
    if (!t) { this.chop = null; return; }
    if (!this.chop || this.chop.x !== t[0] || this.chop.y !== t[1]) this.chop = { x: t[0], y: t[1], progress: 0 };
    this.chop.progress += dt / Math.max(0.05, this.tuning.chopTime);
    if (this.chop.progress < 1) return;
    this.chop = null;
    this.world.fellTree(t[0], t[1]);
    this.refresh();
    this.events.push({ type: "tree-felled", x: t[0], y: t[1] });
  }

  /**
   * Mined-out nodes grow back when a raid is cleared, if their 3×3 is
   * clear (no walls, not the avatar) and growing wouldn't seal the caves off.
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
      this.refresh();
      this.events.push({ type: "node-grew", node: n });
    }
  }

  /** How much of an item (stone, raw metal, alloy) is in the hotbar. */
  ore(kind: ItemKind): number { return this.god ? Infinity : this.hotbar.count(kind); }

  /**
   * God mode, for trying things out: building, plating, growing and repairing cost
   * nothing, upkeep stops, and the next raid can be started at once (`startWave`).
   */
  god = false;

  /** Take the price of something out of the hand (nothing in god mode); returns what was taken. */
  private pay(kind: ItemKind, n: number): number { return this.god ? 0 : this.hotbar.remove(kind, n); }

  // ---------------------------------------------------------------- placement


  /** Would placing `shape` at `at` be legal? On success also returns the resulting flow field. */
  checkPlacement(shape: ShapeId, rot: number, at: Cell): PlacementCheck {
    const cells = pieceCells(shape, rot, at);
    for (const [x, y] of cells) if (this.world.isOccupied(x, y)) return { ok: false, cells, reason: "occupied" };
    const supply = this.checkSupply(cells);
    if (supply) return { ok: false, cells, reason: supply };
    if (this.ore("stone") < this.wallCost(cells.length)) return { ok: false, cells, reason: "stone" };
    const set = keysOf(cells);
    // A wall can't be dropped on the avatar (only matters while it's below deck height).
    if (this.avatar.z < WALL_DECK) for (const k of this.avatarCells()) if (set.has(k)) return { ok: false, cells, reason: "avatar" };
    for (const w of this.walkers) {
      if (set.has(cellKey(w.cx, w.cy)) || set.has(cellKey(w.tx, w.ty))) return { ok: false, cells, reason: "walker" };
    }
    // Walls can always be chewed through, so a wall never seals a path; the field is
    // for the preview of the new route.
    return { ok: true, cells, field: computeField(this.world, set, cells, this.tuning.wallHp) };
  }

  /** Buy and place a piece, paying its stone. Pieces placed during a wave lock immediately. */
  place(shape: ShapeId, rot: number, at: Cell): PlacementCheck & { piece?: PlacedPiece } {
    const check = this.checkPlacement(shape, rot, at);
    if (!check.ok) return check;
    const paid = this.pay("stone", this.wallCost(check.cells.length));
    const piece: PlacedPiece = { id: this.nextId++, shape, rot, at, cells: check.cells, locked: this.phase === "wave", paid, metal: false, plated: 0 };
    this.pieces.push(piece);
    for (const [x, y] of piece.cells) this.world.walls.set(cellKey(x, y), piece.id);
    this.world.pieceHp.set(piece.id, this.tuning.wallHp);
    this.refresh();
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

  /** Take up an unlocked piece, refunding its stone (and plating alloy). Returns its shape. */
  pickUp(pieceId: number): ShapeId | null {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canPickUp(piece)) return null;
    this.pieces.splice(this.pieces.indexOf(piece), 1);
    for (const [x, y] of piece.cells) this.world.walls.delete(cellKey(x, y));
    this.world.pieceHp.delete(piece.id);
    this.refresh();
    this.hotbar.add("stone", piece.paid);
    if (piece.plated) this.hotbar.add("alloy", piece.plated);
    this.events.push({ type: "removed", piece });
    return piece.shape;
  }

  /** Can this piece be plated? Any stone piece, locked or not, with the alloy for it. */
  canPlate(piece: PlacedPiece | undefined): piece is PlacedPiece {
    return !!piece && !piece.metal && this.ore("alloy") >= this.tuning.platingCost;
  }

  /**
   * Metal plating: turns a whole stone piece into the Armored deck, which towers
   * can stand on. Same shape and place, so the path doesn't change.
   */
  plate(pieceId: number): boolean {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canPlate(piece)) return false;
    piece.plated = this.pay("alloy", this.tuning.platingCost);
    // Plating toughens the whole piece, keeping its share of damage.
    this.world.pieceHp.set(piece.id, (this.world.pieceHp.get(piece.id) ?? this.tuning.wallHp) * this.tuning.platedHpMult);
    piece.metal = true;
    this.refresh();
    this.events.push({ type: "plated", piece });
    return true;
  }

  /** Full HP of a piece: stone, or plated (tougher). */
  /**
   * A wall piece of any shape, free and at once (no hand, no stone, no supply check),
   * locked like a piece from an earlier calm: for the balance maze and tests.
   */
  putWall(cells: Cell[], plated = true): PlacedPiece {
    const piece: PlacedPiece = { id: this.nextId++, shape: "O", rot: 0, at: cells[0]!, cells, locked: true, paid: 0, metal: plated, plated: 0 };
    this.pieces.push(piece);
    for (const [x, y] of cells) this.world.walls.set(cellKey(x, y), piece.id);
    this.world.pieceHp.set(piece.id, this.wallMaxHp(piece));
    this.refresh();
    return piece;
  }

  wallMaxHp(piece: PlacedPiece): number { return this.tuning.wallHp * (piece.metal ? this.tuning.platedHpMult : 1); }

  /** HP left in a piece and its full HP. */
  pieceHp(piece: PlacedPiece): { hp: number; max: number } {
    const max = this.wallMaxHp(piece);
    return { hp: this.world.pieceHp.get(piece.id) ?? max, max };
  }

  /** Stone to repair a piece: its share of the wall price for the HP it's missing. */
  repairCost(piece: PlacedPiece): number {
    const { hp, max } = this.pieceHp(piece);
    return max > hp ? Math.ceil(((max - hp) / max) * this.wallCost(piece.cells.length)) : 0;
  }

  /** Repairs happen in calm only: during a raid a wall holds with what it has. */
  canRepair(piece: PlacedPiece | undefined): piece is PlacedPiece {
    return !!piece && this.phase === "planning" && this.repairCost(piece) > 0 && this.ore("stone") >= this.repairCost(piece);
  }

  /** Repair a piece to full HP for stone, in calm. */
  repair(pieceId: number): boolean {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (!this.canRepair(piece)) return false;
    this.pay("stone", this.repairCost(piece));
    this.world.pieceHp.set(piece.id, this.wallMaxHp(piece));
    this.refresh();
    this.events.push({ type: "repaired", piece });
    return true;
  }

  /** Path weights for walls follow the tuning: chew time (at the most clawers) as walking distance. */
  private syncWallWeights(): void {
    const t = this.tuning;
    this.world.defaultWallHp = t.wallHp;
    // One field for everyone, weighed for the Grunt; types that chew differently will get their own.
    const e = t.enemies.grunt;
    this.world.hpToCost = e.speed / (Math.max(1, t.wallClawers) * Math.max(0.01, e.damage));
  }

  /**
   * Enemies chewed a piece to 0: the whole shape goes at once (so the gap fits the same
   * piece again), and so does any tower standing on it (a 2×2 on two pieces goes if either does).
   */
  private breakPiece(id: number): void {
    const piece = this.pieces.find(p => p.id === id);
    const cells = piece ? piece.cells : [...this.world.walls].filter(([, v]) => v === id).map(([k]) => parseKey(k));
    for (const [x, y] of cells) {
      this.world.walls.delete(cellKey(x, y));
      const tower = this.towerAt(x, y);
      if (!tower) continue;
      this.towers.splice(this.towers.indexOf(tower), 1);
      for (const [tx, ty] of tower.cells) this.towerCellsMap.delete(cellKey(tx, ty));
      this.events.push({ type: "tower-destroyed", tower });
    }
    this.world.pieceHp.delete(id);
    if (piece) this.pieces.splice(this.pieces.indexOf(piece), 1);
    this.refresh();
    if (piece) this.events.push({ type: "wall-broken", piece });
  }

  /** Undo the most recent unlocked placement. */
  undo(): PlacedPiece | null {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i]!;
      if (!p.locked) return this.pickUp(p.id) ? p : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- supply

  /** Walls or buildings changed: new paths for the enemies, and new supply. */
  private refresh(): void {
    this.field = computeField(this.world);
    this.syncSupply();
  }

  /** Is a cell within the ship's supply radius (measured to the cell's centre)? */
  inSupplyRange(x: number, y: number): boolean {
    if (this.shipDown) return false;
    const c = this.shipCenter();
    return Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= this.tuning.supplyRadius;
  }

  /** Why these cells can't be built on under the supply rules, or null if they can. */
  private checkSupply(cells: readonly Cell[]): "out-of-range" | "unconnected" | null {
    if (!this.supplyRule) return null;
    if (cells.some(([x, y]) => !this.inSupplyRange(x, y))) return "out-of-range";
    const joins = cells.some(([x, y]) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const k = cellKey(x + dx, y + dy);
        if ((dx || dy) && (this.supplied.has(k) || this.world.ship.has(k))) return true;
      }
      return false;
    });
    return joins ? null : "unconnected";
  }

  /**
   * Which walls and buildings are supplied: a flood from the ship through touching
   * walls and buildings (corners count), staying within the supply radius.
   */
  private syncSupply(): void {
    const out = new Set<string>();
    if (!this.shipDown) {
      const stack: Cell[] = [...this.world.ship].map(k => parseKey(k));
      while (stack.length) {
        const [x, y] = stack.pop()!;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, k = cellKey(nx, ny);
          if (out.has(k) || !(this.world.walls.has(k) || this.world.buildings.has(k)) || !this.inSupplyRange(nx, ny)) continue;
          out.add(k);
          stack.push([nx, ny]);
        }
      }
    }
    this.supplied = out;
  }

  // ---------------------------------------------------------------- the ship's inventory and upkeep

  /** Is the player close enough to use the ship's inventory (the gap to its footprint)? */
  canUseShip(): boolean {
    if (this.shipDown) return false;
    const xs = [...this.world.ship].map(k => parseKey(k));
    const x0 = Math.min(...xs.map(c => c[0])), x1 = Math.max(...xs.map(c => c[0])) + 1;
    const y0 = Math.min(...xs.map(c => c[1])), y1 = Math.max(...xs.map(c => c[1])) + 1;
    const { x, y } = this.avatar;
    return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1)) <= SMELTER_REACH;
  }

  /** Put a hotbar stack into the ship (as much as fits; anything but the multitool). Returns how much moved. */
  shipPut(hotbarSlot: number): number {
    const stack = this.hotbar.slots[hotbarSlot];
    if (!stack || stack.kind === "multitool" || !this.canUseShip()) return 0;
    const n = this.shipStore.add(stack.kind, Math.min(stack.count, this.shipStore.room(stack.kind)));
    stack.count -= n;
    if (!stack.count) this.hotbar.slots[hotbarSlot] = null;
    return n;
  }

  /** Take one of the ship's slots into the hotbar (as much as fits). Returns how much moved. */
  shipTake(slot: number): number {
    const stack = this.shipStore.slots[slot];
    if (!stack || !this.canUseShip()) return 0;
    const n = this.hotbar.add(stack.kind, Math.min(stack.count, this.hotbar.room(stack.kind)));
    stack.count -= n;
    if (!stack.count) this.shipStore.slots[slot] = null;
    return n;
  }

  /**
   * Upkeep per minute: a share of each supplied thing's build price, in what it was
   * paid with. Stone walls and smelters cost stone; plating and towers cost alloy.
   */
  upkeepPerMinute(): { stone: number; alloy: number } {
    const r = this.tuning.upkeepRate;
    let stone = 0, alloy = 0;
    for (const p of this.pieces) if (this.pieceSupplied(p)) { stone += p.paid || this.wallCost(p.cells.length); alloy += p.plated; }
    for (const t of this.towers) if (t.cells.some(([x, y]) => this.supplied.has(cellKey(x, y)))) alloy += t.paid;
    for (const s of this.smelters) if (s.cells.some(([x, y]) => this.supplied.has(cellKey(x, y)))) stone += s.paid.stone;
    return { stone: stone * r, alloy: alloy * r };
  }

  /** Seconds the ship's stock lasts at the current upkeep (Infinity if nothing is owed). */
  upkeepLasts(): number {
    const u = this.upkeepPerMinute();
    const t = (have: number, rate: number) => (rate > 0 ? (have / rate) * 60 : Infinity);
    return Math.min(t(this.shipStore.count("stone"), u.stone), t(this.shipStore.count("alloy"), u.alloy));
  }

  /**
   * Take upkeep from the ship's stock as it adds up, and decay anything unsupplied, or
   * everything supplied while the upkeep goes unpaid (slowly: `decayTime`). Paid upkeep
   * mends supplied walls, slowly and in calm only (`repairTime` from broken to full).
   */
  private stepUpkeep(dt: number): void {
    if (!this.supplyRule) return;
    let paid = true;
    if (!this.god) {
      const u = this.upkeepPerMinute();
      for (const kind of ["stone", "alloy"] as const) {
        this.owed[kind] += (u[kind] * dt) / 60;
        const whole = Math.floor(this.owed[kind]);
        if (whole <= 0) continue;
        const took = this.shipStore.remove(kind, whole);
        this.owed[kind] -= took;
        if (took < whole) { paid = false; this.owed[kind] = Math.min(this.owed[kind], 1); }
      }
    }
    this.upkeepPaid = paid;
    const rate = dt / Math.max(1, this.tuning.decayTime), mend = dt / Math.max(1, this.tuning.repairTime);
    const broken: number[] = [];
    for (const p of this.pieces) {
      if (this.upkeepPaid && this.pieceSupplied(p)) {
        if (this.phase !== "planning") continue;
        const max = this.wallMaxHp(p), hp = this.world.pieceHp.get(p.id) ?? max;
        if (hp < max) this.world.pieceHp.set(p.id, Math.min(max, hp + max * mend));
        continue;
      }
      const max = this.wallMaxHp(p), hp = (this.world.pieceHp.get(p.id) ?? max) - max * rate;
      if (hp > 0) this.world.pieceHp.set(p.id, hp);
      else broken.push(p.id);
    }
    for (const id of broken) this.breakPiece(id);
    for (const s of [...this.smelters]) {
      if (this.upkeepPaid && s.cells.some(([x, y]) => this.supplied.has(cellKey(x, y)))) continue;
      s.hp = Math.max(0, s.hp - s.maxHp * rate);
      if (s.hp <= 0) { this.dropSmelter(s); this.events.push({ type: "smelter-destroyed", smelter: s }); }
    }
  }

  /** Is this wall piece supplied (any of its cells: a piece is one connected shape)? */
  pieceSupplied(piece: PlacedPiece): boolean { return piece.cells.some(([x, y]) => this.supplied.has(cellKey(x, y))); }

  // ---------------------------------------------------------------- smelters

  /** Can a smelter go down with its top-left cell at `at`? Open ground only, paid in stone and raw metal. */
  checkSmelter(at: Cell): SmelterCheck {
    const cells = smelterCells(at);
    for (const [x, y] of cells) if (this.world.isOccupied(x, y)) return { ok: false, cells, reason: "occupied" };
    const supply = this.checkSupply(cells);
    if (supply) return { ok: false, cells, reason: supply };
    const set = keysOf(cells);
    for (const k of this.avatarCells()) if (set.has(k)) return { ok: false, cells, reason: "avatar" };
    for (const w of this.walkers) if (set.has(cellKey(w.cx, w.cy)) || set.has(cellKey(w.tx, w.ty))) return { ok: false, cells, reason: "walker" };
    if (this.ore("stone") < this.tuning.smelterStone) return { ok: false, cells, reason: "stone" };
    if (this.ore("metal") < this.tuning.smelterMetal) return { ok: false, cells, reason: "metal" };
    const field = computeField(this.world, set, cells);
    // With nothing left to attack there is no path to keep open.
    if (this.world.targets.size) {
      for (const [sx, sy] of this.world.spawners) if (!isFinite(field.at(sx, sy))) return { ok: false, cells, reason: "seals-path" };
      for (const w of this.walkers) if (!isFinite(field.at(w.tx, w.ty))) return { ok: false, cells, reason: "traps-walker" };
    }
    return { ok: true, cells, field };
  }

  buildSmelter(at: Cell): SmelterCheck & { smelter?: Smelter } {
    const check = this.checkSmelter(at);
    if (!check.ok) return check;
    const paid = { stone: this.pay("stone", this.tuning.smelterStone), metal: this.pay("metal", this.tuning.smelterMetal) };
    const s = newSmelter(this.nextId++, at, paid, this.tuning.smelterHp);
    this.smelters.push(s);
    for (const [x, y] of s.cells) { this.world.buildings.set(cellKey(x, y), s.id); this.world.targets.add(cellKey(x, y)); }
    this.refresh();
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
    return gapTo(s, this.avatar.x, this.avatar.y) <= SMELTER_REACH;
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
    this.refresh();
  }

  /** An enemy claws what's at `key`: a wall cell, the ship or a smelter. At 0 HP it's destroyed. */
  private damageTarget(key: string, amount: number): void {
    if (this.world.walls.has(key)) {
      const id = this.world.walls.get(key)!;
      const hp = (this.world.pieceHp.get(id) ?? this.world.defaultWallHp) - amount;
      if (hp > 0) this.world.pieceHp.set(id, hp);
      else this.breakPiece(id);
      return;
    }
    if (this.world.ship.has(key)) {
      if (this.shipDown) return;
      this.hp = Math.max(0, this.hp - amount);
      if (this.hp > 0) return;
      this.shipDown = true;
      // Its inventory goes with it.
      this.shipStore = new Inventory(SHIP_SLOTS);
      for (const k of this.world.ship) this.world.targets.delete(k);
      this.refresh();
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

  /** A tower's numbers at a size (its own size by default). */
  towerStats(t: { kind: TowerKind; size: number }): TowerStats { return this.tuning.towers[t.kind][t.size - 1]!; }

  /** Alloy for a new tower (1×1). */
  towerCost(kind: TowerKind): number { return this.towerStats({ kind, size: 1 }).cost; }

  /** Alloy to grow a tower one size up: the difference in total price. */
  growCost(t: Tower): number {
    return Math.max(0, this.towerStats({ kind: t.kind, size: t.size + 1 }).cost - this.towerStats(t).cost);
  }

  /** Can a tower go on these cells: plated walls, no tower but `self`, no avatar, and the alloy? */
  private checkTowerCells(cells: Cell[], cost: number, self?: Tower): TowerCheck {
    for (const [x, y] of cells) if (!this.world.walls.has(cellKey(x, y))) return { ok: false, cells, reason: "no-wall" };
    for (const [x, y] of cells) if (!this.pieceAt(x, y)?.metal) return { ok: false, cells, reason: "stone-wall" };
    for (const [x, y] of cells) { const id = this.towerCellsMap.get(cellKey(x, y)); if (id !== undefined && id !== self?.id) return { ok: false, cells, reason: "tower-there" }; }
    const under = this.avatarCells();
    for (const [x, y] of cells) if (under.has(cellKey(x, y)) && !self?.cells.some(c => c[0] === x && c[1] === y)) return { ok: false, cells, reason: "avatar" };
    if (this.ore("alloy") < cost) return { ok: false, cells, reason: "alloy" };
    return { ok: true, cells };
  }

  /** Towers stand on plated walls only. A footprint may span walls from different pieces. */
  checkTower(kind: TowerKind, at: Cell): TowerCheck {
    return this.checkTowerCells(footprint(at, 1), this.towerCost(kind));
  }

  buildTower(kind: TowerKind, at: Cell): TowerCheck & { tower?: Tower } {
    const check = this.checkTower(kind, at);
    if (!check.ok) return check;
    const cost = this.god ? 0 : this.towerCost(kind);
    const tower: Tower = {
      id: this.nextId++, kind, size: 1, at: [at[0], at[1]], cells: check.cells, cx: at[0] + 0.5, cy: at[1] + 0.5,
      paid: cost, paidNow: this.phase === "planning" ? cost : 0, dealt: 0, cooldown: 0, targetId: null,
    };
    this.pay("alloy", cost);
    this.towers.push(tower);
    for (const [x, y] of tower.cells) this.towerCellsMap.set(cellKey(x, y), tower.id);
    this.events.push({ type: "tower-built", tower });
    this.noise(this.tuning.noiseBuild);
    return { ...check, tower };
  }

  /**
   * Can this tower grow one size up with its footprint's corner at `at`? The new
   * footprint must hold the old one (see `growAt`), and its new cells follow the
   * same rules as building.
   */
  checkGrow(id: number, at: Cell): TowerCheck {
    const t = this.towers.find(x => x.id === id);
    if (!t) return { ok: false, cells: [], reason: "tower-there" };
    const n = t.size + 1, cells = footprint(at, n);
    if (n > TOWER_INFO[t.kind].maxSize) return { ok: false, cells, reason: "max-size" };
    const holds = t.at[0] >= at[0] && t.at[1] >= at[1] && t.at[0] + t.size <= at[0] + n && t.at[1] + t.size <= at[1] + n;
    if (!holds) return { ok: false, cells, reason: "tower-there" };
    return this.checkTowerCells(cells, this.growCost(t), t);
  }

  /** Grow a tower in place, one size up. It keeps its id, what was paid, and what it has dealt. */
  growTower(id: number, at: Cell): TowerCheck & { tower?: Tower } {
    const check = this.checkGrow(id, at);
    if (!check.ok) return check;
    const t = this.towers.find(x => x.id === id)!, cost = this.god ? 0 : this.growCost(t);
    this.pay("alloy", cost);
    t.paid += cost;
    if (this.phase === "planning") t.paidNow += cost;
    t.size += 1;
    t.at = [at[0], at[1]];
    t.cells = check.cells;
    t.cx = at[0] + t.size / 2; t.cy = at[1] + t.size / 2;
    for (const [x, y] of t.cells) this.towerCellsMap.set(cellKey(x, y), t.id);
    this.events.push({ type: "tower-grown", tower: t });
    this.noise(this.tuning.noiseBuild);
    return { ...check, tower: t };
  }

  towerAt(x: number, y: number): Tower | undefined {
    const id = this.towerCellsMap.get(cellKey(x, y));
    return id === undefined ? undefined : this.towers.find(t => t.id === id);
  }

  /** What spent this calm comes back in full; the rest at the sell refund share. */
  sellValue(t: Tower): number {
    return t.paidNow + Math.floor((t.paid - t.paidNow) * this.tuning.sellRefund);
  }

  /** Sell a tower, any time. Bolts already fired still land. Returns the refund, or null. */
  sellTower(id: number): number | null {
    const t = this.towers.find(x => x.id === id);
    if (!t) return null;
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
    for (const t of this.towers) t.paidNow = 0;
    this.walkers = [];
    this.shots = [];
    this.plan = this.raidPlan();
    this.planSize = this.plan.length;
    this.packQueue = [];
    this.spawnTimer = 0;
    this.setPhase("wave");
    return true;
  }

  /** Enemies of this raid not yet killed or gone: to come, climbing out, and about. */
  get waveRemaining(): number {
    return this.plan.reduce((a, p) => a + p.size, 0) * this.activeSpawners().length + this.packQueue.length + this.walkers.length;
  }

  /**
   * A raid's packs, planned ahead (the same plan every time for a raid of this run), so
   * the warning can show what's coming. The raid's size is shared between the types that
   * have come in by then (their `from`), by their `share`; each type's part becomes whole
   * enemies at its `cost`, in packs. A type's first raid always brings at least a pack of it.
   * The packs come in a shuffled order.
   */
  raidPlan(round = this.round): RaidPack[] {
    const t = this.tuning, rng = new Rng((this.planSeed * 31 + round * 7919) >>> 0), out: RaidPack[] = [];
    const total = this.waveSize(round);
    const lo = Math.max(1, Math.round(Math.min(t.packMin, t.packMax))), hi = Math.max(lo, Math.round(t.packMax));
    const shared = ENEMY_KINDS.filter(k => this.enemyStats(k).share > 0);
    const due = shared.filter(k => this.enemyStats(k).from <= round);
    const kinds: EnemyKind[] = due.length ? due : shared.length ? shared : ["grunt"];
    const shares = kinds.reduce((a, k) => a + Math.max(0, this.enemyStats(k).share), 0) || 1;
    for (const kind of kinds) {
      const e = this.enemyStats(kind), part = total * (shared.length ? e.share / shares : 1);
      let n = Math.round(part / Math.max(0.01, e.cost));
      // Its first raid shows the new type properly: at least a whole pack.
      if (e.from === round && shared.length) n = Math.max(n, e.pack > 0 ? Math.round(e.pack) : lo);
      while (n > 0) {
        const full = e.pack > 0 ? Math.round(e.pack) : lo + rng.int(hi - lo + 1), size = Math.min(n, full);
        out.push({ kind, size });
        n -= size;
      }
    }
    // Too small a raid for any whole enemy: one of the cheapest.
    if (!out.length) out.push({ kind: kinds.reduce((a, b) => this.enemyStats(a).cost <= this.enemyStats(b).cost ? a : b), size: 1 });
    for (let i = out.length - 1; i > 0; i--) { const j = rng.int(i + 1); [out[i], out[j]] = [out[j]!, out[i]!]; }
    return out;
  }

  /** The coming raid's mix: how many of each type, from all active caves together. */
  raidMix(round = this.round): { kind: EnemyKind; count: number }[] {
    const caves = this.activeSpawners(round).length, counts = new Map<EnemyKind, number>();
    for (const p of this.raidPlan(round)) counts.set(p.kind, (counts.get(p.kind) ?? 0) + p.size * caves);
    return ENEMY_KINDS.filter(k => counts.has(k)).map(kind => ({ kind, count: counts.get(kind)! }));
  }

  /** An enemy type's numbers. */
  enemyStats(kind: EnemyKind): EnemyStats { return this.tuning.enemies[kind]; }

  /** HP of an enemy of a type in the given raid. */
  enemyHp(kind: EnemyKind = "grunt", round = this.round): number {
    return Math.max(1, Math.round(this.enemyStats(kind).hp * (1 + Math.max(0, this.tuning.enemyHpStep) * (round - 1))));
  }

  /** A walking speed within ±speedSpread of the type's: one per pack, so a pack moves as one. */
  private rollSpeed(kind: EnemyKind): number {
    return this.enemyStats(kind).speed * (1 + (this.rng.next() * 2 - 1) * this.tuning.speedSpread);
  }

  /** Seconds between a pack's enemies climbing out: the type's `gap`, but never less than one body length at its speed. */
  packSpacing(kind: EnemyKind, speed: number): number {
    return Math.max(this.enemyStats(kind).gap, (ENEMY_INFO[kind].length * 1.1) / Math.max(0.1, speed));
  }

  /** One enemy climbs out of a cave, with its pack's speed and its own line. */
  private spawnWalker(at: Cell, practice: boolean, kind: EnemyKind = "grunt", speed = this.rollSpeed(kind)): void {
    const [sx, sy] = at, hp = this.enemyHp(kind);
    this.walkers.push({
      id: this.nextId++, kind, x: sx + 0.5, y: sy + 0.5, cx: sx, cy: sy, tx: sx, ty: sy,
      speed,
      hp, maxHp: hp, pending: 0, practice, lane: this.rng.next() * 2 - 1,
    });
  }

  /** Send the next pack from every active cave: its enemies climb out one after another. */
  private sendPack(): void {
    const pack = this.plan.shift();
    if (!pack) return;
    const { kind, size } = pack;
    let longest = 0;
    for (const at of this.activeSpawners()) {
      const speed = this.rollSpeed(kind), gap = this.packSpacing(kind, speed);
      longest = Math.max(longest, size * gap);
      for (let i = 0; i < size; i++) this.packQueue.push({ at, delay: i * gap, speed, kind });
    }
    // The next pack follows after `packGap`, or sooner when the raid's packs must fit in `raidSpread`.
    const t = this.tuning;
    this.spawnTimer = Math.max(longest, Math.min(t.packGap + longest, t.raidSpread / Math.max(1, this.planSize)));
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
    this.stepMining(dt);
  }

  /** Advance the world (waves, enemies, towers) by one tick. Game speed scales how often this runs. */
  step(dt = TICK): void {
    this.syncWallWeights();
    if (this.phase === "wave") {
      this.spawnTimer -= dt;
      if (this.plan.length && this.spawnTimer <= 0) this.sendPack();
      for (const q of this.packQueue) if ((q.delay -= dt) <= 0) this.spawnWalker(q.at, false, q.kind, q.speed);
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
    for (const s of this.smelters) smelt(s, dt, this.tuning.smeltRate);
    this.stepUpkeep(dt);
    this.updateTowers(dt);
    this.updateShots(dt);
    if (this.phase === "wave" && !this.plan.length && this.packQueue.length === 0 && this.walkers.length === 0) {
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
    /** Enemies clawing each wall piece this tick: only `wallClawers` of them do damage. */
    const clawing = new Map<number, number>();
    for (const w of this.walkers) {
      w.px = w.x; w.py = w.y;
      if (!this.world.targets.size) { gone.push(w); continue; }
      if (w.attacking) {
        const k = w.attacking;
        const dps = this.enemyStats(w.kind).damage;
        if (this.world.targets.has(k)) { this.damageTarget(k, dps * dt); continue; }
        // Chewing a wall: keep at it while it's still the quickest way on.
        const n = this.world.walls.has(k) ? this.field.next(w.cx, w.cy) : null;
        if (n && cellKey(n[0], n[1]) === k) {
          const pid = this.world.walls.get(k)!, c = clawing.get(pid) ?? 0;
          if (c < this.tuning.wallClawers) { clawing.set(pid, c + 1); if (!w.practice) this.damageTarget(k, dps * dt); }
          continue;
        }
        w.attacking = null; // gone, or no longer in the way: walk on from here
      }
      let budget = w.speed * dt * (w.heavy ? 1 - this.tuning.heavySlow : 1);
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
  pickTarget(t: Tower): Walker | null { return this.pickTargetFrom(t.cx, t.cy, this.towerStats(t).range); }

  /** The ship's centre, where its gun's range is measured from. */
  shipCenter(): { x: number; y: number } {
    const cells = this.world.map.ship;
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
      const shot: Shot = { id: this.nextId++, towerId: SHIP_SHOOTER, targetId: st.id, damage: s.damage, t: 0, dur: Math.hypot(st.x - c.x, st.y - c.y) / BOLT_SPEED, radius: 0, x: st.x, y: st.y };
      st.pending += this.hitFor(st, shot.damage);
      this.shots.push(shot);
      this.events.push({ type: "shot", shot });
    }
    for (const w of this.walkers) if (w.heavy) w.heavy = Math.max(0, w.heavy - dt);
    for (const t of this.towers) {
      if (TOWER_INFO[t.kind].shot === "field") { this.applyField(t, dt); continue; }
      t.cooldown = Math.max(0, t.cooldown - dt);
      const target = this.pickTarget(t);
      t.targetId = target?.id ?? null;
      if (!target || t.cooldown > 0) continue;
      const s = this.towerStats(t);
      t.cooldown = 1 / s.rate;
      const dist = Math.hypot(target.x - t.cx, target.y - t.cy);
      const kind = TOWER_INFO[t.kind].shot;
      const dur = kind === "missile" ? missileTime(dist) : dist / (kind === "slug" ? SLUG_SPEED : BOLT_SPEED);
      const shot: Shot = { id: this.nextId++, towerId: t.id, targetId: target.id, damage: s.damage, t: 0, dur, radius: s.radius, x: target.x, y: target.y };
      target.pending += this.hitFor(target, shot.damage);
      this.shots.push(shot);
      this.events.push({ type: "shot", shot });
    }
  }

  /** A Radome's field: everything in range is Heavy, and stays so for the tower's `heavy` seconds after leaving. */
  private applyField(t: Tower, dt: number): void {
    const s = this.towerStats(t);
    t.targetId = null;
    for (const w of this.walkers) {
      if (Math.hypot(w.x - t.cx, w.y - t.cy) > s.range) continue;
      w.heavy = Math.max(w.heavy ?? 0, s.heavy + dt);
    }
  }

  private updateShots(dt: number): void {
    const landed: Shot[] = [];
    for (const s of this.shots) {
      s.t += dt;
      // Shots follow their target; one whose target is gone lands where it last was.
      const w = this.walkers.find(x => x.id === s.targetId);
      if (w) { s.x = w.x; s.y = w.y; }
      if (s.t >= s.dur) landed.push(s);
    }
    if (!landed.length) return;
    this.shots = this.shots.filter(s => !landed.includes(s));
    for (const s of landed) {
      const target = this.walkers.find(x => x.id === s.targetId);
      if (target) target.pending = Math.max(0, target.pending - this.hitFor(target, s.damage));
      const tower = s.towerId === SHIP_SHOOTER ? undefined : this.towers.find(t => t.id === s.towerId);
      if (s.radius > 0) this.events.push({ type: "blast", x: s.x, y: s.y, radius: s.radius, towerId: s.towerId });
      // A blast hits everything in its radius (its target too, wherever it has got to).
      const hit = s.radius > 0
        ? this.walkers.filter(w => w === target || Math.hypot(w.x - s.x, w.y - s.y) <= s.radius)
        : target ? [target] : [];
      for (const w of hit) this.damage(w, s.damage, tower);
    }
  }

  /** What a hit of `damage` really does to this enemy, through its armour. */
  hitFor(w: Walker, damage: number): number { return throughArmour(damage, this.enemyStats(w.kind).armour); }

  private damage(w: Walker, raw: number, tower: Tower | undefined): void {
    const amount = this.hitFor(w, raw);
    if (tower && !w.practice) tower.dealt += Math.min(amount, w.hp);
    w.hp -= amount;
    if (w.hp > 0) { this.events.push({ type: "hit", walker: w }); return; }
    this.walkers.splice(this.walkers.indexOf(w), 1);
    this.events.push({ type: "killed", walker: w });
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

  /** How many caves send enemies in a raid: one at first, another every `caveEvery` raids, up to `activeCaves`. */
  cavesIn(round = this.round): number {
    const t = this.tuning, max = Math.max(1, Math.round(t.activeCaves));
    return t.caveEvery > 0 ? Math.min(max, 1 + Math.floor((round - 1) / Math.round(t.caveEvery))) : max;
  }

  /**
   * The caves that send enemies: the nearest to the ship by walking distance, as many
   * as `cavesIn` says for this raid. A big world has caves everywhere; the far ones stay quiet.
   */
  activeSpawners(round = this.round): Cell[] {
    const n = this.cavesIn(round);
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
