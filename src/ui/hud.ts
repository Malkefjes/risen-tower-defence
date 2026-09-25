import type { Game, GameEvent } from "../sim/game";
import { shapeOffsets, type ShapeId } from "../sim/pieces";
import { TOWER_INFO, TOWER_KINDS, type TowerKind } from "../sim/towers";

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
  selectHand(uid: number): void;
  startWave(): void;
  selectBuild(kind: TowerKind): void;
  sell(): void;
  restart(): void;
}

/** What the input layer has selected, for highlighting. */
export interface HudSelection {
  selectedUid: number | null;
  rot: number;
  buildKind: TowerKind | null;
  selectedTowerId: number | null;
}

const BUILD_KEYS: Record<TowerKind, string> = { twin: "Q", gatling: "E" };

/** DOM overlay: status, wall bar, wave button, toasts. Re-renders only on change. */
export class Hud {
  private lastSig = "";
  private toastTimer = 0;
  /** Hand entries that just arrived, so their cards can pop in. */
  private fresh = new Set<number>();

  constructor(private game: Game, private h: HudHandlers) {
    $("waveBtn").addEventListener("click", () => h.startWave());
    $("restartBtn").addEventListener("click", () => h.restart());
  }

  /** React to this frame's game events (notices, HP flash). */
  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === "supply") {
        for (const p of e.pieces) this.fresh.add(p.uid);
        const uids = e.pieces.map(p => p.uid);
        this.toast(`Supply drop: +${uids.length} walls${e.credits ? `, +${e.credits} credits` : ""}`, "info");
        this.lastSig = "";
        window.setTimeout(() => { for (const u of uids) this.fresh.delete(u); }, 900);
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

  update(sel: HudSelection): void {
    const g = this.game;
    const { selectedUid, rot } = sel;
    const tower = g.towers.find(t => t.id === sel.selectedTowerId);
    const sig = JSON.stringify([g.phase, g.round, g.hand, selectedUid, rot, sel.buildKind, sel.selectedTowerId, g.waveRemaining, this.fresh.size, g.credits, g.hp,
      g.tuning.twin, g.tuning.gatling, g.tuning.sellRefund, tower?.fresh]);
    if (sig === this.lastSig) return;
    this.lastSig = sig;

    $("round").textContent = `Round ${g.round}`;
    const pill = $("phase");
    pill.textContent = g.phase === "planning" ? "Planning" : g.phase === "wave" ? "Wave" : "Run over";
    pill.className = `pill ${g.phase}`;
    $("credits").innerHTML = `Credits <b>${g.credits}</b>`;
    $("hp").innerHTML = `HP <b>${g.hp}</b>`;

    // Run over: a notice, not a popup. The map stays visible behind it.
    const over = $("over");
    over.hidden = g.phase !== "over";
    $("overText").textContent = `The nexus fell in round ${g.round}.`;

    // Build menu
    const build = $("build");
    build.innerHTML = "";
    for (const kind of TOWER_KINDS) {
      const info = TOWER_INFO[kind], cost = g.tuning[kind].cost;
      const b = document.createElement("button");
      b.className = "card tower" + (sel.buildKind === kind ? " sel" : "") + (g.credits < cost ? " poor" : "");
      b.innerHTML = `<span class="key">${BUILD_KEYS[kind]}</span><span class="cost">${cost}</span>${towerIcon(kind)}<span class="name">${info.name.toUpperCase()} ${info.size}×${info.size}</span>`;
      b.title = `Build ${info.name} (${info.size}×${info.size}, ${cost} credits) (${BUILD_KEYS[kind]})`;
      b.addEventListener("click", () => this.h.selectBuild(kind));
      build.appendChild(b);
    }

    // Selected tower
    const inspect = $("inspect");
    inspect.hidden = !tower;
    if (tower) {
      const info = TOWER_INFO[tower.kind], s = g.tuning[tower.kind], value = g.sellValue(tower);
      inspect.innerHTML = `
        <h3>${info.name} <span>${info.size}×${info.size}</span></h3>
        <dl><dt>Damage</dt><dd>${s.damage}</dd><dt>Shots/s</dt><dd>${s.rate}</dd><dt>Range</dt><dd>${s.range}</dd></dl>
        <button class="sell" id="sellBtn" ${g.phase === "over" ? "disabled" : ""}>Sell for ${value}</button>`;
      $("sellBtn").addEventListener("click", () => this.h.sell());
    }

    // Wall bar
    const hand = $("hand");
    hand.innerHTML = "";
    if (!g.hand.length) {
      const e = document.createElement("div");
      e.className = "card empty";
      e.innerHTML = `<span class="name">No walls</span>`;
      hand.appendChild(e);
    }
    g.hand.forEach((p, i) => {
      const b = document.createElement("button");
      b.className = "card" + (p.uid === selectedUid ? " sel" : "") + (this.fresh.has(p.uid) ? " new" : "");
      const key = i < 9 ? `<span class="key">${i + 1}</span>` : "";
      b.innerHTML = `${key}${pieceIcon(p.shape, p.uid === selectedUid ? rot : 0)}<span class="name">${p.shape}</span>`;
      b.title = `Hold ${p.shape} wall${i < 9 ? ` (${i + 1})` : ""}`;
      b.addEventListener("click", () => this.h.selectHand(p.uid));
      hand.appendChild(b);
    });

    // Wave button
    const wave = $("waveBtn") as HTMLButtonElement;
    wave.disabled = g.phase !== "planning";
    wave.hidden = g.phase === "over";
    wave.innerHTML = g.phase === "wave" ? `Wave in progress: ${g.waveRemaining} left` : "Start wave";
  }
}
