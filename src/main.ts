import "./style.css";
import { Controller } from "./input/controller";
import { GameView } from "./render/view";
import { Game, TICK } from "./sim/game";
import { FROSTFALL } from "./sim/maps";
import { Hud } from "./ui/hud";
import { loadTuning, TuningPanel } from "./ui/tuning";

const game = new Game(FROSTFALL, { tuning: loadTuning() });
const view = new GameView(document.getElementById("view")!, game);

let controller!: Controller;
const hud = new Hud(game, {
  selectHand: uid => controller.select(uid),
  startWave: () => controller.startWave(),
  selectBuild: kind => controller.selectBuild(kind),
  sell: () => controller.sellSelected(),
  restart: () => { controller.clearSelection(); game.reset(); },
});
const tuning = new TuningPanel(game.tuning);
controller = new Controller(game, view, hud);
controller.attach(view.renderer.domElement);

// Top bar toggles mirror controller state every frame.
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;
btn("bPath").addEventListener("click", () => { controller.showPath = !controller.showPath; });
btn("bGrid").addEventListener("click", () => { controller.showGrid = !controller.showGrid; });
btn("bWalkers").addEventListener("click", () => controller.toggleWalkers());
btn("bSpeed").addEventListener("click", () => controller.toggleSpeed());
btn("bPause").addEventListener("click", () => controller.togglePause());
btn("bTune").addEventListener("click", () => tuning.toggle());
addEventListener("keydown", e => { if (e.key.toLowerCase() === "k" && !(e.target instanceof HTMLInputElement)) tuning.toggle(); });
function syncTools(): void {
  btn("bPath").setAttribute("aria-pressed", String(controller.showPath));
  btn("bGrid").setAttribute("aria-pressed", String(controller.showGrid));
  btn("bWalkers").setAttribute("aria-pressed", String(game.testWalkers));
  btn("bWalkers").disabled = game.phase !== "planning";
  btn("bSpeed").textContent = `${controller.speed}×`;
  btn("bPause").setAttribute("aria-pressed", String(controller.paused));
  btn("bPause").textContent = controller.paused ? "Paused" : "Pause";
  btn("bTune").setAttribute("aria-pressed", String(tuning.open));
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
  const events = game.drainEvents();
  hud.onEvents(events);
  hud.update(controller);
  syncTools();
  view.render(dt, simDt, overlay, events);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
