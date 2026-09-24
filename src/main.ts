import "./style.css";
import { Controller } from "./input/controller";
import { GameView } from "./render/view";
import { Game, TICK } from "./sim/game";
import { FROSTFALL } from "./sim/maps";
import { Hud } from "./ui/hud";

const game = new Game(FROSTFALL);
const view = new GameView(document.getElementById("view")!, game);

let controller!: Controller;
const hud = new Hud(game, {
  selectHand: uid => controller.select(uid),
  pickDraft: (i, discard) => { game.pickDraft(i, discard); },
  skipDraft: () => game.skipDraft(),
  startWave: () => controller.startWave(),
});
controller = new Controller(game, view, hud);
controller.attach(view.renderer.domElement);

// Top bar toggles mirror controller state every frame.
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
btn("bPath").addEventListener("click", () => { controller.showPath = !controller.showPath; });
btn("bGrid").addEventListener("click", () => { controller.showGrid = !controller.showGrid; });
btn("bWalkers").addEventListener("click", () => controller.toggleWalkers());
btn("bSpeed").addEventListener("click", () => controller.toggleSpeed());
btn("bPause").addEventListener("click", () => controller.togglePause());
function syncTools(): void {
  btn("bPath").setAttribute("aria-pressed", String(controller.showPath));
  btn("bGrid").setAttribute("aria-pressed", String(controller.showGrid));
  btn("bWalkers").setAttribute("aria-pressed", String(game.testWalkers));
  btn("bWalkers").disabled = game.phase !== "planning";
  btn("bSpeed").textContent = `${controller.speed}×`;
  btn("bPause").setAttribute("aria-pressed", String(controller.paused));
  btn("bPause").textContent = controller.paused ? "Paused" : "Pause";
}

addEventListener("resize", () => view.resize());
// Keep keyboard shortcuts from also re-activating the last clicked button.
document.addEventListener("click", e => (e.target as HTMLElement).closest("button")?.blur());

// Fixed-step simulation, rendered every animation frame.
let last = performance.now(), acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let simDt = 0;
  if (!controller.paused) {
    acc += dt * controller.speed;
    let steps = 0;
    while (acc >= TICK && steps++ < 12) { game.step(TICK); acc -= TICK; simDt += TICK; }
  }
  const overlay = controller.frame(dt);
  hud.update(controller.selectedUid, controller.rot);
  syncTools();
  view.render(dt, simDt, overlay);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
