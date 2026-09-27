import { LOOKS, setLook, type LookName } from "../../src/render/lighting";
import type { Game } from "../../src/sim/game";
import type { EnemyKind } from "../../src/sim/enemies";
import type { Cell } from "../../src/sim/types";

// The real game under each lighting look (src/render/lighting.ts). A look is picked before
// anything is built (colour management changes how every colour is read), so a pick reloads.
// A small base goes up by the ship, and mixed packs keep coming at it.

// Any failure shows on the page, so a blank screen always says why.
const fail = (m: string) => {
  const d = document.createElement("pre");
  d.style.cssText = "position:fixed;left:16px;bottom:120px;z-index:99;max-width:80vw;white-space:pre-wrap;color:#fff;background:rgba(20,10,30,.85);padding:10px;font:12px monospace";
  d.textContent = m;
  document.body.append(d);
};
addEventListener("error", e => fail(String(e.message)));
addEventListener("unhandledrejection", e => fail(String((e.reason as Error)?.stack ?? e.reason)));

const names = Object.keys(LOOKS) as LookName[];
const fromHash = location.hash.slice(1) as LookName;
const pick: LookName = names.includes(fromHash) ? fromHash : "A";
setLook(pick);

const bar = document.getElementById("looks")!;
for (const n of names) {
  const b = document.createElement("button");
  b.className = "tool";
  b.textContent = LOOKS[n].label;
  b.setAttribute("aria-pressed", String(n === pick));
  b.addEventListener("click", () => { if (n !== pick) { location.hash = n; location.reload(); } });
  bar.append(b);
}
const style = document.createElement("style");
style.textContent = `.looks{position:fixed;top:52px;left:50%;transform:translateX(-50%);display:flex;gap:4px;padding:4px;z-index:20;
  background:rgba(18,20,30,.55);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12)}`;
document.head.append(style);

await import("../../src/main");
const game = (window as unknown as { game: Game }).game;

// ------------------------------------------------------------------ a small base

game.god = true;
const c = game.shipCenter(), cx = Math.floor(c.x), cy = Math.floor(c.y);
const at = (dx: number, dy: number): Cell => [cx + dx, cy + dy];
const line = (x0: number, y0: number, x1: number, y1: number): Cell[] => {
  const out: Cell[] = [];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push(at(x, y));
  return out;
};
game.putWall(line(2, -3, 7, -3));
game.putWall(line(2, -2, 2, 2));
game.putWall(line(-5, -6, -3, -5));
game.putWall(line(-6, 3, -2, 3), false);
game.putWall(line(-2, -4, 1, -4), false);
game.buildTower("gun", at(5, -3));
game.buildTower("explosive", at(7, -3));
game.buildTower("laser", at(2, 0));
game.buildTower("support", at(2, -2));
const big = game.buildTower("gun", at(-5, -6)).tower;
if (big) game.growTower(big.id, at(-5, -6));
game.buildTower("explosive", at(-3, -5));
game.buildSmelter(at(-6, 4));

// ------------------------------------------------------------------ raiders

game.round = 6;
game.hp = 1e7;
const queue = (game as unknown as { packQueue: { at: Cell; delay: number; speed: number; kind: EnemyKind }[] }).packQueue;
const send = () => {
  if (game.phase === "planning") game.startWave();
  const mix: [EnemyKind, number][] = [["grunt", 6], ["runner", 3], ["brute", 1], ["elite", 3]];
  let delay = 0;
  mix.forEach(([kind, n], i) => {
    const from = at(i % 2 ? 16 : -16, i < 2 ? 12 : -12);
    for (let k = 0; k < n; k++) queue.push({ at: from, delay: delay + k * 0.8, speed: game.tuning.enemies[kind].speed, kind });
    delay += 1.5;
  });
};
send();
setInterval(() => { if (game.walkers.length < 8) send(); }, 5000);
