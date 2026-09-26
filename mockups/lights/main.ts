import "../../src/main";
import type { LightLook } from "../../src/render/colonyLights";
import type { GameView } from "../../src/render/view";
import type { Game } from "../../src/sim/game";
import type { TowerKind } from "../../src/sim/towers";
import type { Cell } from "../../src/sim/types";

// The colony's lights, three looks over the real game: A warm glow, B cyan power,
// C lanterns. A small base is built round the ship (walls, plating, all four towers,
// a smelter) and one wall is left cut off from supply, to show it stays dark.

const w = window as unknown as { game: Game; view: GameView; lookAtCell(x: number, y: number): void };
const g = w.game, view = w.view;

function buildBase(): void {
  g.god = true;
  g.raidIn = 3600;
  const ship = g.world.map.ship, cx = Math.round(ship.reduce((a, c) => a + c[0], 0) / ship.length), cy = Math.round(ship.reduce((a, c) => a + c[1], 0) / ship.length);
  // Walls in rings round the ship, each joining the base (the supply rule).
  const placed = [];
  for (let r = 3; r <= 8 && placed.length < 22; r++) {
    for (let a = 0; a < 16 && placed.length < 22; a++) {
      const ang = (a / 16) * Math.PI * 2, at: Cell = [Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r)];
      for (const [shape, rot] of [["I", a % 2], ["O", 0], ["L", a % 4]] as const) {
        const p = g.place(shape, rot, at).piece;
        if (p) { placed.push(p); break; }
      }
    }
  }
  // Every other piece plated, with a tower of each kind on the plated ones.
  const kinds: TowerKind[] = ["gun", "explosive", "laser", "support", "gun", "explosive"];
  let k = 0;
  placed.forEach((p, i) => {
    if (i % 2) return;
    g.plate(p.id);
    if (k < kinds.length && g.buildTower(kinds[k]!, p.cells[0]!).ok) k++;
  });
  // A smelter near the ship.
  for (let r = 4; r < 12; r++) for (let dx = -r; dx <= r; dx++) {
    if (g.smelters.length) break;
    g.buildSmelter([cx + dx, cy + r]);
  }
  // One wall on its own, off the network: it stays dark.
  g.putWall([[cx + 13, cy - 2], [cx + 14, cy - 2], [cx + 15, cy - 2]], false);
  w.lookAtCell(cx, cy);
}

const LOOKS: { key: LightLook; name: string }[] = [
  { key: "a", name: "A &middot; Warm glow" },
  { key: "b", name: "B &middot; Cyan power" },
  { key: "c", name: "C &middot; Lanterns" },
  { key: "off", name: "Off (today)" },
];
const bar = document.createElement("div");
bar.style.cssText = "position:absolute;left:16px;top:52px;display:flex;gap:4px;z-index:10";
for (const l of LOOKS) {
  const b = document.createElement("button");
  b.className = "tool";
  b.innerHTML = l.name;
  b.setAttribute("aria-pressed", String(l.key === "a"));
  b.onclick = () => {
    view.lights.setLook(l.key);
    for (const c of bar.children) c.setAttribute("aria-pressed", String(c === b));
  };
  bar.appendChild(b);
}
document.getElementById("app")!.appendChild(bar);

// Build once the ship has landed and the world is up.
setTimeout(() => { buildBase(); view.lights.setLook("a"); }, 1500);
