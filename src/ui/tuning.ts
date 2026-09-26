import { alloyPerDps, dps } from "../sim/balance";
import { ENEMY_INFO, ENEMY_KINDS, type EnemyStats } from "../sim/enemies";
import { TOWER_INFO, TOWER_KINDS, type TowerStats } from "../sim/towers";
import { defaultTuning, mergeTuning, type Tuning } from "../sim/tuning";

/** One slider: where the number lives in Tuning, and its range. */
interface Knob { label: string; get(t: Tuning): number; set(t: Tuning, v: number): void; min: number; max: number; step: number; pct?: boolean }
/** A section of sliders, with an optional line of numbers derived from them. */
interface Section { title: string; knobs: Knob[]; derived?(t: Tuning): string }

type TopKey = { [K in keyof Tuning]: Tuning[K] extends number ? K : never }[keyof Tuning];
const top = (key: TopKey, label: string, min: number, max: number, step: number, pct = false): Knob =>
  ({ label, get: t => t[key], set: (t, v) => { t[key] = v; }, min, max, step, pct });
/** A slider on some stats object inside Tuning, found by `pick`. */
const stat = <S>(pick: (t: Tuning) => S, key: keyof S & string, label: string, min: number, max: number, step: number): Knob =>
  ({ label, get: t => pick(t)[key] as number, set: (t, v) => { (pick(t)[key] as number) = v; }, min, max, step });

const gunKnobs = (pick: (t: Tuning) => TowerStats, costMax: number, blast: boolean): Knob[] => [
  stat(pick, "cost", "Alloy (total at this size)", 0, costMax, 10), stat(pick, "damage", "Damage", 0.5, 20, 0.5),
  stat(pick, "rate", "Shots per second", 0.1, 30, 0.05), stat(pick, "range", "Range", 1, 12, 0.25),
  ...(blast ? [stat(pick, "radius", "Blast radius (cells)", 0.25, 3, 0.05)] : []),
];
const gunNumbers = (s: TowerStats) => `DPS ${+dps(s).toFixed(2)} · ${Math.round(alloyPerDps(s))} alloy per DPS`;

/** One section per enemy type. */
const enemySections = (): Section[] => ENEMY_KINDS.map(kind => {
  const pick = (t: Tuning): EnemyStats => t.enemies[kind];
  return {
    title: `Enemy: ${ENEMY_INFO[kind].name}`,
    knobs: [
      stat(pick, "hp", "HP in raid 1", 1, 200, 1),
      stat(pick, "speed", "Speed (cells per second)", 0.2, 6, 0.05),
      stat(pick, "damage", "Damage per second (to buildings and walls)", 0, 50, 0.5),
      stat(pick, "pack", "Per pack (0 = Grunt pack range)", 0, 40, 1),
      stat(pick, "gap", "Seconds between them in a pack", 0.05, 5, 0.05),
      stat(pick, "cost", "Raid size one takes (a Grunt is 1)", 0.05, 20, 0.05),
      stat(pick, "share", "Share of raid packs (0 = never)", 0, 10, 1),
      stat(pick, "armour", "Armour (taken off every hit)", 0, 10, 0.05),
      stat(pick, "from", "First raid it comes in", 1, 20, 1),
    ],
  };
});

/** One section per tower type and size on offer, with its damage per second and alloy per DPS. */
const towerSections = (): Section[] => TOWER_KINDS.flatMap(kind =>
  Array.from({ length: TOWER_INFO[kind].maxSize }, (_, i): Section => {
    const pick = (t: Tuning): TowerStats => t.towers[kind][i]!;
    const title = `${TOWER_INFO[kind].name} ${i + 1}×${i + 1}`;
    if (TOWER_INFO[kind].shot === "field") return { title, knobs: [
      stat(pick, "cost", "Alloy (total at this size)", 0, 1000 * (i + 1) ** 2, 10), stat(pick, "range", "Field range", 1, 12, 0.25),
      stat(pick, "heavy", "Heavy lingers after leaving (s)", 0, 10, 0.25),
    ] };
    return { title, knobs: gunKnobs(pick, 1000 * (i + 1) ** 2, TOWER_INFO[kind].shot === "missile"), derived: t => gunNumbers(pick(t)) };
  }));

const SECTIONS: Section[] = [
  { title: "Costs and ore", knobs: [
    top("wallCost", "Stone per wall cell", 0, 100, 5),
    top("platingCost", "Alloy for metal plating per wall piece", 0, 500, 5),
    top("startStone", "Starting stone", 0, 2000, 50),
    top("startMetal", "Starting raw metal", 0, 1000, 25),
    top("startAlloy", "Starting alloy", 0, 1000, 25),
    top("sellRefund", "Sell refund (what was spent before this calm)", 0, 1, 0.05, true),
    top("heavySlow", "Heavy: speed lost in a Radome's field", 0, 0.9, 0.05, true),
  ] },
  { title: "Raids", knobs: [
    top("raidGrace", "Seconds before the first raid", 10, 900, 10),
    top("raidInterval", "Seconds between raids", 10, 900, 10),
    top("raidWarning", "Warning (seconds)", 5, 180, 5),
    top("noiseStone", "Noise: stone stage mined (s)", 0, 30, 1),
    top("noiseMetal", "Noise: metal stage mined (s)", 0, 30, 1),
    top("noiseWall", "Noise: wall piece (s)", 0, 30, 1),
    top("noiseBuild", "Noise: tower or building (s)", 0, 60, 1),
    top("smeltNoise", "Noise: clock speed-up while smelting", 0, 3, 0.1, true),
  ] },
  { title: "Smelter", knobs: [
    top("smelterStone", "Stone to build", 0, 2000, 25),
    top("smelterMetal", "Raw metal to build", 0, 2000, 25),
    top("smeltRate", "Alloy per second", 0.5, 50, 0.5),
  ] },
  { title: "Mining and moving", knobs: [
    top("mineTime", "Seconds to mine a node", 1, 30, 0.5),
    top("reach", "Mining reach (cells)", 0.5, 4, 0.1),
    top("sprint", "Sprint (× run speed)", 1, 2.5, 0.05),
  ] },
  { title: "Enemies (all types)", knobs: [
    top("raidBase", "Raid 1 size per cave (in Grunts)", 1, 60, 0.5),
    top("raidStep", "Raid size added each raid (per cave)", 0, 60, 0.5),
    top("raidSpread", "Seconds a raid's packs are spread over", 5, 300, 5),
    top("enemyHpGrowth", "HP growth per raid", 1, 1.6, 0.01),
    top("speedSpread", "Speed variation between packs (±)", 0, 0.5, 0.01, true),
    top("packMin", "Smallest pack", 1, 12, 1),
    top("packMax", "Largest pack", 1, 12, 1),
    top("packGap", "Seconds between packs", 0.5, 15, 0.5),
    top("laneSpread", "Sideways spread (cells)", 0, 0.45, 0.01),
    top("wallClawers", "Enemies that can claw one wall piece", 1, 8, 1),
    top("activeCaves", "Caves sending enemies", 1, 12, 1),
  ] },
  ...enemySections(),
  { title: "Base", knobs: [
    top("startHp", "Ship HP", 10, 3000, 10),
    top("smelterHp", "Smelter HP", 10, 2000, 10),
    top("supplyRadius", "Ship supply radius (cells)", 5, 100, 1),
    top("upkeepRate", "Upkeep per minute (share of build price)", 0, 0.2, 0.005, true),
    top("decayTime", "Decay: seconds from full to broken", 10, 1800, 10),
    top("shipStartStone", "Stone in the ship at the start", 0, 2000, 50),
    top("wallHp", "Stone wall HP (per piece)", 10, 5000, 10),
    top("platedHpMult", "Plated wall HP (× stone)", 1, 10, 0.5),
  ] },
  { title: "Ship's gun", knobs: [
    stat(t => t.ship, "damage", "Damage", 0, 10, 0.5), stat(t => t.ship, "rate", "Shots per second", 0, 6, 0.25),
    stat(t => t.ship, "range", "Range", 1, 10, 0.25),
  ] },
  ...towerSections(),
];

// v6: enemy numbers moved per type and towers per size; older saves still load through mergeTuning.
const STORE = "risen.tuning.v6";

/** Tuning saved in this browser, if any, over the defaults. Never throws. */
export function loadTuning(): Tuning | undefined {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? mergeTuning(JSON.parse(raw)) : undefined;
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
      const derived = document.createElement("p");
      derived.className = "derived";
      const showDerived = () => { if (sec.derived) derived.textContent = sec.derived(t); };
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
          showDerived();
          save(t);
        });
        s.appendChild(label);
      });
      if (sec.derived) { showDerived(); s.appendChild(derived); }
      this.el.appendChild(s);
    });
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Changes apply at once and are saved in this browser. Starting ore and ship HP apply from the next run.";
    this.el.appendChild(note);
    this.el.querySelector("#tuneReset")!.addEventListener("click", () => {
      Object.assign(t, defaultTuning());
      save(t);
      this.render();
    });
  }
}
