import * as THREE from "three";
import { roundedBox, type Materials, type TurretRig } from "./models";

/**
 * The laser cannon: the rail lance (Erik's pick, mockup A). Two long rails with cyan
 * coils between them on a low orange turret; side packs when grown to 2×2. The coils
 * are the tower's own cyan (`TurretRig.charge`), which the view charges up before
 * each shot; the rails slide back as it fires a big glowing slug.
 */
export function railLanceModel(mat: Materials, big: boolean): THREE.Object3D {
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
  const glow = mat.power.clone();
  yaw.add(m(roundedBox(0.28 * k, 0.15 * k, 0.34 * k, 0.03 * k), mat.accent, 0, 0.08 * k, -0.04 * k));
  yaw.add(m(new THREE.BoxGeometry(0.2 * k, 0.1 * k, 0.12 * k), mat.gun, 0, 0.08 * k, -0.24 * k));
  const rails = new THREE.Group();
  rails.position.set(0, 0.13 * k, 0);
  yaw.add(rails);
  const len = big ? 0.62 : 0.6;
  for (const sx of [-1, 1]) {
    rails.add(m(new THREE.BoxGeometry(0.035 * k, 0.07 * k, len * k), mat.gunDark, sx * 0.05 * k, 0, (len * k) / 2));
    rails.add(m(new THREE.BoxGeometry(0.04 * k, 0.08 * k, 0.05 * k), mat.plate, sx * 0.05 * k, 0, len * k));
  }
  const coils = big ? 5 : 4;
  for (let i = 0; i < coils; i++) {
    rails.add(m(new THREE.TorusGeometry(0.05 * k, 0.012 * k, 4, 8), glow, 0, 0, (0.14 + (i / (coils - 1)) * (len - 0.24)) * k));
  }
  if (big) for (const sx of [-1, 1]) yaw.add(m(roundedBox(0.07 * k, 0.11 * k, 0.22 * k, 0.015 * k), mat.gun, sx * 0.18 * k, 0.08 * k, -0.08 * k));
  const rig: TurretRig = {
    yaw, kick: big ? 0.12 : 0.08, charge: glow, vent: new THREE.Vector3(0, 0.2 * k, -0.24 * k),
    guns: [{ obj: rails, rest: rails.position.z, muzzle: new THREE.Vector3(0, 0.13 * k, (len + 0.04) * k) }],
  };
  root.userData.rig = rig;
  return root;
}
