import { wheelAngle, wheelPick } from "../../src/ui/wheel";

/**
 * The build wheel's looks, for Erik to pick from (A, B, C). Held open with Q (walls)
 * or E (towers), centred on the character. Only the drawing lives here; which
 * slice is picked comes from src/ui/wheel.ts.
 */
export type WheelLook = "A" | "B" | "C";

export interface WheelItem {
  icon: string;
  /** Shown as "x2"; omitted for items without a stock (towers). */
  count?: number;
  /** Can't be picked (none left, or can't afford). */
  off: boolean;
}

const ORANGE = "#d9573a";
/** Radius of the empty centre, where nothing is picked, per look. */
const DEAD: Record<WheelLook, number> = { A: 58, B: 50, C: 40 };
const OUTER = 150;

const pt = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
/** A ring segment between two angles and radii, as an SVG path. */
function segment(a0: number, a1: number, r0: number, r1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(a0, r0)} L${pt(a0, r1)} A${r1},${r1} 0 ${large} 1 ${pt(a1, r1)} L${pt(a1, r0)} A${r0},${r0} 0 ${large} 0 ${pt(a0, r0)}Z`;
}

export class BuildWheel {
  readonly el: HTMLDivElement;
  look: WheelLook = "A";
  items: WheelItem[] = [];
  hover: number | null = null;
  private sig = "";

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "wheel";
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  get open(): boolean { return !this.el.hidden; }

  show(items: WheelItem[]): void { this.items = items; this.hover = null; this.sig = ""; this.el.hidden = false; }
  hide(): void { this.el.hidden = true; }

  /** Place the wheel on the character and update the hovered slice from the cursor (screen pixels). */
  update(cx: number, cy: number, mx: number, my: number): void {
    if (!this.open) return;
    this.el.style.transform = `translate(${cx}px, ${cy}px)`;
    this.hover = wheelPick(mx - cx, my - cy, this.items.length, DEAD[this.look]);
    const sig = `${this.look}|${this.hover}|${this.items.map(i => `${i.count}${i.off}`).join()}`;
    if (sig !== this.sig) { this.sig = sig; this.draw(); }
  }

  /** The item to pick on release: the hovered one, unless it's off. */
  picked(): number | null {
    return this.hover !== null && !this.items[this.hover]!.off ? this.hover : null;
  }

  private draw(): void {
    const n = this.items.length, slice = (2 * Math.PI) / n, look = this.look;
    let bg = "", fg = "";
    /** An icon with its count, as HTML over the SVG, centred at radius `r` along angle `a`. */
    const item = (it: WheelItem, a: number, r: number, scale: number, cls = "") => {
      const count = it.count === undefined ? "" : `<b>x${it.count}</b>`;
      fg += `<div class="it ${cls}${it.off ? " off" : ""}" style="left:${(Math.cos(a) * r).toFixed(1)}px;top:${(Math.sin(a) * r).toFixed(1)}px;--s:${scale}">${it.icon}${count}</div>`;
    };
    if (look === "B") bg += `<circle r="112" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/><circle r="${DEAD.B}" fill="rgba(28,26,52,.35)" stroke="rgba(255,255,255,.14)"/>`;
    if (look === "C") bg += `<circle r="${DEAD.C - 4}" fill="rgba(28,26,52,.55)" stroke="rgba(255,255,255,.1)"/>`;
    this.items.forEach((it, i) => {
      const a = wheelAngle(i, n), on = this.hover === i;
      if (look === "A") {
        const gap = 0.035;
        bg += `<path d="${segment(a - slice / 2 + gap, a + slice / 2 - gap, DEAD.A, OUTER)}" fill="${on ? "rgba(217,87,58,.32)" : "rgba(28,26,52,.66)"}" stroke="${on ? ORANGE : "rgba(255,255,255,.12)"}" stroke-width="${on ? 2.5 : 1}"/>`;
        item(it, a, 104, on ? 1.1 : 0.95);
      } else if (look === "B") {
        const r = on ? 36 : 30, [x, y] = pt(a, 112).split(",");
        if (on) bg += `<path d="${segment(a - 0.08, a + 0.08, DEAD.B + 4, 112 - r - 4)}" fill="${ORANGE}" opacity=".8"/>`;
        bg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${on ? "rgba(61,68,87,.95)" : "rgba(28,26,52,.78)"}" stroke="${on ? ORANGE : "rgba(255,255,255,.14)"}" stroke-width="${on ? 3 : 1.5}"${it.off ? ' opacity=".5"' : ""}/>`;
        item(it, a, 112, on ? 0.95 : 0.8, "tight");
      } else {
        const out = on ? OUTER + 14 : OUTER;
        bg += `<path d="${segment(a - slice / 2 + 0.012, a + slice / 2 - 0.012, DEAD.C, out)}" fill="${on ? "url(#hot)" : "rgba(34,31,62,.72)"}" stroke="rgba(255,255,255,${on ? 0.4 : 0.08})" stroke-width="1"/>`;
        item(it, a, on ? 106 : 98, on ? 1.1 : 0.95);
      }
    });
    // Look C shows the highlighted item large in the centre.
    if (look === "C" && this.hover !== null) item({ ...this.items[this.hover]!, count: undefined }, 0, 0, 0.75);
    const s = OUTER + 20;
    this.el.innerHTML = `<svg viewBox="${-s} ${-s} ${2 * s} ${2 * s}" width="${2 * s}" height="${2 * s}">
      <defs><radialGradient id="hot" r="1"><stop offset=".3" stop-color="rgba(217,87,58,.15)"/><stop offset="1" stop-color="rgba(217,87,58,.55)"/></radialGradient></defs>
      ${bg}</svg>${fg}`;
  }
}
