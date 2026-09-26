import * as THREE from "three";
import type { Enemy } from "./leaper";
import { assemble, cutStone, type Marks, type V3 } from "./stoneCreature";
import { GLB } from "./wolfData";

/**
 * The Swarm: Erik's 201-triangle stone wolf, in the same mined-stone grey as the
 * Brute. Cut into five parts: the body (with head and tail) and four legs, which trot
 * in diagonal pairs.
 */

type Part = "body" | "legFR" | "legFL" | "legBR" | "legBL";

/** The model is 1.9 long nose to tail, centred on the origin; at scale 1 the wolf is this long. */
export const WOLF_LENGTH = 1;
const SCALE = WOLF_LENGTH / 1.9, LIFT = 0.43;
// Hips and shoulders in the model's own units (the head is at +z); below the belly is leg.
const HIP_Y = -0.1, FRONT_Z = 0.34, BACK_Z = -0.3, LEG_X = 0.07, BELLY = -0.14;
const PIVOTS: Record<Part, V3> = {
  body: [0, 0, 0],
  legFR: [LEG_X, HIP_Y, FRONT_Z], legFL: [-LEG_X, HIP_Y, FRONT_Z],
  legBR: [LEG_X, HIP_Y, BACK_Z], legBL: [-LEG_X, HIP_Y, BACK_Z],
};

let geo: Record<Part, THREE.BufferGeometry> | undefined;

export interface WolfOptions {
  /** Size multiplier (1 = one cell long). */
  scale: number;
  /** Strides per second of game time. */
  strideRate: number;
  marks?: Marks;
}

/** One wolf. */
export function wolfModel(o: WolfOptions): Enemy {
  geo ??= cutStone(GLB, PIVOTS, c => {
    if (c.y > BELLY) return "body";
    const front = c.z > (FRONT_Z + BACK_Z) / 2;
    return c.x >= 0 ? (front ? "legFR" : "legBR") : (front ? "legFL" : "legBL");
  }, SCALE);
  const { root, tilt, mat, parts, showMarks } = assemble(geo, k => { const [x, y, z] = PIVOTS[k]; return [x * SCALE, (y + LIFT) * SCALE, z * SCALE]; }, 0.3);
  root.scale.setScalar(o.scale);
  const { legFR, legFL, legBR, legBL } = parts;
  let last = 0, phase = Math.random() * 6;
  return {
    object: root,
    update(t, walking) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      phase += dt * Math.PI * 2 * o.strideRate * (walking ? 1 : 1.6);
      showMarks(o.marks);
      const s = Math.sin(phase), c = Math.cos(phase);
      // A trot: diagonal legs move together. Standing at its target, it bites, head dipping.
      const stride = walking ? 0.55 : 0.1;
      legFR.rotation.x = s * stride; legBL.rotation.x = s * stride;
      legFL.rotation.x = -s * stride; legBR.rotation.x = -s * stride;
      tilt.position.y = Math.abs(c) * 0.04 * (walking ? 1 : 0.5);
      tilt.rotation.x = (walking ? 0.03 : Math.max(0, s) * 0.18) - mat.emissiveIntensity * 0.25;
    },
    flash(k) { mat.emissiveIntensity = k * 0.6; },
  };
}
