import { REASON_TEXT, SMELTER_REASON_TEXT, TOWER_REASON_TEXT, type Game, type PlacedPiece, type PlacementCheck } from "../sim/game";
import type { FlowField } from "../sim/pathfinding";
import { SMELTER_SIZE, type Smelter } from "../sim/smelter";
import { WALL_DECK } from "../sim/world";
import { SHAPE_IDS, type ShapeId } from "../sim/pieces";
import { TOWER_INFO, TOWER_KINDS, type Tower, type TowerKind } from "../sim/towers";
import type { Cell } from "../sim/types";
import { BuildWheel, type WheelItem } from "../ui/buildWheel";
import { buildingsIcon, pieceIcon, platingIcon, smelterIcon, towerIcon, type Hud } from "../ui/hud";
import type { GameView, Overlay } from "../render/view";

const DRAG_THRESHOLD = 5;
/** A left press shorter than this is a click (select a tower, pick up a wall); longer is just the tool firing. */
const CLICK_TIME = 250;
const sized = (svg: string) => svg.replace("<svg ", '<svg width="40" height="40" ');
const PAN_SPEED = 1.1; // screen heights per second at current zoom

/** What can be placed from the E wheel: a tower, or a building. */
type BuildKind = TowerKind | "smelter";

/** Turns mouse and keyboard into game actions, and describes what to draw on top. */
export class Controller {
  /** Held wall shape, bought with stone as each piece goes down. */
  heldShape: ShapeId | null = null;
  /** Tower type (or building) being placed. */
  buildKind: BuildKind | null = null;
  /** The smelter whose panel is open (you're next to it). */
  openSmelterId: number | null = null;
  /** Placed tower picked for inspecting and selling. */
  selectedTowerId: number | null = null;
  /** The ship picked for inspecting (its gun's range and stats). */
  selectedShip = false;
  rot = 0;
  showPath = true;
  showGrid = false;
  paused = false;
  speed = 1;

  private hoverCell: Cell | null = null;
  private hoverPoint: { x: number; z: number } | null = null;
  private hoverPieceId: number | null = null;
  private check: PlacementCheck | null = null;
  private checkSig = "";
  private checkAge = 0;
  /** The smelter placement check, redone only when something it depends on changes. */
  private smelterCheck: ReturnType<Game["checkSmelter"]> | null = null;
  private smelterSig = "";
  private smelterAge = 0;
  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number; moved: boolean; button: number; mining: boolean } | null = null;
  private lastPointer: { x: number; y: number } | null = null;
  /** Left button held with nothing to place: the multitool fires. */
  private toolDown = false;
  private pressedAt = 0;
  /** The build wheel, and which one is open (Q walls, E towers). */
  private wheel!: BuildWheel;
  private wheelKind: "walls" | "towers" | "buildings" | "mods" | null = null;
  /** The wall whose modification wheel is open (right mouse held on it). */
  private modTarget: PlacedPiece | null = null;

  constructor(private game: Game, private view: GameView, private hud: Hud) {}

  attach(el: HTMLElement): void {
    this.wheel = new BuildWheel(document.getElementById("app")!);
    el.addEventListener("contextmenu", e => e.preventDefault());
    // The middle button drags the camera: keep the browser from starting autoscroll or a middle-click paste.
    el.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); });
    el.addEventListener("pointerdown", e => {
      if (e.button === 2) {
        if (this.heldShape !== null) this.rotate();
        else if (this.buildKind) this.clearSelection();
        else this.openMods(e.clientX, e.clientY);
        return;
      }
      if (e.button === 1) e.preventDefault();
      el.setPointerCapture(e.pointerId);
      // A left press next to a node mines (the cursor aims); anywhere else a left drag pans.
      const mining = e.button === 0 && this.heldShape === null && this.buildKind === null && this.game.hotbar.held === "multitool" && this.game.nodeInReach() !== null;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: e.button, mining };
      this.pressedAt = performance.now();
      // Holding a wall or tower, the click places it. Otherwise the left button fires the tool.
      if (e.button === 0 && this.heldShape === null && this.buildKind === null) this.toolDown = true;
    });
    el.addEventListener("pointermove", e => {
      this.view.setPointer(e.clientX, e.clientY);
      if (this.drag && this.drag.id === e.pointerId) {
        // The middle button always drags the camera; the left one too, unless it is mining.
        const canDrag = this.drag.button === 1 || (this.drag.button === 0 && !this.drag.mining);
        if (!this.drag.moved && canDrag && Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > DRAG_THRESHOLD) {
          this.drag.moved = true;
          if (this.drag.button === 0) this.toolDown = false;
        }
        if (this.drag.moved && this.lastPointer) {
          const a = this.view.pickGround(this.lastPointer.x, this.lastPointer.y), b = this.view.pickGround(e.clientX, e.clientY);
          if (a && b) this.view.userPan(a.x - b.x, a.z - b.z);
        }
      }
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.updateHover();
    });
    el.addEventListener("pointerup", e => {
      const d = this.drag;
      this.drag = null;
      if (e.button === 0) this.toolDown = false;
      if (!d || d.id !== e.pointerId || d.moved || d.button !== 0) return;
      const holding = this.heldShape !== null || this.buildKind !== null;
      if (holding || performance.now() - this.pressedAt < CLICK_TIME) this.click();
    });
    el.addEventListener("pointerleave", () => { this.lastPointer = null; this.hoverCell = null; this.hoverPoint = null; this.hoverPieceId = null; });
    el.addEventListener("wheel", e => {
      e.preventDefault();
      this.view.zoomAt(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY);
      this.updateHover();
    }, { passive: false });

    window.addEventListener("pointerup", e => { if (e.button === 2 && this.wheelKind === "mods") this.closeWheel(); });
    window.addEventListener("keydown", e => this.onKey(e));
    window.addEventListener("keyup", e => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if ((k === "q" && this.wheelKind === "walls") || (k === "e" && (this.wheelKind === "towers" || this.wheelKind === "buildings"))) this.closeWheel();
    });
    window.addEventListener("blur", () => { this.keys.clear(); this.toolDown = false; if (this.wheelKind) { this.wheel.hide(); this.wheelKind = null; } });
  }

  // ---------------------------------------------------------------- build wheel

  private wheelItems(): WheelItem[] {
    const g = this.game;
    if (this.wheelKind === "mods") return [{ icon: sized(platingIcon()), off: !g.canPlate(this.modTarget ?? undefined) }];
    if (this.wheelKind === "walls") return SHAPE_IDS.map(sh => ({ icon: sized(pieceIcon(sh)), off: !g.canAffordShape(sh) }));
    // Buildings: the smelter, for now (stone and raw metal).
    if (this.wheelKind === "buildings") return [{ icon: sized(smelterIcon()), off: g.ore("stone") < g.tuning.smelterStone || g.ore("metal") < g.tuning.smelterMetal }];
    // Towers, then the Buildings slice, which opens the buildings wheel when pointed at.
    return [...TOWER_KINDS.map(k => ({ icon: sized(towerIcon(k)), off: g.ore("alloy") < g.towerCost(k) })), { icon: sized(buildingsIcon()), off: false }];
  }

  private openWheel(kind: "walls" | "towers"): void {
    if (!this.game.canPlaceNow()) return;
    this.wheelKind = kind;
    this.wheel.show(this.wheelItems());
  }

  /** The tower under the cursor: turrets stand on walls, so look at turret and deck height before the ground. */
  private towerUnderCursor(): Tower | undefined {
    if (!this.lastPointer) return undefined;
    for (const y of [WALL_DECK + 0.35, WALL_DECK, 0]) {
      const p = this.view.pickAtHeight(this.lastPointer.x, this.lastPointer.y, y);
      const t = p && this.game.towerAt(Math.floor(p.x), Math.floor(p.z));
      if (t) return t;
    }
    return undefined;
  }

  /** The smelter under the cursor: look along its height, so you click what you see. */
  private smelterUnderCursor(): Smelter | undefined {
    if (!this.lastPointer) return undefined;
    for (const y of [1.2, 0.6, 0]) {
      const p = this.view.pickAtHeight(this.lastPointer.x, this.lastPointer.y, y);
      const s = p && this.game.smelterAt(Math.floor(p.x), Math.floor(p.z));
      if (s) return s;
    }
    return undefined;
  }

  /** The wall under the cursor: its deck if the cursor is on top of one, else the ground cell. */
  private wallAt(clientX: number, clientY: number): PlacedPiece | undefined {
    for (const y of [WALL_DECK, 0]) {
      const p = this.view.pickAtHeight(clientX, clientY, y);
      const piece = p && this.game.pieceAt(Math.floor(p.x), Math.floor(p.z));
      if (piece) return piece;
    }
    return undefined;
  }

  /** Right mouse held on a wall: its modification wheel (metal plating, for now). */
  private openMods(clientX: number, clientY: number): void {
    const piece = this.wallAt(clientX, clientY);
    if (!piece || !this.game.canPlaceNow()) return;
    this.modTarget = piece;
    this.wheelKind = "mods";
    this.wheel.show(this.wheelItems());
  }

  /** Releasing the key (or the right button) picks the highlighted item. */
  private closeWheel(): void {
    const i = this.wheel.picked(), kind = this.wheelKind, target = this.modTarget;
    this.wheel.hide();
    this.wheelKind = null;
    this.modTarget = null;
    if (i === null || !this.game.canPlaceNow()) return;
    if (kind === "mods") { if (target) this.game.plate(target.id); return; }
    if (kind === "walls") {
      const shape = SHAPE_IDS[i]!;
      if (!this.game.canAffordShape(shape)) return;
      this.clearSelection();
      this.heldShape = shape;
      this.checkSig = "";
    } else if (kind === "buildings") {
      this.clearSelection();
      this.buildKind = "smelter";
    } else if (i < TOWER_KINDS.length) {
      this.clearSelection();
      this.buildKind = TOWER_KINDS[i]!;
    }
    this.updateHover();
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (e.target instanceof HTMLInputElement) return;
    if (["w", "a", "s", "d", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { this.keys.add(k); if (k.startsWith("arrow")) e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); this.undo(); return; }
    switch (k) {
      case "1": case "2": case "3": case "4": case "5": case "6": {
        // Hotbar slots; 1 is the multitool, so it also puts away a held wall or tower.
        this.game.hotbar.select(Number(k) - 1);
        if (k === "1") { this.heldShape = null; this.buildKind = null; }
        break;
      }
      case "r": this.rotate(); break;
      case "q": if (!e.repeat) this.openWheel("walls"); break;
      case "e": if (!e.repeat) this.openWheel("towers"); break;
      case "x": case "delete": case "backspace": this.sellSelected(); break;
      case "escape": this.clearSelection(); this.openSmelterId = null; break;
      case "z": this.undo(); break;
      case " ": e.preventDefault(); if (!e.repeat) this.game.avatarInput.jump = true; break;
      case "p": this.togglePause(); break;
      case "f": this.toggleSpeed(); break;
      case "v": this.showPath = !this.showPath; break;
      case "c": this.view.followAvatar(); break;
      case "h": this.view.lookAtShip(); break;
      case "g": this.showGrid = !this.showGrid; break;
      case "t": this.toggleWalkers(); break;
    }
  }

  // ---------------------------------------------------------------- actions

  clearSelection(): void {
    this.heldShape = null;
    this.buildKind = null;
    this.selectedTowerId = null;
    this.selectedShip = false;
  }

  /** Pick a tower type to place; picking it again puts it away. */
  selectBuild(kind: BuildKind | null): void {
    if (kind !== null && !this.game.canPlaceNow()) return;
    const same = kind === this.buildKind;
    this.clearSelection();
    this.buildKind = same ? null : kind;
    this.updateHover();
  }

  sellSelected(): void {
    const id = this.selectedTowerId;
    if (id === null) return;
    const refund = this.game.sellTower(id);
    if (refund === null) return;
    this.selectedTowerId = null;
    this.hud.toast(`Sold for ${refund} alloy`, "info");
  }

  rotate(): void {
    if (this.heldShape === null) return;
    this.rot = (this.rot + 1) % 4;
    this.updateHover();
  }

  undo(): void {
    const p = this.game.undo();
    if (!p) { if (this.game.phase === "wave") this.hud.toast("Pieces are locked once the wave starts"); return; }
    this.updateHover();
  }

  togglePause(): void { this.paused = !this.paused; }
  toggleSpeed(): void { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; }
  toggleWalkers(): void { this.game.setTestWalkers(!this.game.testWalkers); }

  /** Footprint corner for a tower or building under the cursor: a 2×2 snaps to the nearest grid corner. */
  private towerAnchor(kind: BuildKind): Cell | null {
    const p = this.hoverPoint;
    if (!p) return null;
    const n = kind === "smelter" ? SMELTER_SIZE : TOWER_INFO[kind].size;
    return n === 1 ? [Math.floor(p.x), Math.floor(p.z)] : [Math.round(p.x - n / 2), Math.round(p.z - n / 2)];
  }

  private click(): void {
    if (!this.hoverCell) return;
    if (this.buildKind === "smelter") {
      const at = this.towerAnchor("smelter");
      if (!at) return;
      const r = this.game.buildSmelter(at);
      if (r.ok) this.buildKind = null;
      else this.hud.toast(SMELTER_REASON_TEXT[r.reason]);
      this.updateHover();
      return;
    }
    if (this.buildKind) {
      const at = this.towerAnchor(this.buildKind);
      if (!at) return;
      const r = this.game.buildTower(this.buildKind, at);
      if (r.ok) this.buildKind = null;
      else this.hud.toast(TOWER_REASON_TEXT[r.reason]);
      this.updateHover();
      return;
    }
    if (this.heldShape !== null) {
      const r = this.game.place(this.heldShape, this.rot, this.hoverCell);
      // Keep holding the same shape while there is stone for another.
      if (r.ok) { if (!this.game.canAffordShape(this.heldShape)) this.heldShape = null; this.checkSig = ""; }
      else this.hud.toast(REASON_TEXT[r.reason]);
      this.updateHover();
      return;
    }
    // Clicking a smelter next to you opens its panel; clicking it again closes it.
    const smelter = this.smelterUnderCursor();
    if (smelter) {
      if (this.openSmelterId === smelter.id) this.openSmelterId = null;
      else if (this.game.canUseSmelter(smelter)) { this.openSmelterId = smelter.id; this.selectedTowerId = null; this.selectedShip = false; }
      else this.hud.toast("Too far away");
      return;
    }
    // Clicking a tower (or the ship) shows its range and stats; clicking it again hides them.
    const tower = this.towerUnderCursor();
    if (tower) { this.selectedShip = false; this.selectedTowerId = this.selectedTowerId === tower.id ? null : tower.id; return; }
    this.selectedTowerId = null;
    if (this.lastPointer && this.view.shipAt(this.lastPointer.x, this.lastPointer.y)) { this.selectedShip = !this.selectedShip; return; }
    this.selectedShip = false;
    const piece = this.lastPointer ? this.wallAt(this.lastPointer.x, this.lastPointer.y) : undefined;
    if (!piece) return;
    if (piece.locked) { this.hud.toast("That piece is locked in"); return; }
    if (this.game.phase !== "planning") return;
    const shape = this.game.pickUp(piece.id);
    if (shape) { this.heldShape = shape; this.rot = piece.rot; this.updateHover(); }
  }

  // ---------------------------------------------------------------- per frame

  private updateHover(): void {
    if (!this.lastPointer) return;
    const p = this.view.pickGround(this.lastPointer.x, this.lastPointer.y);
    this.hoverCell = p ? [Math.floor(p.x), Math.floor(p.z)] : null;
    this.hoverPoint = p ? { x: p.x, z: p.z } : null;
    const piece = this.hoverCell && this.heldShape === null && this.buildKind === null && !this.towerUnderCursor() ? this.wallAt(this.lastPointer.x, this.lastPointer.y) : undefined;
    this.hoverPieceId = piece && this.game.canPickUp(piece) ? piece.id : null;
  }

  private currentCheck(dt: number): PlacementCheck | null {
    const held = this.heldShape;
    if (!held || !this.hoverCell || !this.game.canPlaceNow()) return null;
    const sig = `${held}|${this.rot}|${this.hoverCell[0]},${this.hoverCell[1]}|${this.game.pieces.length}`;
    this.checkAge += dt;
    // During a wave, enemies move, so re-check a few times per second.
    if (sig !== this.checkSig || (this.game.phase === "wave" && this.checkAge > 0.12)) {
      this.check = this.game.checkPlacement(held, this.rot, this.hoverCell);
      this.checkSig = sig;
      this.checkAge = 0;
    }
    return this.check;
  }

  frame(dt: number): Overlay {
    // WASD runs the avatar, relative to the screen: W is up the screen.
    let r = 0, u = 0;
    if (this.keys.has("d")) r += 1;
    if (this.keys.has("a")) r -= 1;
    if (this.keys.has("w")) u += 1;
    if (this.keys.has("s")) u -= 1;
    // On the ground, screen right is (1, -1) and screen up is (-1, -1).
    const mx = (r - u) * Math.SQRT1_2, my = (-r - u) * Math.SQRT1_2, ml = Math.hypot(mx, my);
    this.game.avatarInput.x = ml ? mx / ml : 0;
    this.game.avatarInput.y = ml ? my / ml : 0;
    this.game.avatarInput.sprint = this.keys.has("shift");
    // The tool fires while the left button is held with nothing to place.
    const holding = this.heldShape !== null || this.buildKind !== null;
    const firing = this.toolDown && !holding && !this.wheelKind && this.game.hotbar.held === "multitool";
    this.game.mineInput = { firing, onSpot: firing && this.view.cursorOnHotspot() };
    if (this.wheelKind && this.lastPointer) {
      // Build wheels sit on the character; a wall's modification wheel sits on that wall.
      const t = this.modTarget;
      const c = this.wheelKind === "mods" && t
        ? this.view.screenOf(t.cells.reduce((a, q) => a + q[0] + 0.5, 0) / t.cells.length, WALL_DECK, t.cells.reduce((a, q) => a + q[1] + 0.5, 0) / t.cells.length)
        : this.view.avatarScreen();
      this.wheel.update(this.wheelItems(), c.x, c.y, this.lastPointer.x, this.lastPointer.y);
      // Pointing at Buildings on the tower wheel swaps it for the buildings wheel.
      if (this.wheelKind === "towers" && this.wheel.hover === TOWER_KINDS.length) {
        this.wheelKind = "buildings";
        this.wheel.show(this.wheelItems());
        this.wheel.update(this.wheelItems(), c.x, c.y, this.lastPointer.x, this.lastPointer.y);
      }
    }
    // The smelter panel closes when you walk away (or the smelter is gone).
    const open = this.game.smelters.find(s => s.id === this.openSmelterId);
    if (!open || !this.game.canUseSmelter(open)) this.openSmelterId = null;
    this.hud.smelterId = this.openSmelterId;
    if (ml) this.updateHover();

    // Arrow keys pan the camera away from the avatar.
    let pr = 0, pu = 0;
    if (this.keys.has("arrowright")) pr += 1;
    if (this.keys.has("arrowleft")) pr -= 1;
    if (this.keys.has("arrowup")) pu += 1;
    if (this.keys.has("arrowdown")) pu -= 1;
    if (pr || pu) {
      const s = PAN_SPEED * this.view.zoom * 2 * dt;
      this.view.panScreen(pr * s, pu * s * 1.6);
      this.updateHover();
    }
    // Walls can't be held once the run is over.
    if (!this.game.canPlaceNow()) this.heldShape = null;

    if (!this.game.canPlaceNow()) this.buildKind = null;
    if (this.selectedTowerId !== null && !this.game.towers.some(t => t.id === this.selectedTowerId)) this.selectedTowerId = null;

    const check = this.currentCheck(dt);
    const current = this.game.routes();
    let towerGhost: Overlay["towerGhost"] = null, smelterGhost: Overlay["smelterGhost"] = null;
    const at = this.buildKind ? this.towerAnchor(this.buildKind) : null;
    // A smelter blocks enemies like a wall, so its preview shows the new route too.
    let smelterField: FlowField | null = null;
    if (this.buildKind === "smelter" && at) {
      const sig = `${at[0]},${at[1]}|${this.game.pieces.length}|${this.game.smelters.length}|${this.game.ore("stone")}|${this.game.ore("metal")}`;
      if (sig !== this.smelterSig || (this.game.phase === "wave" && (this.smelterAge += dt) > 0.12)) {
        this.smelterSig = sig; this.smelterAge = 0;
        this.smelterCheck = this.game.checkSmelter(at);
      }
      const sc = this.smelterCheck!;
      if (sc.ok) smelterField = sc.field;
      smelterGhost = { cells: sc.cells, valid: sc.ok, cx: at[0] + SMELTER_SIZE / 2, cy: at[1] + SMELTER_SIZE / 2 };
    } else if (this.buildKind && this.buildKind !== "smelter" && at) {
      const tc = this.game.checkTower(this.buildKind, at), n = TOWER_INFO[this.buildKind].size;
      towerGhost = { kind: this.buildKind, cells: tc.cells, valid: tc.ok, cx: at[0] + n / 2, cy: at[1] + n / 2, range: this.game.tuning[this.buildKind].range };
    }
    const sel = this.game.towers.find(t => t.id === this.selectedTowerId);
    const ship = this.selectedShip ? this.game.shipCenter() : null;
    return {
      towerGhost,
      smelterGhost,
      toolReady: this.heldShape !== null || this.buildKind !== null,
      selectedTower: sel ? { cx: sel.cx, cy: sel.cy, range: this.game.tuning[sel.kind].range }
        : ship ? { cx: ship.x, cy: ship.y, range: this.game.tuning.ship.range } : null,
      ghost: check ? { cells: check.cells, valid: check.ok } : null,
      route: check?.ok ? this.game.routes(check.field) : smelterField ? this.game.routes(smelterField) : current,
      faintRoute: check?.ok || smelterField ? current : null,
      hoverCell: this.hoverCell,
      hoverPieceId: this.hoverPieceId,
      showPath: this.showPath,
      showGrid: this.showGrid,
    };
  }
}
