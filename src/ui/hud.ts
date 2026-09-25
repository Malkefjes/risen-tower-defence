import type { Game, GameEvent } from "../sim/game";
import { STACK_MAX } from "../sim/inventory";
import type { OreNode } from "../sim/ore";
import { itemIcons } from "../render/icons";
import { shapeOffsets, type ShapeId } from "../sim/pieces";
import { TOWER_INFO, type TowerKind } from "../sim/towers";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Small SVG of a piece, for cards. */
export function pieceIcon(shape: ShapeId, rot = 0): string {
  const cells = shapeOffsets(shape, rot);
  const minX = Math.min(...cells.map(c => c[0])), minY = Math.min(...cells.map(c => c[1]));
  const w = Math.max(...cells.map(c => c[0])) - minX + 1, h = Math.max(...cells.map(c => c[1])) - minY + 1;
  const S = 11, size = 4 * S, ox = (size - w * S) / 2, oy = (size - h * S) / 2;
  const rects = cells.map(([x, y]) =>
    `<rect x="${ox + (x - minX) * S + 0.5}" y="${oy + (y - minY) * S + 0.5}" width="${S - 1}" height="${S - 1}" rx="2" fill="#d9573a" stroke="#f08a66" stroke-width="1"/>`).join("");
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${rects}</svg>`;
}

/** Metal plating, for a wall's modification wheel: an orange armored block. */
export function platingIcon(): string {
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><rect x="6" y="20" width="32" height="14" rx="2" fill="#d9573a" stroke="#f08a66"/><rect x="5" y="14" width="34" height="7" rx="2" fill="#4a5266"/><rect x="8" y="26" width="28" height="2" fill="#7ff5e6"/><rect x="6" y="33" width="32" height="3" fill="#2c3142"/></svg>`;
}

/** Small SVG of a tower seen from above, for build cards. */
export function towerIcon(kind: TowerKind): string {
  const hex = (r: number) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${22 + Math.cos(a) * r},${24 + Math.sin(a) * r}`;
  }).join(" ");
  const barrels = kind === "twin"
    ? `<rect x="17" y="4" width="3.5" height="16" rx="1.5" fill="#2c3142"/><rect x="23.5" y="4" width="3.5" height="16" rx="1.5" fill="#2c3142"/>`
    : `<rect x="15" y="1" width="14" height="18" rx="3" fill="#2c3142"/><circle cx="19" cy="5" r="1.6" fill="#798399"/><circle cx="25" cy="5" r="1.6" fill="#798399"/><circle cx="19" cy="10" r="1.6" fill="#798399"/><circle cx="25" cy="10" r="1.6" fill="#798399"/>`;
  const r = kind === "twin" ? 10 : 13;
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><polygon points="${hex(r + 3)}" fill="#3d4457"/>${barrels}<polygon points="${hex(r)}" fill="#d9573a" stroke="#f08a66" stroke-width="1"/><polygon points="${hex(r * 0.55)}" fill="#b4bccd"/></svg>`;
}

export interface HudHandlers {
  startWave(): void;
  sell(): void;
  restart(): void;
}

/** What the input layer has selected, for highlighting. */
export interface HudSelection {
  selectedTowerId: number | null;
  selectedShip: boolean;
}

/** Screen position (page pixels) of a world point, from the view. */
export type Projector = (x: number, y: number, z: number) => { x: number; y: number };

/** Seconds the "+N" stays up after the last ore, and how long it takes to fade. */
const GAIN_HOLD = 1, GAIN_FADE = 0.5;

/** DOM overlay: status, hotbar, wave button, notices. Re-renders only on change. */
export class Hud {
  private lastSig = "";
  private barSig = "";
  private toastTimer = 0;
  private icons = itemIcons();
  /** "+N" over the node a stage just broke off (adds up if stages break close together). */
  private gain = { node: null as OreNode | null, amount: 0, idle: 9 };

  constructor(private game: Game, private h: HudHandlers) {
    $("waveBtn").addEventListener("click", () => h.startWave());
    $("restartBtn").addEventListener("click", () => h.restart());
  }

  /** React to this frame's game events (notices, HP flash). */
  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === "node-broke") {
        const g = this.gain;
        if (g.node !== e.node || g.idle > GAIN_HOLD + GAIN_FADE) { g.node = e.node; g.amount = 0; }
        g.amount += e.added; g.idle = 0;
      } else if (e.type === "leak") {
        const hp = $("hp");
        hp.classList.remove("hurt");
        void hp.offsetWidth;
        hp.classList.add("hurt");
      }
    }
  }

  toast(msg: string, kind: "error" | "info" = "error"): void {
    const t = $("toast");
    t.textContent = msg;
    t.className = `show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove("show"), kind === "info" ? 2400 : 1700);
  }

  /** Per frame: the hotbar, and the "+N" popup. `dt` in real seconds. */
  frame(dt: number, project: Projector): void {
    const g = this.game, bar = g.hotbar;
    const sig = bar.selected + "|" + bar.slots.map(s => (s ? s.kind + s.count : "")).join(",");
    if (sig !== this.barSig) {
      this.barSig = sig;
      $("hotbar").innerHTML = bar.slots.map((s, i) =>
        `<div class="slot${i === bar.selected ? " on" : ""}">${s ? `<img alt="" src="${this.icons[s.kind]}">` + (STACK_MAX[s.kind] > 1 ? `<b>x${s.count}</b>` : "") : ""}</div>`).join("");
    }

    // "+N" over the node, or "Full" while the hotbar can't take the next chunk.
    const gn = this.gain, full = g.mining.full ? g.mining.node : null;
    if (full) { if (gn.node !== full) { gn.node = full; gn.amount = 0; } gn.idle = 0; }
    gn.idle += dt;
    const el = $("gain");
    const a = gn.node && (gn.amount > 0 || full) ? Math.max(0, Math.min(1, 1 - (gn.idle - GAIN_HOLD) / GAIN_FADE)) : 0;
    if (a > 0 && gn.node) {
      const n = gn.node, p = project(n.x + 1.5, 1.6 + Math.max(0, gn.idle - GAIN_HOLD) * 0.5, n.y + 1.5);
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      el.innerHTML = (gn.amount > 0 ? `<img alt="" src="${this.icons[n.kind]}">+${gn.amount}` : "") + (full ? "<i>Full</i>" : "");
    }
    el.style.opacity = String(a);

  }

  update(sel: HudSelection): void {
    const g = this.game;
    const tower = g.towers.find(t => t.id === sel.selectedTowerId);
    const sig = JSON.stringify([g.phase, g.round, sel.selectedTowerId, sel.selectedShip, g.waveRemaining, g.hp,
      g.tuning.twin, g.tuning.gatling, g.tuning.ship, g.tuning.sellRefund, tower?.fresh]);
    if (sig === this.lastSig) return;
    this.lastSig = sig;

    $("round").textContent = `Round ${g.round}`;
    const pill = $("phase");
    pill.textContent = g.phase === "planning" ? "Planning" : g.phase === "wave" ? "Wave" : "Run over";
    pill.className = `pill ${g.phase}`;
    $("hp").innerHTML = `HP <b>${g.hp}</b>`;

    // Run over: a notice, not a popup. The map stays visible behind it.
    const over = $("over");
    over.hidden = g.phase !== "over";
    $("overText").textContent = `The ship fell in round ${g.round}.`;

    // Selected tower (or the ship): its stats in the corner; the view draws its range.
    const inspect = $("inspect");
    inspect.hidden = !tower && !sel.selectedShip;
    if (!tower && sel.selectedShip) {
      const s = g.tuning.ship;
      inspect.innerHTML = `
        <h3>Ship <span>reactor gun</span></h3>
        <dl><dt>Damage</dt><dd>${s.damage}</dd><dt>Shots/s</dt><dd>${s.rate}</dd><dt>Range</dt><dd>${s.range}</dd></dl>`;
    }
    if (tower) {
      const info = TOWER_INFO[tower.kind], s = g.tuning[tower.kind], value = g.sellValue(tower);
      inspect.innerHTML = `
        <h3>${info.name} <span>${info.size}×${info.size}</span></h3>
        <dl><dt>Damage</dt><dd>${s.damage}</dd><dt>Shots/s</dt><dd>${s.rate}</dd><dt>Range</dt><dd>${s.range}</dd></dl>
        <button class="sell" id="sellBtn" ${g.phase === "over" ? "disabled" : ""}>Sell for <img alt="" src="${this.icons.metal}">${value}</button>`;
      $("sellBtn").addEventListener("click", () => this.h.sell());
    }

    // Wave button
    const wave = $("waveBtn") as HTMLButtonElement;
    wave.disabled = g.phase !== "planning";
    wave.hidden = g.phase === "over";
    wave.innerHTML = g.phase === "wave" ? `Wave in progress: ${g.waveRemaining} left` : "Start wave";
  }
}
