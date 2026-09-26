import "./style.css";
import { Controller } from "./input/controller";
import { GameView } from "./render/view";
import { Game, TICK } from "./sim/game";
import { generateWorld } from "./sim/worldgen";
import { Hud } from "./ui/hud";
import { loadTuning, TuningPanel } from "./ui/tuning";

// The world is generated from a seed (stored in this browser; 1 unless changed).
let seed = 1;
try { seed = Number(localStorage.getItem("risen.world.seed")) || 1; } catch { /* storage blocked */ }
const world = generateWorld(seed);
const game = new Game(world.map, { tuning: loadTuning(), supply: true });
// Enemies show their HP bar even at full health, so they read as enemies at a glance.
const view = new GameView(document.getElementById("view")!, game, world, { alwaysBars: true });

let controller!: Controller;
const hud = new Hud(game, {
  sell: () => controller.sellSelected(),
  grow: () => controller.growSelected(),
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
// God mode, remembered in this browser: everything free, and raids start when you say.
const GOD_KEY = "risen.god";
try { game.god = localStorage.getItem(GOD_KEY) === "1"; } catch { /* storage off */ }
btn("bGod").addEventListener("click", () => {
  game.god = !game.god;
  try { localStorage.setItem(GOD_KEY, game.god ? "1" : "0"); } catch { /* storage off */ }
});
btn("bStartRaid").addEventListener("click", () => { game.startWave(); });
// Restart: a second click within 3 s starts a new run (no popup; the button itself asks).
let restartArmed = 0;
btn("bRestart").addEventListener("click", () => {
  if (performance.now() < restartArmed) { restartArmed = 0; controller.clearSelection(); game.reset(); return; }
  restartArmed = performance.now() + 3000;
});
addEventListener("keydown", e => { if (e.key.toLowerCase() === "k" && !(e.target instanceof HTMLInputElement)) tuning.toggle(); });
function syncTools(): void {
  btn("bPath").setAttribute("aria-pressed", String(controller.showPath));
  btn("bGrid").setAttribute("aria-pressed", String(controller.showGrid));
  btn("bWalkers").setAttribute("aria-pressed", String(game.testWalkers));
  btn("bWalkers").disabled = game.phase !== "planning";
  btn("bSpeed").textContent = `${controller.speed}×`;
  btn("bPause").setAttribute("aria-pressed", String(controller.paused));
  btn("bPause").textContent = controller.paused ? "Paused" : "Pause";
  // Make pause impossible to miss, without blocking the map.
  document.getElementById("app")!.classList.toggle("is-paused", controller.paused);
  document.getElementById("paused")!.hidden = !controller.paused;
  btn("bTune").setAttribute("aria-pressed", String(tuning.open));
  btn("bGod").setAttribute("aria-pressed", String(game.god));
  const armed = performance.now() < restartArmed;
  btn("bRestart").textContent = armed ? "Sure?" : "Restart";
  btn("bRestart").classList.toggle("armed", armed);
  btn("bStartRaid").hidden = !game.god || game.phase !== "planning";
}

addEventListener("resize", () => view.resize());
// Keep keyboard shortcuts from also re-activating the last clicked button.
document.addEventListener("click", e => (e.target as HTMLElement).closest("button")?.blur());

// Fixed-step simulation, rendered every animation frame.
// The avatar runs on real time; game speed only scales the world (waves, enemies, towers).
let last = performance.now(), acc = 0, avatarAcc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let simDt = 0;
  if (!controller.paused) {
    avatarAcc += dt;
    while (avatarAcc >= TICK) { game.stepAvatar(TICK); avatarAcc -= TICK; }
    acc += dt * controller.speed;
    let steps = 0;
    while (acc >= TICK && steps++ < 12) { game.step(TICK); acc -= TICK; simDt += TICK; }
  }
  const overlay = controller.frame(dt);
  const events = game.drainEvents();
  hud.onEvents(events);
  hud.update(controller);
  hud.frame(dt, (x, y, z) => view.screenOf(x, y, z));
  syncTools();
  // Draw moving things between the last two ticks, so they stay smooth at any refresh rate.
  // The world's clock for animation runs every frame (not just on ticks), at game speed.
  const worldDt = controller.paused ? 0 : dt * controller.speed;
  view.render(dt, simDt, overlay, events, Math.min(1, avatarAcc / TICK), worldDt, Math.min(1, acc / TICK));
  // Numbers for headless checks: draws and triangles last frame, and enemies on the map.
  (window as unknown as { perfInfo: object }).perfInfo = { calls: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles, walkers: game.walkers.length, phase: game.phase, active: game.activeSpawners() };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// For headless checks: glide the camera to a cell.
(window as unknown as { lookAtCell: (x: number, y: number) => void }).lookAtCell = (x, y) => view.userPan(x + 0.5 - view.target.x, y + 0.5 - view.target.z);
(window as unknown as { game: Game }).game = game;
