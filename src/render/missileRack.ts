import * as THREE from "three";
import { roundedBox, type Materials, type TurretRig } from "./models";

/**
 * The explosive tower: the missile rack (Erik's pick, tuned in `mockups/missile`).
 * The Gun's hex mount with a cradle of missiles tilted up: three at 1×1, six in two
 * rows at 2×2. Each missile on the rack is a "gun" of its rig; firing one hides it
 * until it reloads (`TurretRig.reload`).
 */

const TILT = (30 * Math.PI) / 180;
const CHEEKS = 1.2;

/** A missile's size on the rack and in flight, per tower size. */
export const missileScale = (size: number): number => (size > 1 ? 1.7 : 1.15);

const cache = new Map<number, { body: THREE.BufferGeometry; nose: THREE.BufferGeometry; finA: THREE.BufferGeometry; finB: THREE.BufferGeometry }>();

/** Cylinder lying along +z, starting at the origin. */
function barrel(r: number, len: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, len / 2);
  return g;
}

/** A missile lying along +z, centred on the origin: white body, orange nose, dark fins. */
export function missileMesh(mat: Materials, s: number): THREE.Group {
  const len = 0.3 * s, r = 0.038 * s;
  let geo = cache.get(s);
  if (!geo) {
    const nose = new THREE.ConeGeometry(r, len * 0.22, 8);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 0, len * 0.11 + len * 0.28);
    const body = barrel(r, len * 0.78);
    body.translate(0, 0, -len / 2);
    const finA = new THREE.BoxGeometry(r * 3.2, r * 0.25, len * 0.18).translate(0, 0, -len / 2 + len * 0.09);
    const finB = new THREE.BoxGeometry(r * 0.25, r * 3.2, len * 0.18).translate(0, 0, -len / 2 + len * 0.09);
    geo = { body, nose, finA, finB };
    cache.set(s, geo);
  }
  const g = new THREE.Group();
  for (const [part, m] of [[geo.body, mat.plate], [geo.nose, mat.accent], [geo.finA, mat.gunDark], [geo.finB, mat.gunDark]] as const) {
    const mesh = new THREE.Mesh(part, m);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

export function missileRackModel(mat: Materials, big: boolean): THREE.Object3D {
  const k = big ? 1.8 : 1;
  const m = (g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, material);
    o.castShadow = o.receiveShadow = true;
    o.position.set(x, y, z);
    return o;
  };
  const root = new THREE.Group();
  root.add(m(new THREE.CylinderGeometry(0.32 * k, 0.36 * k, 0.12 * k, 6), mat.gun, 0, 0.06 * k, 0));
  root.add(m(new THREE.CylinderGeometry(0.2 * k, 0.24 * k, 0.08 * k, 6), mat.gunDark, 0, 0.16 * k, 0));
  const yaw = new THREE.Group();
  yaw.position.y = 0.2 * k;
  root.add(yaw);
  yaw.add(m(new THREE.CylinderGeometry(0.18 * k, 0.2 * k, 0.05 * k, 6), mat.gunDark, 0, 0.025 * k, 0));
  yaw.add(m(new THREE.BoxGeometry(0.12 * k, 0.16 * k, 0.12 * k), mat.gun, 0, 0.1 * k, -0.02 * k));
  const pitch = new THREE.Group();
  pitch.position.set(0, 0.2 * k, 0);
  pitch.rotation.x = -TILT;
  yaw.add(pitch);

  const s = missileScale(big ? 2 : 1), count = big ? 6 : 3;
  const rows = big ? 2 : 1, cols = Math.ceil(count / rows);
  const step = (big ? 0.176 : 0.148) * s, rowStep = 0.088 * s, y0 = 0.052 * s;
  const w = (cols - 1) * step + 0.1 * s, len = 0.3 * s, top = y0 + (rows - 1) * rowStep;
  // The cradle: a floor under the missiles, orange cheeks, a back plate.
  pitch.add(m(roundedBox(w, 0.04 * s, len * 0.9, 0.01), mat.gunDark, 0, 0, -0.02 * s));
  const h = 0.1 * s * CHEEKS;
  for (const sx of [-1, 1]) pitch.add(m(roundedBox(0.035 * s, h, len * 0.75, 0.01), mat.accent, sx * (w / 2 + 0.01 * s), h * 0.4, -0.03 * s));
  pitch.add(m(new THREE.BoxGeometry(w, top + 0.05 * s, 0.03 * s), mat.gun, 0, top / 2, -len / 2 - 0.03 * s));
  if (rows > 1) {
    pitch.add(m(new THREE.BoxGeometry(w * 0.9, 0.02, len * 0.5), mat.gunDark, 0, y0 + rowStep * 0.5, -0.06));
    for (const sx of [-1, 1]) pitch.add(m(new THREE.BoxGeometry(0.02, rowStep + 0.02, 0.04), mat.gunDark, sx * (w / 2 - 0.01), y0 + rowStep * 0.5, -0.06));
  }
  pitch.updateMatrix();
  const rig: TurretRig = { yaw, guns: [], kick: 0, reload: big ? 2 : 1.6, launch: new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(1, 0, 0), -TILT) };
  for (let r = 0; r < rows; r++) {
    const n = Math.min(cols, count - r * cols);
    for (let c = 0; c < n; c++) {
      const at = new THREE.Vector3((c - (n - 1) / 2) * step, y0 + r * rowStep, 0);
      const load = missileMesh(mat, s);
      load.position.copy(at);
      pitch.add(load);
      rig.guns.push({ obj: load, rest: 0, muzzle: at.clone().applyMatrix4(pitch.matrix) });
    }
  }
  // Fire across the rack rather than down one side.
  if (big) rig.guns = [0, 5, 2, 3, 1, 4].map(i => rig.guns[i]!);
  else rig.guns = [0, 2, 1].map(i => rig.guns[i]!);
  root.userData.rig = rig;
  return root;
}
