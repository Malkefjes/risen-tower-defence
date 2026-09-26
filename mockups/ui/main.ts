import "../../src/main";
import "./styles.css";

// Three looks for the game's UI, over the real game: A frost glass, B smoked glass,
// C hairline. All square-edged. A small switch in the top-left corner flips between
// them; a sample tower panel sits bottom-left so panels and buttons can be judged too.

const root = document.documentElement;
const LOOKS = [
  { key: "a", name: "A &middot; Frost glass" },
  { key: "b", name: "B &middot; Smoked glass" },
  { key: "c", name: "C &middot; Hairline" },
];
const KEY = "risen.uimockup";
let pick = "a";
try { pick = localStorage.getItem(KEY) ?? "a"; } catch { /* storage off */ }
root.dataset.ui = pick;

const sw = document.createElement("div");
sw.className = "uiswitch";
for (const l of LOOKS) {
  const b = document.createElement("button");
  b.innerHTML = l.name;
  b.setAttribute("aria-pressed", String(l.key === pick));
  b.onclick = () => {
    root.dataset.ui = l.key;
    try { localStorage.setItem(KEY, l.key); } catch { /* storage off */ }
    for (const c of sw.children) c.setAttribute("aria-pressed", String(c === b));
  };
  sw.appendChild(b);
}
document.getElementById("app")!.appendChild(sw);

// A sample tower panel, as the game shows it when a tower is clicked.
const demo = document.createElement("div");
demo.className = "inspect demo";
demo.innerHTML = `
  <h3>Missile rack <span>1&times;1</span></h3>
  <dl><dt>Damage</dt><dd>8</dd><dt>Shots/s</dt><dd>0.45</dd><dt>Range</dt><dd>4</dd><dt>Dealt</dt><dd>312</dd></dl>
  <div class="acts"><button class="sell grow">Grow 2&times;2 &middot; 375</button><button class="sell">Sell &middot; 187</button></div>`;
document.getElementById("app")!.appendChild(demo);
