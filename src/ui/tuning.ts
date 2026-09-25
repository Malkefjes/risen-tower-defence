import { defaultTuning, type TowerStats, type Tuning } from "../sim/towers";

/** One slider: where the number lives in Tuning, and its range. */
interface Knob { label: string; get(t: Tuning): number; set(t: Tuning, v: number): void; min: number; max: number; step: number; pct?: boolean }

const top = (key: Exclude<keyof Tuning, "twin" | "gatling" | "ship">, label: string, min: number, max: number, step: number, pct = false): Knob =>
  ({ label, get: t => t[key], set: (t, v) => { t[key] = v; }, min, max, step, pct });
const tower = (kind: "twin" | "gatling" | "ship", key: keyof TowerStats, label: string, min: number, max: number, step: number): Knob =>
  ({ label, get: t => t[kind][key], set: (t, v) => { t[kind][key] = v; }, min, max, step });

const SECTIONS: { title: string; knobs: Knob[] }[] = [
  { title: "Costs and ore", knobs: [
    top("wallCost", "Stone per wall cell", 0, 100, 5),
    top("platingCost", "Metal plating per wall piece", 0, 500, 5),
    top("startStone", "Starting stone", 0, 2000, 50),
    top("startMetal", "Starting metal", 0, 1000, 25),
    top("sellRefund", "Sell refund (after the wave starts)", 0, 1, 0.05, true),
  ] },
  { title: "Mining and moving", knobs: [
    top("mineTime", "Seconds to mine a node", 1, 30, 0.5),
    top("reach", "Mining reach (cells)", 0.5, 4, 0.1),
    top("sprint", "Sprint (× run speed)", 1, 2.5, 0.05),
  ] },
  { title: "Enemies", knobs: [
    top("enemyHp", "HP in round 1", 1, 60, 1),
    top("enemyHpGrowth", "HP growth per round", 1, 1.6, 0.01),
    top("enemySpeed", "Speed", 0.4, 2.5, 0.05),
    top("startHp", "Ship HP", 1, 50, 1),
    top("activeCaves", "Caves sending enemies", 1, 12, 1),
  ] },
  { title: "Ship's gun", knobs: [
    tower("ship", "damage", "Damage", 0, 10, 0.5), tower("ship", "rate", "Shots per second", 0, 6, 0.25),
    tower("ship", "range", "Range", 1, 10, 0.25),
  ] },
  { title: "Twin 1×1", knobs: [
    tower("twin", "cost", "Metal cost", 0, 1000, 10), tower("twin", "damage", "Damage", 0.5, 10, 0.5),
    tower("twin", "rate", "Shots per second", 0.5, 12, 0.5), tower("twin", "range", "Range", 1, 8, 0.25),
  ] },
  { title: "Gatling 2×2", knobs: [
    tower("gatling", "cost", "Metal cost", 0, 2000, 10), tower("gatling", "damage", "Damage", 0.5, 10, 0.5),
    tower("gatling", "rate", "Shots per second", 0.5, 20, 0.5), tower("gatling", "range", "Range", 1, 10, 0.25),
  ] },
];

// v3: metal prices doubled and the ship got a gun, so older saved tuning is dropped.
const STORE = "risen.tuning.v3";

/** Tuning saved in this browser, if any. Never throws. */
export function loadTuning(): Partial<Tuning> | undefined {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return undefined;
    const t = JSON.parse(raw) as Partial<Tuning>;
    const d = defaultTuning();
    return { ...t, twin: { ...d.twin, ...t.twin }, gatling: { ...d.gatling, ...t.gatling }, ship: { ...d.ship, ...t.ship } };
  } catch { return undefined; }
}

function save(t: Tuning): void {
  try { localStorage.setItem(STORE, JSON.stringify(t)); } catch { /* storage unavailable: tuning just won't persist */ }
}

const fmt = (k: Knob, v: number) => k.pct ? `${Math.round(v * 100)}%` : String(+v.toFixed(2));

/** Slider panel that edits the live tuning. Starting ore and ship HP apply from the next run. */
export class TuningPanel {
  private el = document.getElementById("tune")!;

  constructor(private tuning: Tuning) { this.render(); }

  get open(): boolean { return !this.el.hidden; }
  toggle(): void { this.el.hidden = !this.el.hidden; }

  private render(): void {
    const t = this.tuning;
    this.el.innerHTML = `<div class="row"><h4>Tuning</h4><button id="tuneReset">Reset</button></div>`;
    SECTIONS.forEach((sec, si) => {
      const s = document.createElement("section");
      s.innerHTML = `<h4>${sec.title}</h4>`;
      sec.knobs.forEach((k, ki) => {
        const id = `tune-${si}-${ki}`;
        const label = document.createElement("label");
        label.htmlFor = id;
        label.innerHTML = `<span>${k.label}</span><output>${fmt(k, k.get(t))}</output><input id="${id}" type="range" min="${k.min}" max="${k.max}" step="${k.step}" value="${k.get(t)}">`;
        const input = label.querySelector("input")!, out = label.querySelector("output")!;
        input.addEventListener("input", () => {
          const v = Number(input.value);
          k.set(t, v);
          out.textContent = fmt(k, v);
          save(t);
        });
        s.appendChild(label);
      });
      this.el.appendChild(s);
    });
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Changes apply at once and are saved in this browser. Starting ore and ship HP apply from the next run.";
    this.el.appendChild(note);
    this.el.querySelector("#tuneReset")!.addEventListener("click", () => {
      const d = defaultTuning();
      Object.assign(t, d, { twin: { ...d.twin }, gatling: { ...d.gatling }, ship: { ...d.ship } });
      save(t);
      this.render();
    });
  }
}
