import { HAND_SIZE, type Game } from "../sim/game";
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
  pickDraft(index: number, discardUid?: number): void;
  skipDraft(): void;
  startWave(): void;
}

/** DOM overlay: status, hand, draft dialog, wave button, toasts. Re-renders only on change. */
export class Hud {
  private lastSig = "";
  private pendingOption: number | null = null;
  private toastTimer = 0;

  constructor(private game: Game, private h: HudHandlers) {
    $("skipBtn").addEventListener("click", () => { this.pendingOption = null; h.skipDraft(); });
    $("waveBtn").addEventListener("click", () => h.startWave());
  }

  toast(msg: string): void {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove("show"), 1700);
  }

  update(selectedUid: number | null, rot: number): void {
    const g = this.game;
    if (g.phase !== "draft") this.pendingOption = null;
    const sig = JSON.stringify([g.phase, g.round, g.hand, g.draft, selectedUid, rot, this.pendingOption, g.waveRemaining, g.openingDraftsLeft]);
    if (sig === this.lastSig) return;
    this.lastSig = sig;

    $("round").textContent = `Round ${g.round}`;
    const pill = $("phase");
    pill.textContent = g.phase === "draft" ? "Supply drop" : g.phase === "planning" ? "Planning" : "Wave";
    pill.className = `pill ${g.phase}`;

    // Hand
    const hand = $("hand");
    hand.innerHTML = "";
    for (let i = 0; i < HAND_SIZE; i++) {
      const p = g.hand[i];
      const b = document.createElement("button");
      b.className = "card" + (p ? (p.uid === selectedUid ? " sel" : "") : " empty");
      if (p) {
        b.innerHTML = `<span class="key">${i + 1}</span>${pieceIcon(p.shape, p.uid === selectedUid ? rot : 0)}<span class="name">${p.shape}</span>`;
        b.title = `Hold ${p.shape} piece (${i + 1})`;
        b.addEventListener("click", () => this.h.selectHand(p.uid));
      } else {
        b.disabled = true;
        b.innerHTML = `<span class="key">${i + 1}</span>`;
        b.setAttribute("aria-label", "Empty slot");
      }
      hand.appendChild(b);
    }

    // Wave button
    const wave = $("waveBtn") as HTMLButtonElement;
    wave.hidden = g.phase === "draft";
    wave.disabled = g.phase !== "planning";
    wave.innerHTML = g.phase === "wave" ? `Wave in progress: ${g.waveRemaining} left` : `Start wave <kbd>Enter</kbd>`;

    // Draft dialog
    const d = g.draft;
    $("draft").hidden = !d;
    if (!d) return;
    const opening = d.opening;
    const n = 3 - g.openingDraftsLeft + 1;
    $("draftEyebrow").textContent = opening ? `Landing supplies ${n} of 3` : `Round ${g.round} supply drop`;
    $("draftTitle").textContent = "Choose a piece";
    $("draftSub").textContent = opening ? "Build your opening fortress before the first wave." : "It goes into your hand. You can hold up to three.";
    const opts = $("draftOptions");
    opts.innerHTML = "";
    d.options.forEach((shape, i) => {
      const b = document.createElement("button");
      b.className = "card" + (this.pendingOption === i ? " pending" : "");
      b.innerHTML = `${pieceIcon(shape)}<span class="name">${shape}</span>`;
      b.title = `Take ${shape}`;
      b.addEventListener("click", () => {
        if (g.handFull) { this.pendingOption = i; this.lastSig = ""; this.update(selectedUid, rot); }
        else this.h.pickDraft(i);
      });
      opts.appendChild(b);
    });
    const discard = $("discard");
    discard.hidden = !(g.handFull && this.pendingOption !== null);
    if (!discard.hidden) {
      const row = $("discardOptions");
      row.innerHTML = "";
      for (const p of g.hand) {
        const b = document.createElement("button");
        b.className = "card";
        b.innerHTML = `${pieceIcon(p.shape)}<span class="name">${p.shape}</span>`;
        b.title = `Give up ${p.shape}`;
        b.addEventListener("click", () => { const i = this.pendingOption!; this.pendingOption = null; this.h.pickDraft(i, p.uid); });
        row.appendChild(b);
      }
    } else if (g.handFull) {
      $("draftSub").textContent = "Your hand is full. Pick one, then choose a piece to give up.";
    }
  }
}
