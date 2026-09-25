import * as THREE from "three";
import { colonyOrange } from "./palette";

/**
 * The smelter (2×2): a round furnace with an orange band, a framed window onto the
 * molten metal at the front, and a chimney. Erik's pick from the refinery round (look
 * A, trimmed to the furnace alone). Its window glows and the chimney smokes only while
 * it's smelting. Built facing +z, standing on y = 0, centred on its footprint.
 */

export interface SmelterView {
  object: THREE.Group;
  /** Animate: `t` in seconds; `working` lights the window and the chimney. */
  update(t: number, working: boolean): void;
}

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true, ...o });

let M: ReturnType<typeof makeMaterials> | undefined;
// Created on first use, after colour management is switched off.
function makeMaterials() {
  return {
    hull: std("#4a5266", { roughness: 0.6 }),
    hullShade: std("#3d4457", { roughness: 0.6 }),
    steelDark: std("#2c3142", { roughness: 0.6 }),
    orange: colonyOrange(),
    /** Molten metal: a hot yellow-orange glowing through the window. */
    molten: std("#ffb347", { emissive: "#ff8a2a", emissiveIntensity: 1.1, roughness: 0.4 }),
    snow: std("#f1f4fa", { roughness: 1 }),
    smoke: new THREE.MeshStandardMaterial({ color: "#e9ecf5", roughness: 1, transparent: true, opacity: 0.7, depthWrite: false }),
  };
}
const mats = () => (M ??= makeMaterials());

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
/** Box standing on y (y is its bottom). */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
/** Upright cylinder standing on y. */
const cyl = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 20, rTop = r) => mesh(new THREE.CylinderGeometry(rTop, r, h, seg), m, x, y + h / 2, z);

/** Alloy as an item (the hotbar icon): one plain ingot lying on y = 0, centred. */
export function alloyIngot(): THREE.Mesh {
  const g = new THREE.CylinderGeometry(0.075, 0.1, 0.07, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(1.9, 1, 1);
  const b = new THREE.Mesh(g, std("#9ea8ba", { roughness: 0.55 }));
  b.position.y = 0.035;
  b.castShadow = true;
  return b;
}

export function smelterModel(): SmelterView {
  const m = mats(), g = new THREE.Group();
  g.add(cyl(0.86, 0.3, m.hullShade, 0, 0, 0, 24));
  g.add(cyl(0.77, 1.2, m.hull, 0, 0.3, 0, 24));
  g.add(cyl(0.79, 0.14, m.orange, 0, 0.93, 0, 24));
  g.add(cyl(0.6, 0.26, m.hullShade, 0, 1.5, 0, 24, 0.43));
  // A proper window into the furnace: the molten glow set back inside a frame of dark
  // bars, top and bottom running the full width, the sides fitted between them.
  const W = 0.5, H = 0.32, T = 0.07, D = 0.18, wy = 0.5, wz = 0.78;
  // Its own glow, so each smelter lights up only while it's smelting.
  const molten = m.molten.clone();
  g.add(box(W, H, 0.02, molten, 0, wy, wz + 0.02));
  for (const y of [wy - T, wy + H]) g.add(box(W + 2 * T, T, D, m.steelDark, 0, y, wz));
  for (const x of [-(W + T) / 2, (W + T) / 2]) g.add(box(T, H, D, m.steelDark, x, wy, wz));
  // The chimney, and the smoke that rises from it.
  const cx = 0.12, cy = 3.0, cz = -0.12;
  g.add(cyl(0.19, 1.1, m.hullShade, cx, 1.76, cz, 14));
  g.add(cyl(0.21, 0.12, m.orange, cx, 2.8, cz, 14));
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) { const p = mesh(new THREE.IcosahedronGeometry(0.12, 0), m.smoke.clone(), cx, cy, cz); g.add(p); puffs.push(p); }
  // Snow settled on the furnace's shoulder, round the chimney.
  g.add(mesh(new THREE.TorusGeometry(0.56, 0.08, 6, 24).rotateX(Math.PI / 2), m.snow, 0, 1.52, 0));
  g.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  for (const p of puffs) p.castShadow = false;
  // Heat eases up when smelting starts and dies down after it stops.
  let heat = 1, lastT = -1;
  const cold = new THREE.Color("#3a2a24"), hot = new THREE.Color("#ffb347");
  return {
    object: g,
    update(t, working) {
      const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      heat += ((working ? 1 : 0) - heat) * Math.min(1, dt * 1.5);
      molten.color.copy(cold).lerp(hot, heat);
      molten.emissiveIntensity = heat * (1.0 + Math.sin(t * 3.1) * 0.15 + Math.sin(t * 7.3) * 0.08);
      puffs.forEach((p, i) => {
        const k = (t * 0.35 + i / puffs.length) % 1;
        p.position.set(cx + k * 0.35, cy + k * 1.1, cz - k * 0.2);
        p.scale.setScalar(0.6 + k * 1.6);
        (p.material as THREE.MeshStandardMaterial).opacity = 0.7 * (1 - k) * Math.min(1, k * 6) * heat;
      });
    },
  };
}
