import * as THREE from "three";
import { COLOSSUS_HEIGHT, COLOSSUS_PALETTES, colossusModel, type ColossusPalette } from "../../src/render/colossus";
import { GameView, type Overlay } from "../../src/render/view";
import { Game, TICK, type PlacedPiece } from "../../src/sim/game";
import { growAt, type Tower } from "../../src/sim/towers";
import type { Cell } from "../../src/sim/types";
import type { MapDef } from "../../src/sim/world";
import { WALL_DECK } from "../../src/sim/world";
import "./style.css";

// A playground on the real game: a cave, a small walled maze of plated walls, the ship
// at the far end, and packs of Colossus golems that never stop coming. Guns are free.
// Click a wall to put a Gun on it, click a Gun to grow it toward the cursor, right-click
// a Gun to take it away. Drag to pan, scroll to zoom.

THREE.ColorManagement.enabled = false;

// ------------------------------------------------------------------ the map

/** Cells of a straight wall run from (x0, y0) to (x1, y1). */
function run(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const out: Cell[] = [];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push([x, y]);
  return out;
}
const WALLS: Cell[][] = [
  run(-8, -7, 17, -7), run(-8, 7, 17, 7), // top and bottom
  run(17, -6, 17, 6), // far end
  run(-8, -6, -8, -2), run(-8, 2, -8, 6), // near end, with the way in
  run(-4, -6, -4, 4), run(0, -4, 0, 6), run(4, -6, 4, 4), run(8, -4, 8, 6), // the serpentine
  run(16, 0, 16, 0), // ties the walls to the ship
];
const map: MapDef = {
  name: "playground",
  spawners: [[-12, 0]],
  caves: [{ x: -14, y: 0, dir: [1, 0] }],
  ship: run(13, -1, 15, 1),
  start: [11, 4],
  rocks: [], trees: [],
};

// ------------------------------------------------------------------ settings

const look = {
  size: 1,
  palette: "mix" as ColossusPalette | "mix",
  hp: 12,
  speed: 1.2,
  pack: 4,
  gap: 3,
};
const PALETTES = Object.keys(COLOSSUS_PALETTES) as ColossusPalette[];
let waveSize = 12;

const game = new Game(map, {
  seed: 7,
  waveSize: () => waveSize,
  tuning: {
    startHp: 1e9, ship: { damage: 0 }, enemyHpGrowth: 1, wallHp: 1e6,
    towers: { gun: [{ cost: 0 }, { cost: 0 }, { cost: 0 }] },
    enemies: { grunt: { hp: look.hp, speed: look.speed } },
    packMin: look.pack, packMax: look.pack, packGap: look.gap,
  },
});
game.pieces.length = 0;
WALLS.forEach((cells, i) => {
  const piece: PlacedPiece = { id: 900 + i, shape: "I", rot: 0, at: cells[0]!, cells, locked: true, paid: 0, metal: true, plated: 0 };
  game.pieces.push(piece);
  for (const [x, y] of cells) game.world.walls.set(`${x},${y}`, piece.id);
});
(game as unknown as { refresh(): void }).refresh();

const view = new GameView(document.getElementById("view")!, game, undefined, {
  enemy: () => colossusModel({
    palette: look.palette === "mix" ? PALETTES[Math.floor(Math.random() * PALETTES.length)]! : look.palette,
    scale: look.size,
    // Strides keep pace with the ground it covers; a bigger golem takes longer strides.
    strideRate: (look.speed * 0.75) / look.size,
  }),
  barY: COLOSSUS_HEIGHT * look.size + 0.08,
  burst: { color: "#5a5f70", count: 12, size: 2.2 },
});
// Frame the whole maze, from the cave to the ship.
view.zoom = 10;
view.resize();
view.userPan(5 - view.target.x, 1 - view.target.z);

// ------------------------------------------------------------------ panel

const panel = document.getElementById("panel")!;
function slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt = (v: number) => String(+v.toFixed(2))): HTMLElement {
  const el = document.createElement("label");
  el.innerHTML = `<span>${label}</span><output>${fmt(get())}</output><input type="range" min="${min}" max="${max}" step="${step}" value="${get()}">`;
  const input = el.querySelector("input")!, out = el.querySelector("output")!;
  input.addEventListener("input", () => { set(Number(input.value)); out.textContent = fmt(get()); });
  return el;
}
function section(title: string, ...kids: HTMLElement[]): void {
  const h = document.createElement("h4");
  h.textContent = title;
  panel.append(h, ...kids);
}
const chips = document.createElement("div");
chips.className = "chips";
const drawChips = () => {
  chips.innerHTML = (["mix", ...PALETTES] as const).map(p => `<button class="chip" data-p="${p}" aria-pressed="${look.palette === p}">${p === "mix" ? "Mixed" : p === "snow" ? "Snow" : p === "ice" ? "Ice" : "Earth"}</button>`).join("");
};
chips.addEventListener("click", e => {
  const b = (e.target as HTMLElement).closest("button");
  if (b) { look.palette = b.dataset.p as ColossusPalette | "mix"; drawChips(); }
});
drawChips();
const tune = game.tuning;
section("Golem",
  slider("Size (1 = 0.8 cells tall)", 0.5, 1.8, 0.05, () => look.size, v => { look.size = v; view.looks.barY = COLOSSUS_HEIGHT * v + 0.08; }),
  slider("Speed (cells per second)", 0.3, 4, 0.05, () => look.speed, v => { look.speed = v; tune.enemies.grunt.speed = v; }),
  slider("HP", 1, 80, 1, () => look.hp, v => { look.hp = v; tune.enemies.grunt.hp = v; }),
  chips,
);
section("Packs",
  slider("Golems per pack", 1, 12, 1, () => look.pack, v => { look.pack = v; tune.packMin = tune.packMax = v; }),
  slider("Seconds between packs", 0.5, 12, 0.5, () => look.gap, v => { look.gap = v; tune.packGap = v; }),
  slider("Golems per raid", 1, 60, 1, () => waveSize, v => { waveSize = v; }),
);
section("Gun",
  slider("Damage", 0.5, 10, 0.5, () => tune.towers.gun[0]!.damage, v => { tune.towers.gun[0]!.damage = v; tune.towers.gun[1]!.damage = v; }),
);
const clear = document.createElement("button");
clear.className = "chip";
clear.textContent = "Remove all Guns";
clear.addEventListener("click", () => { for (const t of [...game.towers]) game.sellTower(t.id); });
panel.append(clear);

// ------------------------------------------------------------------ input

const el = view.renderer.domElement;
let pointer: { x: number; y: number } | null = null;
let drag: { x: number; y: number; moved: boolean; last: { x: number; y: number } } | null = null;
el.addEventListener("contextmenu", e => e.preventDefault());
/** The tower under the cursor: look at turret and deck height before the ground. */
function towerAt(x: number, y: number): Tower | undefined {
  for (const h of [WALL_DECK + 0.35, WALL_DECK, 0]) {
    const p = view.pickAtHeight(x, y, h);
    const t = p && game.towerAt(Math.floor(p.x), Math.floor(p.z));
    if (t) return t;
  }
  return undefined;
}
function deckCell(x: number, y: number): Cell | null {
  const p = view.pickAtHeight(x, y, WALL_DECK);
  return p ? [Math.floor(p.x), Math.floor(p.z)] : null;
}
el.addEventListener("pointerdown", e => {
  if (e.button === 2) { const t = towerAt(e.clientX, e.clientY); if (t) game.sellTower(t.id); return; }
  drag = { x: e.clientX, y: e.clientY, moved: false, last: { x: e.clientX, y: e.clientY } };
  el.setPointerCapture(e.pointerId);
});
el.addEventListener("pointermove", e => {
  pointer = { x: e.clientX, y: e.clientY };
  view.setPointer(e.clientX, e.clientY);
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
  if (drag.moved) {
    const a = view.pickGround(drag.last.x, drag.last.y), b = view.pickGround(e.clientX, e.clientY);
    if (a && b) view.userPan(a.x - b.x, a.z - b.z);
  }
  drag.last = { x: e.clientX, y: e.clientY };
});
el.addEventListener("pointerup", e => {
  const d = drag;
  drag = null;
  if (!d || d.moved || e.button !== 0) return;
  const t = towerAt(e.clientX, e.clientY);
  if (t) {
    const p = view.pickAtHeight(e.clientX, e.clientY, WALL_DECK);
    if (p) game.growTower(t.id, growAt(t, p.x, p.z));
    return;
  }
  const c = deckCell(e.clientX, e.clientY);
  if (c) game.buildTower("gun", c);
});
el.addEventListener("wheel", e => { e.preventDefault(); view.zoomAt(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY); }, { passive: false });
addEventListener("resize", () => view.resize());

/** What would happen on a click here: a new Gun, or the one under the cursor grown. */
function ghost(): Overlay["towerGhost"] {
  if (!pointer || drag?.moved) return null;
  const t = towerAt(pointer.x, pointer.y);
  if (t) {
    const p = view.pickAtHeight(pointer.x, pointer.y, WALL_DECK);
    if (!p || t.size >= 2) return null;
    const at = growAt(t, p.x, p.z), c = game.checkGrow(t.id, at);
    return { kind: "gun", size: 2, cells: c.cells, valid: c.ok, cx: at[0] + 1, cy: at[1] + 1, range: game.towerStats({ kind: "gun", size: 2 }).range };
  }
  const c = deckCell(pointer.x, pointer.y);
  if (!c || !game.world.walls.has(`${c[0]},${c[1]}`)) return null;
  const check = game.checkTower("gun", c);
  return { kind: "gun", size: 1, cells: check.cells, valid: check.ok, cx: c[0] + 0.5, cy: c[1] + 0.5, range: game.towerStats({ kind: "gun", size: 1 }).range };
}

// ------------------------------------------------------------------ loop

const stats = document.getElementById("stats")!;
let last = performance.now(), acc = 0, avatarAcc = 0, fpsT = 0, frames = 0, fps = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // Raids follow each other with no calm in between.
  if (game.phase === "planning") game.startWave();
  avatarAcc += dt;
  while (avatarAcc >= TICK) { game.stepAvatar(TICK); avatarAcc -= TICK; }
  acc += dt;
  let simDt = 0, steps = 0;
  while (acc >= TICK && steps++ < 12) { game.step(TICK); acc -= TICK; simDt += TICK; }
  const tg = ghost();
  const overlay: Overlay = {
    ghost: null, route: game.routes(), faintRoute: null, hoverCell: null, hoverPieceId: null,
    showPath: true, showGrid: false, towerGhost: tg, smelterGhost: null, selectedTower: null, toolReady: false,
  };
  view.render(dt, simDt, overlay, game.drainEvents(), Math.min(1, avatarAcc / TICK), dt, Math.min(1, acc / TICK));
  frames++; fpsT += dt;
  if (fpsT >= 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
  stats.textContent = `${game.walkers.length} golems \u00b7 ${game.towers.length} guns \u00b7 ${fps} fps \u00b7 ${view.renderer.info.render.calls} draw calls`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
