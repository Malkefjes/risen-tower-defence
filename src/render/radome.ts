import * as THREE from "three";
import type { Materials, TurretRig } from "./models";

/**
 * The support tower: the Radome (Erik's pick from the radar mockups). A faceted white
 * dome with an orange band on lattice legs, turning slowly; three legs at 1×1, four
 * taller ones and two whip antennas at 2×2. It fires nothing: the view draws its
 * field on the snow, and everything in it is Heavy.
 */
export function radomeModel(mat: Materials, big: boolean): THREE.Object3D {
  const k = big ? 1.8 : 1;
  const m = (g: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, material);
    o.castShadow = o.receiveShadow = true;
    o.position.set(x, y, z);
    return o;
  };
  const cyl = (rt: number, rb: number, h: number, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const root = new THREE.Group();
  root.add(m(cyl(0.32 * k, 0.36 * k, 0.12 * k), mat.gun, 0, 0.06 * k, 0));
  root.add(m(cyl(0.2 * k, 0.24 * k, 0.08 * k), mat.gunDark, 0, 0.16 * k, 0));
  const base = 0.2 * k, legH = big ? 0.36 * k : 0.24 * k, legs = big ? 4 : 3;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + 0.4;
    const foot = new THREE.Vector3(Math.cos(a) * 0.2 * k, base, Math.sin(a) * 0.2 * k);
    const top = new THREE.Vector3(Math.cos(a) * 0.11 * k, base + legH, Math.sin(a) * 0.11 * k);
    const leg = m(cyl(0.018 * k, 0.022 * k, foot.distanceTo(top), 5), mat.gunDark);
    leg.position.copy(foot).lerp(top, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    root.add(leg);
  }
  root.add(m(cyl(0.12 * k, 0.12 * k, 0.02 * k, 6), mat.gun, 0, base + legH * 0.45, 0));
  const head = new THREE.Group();
  head.position.y = base + legH;
  root.add(head);
  head.add(m(cyl(0.2 * k, 0.17 * k, 0.06 * k, 8), mat.accent, 0, 0.03 * k, 0));
  // The dome turns; everything on it turns with it.
  const yaw = new THREE.Group();
  head.add(yaw);
  const shell = radomeShell(mat);
  yaw.add(m(new THREE.IcosahedronGeometry(0.2 * k, 1), shell, 0, 0.2 * k, 0));
  yaw.add(m(cyl(0.205 * k, 0.205 * k, 0.03 * k, 12), mat.accent, 0, 0.16 * k, 0));
  const n = big ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const vent = m(new THREE.BoxGeometry(0.08 * k, 0.12 * k, 0.02 * k), mat.gun, Math.sin(a) * 0.21 * k, 0.12 * k, Math.cos(a) * 0.21 * k);
    vent.rotation.set(0, a, 0);
    vent.rotateX(0.12);
    yaw.add(vent);
  }
  if (big) for (const sx of [-1, 1]) yaw.add(m(cyl(0.008 * k, 0.008 * k, 0.3 * k, 4), mat.gunDark, sx * 0.1 * k, 0.45 * k, -0.05 * k));
  const rig: TurretRig = { yaw, guns: [], kick: 0, turn: 0.5 };
  root.userData.rig = rig;
  return root;
}

let shellMat: THREE.MeshStandardMaterial | undefined;
/** The dome's white shell, faceted like a golf ball. */
function radomeShell(mat: Materials): THREE.MeshStandardMaterial {
  if (!shellMat) {
    shellMat = mat.plate.clone();
    shellMat.flatShading = true;
    shellMat.color.set("#dfe3ea");
  }
  return shellMat;
}
