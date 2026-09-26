import { wheelAngle, wheelPick } from "./wheel";

/**
 * The build wheel (Erik's pick: look A, a ring of segments). Held open with Q
 * (walls) or E (towers), centred on the character. Which slice is picked comes
 * from `wheelPick`; this class only draws.
 */
export interface WheelItem {
  icon: string;
  /** Shown as "x2"; omitted for items without a stock (towers). */
  count?: number;
  /** Can't be picked (none left, or can't afford). */
  off: boolean;
}

const ORANGE = "#ff7a2f";
/** The empty centre, where nothing is picked, and the ring's outer edge (pixels). */
const DEAD = 58, OUTER = 150, ICON_R = 104;

const pt = (a: number, r: number) => `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
function segment(a0: number, a1: number, r0: number, r1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(a0, r0)} L${pt(a0, r1)} A${r1},${r1} 0 ${large} 1 ${pt(a1, r1)} L${pt(a1, r0)} A${r0},${r0} 0 ${large} 0 ${pt(a0, r0)}Z`;
}

export class BuildWheel {
  readonly el: HTMLDivElement;
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

  /** Place the wheel on the character (`cx`, `cy`) and pick the hovered slice from the cursor (`mx`, `my`), in page pixels. */
  update(items: WheelItem[], cx: number, cy: number, mx: number, my: number): void {
    if (!this.open) return;
    this.items = items;
    this.el.style.transform = `translate(${cx}px, ${cy}px)`;
    this.hover = wheelPick(mx - cx, my - cy, items.length, DEAD);
    const sig = `${this.hover}|${items.map(i => `${i.count}${i.off}`).join()}`;
    if (sig !== this.sig) { this.sig = sig; this.draw(); }
  }

  /** The item to pick on release: the hovered one, unless it's off. */
  picked(): number | null {
    return this.hover !== null && !this.items[this.hover]!.off ? this.hover : null;
  }

  private draw(): void {
    const n = this.items.length, slice = (2 * Math.PI) / n, gap = 0.035;
    let bg = "", fg = "";
    this.items.forEach((it, i) => {
      const a = wheelAngle(i, n), on = this.hover === i;
      bg += `<path d="${segment(a - slice / 2 + gap, a + slice / 2 - gap, DEAD, OUTER)}" fill="${on ? "rgba(255,122,47,.28)" : "rgba(14,16,28,.62)"}" stroke="${on ? ORANGE : "rgba(255,255,255,.14)"}" stroke-width="${on ? 1.5 : 1}"/>`;
      const count = it.count === undefined ? "" : `<b>x${it.count}</b>`;
      fg += `<div class="it${it.off ? " off" : ""}" style="left:${(Math.cos(a) * ICON_R).toFixed(1)}px;top:${(Math.sin(a) * ICON_R).toFixed(1)}px;--s:${on ? 1.1 : 0.95}">${it.icon}${count}</div>`;
    });
    const s = OUTER + 20;
    this.el.innerHTML = `<svg viewBox="${-s} ${-s} ${2 * s} ${2 * s}" width="${2 * s}" height="${2 * s}">${bg}</svg>${fg}`;
  }
}
