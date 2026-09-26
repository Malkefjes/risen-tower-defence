import * as THREE from "three";
import { GOLEM_LOOKS, golemEnemy } from "../../src/render/golem";
import { GameView, type Overlay } from "../../src/render/view";
import { Game, TICK, type PlacedPiece } from "../../src/sim/game";
import { growAt, type Tower } from "../../src/sim/towers";
import type { Cell } from "../../src/sim/types";
import type { MapDef } from "../../src/sim/world";
import { WALL_DECK } from "../../src/sim/world";
import "./style.css";

// A playground on the real game: a cave, a small walled maze of plated walls, the ship
// at the far end. Brutes, wolf packs and Grumtooth swarms come out of the cave when sent from the panel. Guns are free.
// Click a wall to put a Gun on it, click a Gun to grow it toward the cursor, right-click
// a Gun to take it away. Drag to pan, scroll to zoom, WASD to walk.

THREE.ColorManagement.enabled = false;

// ------------------------------------------------------------------ the map

/** Cells of a straight wall run from (x0, y0) to (x1, y1). */
function run(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const out: Cell[] = [];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push([x, y]);
  return out;
}
// A tight, single-lane serpentine built right up against the ship: one-cell lanes
// between one-cell walls, the gaps alternating top and bottom, the way in at the top left.
const DIVIDERS: Cell[][] = [-7, -5, -3, -1, 1, 3, 5, 7].map((x, i) => i % 2 === 0 ? run(x, -4, x, 3) : run(x, -3, x, 4));
const WALLS: Cell[][] = [
  run(-9, -5, 12, -5), run(-9, 5, 12, 5), // top and bottom
  run(-9, -3, -9, 4), // the near end, open at (-9, -4)
  run(9, -4, 12, -2), run(9, 2, 12, 4), run(12, -1, 12, 1), // hugging the ship
  ...DIVIDERS,
];
const map: MapDef = {
  name: "playground",
  spawners: [[-14, -4]],
  caves: [{ x: -16, y: -4, dir: [1, 0] }],
  ship: run(9, -1, 11, 1),
  start: [0, 7],
  rocks: [], trees: [],
};

// ------------------------------------------------------------------ settings

/** Each enemy type's height (cells) and numbers, from the panel. */
const brute = { height: GOLEM_LOOKS.brute.height, hp: 80, speed: 1, gap: 3 };
const runner = { height: GOLEM_LOOKS.runner.height, hp: 4, speed: 3, pack: 5 };
const swarm = { height: GOLEM_LOOKS.swarm.height, hp: 2, speed: 1.5, pack: 12 };
const cfg = (kind: string) => kind === "runner" ? runner : kind === "swarm" ? swarm : brute;

const game = new Game(map, {
  seed: 7,
  // Nothing comes on its own: every enemy is sent from the panel.
  waveSize: () => 0,
  tuning: {
    startHp: 1e9, ship: { damage: 0 }, enemyHpStep: 0, wallHp: 1e6,
    towers: { gun: [{ cost: 0 }, { cost: 0 }, { cost: 0 }] },
    enemies: { brute: { hp: brute.hp, speed: brute.speed }, runner: { hp: runner.hp, speed: runner.speed }, swarm: { hp: swarm.hp, speed: swarm.speed } },
    // Enemies fill most of a one-cell lane: they keep close to its centre line.
    laneSpread: 0.05,
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
  // The golem at the height from the panel; strides keep pace with the ground covered.
  enemy: w => golemEnemy({ ...GOLEM_LOOKS[w.kind], height: cfg(w.kind).height }, cfg(w.kind).speed),
  barY: w => cfg(w.kind).height + 0.08,
  barScale: w => GOLEM_LOOKS[w.kind].bar,
  burst: { color: "#5a5f70", count: 12, size: 2.2 },
  alwaysBars: true,
});
// Frame the whole maze, from the cave to the ship.
view.zoom = 8.5;
view.resize();
view.userPan(2 - view.target.x, 1.5 - view.target.z);

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
const tune = game.tuning;
/** Send `n` enemies of a kind out of the cave now, `gap` seconds apart (a pack moves at one speed, like the game's). */
function spawn(kind: "brute" | "runner" | "swarm", n: number, gap: number): void {
  if (game.phase === "planning") game.startWave();
  const queue = (game as unknown as { packQueue: { at: Cell; delay: number; speed: number; kind: "brute" | "runner" | "swarm" }[] }).packQueue;
  const speed = tune.enemies[kind].speed * (1 + (Math.random() * 2 - 1) * tune.speedSpread);
  for (let i = 0; i < n; i++) queue.push({ at: map.spawners[0]!, delay: i * gap, speed, kind });
}
function buttons(...list: [string, () => void][]): HTMLElement {
  const row = document.createElement("div");
  row.className = "chips";
  for (const [label, go] of list) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = label;
    b.addEventListener("click", go);
    row.append(b);
  }
  return row;
}
// The Brute comes alone: "Spawn 5" sends five, one after another.
section("Brute",
  slider("Height (cells)", 0.3, 2.5, 0.05, () => brute.height, v => { brute.height = v; }),
  slider("Speed (cells per second)", 0.3, 4, 0.05, () => brute.speed, v => { brute.speed = v; tune.enemies.brute.speed = v; }),
  slider("HP", 1, 300, 1, () => brute.hp, v => { brute.hp = v; tune.enemies.brute.hp = v; }),
  slider("Seconds between Brutes", 0.5, 12, 0.5, () => brute.gap, v => { brute.gap = v; }),
  buttons(["Spawn 1", () => spawn("brute", 1, 0)], ["Spawn 5", () => spawn("brute", 5, brute.gap)]),
);
section("Runner",
  slider("Height (cells)", 0.3, 2.5, 0.05, () => runner.height, v => { runner.height = v; }),
  slider("Speed (cells per second)", 0.3, 6, 0.05, () => runner.speed, v => { runner.speed = v; tune.enemies.runner.speed = v; }),
  slider("HP", 1, 60, 1, () => runner.hp, v => { runner.hp = v; tune.enemies.runner.hp = v; }),
  slider("Wolves per pack", 1, 30, 1, () => runner.pack, v => { runner.pack = v; }),
  // A pack runs nose to tail: each wolf leaves as the one ahead has cleared its length.
  buttons(["Spawn 1", () => spawn("runner", 1, 0)], ["Spawn a pack", () => spawn("runner", runner.pack, game.packSpacing("runner", runner.speed))]),
);
// A swarm pours out of the cave in a stream.
section("Swarm",
  slider("Height (cells)", 0.3, 2.5, 0.05, () => swarm.height, v => { swarm.height = v; }),
  slider("Speed (cells per second)", 0.3, 5, 0.05, () => swarm.speed, v => { swarm.speed = v; tune.enemies.swarm.speed = v; }),
  slider("HP", 1, 30, 1, () => swarm.hp, v => { swarm.hp = v; tune.enemies.swarm.hp = v; }),
  slider("Per swarm", 1, 60, 1, () => swarm.pack, v => { swarm.pack = v; }),
  buttons(["Spawn 1", () => spawn("swarm", 1, 0)], ["Spawn a swarm", () => spawn("swarm", swarm.pack, game.packSpacing("swarm", swarm.speed))]),
);
const barRow = document.createElement("div");
barRow.className = "chips";
const drawBars = () => { barRow.innerHTML = `<button class="chip" aria-pressed="${!!view.looks.alwaysBars}">HP bar always</button>`; };
barRow.addEventListener("click", () => { view.looks.alwaysBars = !view.looks.alwaysBars; drawBars(); });
drawBars();
section("HP bars", barRow);
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

// WASD runs the rig, relative to the screen, as in the game; Shift sprints, Space jumps,
// C brings the camera back to the rig. The first step takes the camera along.
const keys = new Set<string>();
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (e.target instanceof HTMLInputElement) return;
  if (["w", "a", "s", "d"].includes(k) && !keys.size) view.followAvatar();
  keys.add(k);
  if (k === " ") { e.preventDefault(); if (!e.repeat) game.avatarInput.jump = true; }
  if (k === "c") view.followAvatar();
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => keys.clear());
function steer(): void {
  let r = 0, u = 0;
  if (keys.has("d")) r += 1;
  if (keys.has("a")) r -= 1;
  if (keys.has("w")) u += 1;
  if (keys.has("s")) u -= 1;
  // On the ground, screen right is (1, -1) and screen up is (-1, -1).
  const mx = (r - u) * Math.SQRT1_2, my = (-r - u) * Math.SQRT1_2, ml = Math.hypot(mx, my);
  game.avatarInput.x = ml ? mx / ml : 0;
  game.avatarInput.y = ml ? my / ml : 0;
  game.avatarInput.sprint = keys.has("shift");
}

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
  steer();
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
  stats.textContent = `${game.walkers.length} enemies \u00b7 ${game.towers.length} guns \u00b7 ${fps} fps \u00b7 ${view.renderer.info.render.calls} draw calls`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
