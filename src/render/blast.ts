import * as THREE from "three";
import { EVENING, type Materials } from "./models";
import { missileMesh, missileScale } from "./missileRack";

/**
 * Missiles in flight and the blasts they end in (the explosive tower). A missile
 * leaves along its rack, climbs, turns and dives onto its target, following it; the
 * blast comes from the simulation's "blast" event, where the damage really lands.
 * Smoke and snow chunks are drawn in bulk (one instanced mesh each), so a busy raid
 * stays cheap.
 */

/** Particles drawn with one instanced mesh: they grow, then shrink away (no transparency). */
class Particles {
  readonly mesh: THREE.InstancedMesh;
  private list: { p: THREE.Vector3; v: THREE.Vector3; t: number; life: number; size: number; grow: number; fall: number; spin: number; rx: number; ry: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sc = new THREE.Vector3();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, private max: number, shadows: boolean) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadows;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  add(p: THREE.Vector3, o: { size: number; life: number; v?: THREE.Vector3; grow?: number; fall?: number; spin?: number }): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: p.clone(), v: o.v?.clone() ?? new THREE.Vector3(), t: 0, life: o.life, size: o.size, grow: o.grow ?? 0, fall: o.fall ?? 0, spin: o.spin ?? 0, rx: Math.random() * 6, ry: Math.random() * 6 });
  }

  update(dt: number): void {
    let n = 0;
    this.list = this.list.filter(a => {
      a.t += dt;
      if (a.t >= a.life) return false;
      a.v.y -= a.fall * dt;
      a.p.addScaledVector(a.v, dt);
      if (a.fall > 0 && a.p.y < 0.02) return false;
      if (!a.fall) a.v.multiplyScalar(1 - dt * 1.5);
      const k = a.t / a.life;
      const s = (a.size + a.grow * a.t) * (k < 0.6 ? 1 : (1 - k) / 0.4);
      this.e.set(a.rx + a.spin * a.t, a.ry, 0);
      this.m.compose(a.p, this.q.setFromEuler(this.e), this.sc.setScalar(Math.max(0.0001, s)));
      this.mesh.setMatrixAt(n++, this.m);
      return true;
    });
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void { this.list = []; this.mesh.count = 0; }
}

interface Missile { obj: THREE.Group; t: number; dur: number; curve: THREE.CubicBezierCurve3; dist: number; target: () => THREE.Vector3 | null; trail: number }
interface Fade { mesh: THREE.Mesh; t: number; life: number; grow: number; from: number }

export class MissileFx {
  private missiles: Missile[] = [];
  private fades: Fade[] = [];
  private smoke: Particles;
  private chunks: Particles;
  private ringGeo = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
  private discGeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  private ballGeo = new THREE.IcosahedronGeometry(1, 1);
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private mat: Materials, private glow: THREE.SpriteMaterial) {
    const smokeMat = new THREE.MeshStandardMaterial({ color: "#d8d4e2", roughness: 1, flatShading: true, emissive: "#d8d4e2", emissiveIntensity: 0.35 });
    this.smoke = new Particles(new THREE.IcosahedronGeometry(1, 0), smokeMat, 700, false);
    const snowMat = new THREE.MeshStandardMaterial({ color: EVENING.snow, roughness: 1, emissive: "#d8cfe6", emissiveIntensity: 0.3 });
    this.chunks = new Particles(new THREE.BoxGeometry(1, 1, 1), snowMat, 300, true);
    scene.add(this.smoke.mesh, this.chunks.mesh);
  }

  /** A missile leaves `from` along `fwd` and lands on the target (followed while it lives) after `dur` seconds. */
  launch(from: THREE.Vector3, fwd: THREE.Vector3, dur: number, size: number, target: () => THREE.Vector3 | null): void {
    const aim = target()?.clone().setY(0.2) ?? from.clone().addScaledVector(fwd, 2).setY(0.2);
    const dist = Math.hypot(aim.x - from.x, aim.z - from.z);
    const curve = new THREE.CubicBezierCurve3(from.clone(), from.clone().addScaledVector(fwd, 1.3), aim.clone().setY(2.4 + dist * 0.1), aim);
    const obj = missileMesh(this.mat, missileScale(size));
    obj.position.copy(from);
    obj.lookAt(from.clone().add(fwd));
    this.scene.add(obj);
    this.missiles.push({ obj, t: 0, dur: Math.max(0.05, dur), curve, dist, target, trail: 0 });
    this.flash(from.clone().addScaledVector(fwd, -0.12), 0.35, 0.08);
    this.smoke.add(from, { size: 0.04, life: 0.6, grow: 0.08, v: fwd.clone().multiplyScalar(-0.3).setY(0.25) });
  }

  /** The blast where the simulation says damage landed; the ring ends at its radius. */
  blast(x: number, z: number, radius: number): void {
    const r = radius, at = new THREE.Vector3(x, 0.02, z);
    this.flash(at.clone().setY(0.3), 1.6 * r, 0.22);
    this.fade(new THREE.Mesh(this.ballGeo, new THREE.MeshBasicMaterial({ color: "#ff9a3c", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })),
      at.clone().setY(0.2 * r), 0.25 * r, 0.3, 1.4 * r);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0.7, depthWrite: false }));
    this.fade(ring, at.clone().setY(0.03), 0.2, 0.35, (r - 0.2) / 0.35, false);
    const scorch = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color: "#4f475e", transparent: true, opacity: 0.4, depthWrite: false }));
    scorch.rotation.y = Math.random() * 6;
    this.fade(scorch, at.clone().setY(0.006 + Math.random() * 0.002), r * (0.42 + Math.random() * 0.12), 6, 0, false);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.3 + Math.random() * 0.5;
      this.smoke.add(at.clone().add(new THREE.Vector3(Math.cos(a) * 0.2 * r, 0.15 * r, Math.sin(a) * 0.2 * r)),
        { size: 0.08 * r, life: 1 + Math.random() * 0.6, grow: 0.12 * r, v: new THREE.Vector3(Math.cos(a) * s * 0.5, 0.45 + Math.random() * 0.35, Math.sin(a) * s * 0.5) });
    }
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 1.6;
      this.chunks.add(at.clone().setY(0.05), { size: 0.035 + Math.random() * 0.03, life: 2, fall: 9, spin: 8, v: new THREE.Vector3(Math.cos(a) * s * 0.6, 2.2 + Math.random() * 1.6, Math.sin(a) * s * 0.6) });
    }
  }

  update(dt: number): void {
    const next = this.tmp;
    this.missiles = this.missiles.filter(m => {
      m.t += dt;
      // Homing: the dive follows the target.
      const p3 = m.target();
      if (p3) {
        m.curve.v3.set(p3.x, 0.2, p3.z);
        m.curve.v2.set(p3.x, 2.4 + m.dist * 0.1, p3.z);
      }
      const u = Math.min(1, m.t / m.dur);
      const p = m.curve.getPoint(u);
      m.curve.getPoint(Math.min(1, u + 0.02), next);
      m.obj.position.copy(p);
      if (next.distanceToSquared(p) > 1e-8) m.obj.lookAt(next);
      if ((m.trail -= dt) <= 0) {
        m.trail = 0.03;
        this.smoke.add(p, { size: 0.022, life: 0.6, grow: 0.06, v: new THREE.Vector3(0, 0.08, 0) });
      }
      if (u < 1) return true;
      this.scene.remove(m.obj);
      return false;
    });
    this.fades = this.fades.filter(f => {
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { this.scene.remove(f.mesh); if (!(f.mesh instanceof THREE.Sprite)) (f.mesh.material as THREE.Material).dispose(); return false; }
      if (f.mesh instanceof THREE.Sprite) f.mesh.scale.setScalar(f.from * (1 - k));
      else {
        f.mesh.scale.setScalar(f.from + f.grow * f.t);
        (f.mesh.material as THREE.MeshBasicMaterial).opacity = (f.mesh.userData.opacity as number) * (1 - k * k);
      }
      return true;
    });
    this.smoke.update(dt);
    this.chunks.update(dt);
  }

  clear(): void {
    for (const m of this.missiles) this.scene.remove(m.obj);
    for (const f of this.fades) this.scene.remove(f.mesh);
    this.missiles = []; this.fades = [];
    this.smoke.clear(); this.chunks.clear();
  }

  private flash(at: THREE.Vector3, size: number, life: number): void {
    const s = new THREE.Sprite(this.glow);
    s.position.copy(at);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.fades.push({ mesh: s as unknown as THREE.Mesh, t: 0, life, grow: 0, from: size });
  }

  private fade(mesh: THREE.Mesh, at: THREE.Vector3, size: number, life: number, grow: number, spin = true): void {
    mesh.position.copy(at);
    mesh.scale.setScalar(size);
    if (spin) mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    mesh.userData.opacity = (mesh.material as THREE.MeshBasicMaterial).opacity;
    this.scene.add(mesh);
    this.fades.push({ mesh, t: 0, life, grow, from: size });
  }
}
