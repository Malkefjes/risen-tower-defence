import * as THREE from "three";
import { roundedBox } from "./models";
import { colonyOrange } from "./palette";

/**
 * The player rig (picked by Erik from mockups/rig): a slim humanoid exo-rig with a
 * square visored helmet, a small backpack and a multitool locked to the right wrist.
 * `createRig` builds the model; `RigAnimator` drives it from how the avatar moves.
 */

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, flatShading: true, ...o });
// Created on first use, not at import: the game turns off THREE's colour management at
// startup, and materials made before that would convert these hex colours (orange turns red).
const palette = () => ({
  suit: std("#eef1f6", { roughness: 0.6 }),
  orange: colonyOrange(),
  steel: std("#3d4457", { roughness: 0.55 }),
  steelDark: std("#2c3142", { roughness: 0.6 }),
  power: std("#7ff5e6", { emissive: "#4fdcca", emissiveIntensity: 0.8, roughness: 0.4 }),
});
let M: ReturnType<typeof palette>;
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  return o;
};
/** Box standing on y (y is its bottom). */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
/** How far a roundedBox's bevel pushes its sides out past w and d. */
const bulge = (r: number, h: number) => Math.min(r * 0.6, h / 3) * 0.8;
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(roundedBox(w, h, d, r), m, x, y, z);
/** A rounded box scaled to an exact outer width and depth. */
function exactBox(w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const g = roundedBox(w, h, d, r);
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.scale(w / (b.max.x - b.min.x), 1, d / (b.max.z - b.min.z));
  return mesh(g, m, x, y, z);
}

// Proportions, in rig units. Leg length equals hip height, so feet sit on the ground.
const THIGH = 0.21, SHIN = 0.2, FOOT_H = 0.045, HIP_Y = THIGH + SHIN + FOOT_H;
const HIP_W = 0.065, LEG_W = 0.075, WAIST_H = 0.08, TORSO_H = 0.26;
const TORSO_Y = HIP_Y + WAIST_H * 0.5, TORSO_TOP = TORSO_Y + TORSO_H;
const HIPS_W = 2 * HIP_W + LEG_W + 2 * 0.009, HIPS_D = 0.127;
const ARM_W = 0.062, UPPER_ARM = 0.17, FOREARM = 0.16;
/** The rig is shown a bit larger than life so it reads at the game's zoom. */
export const RIG_SCALE = 1.3;

interface Limb { top: THREE.Group; mid: THREE.Group; end: THREE.Group }

function limb(parent: THREE.Object3D, x: number, y: number, upper: number, lower: number, w: number, joint = 0.6): Limb {
  const top = new THREE.Group(); top.position.set(x, y, 0); parent.add(top);
  top.add(mesh(new THREE.SphereGeometry(w * joint, 10, 8), M.steel));
  top.add(rbox(w, upper, w, w * 0.25, M.suit, 0, -upper, 0));
  const mid = new THREE.Group(); mid.position.y = -upper; top.add(mid);
  mid.add(mesh(new THREE.SphereGeometry(w * 0.55, 10, 8), M.steel));
  mid.add(rbox(w * 0.92, lower, w * 0.92, w * 0.22, M.steelDark, 0, -lower, 0));
  mid.add(box(w * 1.02, 0.055, w * 1.02, M.orange, 0, -lower * 0.55, 0));
  const end = new THREE.Group(); end.position.y = -lower; mid.add(end);
  return { top, mid, end };
}

export interface Rig {
  /** Place this in the world: position, heading. Faces +z. */
  object: THREE.Group;
  /** Inside `object` (scaled): carries the small foot-planting correction. */
  root: THREE.Group;
  body: THREE.Group;
  legs: Limb[];
  arms: Limb[];
  beam: THREE.Mesh;
}

export function createRig(): Rig {
  M ??= palette();
  const object = new THREE.Group(), root = new THREE.Group();
  root.scale.setScalar(RIG_SCALE);
  object.add(root);
  // `body` pivots at hip height so the torso leans over the hips.
  const body = new THREE.Group(), torso = new THREE.Group();
  body.position.y = HIP_Y;
  torso.position.y = -HIP_Y;
  body.add(torso);
  root.add(body);

  root.add(exactBox(HIPS_W, WAIST_H, HIPS_D, 0.045, M.steelDark, 0, HIP_Y - WAIST_H * 0.5, 0));
  torso.add(exactBox(HIPS_W, TORSO_H, HIPS_D, 0.045, M.suit, 0, TORSO_Y, 0));

  const NECK_H = 0.04;
  torso.add(mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.014, 12), M.steel, 0, TORSO_TOP + 0.007, 0));
  torso.add(mesh(new THREE.CylinderGeometry(0.03, 0.034, NECK_H, 10), M.steelDark, 0, TORSO_TOP + NECK_H / 2, 0));
  const HW = 0.13, HH = 0.12, headY = TORSO_TOP + NECK_H - 0.005;
  torso.add(rbox(HW, HH, HW, 0.028, M.suit, 0, headY, 0));
  torso.add(box(HW * 0.84, 0.042, 0.02, M.power, 0, headY + HH * 0.45, HW / 2 + bulge(0.028, HH)));

  const PACK_H = 0.2, PACK_D = 0.065, backZ = -HIPS_D / 2 - PACK_D / 2;
  torso.add(exactBox(HIPS_W * 0.8, PACK_H, PACK_D, 0.025, M.steel, 0, TORSO_TOP - PACK_H, backZ));
  torso.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 14).rotateX(Math.PI / 2), M.power, 0, TORSO_TOP - 0.06, backZ - PACK_D / 2 - 0.005));

  const legs = [-1, 1].map(sx => {
    const l = limb(root, sx * HIP_W, HIP_Y, THIGH, SHIN, LEG_W, 0.5);
    l.end.add(rbox(LEG_W * 1.1, FOOT_H, 0.14, 0.015, M.steelDark, 0, -FOOT_H, 0.025));
    l.end.add(box(LEG_W * 1.12, FOOT_H * 0.55, 0.04, M.orange, 0, -FOOT_H, 0.08));
    return l;
  });
  const arms = [-1, 1].map(sx => limb(torso, sx * (HIPS_W / 2 + ARM_W / 2), TORSO_TOP - 0.03, UPPER_ARM, FOREARM, ARM_W));

  // Multitool, locked to the right wrist and pointing on along the forearm.
  const tool = new THREE.Group();
  tool.position.y = -0.03;
  tool.rotation.x = Math.PI / 2;
  arms[1]!.end.add(tool);
  tool.add(box(0.03, 0.06, 0.035, M.steelDark, 0, -0.035, -0.015));
  tool.add(rbox(0.05, 0.055, 0.16, 0.012, M.suit, 0, 0.015, 0.035));
  for (const sx of [-1, 1]) tool.add(box(0.004, 0.028, 0.08, M.orange, sx * (0.025 + bulge(0.012, 0.055)), 0.028, 0.03));
  tool.add(box(0.034, 0.034, 0.06, M.steelDark, 0, 0.025, 0.14));
  tool.add(box(0.024, 0.024, 0.012, M.power, 0, 0.03, 0.175));
  const beam = mesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), M.power, 0, 0.042, 0.18);
  beam.scale.z = 0.3;
  beam.visible = false;
  tool.add(beam);

  object.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return { object, root, body, legs, arms, beam };
}

// ------------------------------------------------------------------ animation

const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const softMin = (a: number, b: number, k = 40) => -Math.log(Math.exp(-k * a) + Math.exp(-k * b)) / k;
const approach = (v: number, target: number, rate: number, dt: number) => v + (target - v) * Math.min(1, rate * dt);

/** What the avatar is doing this frame, as the animator needs it. */
export interface RigMotion {
  /** Horizontal speed and the top running speed (not sprinting), cells per second. */
  speed: number;
  topSpeed: number;
  grounded: boolean;
  /** Vertical speed (positive rising), and the take-off speed of a full jump. */
  vz: number;
  jumpSpeed: number;
  /** Touched down this frame. */
  landed: boolean;
  /** Tool raised (building or mining). */
  ready: boolean;
  mining: boolean;
}

export interface RigAnimTuning {
  /** Stride phase per cell travelled (radians): lower means longer strides. */
  stride: number;
  /** Height of the flight bounce between running steps, rig units. */
  bounce: number;
}
export const defaultRigAnimTuning = (): RigAnimTuning => ({ stride: 2, bounce: 0.025 });

/**
 * Drives the rig from movement: idle and run blend by speed, the air pose blends
 * in off the ground (a running leap when moving, a tuck when not), and a brief
 * crouch plays on landing. All blends are eased, so nothing snaps.
 */
export class RigAnimator {
  tuning = defaultRigAnimTuning();
  private phase = 0;
  private runW = 0;
  private airW = 0;
  private leapW = 0;
  private landW = 0;
  private readyW = 0;
  private sprintW = 0;
  private time = 0;
  private rootY = 0;
  private readonly joints: THREE.Group[];

  constructor(private rig: Rig) {
    this.joints = [...rig.legs.flatMap(l => [l.top, l.mid, l.end]), ...rig.arms.flatMap(a => [a.top, a.mid])];
  }

  update(dt: number, m: RigMotion): void {
    this.time += dt;
    const t = this.time;
    const moving = Math.min(1, m.speed / Math.max(0.01, m.topSpeed * 0.5));
    this.runW = approach(this.runW, m.grounded ? moving : this.runW, 10, dt);
    this.airW = approach(this.airW, m.grounded ? 0 : 1, 14, dt);
    this.leapW = approach(this.leapW, moving, 6, dt);
    this.readyW = approach(this.readyW, m.ready ? 1 : 0, 10, dt);
    // Sprinting: anything above the top running speed blends in the sprint stride.
    const over = smooth((m.speed / Math.max(0.01, m.topSpeed) - 1.02) / 0.3);
    this.sprintW = approach(this.sprintW, m.grounded ? over : this.sprintW, 6, dt);
    if (m.landed) this.landW = Math.max(this.landW, m.speed > 0.5 ? 0.35 : 1);
    this.landW = Math.max(0, this.landW - dt * 5);
    // Stride phase follows distance travelled, so the feet match the ground speed.
    // Sprint strides are longer, so the cadence rises less than the speed.
    this.phase += m.speed * dt * this.tuning.stride * (1 - 0.2 * this.sprintW);

    const idle = this.pose(() => this.idlePose(t));
    const run = this.pose(() => this.runPose(this.phase, this.sprintW));
    const rise = m.jumpSpeed > 0 ? Math.max(-1, Math.min(1, m.vz / m.jumpSpeed)) : 0;
    const air = this.mix(this.pose(() => this.tuckPose(rise)), this.pose(() => this.leapPose(rise)), this.leapW);
    let p = this.mix(idle, run, this.runW);
    p = this.mix(p, air, smooth(this.airW));
    p = this.mix(p, this.pose(() => this.crouchPose()), smooth(this.landW) * 0.8);
    if (this.readyW > 0.001) {
      const ready = this.pose(() => (m.mining ? this.minePose(t) : this.buildPose(t)));
      // Only the arms go to the ready pose; the legs keep running.
      const armStart = 6;
      p = p.map((v, i) => (i >= armStart && i < armStart + 4 ? v + (ready[i]! - v) * this.readyW : v));
    }
    this.apply(p);
    this.rig.beam.visible = m.mining;
    this.rig.beam.scale.z = 1.1 + Math.sin(t * 40) * 0.06;

    // Keep the lower foot on the ground while grounded; add the run's flight bounce.
    const drops = this.rig.legs.map(l => {
      const a = l.top.rotation.x, b = a + l.mid.rotation.x;
      return HIP_Y - FOOT_H - (THIGH * Math.cos(a) + SHIN * Math.cos(b));
    });
    const groundW = 1 - smooth(this.airW);
    const bounce = this.tuning.bounce * (1 - Math.cos(2 * this.phase)) / 2 * this.runW;
    const target = (-softMin(drops[0]!, drops[1]!) + bounce) * groundW;
    this.rootY = approach(this.rootY, target, 30, dt);
    this.rig.root.position.y = this.rootY * RIG_SCALE;
  }

  // ---------------------------------------------------------------- poses

  private leg(i: number, swing: number, bend: number): void {
    const l = this.rig.legs[i]!;
    l.top.rotation.x = swing; l.mid.rotation.x = bend; l.end.rotation.x = -(swing + bend);
  }
  private arm(i: number, swing: number, bend: number): void {
    const a = this.rig.arms[i]!;
    a.top.rotation.x = swing; a.mid.rotation.x = bend;
  }
  private torso(lean: number, twist: number, y = 0): void {
    this.rig.body.rotation.set(lean, twist, 0);
    this.rig.body.position.y = HIP_Y + y;
  }

  private idlePose(t: number): void {
    this.leg(0, 0, 0.06); this.leg(1, 0, 0.06);
    this.arm(0, 0.05, -0.2); this.arm(1, 0.05, -0.2);
    this.torso(0, 0, Math.sin(t * 2) * 0.004);
  }
  /** Running stride; `sprint` (0..1) swings legs and arms wider and leans further forward. */
  private runPose(r: number, sprint = 0): void {
    const swing = 0.6 + 0.2 * sprint, fold0 = 1.3 + 0.25 * sprint;
    for (const i of [0, 1]) {
      const ph = r + i * Math.PI;
      const fold = fold0 * ((1 + Math.cos(ph - 0.45)) / 2) ** 2;
      this.leg(i, -Math.sin(ph) * swing, 0.1 + fold);
    }
    this.arm(0, Math.sin(r) * swing - 0.1, -1.25);
    this.arm(1, -Math.sin(r) * swing - 0.1, -1.25);
    this.torso(0.14 + 0.12 * sprint, Math.sin(r) * 0.06);
  }
  /** Running leap: knee driven up, trailing leg back; reaching down as the jump falls. */
  private leapPose(rise: number): void {
    const reach = smooth((0.4 - rise) / 1.2);
    this.leg(0, -0.75 + 0.35 * reach, 1.15 - 0.8 * reach);
    this.leg(1, 0.45 - 0.7 * reach, 0.55 - 0.25 * reach);
    this.arm(0, 0.45 - 0.3 * reach, -1.2);
    this.arm(1, -0.7 + 0.4 * reach, -1.2);
    this.torso(0.2, 0);
  }
  /** Standing jump: legs tuck up on the way up, reach down for the landing. */
  private tuckPose(rise: number): void {
    const tuck = smooth((rise + 0.6) / 1.2);
    this.leg(0, -0.2 - 0.5 * tuck, 0.25 + 1.0 * tuck);
    this.leg(1, -0.1 - 0.45 * tuck, 0.2 + 0.9 * tuck);
    this.arm(0, -0.9 * tuck - 0.1, -0.4); this.arm(1, -0.9 * tuck - 0.1, -0.4);
    this.torso(0.1, 0);
  }
  private crouchPose(): void {
    this.leg(0, -0.5, 1.0); this.leg(1, -0.5, 1.0);
    this.arm(0, 0.5, -0.3); this.arm(1, 0.5, -0.3);
    this.torso(0.25, 0);
  }
  private buildPose(t: number): void {
    this.arm(1, -0.95 + Math.sin(t * 3) * 0.03, -0.35);
    this.arm(0, -0.35, -0.8);
  }
  private minePose(t: number): void {
    this.arm(1, -1.25 + Math.sin(t * 14) * 0.02, -0.25);
    this.arm(0, -0.6, -0.7);
  }

  /** Run a pose function and read the joint values it set. */
  private pose(fn: () => void): number[] {
    fn();
    const b = this.rig.body;
    return [...this.joints.map(j => j.rotation.x), b.rotation.x, b.rotation.y, b.position.y];
  }
  private mix(a: number[], b: number[], w: number): number[] {
    return a.map((v, i) => v + (b[i]! - v) * w);
  }
  private apply(v: number[]): void {
    this.joints.forEach((j, i) => { j.rotation.x = v[i]!; });
    const n = this.joints.length, b = this.rig.body;
    b.rotation.x = v[n]!; b.rotation.y = v[n + 1]!; b.position.y = v[n + 2]!;
  }
}
