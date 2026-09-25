import { REASON_TEXT, TOWER_REASON_TEXT, type Game, type PlacementCheck } from "../sim/game";
import { TOWER_INFO, type TowerKind } from "../sim/towers";
import type { Cell } from "../sim/types";
import type { Hud } from "../ui/hud";
import type { GameView, Overlay } from "../render/view";

const DRAG_THRESHOLD = 5;
const PAN_SPEED = 1.1; // screen heights per second at current zoom

/** Turns mouse and keyboard into game actions, and describes what to draw on top. */
export class Controller {
  /** Held wall piece (hand uid). */
  selectedUid: number | null = null;
  /** Tower type being placed. */
  buildKind: TowerKind | null = null;
  /** Placed tower picked for inspecting and selling. */
  selectedTowerId: number | null = null;
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
  private keys = new Set<string>();
  private drag: { id: number; x: number; y: number; moved: boolean; button: number } | null = null;
  private lastPointer: { x: number; y: number } | null = null;

  constructor(private game: Game, private view: GameView, private hud: Hud) {}

  attach(el: HTMLElement): void {
    el.addEventListener("contextmenu", e => e.preventDefault());
    el.addEventListener("pointerdown", e => {
      if (e.button === 2) { if (this.selectedUid !== null) this.rotate(); else if (this.buildKind) this.clearSelection(); return; }
      el.setPointerCapture(e.pointerId);
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: e.button };
    });
    el.addEventListener("pointermove", e => {
      if (this.drag && this.drag.id === e.pointerId) {
        const canDrag = this.drag.button === 1 || (this.selectedUid === null && this.buildKind === null);
        if (!this.drag.moved && canDrag && Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > DRAG_THRESHOLD) this.drag.moved = true;
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
      if (!d || d.id !== e.pointerId || d.moved || d.button !== 0) return;
      this.click();
    });
    el.addEventListener("pointerleave", () => { this.lastPointer = null; this.hoverCell = null; this.hoverPoint = null; this.hoverPieceId = null; });
    el.addEventListener("wheel", e => {
      e.preventDefault();
      this.view.zoomAt(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY);
      this.updateHover();
    }, { passive: false });

    window.addEventListener("keydown", e => this.onKey(e));
    window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (e.target instanceof HTMLInputElement) return;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { this.keys.add(k); if (k.startsWith("arrow")) e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); this.undo(); return; }
    switch (k) {
      case "1": case "2": case "3": case "4": case "5": case "6": case "7": case "8": case "9": { const p = this.game.hand[Number(k) - 1]; if (p) this.select(p.uid); break; }
      case "r": this.rotate(); break;
      case "q": this.selectBuild("twin"); break;
      case "e": this.selectBuild("gatling"); break;
      case "x": case "delete": case "backspace": this.sellSelected(); break;
      case "escape": this.clearSelection(); break;
      case "z": this.undo(); break;
      case "enter": this.startWave(); break;
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
    this.selectedUid = null;
    this.buildKind = null;
    this.selectedTowerId = null;
  }

  select(uid: number | null): void {
    if (uid !== null && !this.game.canPlaceNow()) return;
    if (uid !== null && uid === this.selectedUid) { this.selectedUid = null; return; }
    this.clearSelection();
    this.selectedUid = uid;
    this.checkSig = "";
    this.updateHover();
  }

  /** Pick a tower type to place; picking it again puts it away. */
  selectBuild(kind: TowerKind | null): void {
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
    this.hud.toast(`Sold for ${refund} credits`, "info");
  }

  rotate(): void {
    if (this.selectedUid === null) return;
    this.rot = (this.rot + 1) % 4;
    this.updateHover();
  }

  undo(): void {
    const p = this.game.undo();
    if (!p) { if (this.game.phase === "wave") this.hud.toast("Pieces are locked once the wave starts"); return; }
    this.updateHover();
  }

  startWave(): void {
    if (this.game.startWave()) this.updateHover();
  }

  togglePause(): void { this.paused = !this.paused; }
  toggleSpeed(): void { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; }
  toggleWalkers(): void { this.game.setTestWalkers(!this.game.testWalkers); }

  /** Footprint corner for a tower under the cursor: a 2×2 snaps to the nearest grid corner. */
  private towerAnchor(kind: TowerKind): Cell | null {
    const p = this.hoverPoint;
    if (!p) return null;
    const n = TOWER_INFO[kind].size;
    return n === 1 ? [Math.floor(p.x), Math.floor(p.z)] : [Math.round(p.x - n / 2), Math.round(p.z - n / 2)];
  }

  private click(): void {
    if (!this.hoverCell) return;
    if (this.buildKind) {
      const at = this.towerAnchor(this.buildKind);
      if (!at) return;
      const r = this.game.buildTower(this.buildKind, at);
      if (r.ok) this.buildKind = null;
      else this.hud.toast(TOWER_REASON_TEXT[r.reason]);
      this.updateHover();
      return;
    }
    if (this.selectedUid !== null) {
      const r = this.game.place(this.selectedUid, this.rot, this.hoverCell);
      if (r.ok) { this.selectedUid = null; this.checkSig = ""; }
      else this.hud.toast(REASON_TEXT[r.reason]);
      this.updateHover();
      return;
    }
    const tower = this.game.towerAt(this.hoverCell[0], this.hoverCell[1]);
    if (tower) { this.selectedTowerId = this.selectedTowerId === tower.id ? null : tower.id; return; }
    this.selectedTowerId = null;
    const piece = this.game.pieceAt(this.hoverCell[0], this.hoverCell[1]);
    if (!piece) return;
    if (piece.locked) { this.hud.toast("That piece is locked in"); return; }
    if (this.game.phase !== "planning") return;
    const entry = this.game.pickUp(piece.id);
    if (entry) { this.selectedUid = entry.uid; this.rot = piece.rot; this.updateHover(); }
  }

  // ---------------------------------------------------------------- per frame

  private updateHover(): void {
    if (!this.lastPointer) return;
    const p = this.view.pickGround(this.lastPointer.x, this.lastPointer.y);
    this.hoverCell = p ? [Math.floor(p.x), Math.floor(p.z)] : null;
    this.hoverPoint = p ? { x: p.x, z: p.z } : null;
    const piece = this.hoverCell && this.selectedUid === null && this.buildKind === null && !this.game.towerAt(this.hoverCell[0], this.hoverCell[1]) ? this.game.pieceAt(this.hoverCell[0], this.hoverCell[1]) : undefined;
    this.hoverPieceId = piece && this.game.canPickUp(piece) ? piece.id : null;
  }

  private currentCheck(dt: number): PlacementCheck | null {
    const held = this.game.hand.find(h => h.uid === this.selectedUid);
    if (!held || !this.hoverCell || !this.game.canPlaceNow()) return null;
    const sig = `${held.shape}|${this.rot}|${this.hoverCell[0]},${this.hoverCell[1]}|${this.game.pieces.length}`;
    this.checkAge += dt;
    // During a wave, enemies move, so re-check a few times per second.
    if (sig !== this.checkSig || (this.game.phase === "wave" && this.checkAge > 0.12)) {
      this.check = this.game.checkPlacement(held.shape, this.rot, this.hoverCell);
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
    // Drop a selection that no longer exists.
    if (this.selectedUid !== null && (!this.game.hand.some(h => h.uid === this.selectedUid) || !this.game.canPlaceNow())) this.selectedUid = null;

    if (!this.game.canPlaceNow()) this.buildKind = null;
    if (this.selectedTowerId !== null && !this.game.towers.some(t => t.id === this.selectedTowerId)) this.selectedTowerId = null;

    const check = this.currentCheck(dt);
    const current = this.game.routes();
    let towerGhost: Overlay["towerGhost"] = null;
    const at = this.buildKind ? this.towerAnchor(this.buildKind) : null;
    if (this.buildKind && at) {
      const tc = this.game.checkTower(this.buildKind, at), n = TOWER_INFO[this.buildKind].size;
      towerGhost = { kind: this.buildKind, cells: tc.cells, valid: tc.ok, cx: at[0] + n / 2, cy: at[1] + n / 2, range: this.game.tuning[this.buildKind].range };
    }
    const sel = this.game.towers.find(t => t.id === this.selectedTowerId);
    return {
      towerGhost,
      toolReady: this.selectedUid !== null || this.buildKind !== null,
      selectedTower: sel ? { cx: sel.cx, cy: sel.cy, range: this.game.tuning[sel.kind].range } : null,
      ghost: check ? { cells: check.cells, valid: check.ok } : null,
      route: check?.ok ? this.game.routes(check.field) : current,
      faintRoute: check?.ok ? current : null,
      hoverCell: this.hoverCell,
      hoverPieceId: this.hoverPieceId,
      showPath: this.showPath,
      showGrid: this.showGrid,
    };
  }
}
