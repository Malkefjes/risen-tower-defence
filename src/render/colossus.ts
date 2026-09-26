import * as THREE from "three";
import { GLB } from "./colossusData";
import type { Enemy } from "./leaper";
import { assemble, cutStone, segDist, type Marks, type V3 } from "./stoneCreature";

/**
 * The Brute: Erik's 705-triangle Colossus, a rock golem in the grey of the stone you
 * mine. Cut into five parts that can move (body, two arms, two legs), each triangle
 * going to the nearest bone of a rough skeleton.
 */

type Part = "body" | "armR" | "armL" | "legR" | "legL";

/** The model stands 1.83 tall, centred on the origin; at scale 1 the golem is this tall. */
export const COLOSSUS_HEIGHT = 0.8;
const SCALE = COLOSSUS_HEIGHT / 1.833, LIFT = 0.917;
// The rough skeleton, in the model's own units. The torso is thick, so it gets a head start.
const SHOULDER = 0.42, SHOULDER_Y = 0.55, HIP = 0.17, HIP_Y = -0.02;
const PIVOTS: Record<Part, V3> = {
  body: [0, 0, 0], armR: [SHOULDER, SHOULDER_Y, 0], armL: [-SHOULDER, SHOULDER_Y, 0], legR: [HIP, HIP_Y, 0], legL: [-HIP, HIP_Y, 0],
};
const BONES: { part: Part; a: V3; b: V3; bonus: number }[] = [
  { part: "body", a: [0, -0.05, 0], b: [0, 0.8, 0], bonus: 0.12 },
  { part: "armR", a: [SHOULDER, SHOULDER_Y, 0], b: [0.7, -0.35, 0], bonus: 0 },
  { part: "armL", a: [-SHOULDER, SHOULDER_Y, 0], b: [-0.7, -0.35, 0], bonus: 0 },
  { part: "legR", a: [HIP, HIP_Y, 0], b: [0.33, -0.85, 0], bonus: 0 },
  { part: "legL", a: [-HIP, HIP_Y, 0], b: [-0.33, -0.85, 0], bonus: 0 },
];

let geo: Record<Part, THREE.BufferGeometry> | undefined;

export interface ColossusOptions {
  /** Size multiplier (1 = 0.8 cells tall). */
  scale: number;
  /** Strides per second of game time at the golem's walking speed. */
  strideRate: number;
  marks?: Marks;
}

/** One golem. */
export function colossusModel(o: ColossusOptions): Enemy {
  geo ??= cutStone(GLB, PIVOTS, c => {
    let best = BONES[0]!, bestD = Infinity;
    for (const bone of BONES) { const d = segDist(c, bone.a, bone.b) - bone.bonus; if (d < bestD) { bestD = d; best = bone; } }
    return best.part;
  }, SCALE);
  const { root, tilt, mat, parts, showMarks } = assemble(geo, k => { const [x, y, z] = PIVOTS[k]; return [x * SCALE, (y + LIFT) * SCALE, z * SCALE]; }, 0.42);
  root.scale.setScalar(o.scale);
  const { armR, armL, legR, legL } = parts;
  let last = 0, phase = Math.random() * 6;
  return {
    object: root,
    update(t, walking) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      // Heavy steps while walking; standing, the arms swing slowly as it pounds what it's attacking.
      phase += dt * Math.PI * 2 * o.strideRate * (walking ? 1 : 0.6);
      showMarks(o.marks);
      const s = Math.sin(phase), c = Math.cos(phase);
      const stride = walking ? 0.3 : 0.05, swing = walking ? 0.32 : 0.7;
      legR.rotation.x = s * stride; legL.rotation.x = -s * stride;
      armR.rotation.x = -s * swing; armL.rotation.x = walking ? s * swing : -s * swing;
      armR.rotation.z = 0.08; armL.rotation.z = -0.08;
      tilt.position.y = Math.abs(c) * 0.03 * (walking ? 1 : 0.3);
      tilt.rotation.z = s * 0.06 * (walking ? 1 : 0.3);
      tilt.rotation.x = 0.06 - mat.emissiveIntensity * 0.3;
    },
    flash(k) { mat.emissiveIntensity = k * 0.6; },
  };
}
