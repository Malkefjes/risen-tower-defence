import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { EnemyKind } from "../sim/enemies";
import { GLB } from "./golemData";
import { loopable, parseGlb } from "./skinned";

/**
 * Every enemy is Erik's Stonebound Colossus, a rigged stone golem (the same Meshy rig and
 * clips as the Sentinel). The types differ by size, colour, and which clip they move with,
 * played at the rate that keeps their feet on the ground at their speed. Faceted stone:
 * each face its own small shift in shade, lighter on top, darker underneath. Each enemy has
 * its own material, so a hit flashes and Heavy tints only that one. Try them in
 * `mockups/golem`.
 */

export type GolemClip = "stand" | "walk" | "walk2" | "run";
export const GOLEM_CLIPS: GolemClip[] = ["stand", "walk", "walk2", "run"];
const CLIP_NAME: Record<GolemClip, string> = { stand: "restpose", walk: "Walking", walk2: "walking_2", run: "Running" };
/**
 * Ground covered by one cycle of each clip, per cell of height (the Sentinel's clips, which
 * these are, scaled by his height), and the stride Erik picked for him.
 */
const CYCLE: Record<GolemClip, number> = { stand: 1, walk: 0.62, walk2: 0.72, run: 1.16 };
const STRIDE = 0.5;

export interface GolemLook {
  /** Height in cells. */
  height: number;
  /** The stone's colour. */
  color: string;
  /** How it moves. */
  clip: GolemClip;
  /** Width of its HP bar (1 = the normal half-cell bar). */
  bar: number;
}

/** How each enemy type looks. The Grunt isn't sent yet. */
export const GOLEM_LOOKS: Record<EnemyKind, GolemLook> = {
  grunt: { height: 1.0, color: "#555a67", clip: "walk", bar: 0.5 },
  swarm: { height: 0.6, color: "#6b7080", clip: "walk", bar: 0.35 },
  runner: { height: 0.95, color: "#3e4657", clip: "run", bar: 0.5 },
  brute: { height: 1.7, color: "#4a4f5c", clip: "walk2", bar: 1 },
};

/** One enemy's model, driven by the view: how it moves each frame and how it flashes when hit. */
export interface Enemy {
  object: THREE.Group;
  /** `t`: the enemy's own clock (seconds, slowed while Heavy); `walking` false while it claws. */
  update(t: number, walking: boolean): void;
  /** Light the body up when hit (0 = normal, 1 = full flash). */
  flash(k: number): void;
}

interface Template {
  scene: THREE.Object3D;
  /** The model's height in its own units. */
  height: number;
  clips: Record<GolemClip, THREE.AnimationClip>;
  geometry: THREE.BufferGeometry;
}

let template: Promise<Template> | undefined;
/** Loaded once, on first use. */
function golemTemplate(): Promise<Template> {
  return template ??= parseGlb(GLB).then(gltf => {
    let mesh: THREE.SkinnedMesh | undefined;
    gltf.scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
    const clips = Object.fromEntries(GOLEM_CLIPS.map(c => [c, loopable(gltf.animations.find(a => a.name === CLIP_NAME[c])!)])) as Record<GolemClip, THREE.AnimationClip>;
    gltf.scene.updateMatrixWorld(true);
    const height = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
    return { scene: gltf.scene, height, clips, geometry: mesh!.geometry };
  });
}

const coloured = new Map<string, THREE.BufferGeometry>();
/** The golem's geometry in one colour, as faceted stone (shared by every golem of that colour). */
function stoneGeometry(src: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  let g = coloured.get(color);
  if (g) return g;
  g = src.index ? src.toNonIndexed() : src.clone();
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  const p = g.attributes.position!, col = new Float32Array(p.count * 3), base = new THREE.Color(color);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), c2 = new THREE.Color();
  for (let v = 0; v < p.count; v += 3) {
    a.fromBufferAttribute(p, v); b.fromBufferAttribute(p, v + 1); c.fromBufferAttribute(p, v + 2);
    const ny = b.clone().sub(a).cross(c.clone().sub(a)).normalize().y, f = v / 3;
    const shade = (ny > 0.38 ? 1.12 : ny < -0.35 ? 0.72 : 1) * (0.9 + (((f * 7919) % 97) / 97) * 0.2);
    c2.copy(base).multiplyScalar(shade);
    for (let k = 0; k < 3; k++) col.set([c2.r, c2.g, c2.b], (v + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  coloured.set(color, g);
  return g;
}

/**
 * A golem walking at `speed` cells per second. Its model arrives a moment after the game
 * starts (the loader is async); until then the enemy is an empty group.
 */
export function golemEnemy(look: GolemLook, speed: number): Enemy {
  const object = new THREE.Group();
  // Matte stone: fully rough, no metal; its own copy, for the hit flash and the Heavy tint.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, emissive: "#ffffff", emissiveIntensity: 0 });
  let mixer: THREE.AnimationMixer | null = null, action: THREE.AnimationAction | null = null, last: number | null = null, rate = 1;
  golemTemplate().then(tpl => {
    const model = cloneSkinned(tpl.scene);
    model.scale.setScalar(look.height / tpl.height);
    model.traverse(o => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.geometry = stoneGeometry(tpl.geometry, look.color);
      m.material = mat;
      m.castShadow = true;
      m.frustumCulled = false;
    });
    object.add(model);
    mixer = new THREE.AnimationMixer(model);
    const clip = tpl.clips[look.clip];
    action = mixer.clipAction(clip);
    action.play();
    action.time = Math.random() * clip.duration;
    rate = look.clip === "stand" ? 1 : (speed / (CYCLE[look.clip] * look.height / clip.duration)) * STRIDE;
  }, e => console.error("golem", e));
  return {
    object,
    update(t, walking) {
      if (!mixer) return;
      const dt = last === null ? 0 : Math.min(0.1, Math.max(0, t - last));
      last = t;
      // Clawing a building: the same stride, slower, in place.
      mixer.update(dt * rate * (walking ? 1 : 0.5));
    },
    flash(k) { mat.emissiveIntensity = 0.6 * k; },
  };
}
