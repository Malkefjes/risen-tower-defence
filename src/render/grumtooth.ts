import * as THREE from "three";
import { assemble, cutStone, type Enemy, type Marks, type V3 } from "./stoneCreature";
import { GLB } from "./grumtoothData";

/**
 * The Swarm: Erik's 189-triangle Grumtooth, a small hunched stone brute with long
 * arms, in the same mined-stone grey as the Brute and the Runner. Cut into five
 * parts: the body (with head and loincloth), two arms and two legs.
 */

type Part = "body" | "armR" | "armL" | "legR" | "legL";

/** The model stands 1.87 tall, centred on the origin; at scale 1 it is this tall. */
export const GRUMTOOTH_HEIGHT = 0.5;
const SCALE = GRUMTOOTH_HEIGHT / 1.87, LIFT = 0.92;
// Shoulders and hips in the model's own units. The long arms hang outside the legs; the loincloth between the legs stays on the body.
const SHOULDER_X = 0.55, SHOULDER_Y = 0.4, HIP_X = 0.23, HIP_Y = -0.18, ARM_X = 0.37, CLOTH_X = 0.14;
const PIVOTS: Record<Part, V3> = {
  body: [0, 0, 0],
  armR: [SHOULDER_X, SHOULDER_Y, 0], armL: [-SHOULDER_X, SHOULDER_Y, 0],
  legR: [HIP_X, HIP_Y, 0], legL: [-HIP_X, HIP_Y, 0],
};

let geo: Record<Part, THREE.BufferGeometry> | undefined;

export interface GrumtoothOptions {
  /** Size multiplier (1 = half a cell tall). */
  scale: number;
  /** Strides per second of game time. */
  strideRate: number;
  marks?: Marks;
}

/** One Grumtooth. */
export function grumtoothModel(o: GrumtoothOptions): Enemy {
  geo ??= cutStone(GLB, PIVOTS, c => {
    const ax = Math.abs(c.x);
    if (ax > ARM_X && c.y < SHOULDER_Y + 0.05) return c.x > 0 ? "armR" : "armL";
    if (c.y < HIP_Y && ax > CLOTH_X) return c.x > 0 ? "legR" : "legL";
    return "body";
  }, SCALE);
  const { root, tilt, mat, parts, showMarks } = assemble(geo, k => { const [x, y, z] = PIVOTS[k]; return [x * SCALE, (y + LIFT) * SCALE, z * SCALE]; }, 0.25);
  root.scale.setScalar(o.scale);
  const { armR, armL, legR, legL } = parts;
  let last = 0, phase = Math.random() * 6;
  return {
    object: root,
    update(t, walking) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      phase += dt * Math.PI * 2 * o.strideRate * (walking ? 1 : 1.8);
      showMarks(o.marks);
      const s = Math.sin(phase), c = Math.cos(phase);
      // A quick shuffle, long arms swinging; standing at its target, it pounds with both fists.
      const stride = walking ? 0.5 : 0.08;
      legR.rotation.x = s * stride; legL.rotation.x = -s * stride;
      armR.rotation.x = walking ? -s * 0.45 : -0.6 - Math.max(0, s) * 0.8;
      armL.rotation.x = walking ? s * 0.45 : -0.6 - Math.max(0, -s) * 0.8;
      tilt.position.y = Math.abs(c) * 0.012;
      tilt.rotation.z = s * 0.05;
      tilt.rotation.x = 0.06 - mat.emissiveIntensity * 0.3;
    },
    flash(k) { mat.emissiveIntensity = k * 0.6; },
  };
}
