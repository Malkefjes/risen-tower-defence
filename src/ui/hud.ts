import type { Game, GameEvent } from "../sim/game";
import { STACK_MAX } from "../sim/inventory";
import type { OreNode } from "../sim/ore";
import { itemIcons } from "../render/icons";
import { shapeOffsets, type ShapeId } from "../sim/pieces";
import { TOWER_INFO, type TowerKind } from "../sim/towers";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Small SVG of a piece, for the wall wheel. */
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

/** The smelter, front on: a round furnace with an orange band, a framed glowing window and a chimney. */
export function smelterIcon(): string {
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><rect x="24" y="3" width="6" height="12" fill="#3d4457"/><rect x="23" y="2" width="8" height="3" rx="1" fill="#d9573a"/><path d="M9 16 Q22 11 35 16 L35 38 Q22 42 9 38 Z" fill="#4a5266"/><path d="M9 21 Q22 17 35 21 L35 24 Q22 20 9 24 Z" fill="#d9573a"/><rect x="15" y="27" width="14" height="9" fill="#2c3142"/><rect x="17" y="29" width="10" height="5" fill="#ffb347"/><path d="M7 37 Q22 43 37 37 L37 40 Q22 45 7 40 Z" fill="#3d4457"/></svg>`;
}

/** Buildings, on the tower wheel: a small colony block with a lit door. */
export function buildingsIcon(): string {
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><path d="M6 20 L22 9 L38 20 Z" fill="#3d4457"/><rect x="9" y="20" width="26" height="17" fill="#4a5266"/><rect x="9" y="20" width="26" height="3" fill="#d9573a"/><rect x="19" y="27" width="7" height="10" fill="#ffd79a"/><rect x="11" y="27" width="5" height="4" fill="#7ff5e6"/><rect x="29" y="27" width="4" height="4" fill="#7ff5e6"/><rect x="6" y="37" width="32" height="3" fill="#2c3142"/></svg>`;
}

/** Repair, for a wall's modification wheel: a stone block with a hammer across it. */
export function repairIcon(): string {
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><rect x="6" y="24" width="24" height="13" rx="2" fill="#8d8a99" stroke="#b3b0bf"/><path d="M11 28 l5 3 M20 27 l-3 5" stroke="#5a5766" stroke-width="1.5"/><rect x="21" y="5" width="7" height="26" rx="2" transform="rotate(35 24 18)" fill="#3d4457"/><rect x="24" y="4" width="16" height="8" rx="2" transform="rotate(35 32 8)" fill="#d9573a" stroke="#f08a66"/></svg>`;
}

/** Small SVG of a tower seen from above, for the tower wheel: the Gun's twin barrels at 1×1, its barrel cluster when bigger. */
export function towerIcon(_kind: TowerKind, size = 1): string {
  const hex = (r: number) => Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${22 + Math.cos(a) * r},${24 + Math.sin(a) * r}`;
  }).join(" ");
  const barrels = size === 1
    ? `<rect x="17" y="4" width="3.5" height="16" rx="1.5" fill="#2c3142"/><rect x="23.5" y="4" width="3.5" height="16" rx="1.5" fill="#2c3142"/>`
    : `<rect x="15" y="1" width="14" height="18" rx="3" fill="#2c3142"/><circle cx="19" cy="5" r="1.6" fill="#798399"/><circle cx="25" cy="5" r="1.6" fill="#798399"/><circle cx="19" cy="10" r="1.6" fill="#798399"/><circle cx="25" cy="10" r="1.6" fill="#798399"/>`;
  const r = size === 1 ? 10 : 13;
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><polygon points="${hex(r + 3)}" fill="#3d4457"/>${barrels}<polygon points="${hex(r)}" fill="#d9573a" stroke="#f08a66" stroke-width="1"/><polygon points="${hex(r * 0.55)}" fill="#b4bccd"/></svg>`;
}

export interface HudHandlers {
  sell(): void;
  grow(): void;
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

/** DOM overlay: status, hotbar, raid clock, panels, notices. Re-renders only on change. */
export class Hud {
  /** The smelter whose panel is open, set by the input layer each frame. */
  smelterId: number | null = null;
  /** The ship's inventory panel is open (you're next to it), set by the input layer each frame. */
  shipOpen = false;
  private shipSig = "";
  private lastSig = "";
  private barSig = "";
  private smelterSig = "";
  private lastHp = Infinity;
  private toastTimer = 0;
  private icons = itemIcons();
  /** "+N" over the node a stage just broke off (adds up if stages break close together). */
  private gain = { node: null as OreNode | null, amount: 0, idle: 9 };

  constructor(private game: Game, private h: HudHandlers) {
    $("restartBtn").addEventListener("click", () => h.restart());
    // With a smelter open, click a raw metal stack in the hotbar to put it in, and
    // click a smelter slot to take what's in it.
    $("hotbar").addEventListener("click", e => {
      const i = Number((e.target as HTMLElement).closest<HTMLElement>(".slot")?.dataset.i);
      if (!Number.isInteger(i)) return;
      if (this.shipOpen) this.game.shipPut(i);
      else if (this.smelterId !== null) this.game.smelterPut(this.smelterId, i);
    });
    $("shipStore").addEventListener("click", e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(".slot");
      if (this.shipOpen && el) this.game.shipTake(Number(el.dataset.i));
    });
    $("smelter").addEventListener("click", e => {
      // Remove: the smelter's full price back, and everything in it.
      if ((e.target as HTMLElement).closest("#smelterRemove") && this.smelterId !== null) {
        if (this.game.removeSmelter(this.smelterId) === "full") this.toast("Not enough room in the hotbar");
        return;
      }
      const el = (e.target as HTMLElement).closest<HTMLElement>(".slot");
      if (this.smelterId === null || !el?.dataset.from) return;
      this.game.smelterTake(this.smelterId, el.dataset.from as "input" | "output", Number(el.dataset.i));
    });
  }

  /** React to this frame's game events (notices, HP flash). */
  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === "node-broke") {
        const g = this.gain;
        if (g.node !== e.node || g.idle > GAIN_HOLD + GAIN_FADE) { g.node = e.node; g.amount = 0; }
        g.amount += e.added; g.idle = 0;
      }
    }
  }

  /** The ship's inventory: 24 slots, with the upkeep per minute and how long the stock lasts. */
  private shipPanel(): void {
    const g = this.game, panel = $("shipStore");
    panel.hidden = !this.shipOpen;
    if (!this.shipOpen) { this.shipSig = ""; return; }
    if (!this.shipSig) {
      this.shipSig = "built";
      panel.innerHTML = `<h3>Ship <small></small></h3><div class="grid">${g.shipStore.slots.map((_, i) => `<div class="slot" data-i="${i}"></div>`).join("")}</div>`;
    }
    const u = g.upkeepPerMinute(), lasts = g.upkeepLasts();
    const parts = [u.stone > 0 ? `${Math.ceil(u.stone)} stone` : "", u.alloy > 0 ? `${Math.ceil(u.alloy)} alloy` : ""].filter(Boolean);
    const mm = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const text = !parts.length ? "No upkeep" : !g.upkeepPaid ? `Upkeep ${parts.join(" · ")} / min · unpaid` : `Upkeep ${parts.join(" · ")} / min · lasts ${isFinite(lasts) ? mm(lasts) : "–"}`;
    const small = panel.querySelector("small")!;
    if (small.textContent !== text) small.textContent = text;
    small.classList.toggle("bad", !!parts.length && (!g.upkeepPaid || lasts < 60));
    for (const el of panel.querySelectorAll<HTMLElement>(".slot")) {
      const s = g.shipStore.slots[Number(el.dataset.i)] ?? null, sig = s ? s.kind + s.count : "";
      if (el.dataset.sig === sig) continue;
      el.dataset.sig = sig;
      el.classList.toggle("take", !!s);
      el.innerHTML = s ? `<img alt="" src="${this.icons[s.kind]}">` + (STACK_MAX[s.kind] > 1 ? `<b>x${s.count}</b>` : "") : "";
    }
  }

  /**
   * Where the raid comes from: a marker over each active cave during the warning and
   * the raid, pinned to the screen edge (pointing at it) when the cave is off screen.
   */
  private markCaves(project: Projector): void {
    const g = this.game, box = $("caveMarks");
    const show = g.raidWarned || g.phase === "wave";
    const caves = show ? g.activeSpawners() : [];
    while (box.children.length < caves.length) box.appendChild(document.createElement("i"));
    // Pinned markers stay clear of the top bar and the hotbar.
    const W = window.innerWidth, H = window.innerHeight, M = 34, TOP = 72, BOTTOM = 104;
    [...box.children].forEach((el, i) => {
      const e = el as HTMLElement, c = caves[i];
      e.hidden = !c;
      if (!c) return;
      const p = project(c[0] + 0.5, 0.9, c[1] + 0.5);
      const cx = W / 2, cy = H / 2, dx = p.x - cx, dy = p.y - cy;
      const k = Math.min(1, (W / 2 - M) / Math.max(1e-6, Math.abs(dx)), (dy < 0 ? H / 2 - TOP : H / 2 - BOTTOM) / Math.max(1e-6, Math.abs(dy)));
      const off = k < 1;
      e.className = off ? "off" : "";
      e.style.transform = `translate(${cx + dx * k}px, ${cy + dy * k - (off ? 0 : 42)}px) translate(-50%, -50%) rotate(${off ? Math.atan2(dy, dx) : Math.PI / 2}rad)`;
    });
  }

  /** One inventory slot. `mode`: "take" can be clicked, "dim" can't be used here. */
  private slotHtml(s: { kind: keyof typeof STACK_MAX; count: number } | null, i: number, on: boolean, mode: "" | "take" | "dim", from?: "input" | "output"): string {
    const cls = `slot${on ? " on" : ""}${mode ? ` ${mode}` : ""}`;
    const data = `data-i="${i}"${from ? ` data-from="${from}"` : ""}`;
    const inner = s ? `<img alt="" src="${this.icons[s.kind]}">` + (STACK_MAX[s.kind] > 1 ? `<b>x${s.count}</b>` : "") : "";
    return `<div class="${cls}" ${data}>${inner}</div>`;
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
    const open = g.smelters.find(s => s.id === this.smelterId), ship = this.shipOpen;
    const sig = bar.selected + "|" + bar.slots.map(s => (s ? s.kind + s.count : "")).join(",") + "|" + !!open + ship;
    if (sig !== this.barSig) {
      this.barSig = sig;
      const hb = $("hotbar");
      hb.classList.toggle("open", !!open || ship);
      // With a panel open, the stacks that can go in are clickable, the rest dimmed.
      const mode = (k?: string) => ship ? (k && k !== "multitool" ? "take" : "dim") : open ? (k === "metal" ? "take" : "dim") : "";
      hb.innerHTML = bar.slots.map((s, i) => this.slotHtml(s, i, i === bar.selected, mode(s?.kind))).join("");
    }
    this.shipPanel();
    // The open smelter: raw metal in, a progress arrow, alloy out.
    const panel = $("smelter");
    panel.hidden = !open;
    if (open) {
      // Built once per smelter; after that only what's inside each slot changes, so a
      // click never lands on a slot that was replaced mid-press (it smelts several a second).
      if (this.smelterSig !== String(open.id)) {
        this.smelterSig = String(open.id);
        const empty = (from: string) => [0, 1].map(i => `<div class="slot" data-i="${i}" data-from="${from}"></div>`).join("");
        panel.innerHTML = `<h3>Smelter <button class="remove" id="smelterRemove">Remove</button></h3><div class="row"><div class="slots">${empty("input")}</div><div class="arrow"><i></i></div><div class="slots">${empty("output")}</div></div>`;
      }
      for (const el of panel.querySelectorAll<HTMLElement>(".slot")) {
        const s = open[el.dataset.from as "input" | "output"].slots[Number(el.dataset.i)] ?? null;
        const sig = s ? s.kind + s.count : "";
        if (el.dataset.sig === sig) continue;
        el.dataset.sig = sig;
        el.classList.toggle("take", !!s);
        el.innerHTML = s ? `<img alt="" src="${this.icons[s.kind]}"><b>x${s.count}</b>` : "";
      }
      panel.classList.toggle("working", open.working);
    } else this.smelterSig = "";

    // The raid clock: time to the next raid while calm (the warning stretch stands out),
    // enemies left while a raid is on.
    const clock = $("raidClock");
    const secs = Math.max(0, Math.ceil(g.raidIn)), clockText = g.phase === "planning"
      ? `Raid in <b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}</b>`
      : g.phase === "wave" ? `Raid <b>${g.waveRemaining} left</b>` : "";
    if (clock.innerHTML !== clockText) clock.innerHTML = clockText;
    clock.className = `raidclock${g.raidWarned ? " warned" : ""}${g.phase === "wave" ? " raiding" : ""}`;
    this.markCaves(project);

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
    // The ship's HP flashes when enemies claw it.
    const hpNow = Math.ceil(g.hp);
    if (hpNow < this.lastHp && !g.shipDown) { const el = $("hp"); el.classList.remove("hurt"); void el.offsetWidth; el.classList.add("hurt"); }
    this.lastHp = hpNow;
    const sig = JSON.stringify([g.phase, g.round, sel.selectedTowerId, sel.selectedShip, g.waveRemaining, hpNow, g.shipDown, g.upkeepPaid,
      g.tuning.towers, g.tuning.ship, g.tuning.sellRefund, tower?.size, tower?.paid, tower?.paidNow,
      tower && tower.size < TOWER_INFO[tower.kind].maxSize && g.ore("alloy") >= g.growCost(tower)]);
    // Damage dealt ticks up during a raid: update just that number, so the buttons stay put.
    if (tower) { const dealt = document.getElementById("dealt"); if (dealt) dealt.textContent = String(Math.round(tower.dealt)); }
    if (sig === this.lastSig) return;
    this.lastSig = sig;

    $("round").textContent = `Raid ${g.round}`;
    const pill = $("phase");
    pill.textContent = g.phase === "planning" ? "Calm" : g.phase === "wave" ? "Raid" : "Run over";
    pill.className = `pill ${g.phase}`;
    $("hp").innerHTML = g.shipDown ? "Ship <b>destroyed</b>" : `Ship <b>${hpNow}</b>`;
    $("upkeep").hidden = g.upkeepPaid || g.shipDown;

    // Run over: a notice, not a popup. The map stays visible behind it.
    const over = $("over");
    // The ship destroyed: a notice, not the end. The run goes on; New run starts over.
    over.hidden = !g.shipDown;
    $("overText").textContent = `The ship was destroyed in raid ${g.round}.`;

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
      const info = TOWER_INFO[tower.kind], s = g.towerStats(tower), value = g.sellValue(tower), n = tower.size + 1;
      const grow = n <= info.maxSize
        ? `<button class="sell grow" id="growBtn"${g.ore("alloy") < g.growCost(tower) ? " disabled" : ""}>Grow ${n}×${n} <img alt="" src="${this.icons.alloy}">${g.growCost(tower)}</button>` : "";
      inspect.innerHTML = `
        <h3>${info.name} <span>${tower.size}×${tower.size}</span></h3>
        <dl><dt>Damage</dt><dd>${s.damage}</dd><dt>Shots/s</dt><dd>${s.rate}</dd><dt>Range</dt><dd>${s.range}</dd><dt>Dealt</dt><dd id="dealt">${Math.round(tower.dealt)}</dd></dl>
        <div class="acts">${grow}<button class="sell" id="sellBtn">Sell <img alt="" src="${this.icons.alloy}">${value}</button></div>`;
      $("sellBtn").addEventListener("click", () => this.h.sell());
      document.getElementById("growBtn")?.addEventListener("click", () => this.h.grow());
    }

  }
}
