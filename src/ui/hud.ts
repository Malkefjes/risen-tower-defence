import type { Game } from "../sim/game";
import { shapeOffsets, type ShapeId } from "../sim/pieces";

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

export interface HudHandlers {
  selectHand(uid: number): void;
  startWave(): void;
}

/** DOM overlay: status, wall bar, wave button, toasts. Re-renders only on change. */
export class Hud {
  private lastSig = "";
  private toastTimer = 0;
  /** Hand entries that just arrived, so their cards can pop in. */
  private fresh = new Set<number>();

  constructor(private game: Game, private h: HudHandlers) {
    $("waveBtn").addEventListener("click", () => h.startWave());
  }

  toast(msg: string, kind: "error" | "info" = "error"): void {
    const t = $("toast");
    t.textContent = msg;
    t.className = `show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove("show"), kind === "info" ? 2400 : 1700);
  }

  /** Call when a supply drop lands. */
  supplyArrived(uids: number[]): void {
    for (const u of uids) this.fresh.add(u);
    this.toast(`Supply drop: +${uids.length} walls`, "info");
    this.lastSig = "";
    window.setTimeout(() => { for (const u of uids) this.fresh.delete(u); }, 900);
  }

  update(selectedUid: number | null, rot: number): void {
    const g = this.game;
    const sig = JSON.stringify([g.phase, g.round, g.hand, selectedUid, rot, g.waveRemaining, this.fresh.size]);
    if (sig === this.lastSig) return;
    this.lastSig = sig;

    $("round").textContent = `Round ${g.round}`;
    const pill = $("phase");
    pill.textContent = g.phase === "planning" ? "Planning" : "Wave";
    pill.className = `pill ${g.phase}`;

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
    wave.innerHTML = g.phase === "wave" ? `Wave in progress: ${g.waveRemaining} left` : `Start wave <kbd>Enter</kbd>`;
  }
}
