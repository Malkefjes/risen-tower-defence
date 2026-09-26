import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { EnemyKind } from "../sim/enemies";
import { GLB as COLOSSUS } from "./golemData";
import { loopable, parseGlb } from "./skinned";
import { GLB as TITAN } from "./titanData";

/**
 * Every enemy is Erik's Stonebound Colossus, a rigged golem (the same Meshy rig and clips as
 * the Sentinel), made of ice: Erik's pick C, frost (2026-09-26): white frost on every face
 * that looks up, deep ice in the type's colour on the rest, and a few faces lit from inside.
 * The types differ by size, ice colour, and which clip they move with, played at the rate
 * that keeps their feet on the ground at their speed. Each enemy has
 * its own material, so a hit flashes and Heavy tints only that one. Try them in
 * `mockups/golem`.
 */

export type GolemClip = "stand" | "walk" | "walk2" | "run";
export const GOLEM_CLIPS: GolemClip[] = ["stand", "walk", "walk2", "run"];
const CLIP_NAME: Record<GolemClip, string> = { stand: "restpose", walk: "Walking", walk2: "walking_2", run: "Running" };
/** Ground covered by one cycle of each clip, per cell of height (the Sentinel's clips, which these are, scaled by his height). */
const CYCLE: Record<GolemClip, number> = { stand: 1, walk: 0.62, walk2: 0.72, run: 1.16 };

/** Erik's models on the golem rig: the Stonebound Colossus (Grunt, Runner, Brute) and the Frost Titan (Elite). */
export type GolemModel = "colossus" | "titan";
const MODEL_GLB: Record<GolemModel, string> = { colossus: COLOSSUS, titan: TITAN };

export interface GolemLook {
  /** Which model. */
  model: GolemModel;
  /** Height in cells. */
  height: number;
  /** How it moves. */
  clip: GolemClip;
  /** Width of its HP bar (1 = the normal half-cell bar). */
  bar: number;
  /** How fast the clip plays for its speed (lower: slower, longer strides; the Sentinel's is 0.5). */
  stride: number;
  /** Its ice colour (the frost on top is white for all). */
  ice: string;
}

/** How each enemy type looks. */
export const GOLEM_LOOKS: Record<EnemyKind, GolemLook> = {
  // Erik (2026-09-26): a Grunt as tall as the player, a Runner 1.4 times, the Brute bigger still.
  grunt: { model: "colossus", height: 1.35, clip: "walk", bar: 0.5, stride: 0.2, ice: "#b9dff0" },
  runner: { model: "colossus", height: 1.86, clip: "run", bar: 0.6, stride: 0.4, ice: "#7cb9d8" },
  brute: { model: "colossus", height: 2.5, clip: "walk2", bar: 1, stride: 0.5, ice: "#5689b0" },
  // The Elite: Erik's Frost Titan, between the Grunt and the Runner in size, in violet ice so it stands out.
  elite: { model: "titan", height: 1.6, clip: "walk", bar: 0.7, stride: 0.3, ice: "#8f86c9" },
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

const templates = new Map<GolemModel, Promise<Template>>();
/** Loaded once, on first use. */
function golemTemplate(model: GolemModel): Promise<Template> {
  let t = templates.get(model);
  if (!t) templates.set(model, t = parseGlb(MODEL_GLB[model]).then(gltf => {
    let mesh: THREE.SkinnedMesh | undefined;
    gltf.scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
    separateArmsFromLegs(mesh!);
    const clips = Object.fromEntries(GOLEM_CLIPS.map(c => [c, loopable(inPlace(gltf.animations.find(a => a.name === CLIP_NAME[c])!))])) as Record<GolemClip, THREE.AnimationClip>;
    gltf.scene.updateMatrixWorld(true);
    const height = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
    return { scene: gltf.scene, height, clips, geometry: mesh!.geometry };
  }));
  return t;
}

/**
 * The file's skinning ties the inner hands (the thumbs) partly to the thigh and knee they
 * hang beside, and some thigh to the hands, so a swinging arm stretched the thumb back to the
 * leg. Neither the weights nor the distance to the bones tell a thumb from a thigh (the thumb
 * sits by the knee), but the surface does: every vertex held by both an arm and a leg goes
 * wholly to the one it reaches first along the mesh, a vertex held only by the arm or only by
 * the leg.
 */
function separateArmsFromLegs(mesh: THREE.SkinnedMesh): void {
  const g = mesh.geometry, p = g.attributes.position!, si = g.attributes.skinIndex!, sw = g.attributes.skinWeight!;
  const names = mesh.skeleton.bones.map(b => b.name);
  const isArm = names.map(n => /Arm|Hand|Shoulder/.test(n)), isLeg = names.map(n => /Leg|Foot|Toe/.test(n));
  // One node per position (the file splits vertices along its texture seams).
  const ids = new Map<string, number>(), node = new Int32Array(p.count);
  for (let v = 0; v < p.count; v++) {
    const k = `${p.getX(v).toFixed(5)},${p.getY(v).toFixed(5)},${p.getZ(v).toFixed(5)}`;
    node[v] = ids.get(k) ?? ids.set(k, ids.size).size - 1;
  }
  const n = ids.size, arm = new Float32Array(n), leg = new Float32Array(n), at: THREE.Vector3[] = [];
  for (let v = 0; v < p.count; v++) {
    at[node[v]!] ??= new THREE.Vector3().fromBufferAttribute(p, v);
    let a = 0, l = 0;
    for (let q = 0; q < 4; q++) { const b = si.getComponent(v, q), w = sw.getComponent(v, q); if (isArm[b]) a += w; else if (isLeg[b]) l += w; }
    arm[node[v]!] = a; leg[node[v]!] = l;
  }
  const edges: number[][] = Array.from({ length: n }, () => []), index = g.index!;
  for (let f = 0; f < index.count; f += 3) {
    const t = [node[index.getX(f)]!, node[index.getX(f + 1)]!, node[index.getX(f + 2)]!];
    for (let i = 0; i < 3; i++) edges[t[i]!]!.push(t[(i + 1) % 3]!, t[(i + 2) % 3]!);
  }
  // Distance along the surface from every node the arm (or the leg) wholly holds.
  const along = (from: (i: number) => boolean) => {
    const d = new Float64Array(n).fill(Infinity), done = new Uint8Array(n), open: number[] = [];
    for (let i = 0; i < n; i++) if (from(i)) { d[i] = 0; open.push(i); }
    while (open.length) {
      let k = 0;
      for (let j = 1; j < open.length; j++) if (d[open[j]!]! < d[open[k]!]!) k = j;
      const i = open[k]!;
      open[k] = open[open.length - 1]!; open.pop();
      if (done[i]) continue;
      done[i] = 1;
      for (const j of edges[i]!) {
        const dj = d[i]! + at[i]!.distanceTo(at[j]!);
        if (dj < d[j]!) { d[j] = dj; open.push(j); }
      }
    }
    return d;
  };
  const toArm = along(i => arm[i]! > 0.999), toLeg = along(i => leg[i]! > 0.999);
  for (let v = 0; v < p.count; v++) {
    const i = node[v]!;
    if (arm[i]! <= 0.001 || leg[i]! <= 0.001) continue;
    const drop = toArm[i]! <= toLeg[i]! ? isLeg : isArm;
    let total = 0;
    for (let q = 0; q < 4; q++) if (drop[si.getComponent(v, q)]) sw.setComponent(v, q, 0); else total += sw.getComponent(v, q);
    if (total > 0) for (let q = 0; q < 4; q++) sw.setComponent(v, q, sw.getComponent(v, q) / total);
  }
  sw.needsUpdate = true;
}

/**
 * The Brute's walk (walking_2) carries its hips forward about a body width over a loop and
 * then snaps back, so it was pushed backwards once a stride (the game moves it along its
 * path already). The hips' steady drift is taken out, their bob and sway kept: on the spot,
 * like the other clips.
 */
function inPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  for (const t of clip.tracks) {
    if (!/Hips\.position$/.test(t.name)) continue;
    const n = t.times.length, span = t.times[n - 1]! - t.times[0]!;
    if (n < 2 || span <= 0) continue;
    for (const axis of [0, 2]) {
      const drift = (t.values[(n - 1) * 3 + axis]! - t.values[axis]!) / span;
      for (let i = 0; i < n; i++) t.values[i * 3 + axis]! -= drift * (t.times[i]! - t.times[0]!);
    }
  }
  return clip;
}

const coloured = new Map<string, THREE.BufferGeometry>();
/** A face's own steady random number, 0 to 1. */
const grain = (f: number, k = 7919) => ((f * k) % 97) / 97;
/**
 * The golem's geometry in frost (shared by every golem of that ice colour): faceted, each face
 * its own small shift in shade; white frost on the faces that look up, deep ice on the rest,
 * and about one face in fourteen sent to a second group, drawn lit from inside.
 */
function frostGeometry(model: GolemModel, src: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const key = `${model}|${color}`;
  let g = coloured.get(key);
  if (g) return g;
  g = src.index ? src.toNonIndexed() : src.clone();
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  const p = g.attributes.position!, n = p.count / 3, col = new Float32Array(p.count * 3), base = new THREE.Color(color);
  const frost = new THREE.Color("#eef4fa"), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), c2 = new THREE.Color();
  const glow: boolean[] = [];
  for (let f = 0; f < n; f++) {
    const v = f * 3;
    a.fromBufferAttribute(p, v); b.fromBufferAttribute(p, v + 1); c.fromBufferAttribute(p, v + 2);
    const ny = b.clone().sub(a).cross(c.clone().sub(a)).normalize().y, r = grain(f);
    glow.push(grain(f, 4099) < 0.07 && ny < 0.3);
    if (ny > 0.35) c2.copy(frost).multiplyScalar(0.92 + r * 0.08);
    else c2.copy(base).multiplyScalar(0.55 + r * 0.25);
    for (let k = 0; k < 3; k++) col.set([c2.r, c2.g, c2.b], (v + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  // The lit faces go last, in their own group.
  const order = [...Array(n).keys()].sort((x, y) => Number(glow[x]) - Number(glow[y])), first = order.findIndex(f => glow[f]);
  const re = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const at = attr as THREE.BufferAttribute, size = at.itemSize, out = new (at.array.constructor as Float32ArrayConstructor)(at.array.length);
    order.forEach((f, i) => out.set((at.array as Float32Array).subarray(f * 3 * size, (f + 1) * 3 * size), i * 3 * size));
    re.setAttribute(name, new THREE.BufferAttribute(out, size, at.normalized));
  }
  re.addGroup(0, first * 3, 0);
  re.addGroup(first * 3, (n - first) * 3, 1);
  coloured.set(key, re);
  return re;
}

/** A golem's own materials (its own, for the hit flash and the Heavy tint): the frosted ice and the lit faces, each with its resting glow. */
const GLOW = [0.05, 0.9];
function frostMaterials(): THREE.MeshStandardMaterial[] {
  return [
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0, emissive: "#9fd6ff", emissiveIntensity: GLOW[0] }),
    new THREE.MeshStandardMaterial({ color: "#bfeaff", flatShading: true, roughness: 0.3, metalness: 0, emissive: "#8fd0ff", emissiveIntensity: GLOW[1] }),
  ];
}

/**
 * A golem walking at `speed` cells per second. Its model arrives a moment after the game
 * starts (the loader is async); until then the enemy is an empty group.
 */
export function golemEnemy(look: GolemLook, speed: number): Enemy {
  const object = new THREE.Group();
  const mats = frostMaterials();
  let mixer: THREE.AnimationMixer | null = null, action: THREE.AnimationAction | null = null, last: number | null = null, rate = 1;
  golemTemplate(look.model).then(tpl => {
    const model = cloneSkinned(tpl.scene);
    model.scale.setScalar(look.height / tpl.height);
    model.traverse(o => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.geometry = frostGeometry(look.model, tpl.geometry, look.ice);
      m.material = mats;
      m.castShadow = true;
      m.frustumCulled = false;
    });
    object.add(model);
    mixer = new THREE.AnimationMixer(model);
    const clip = tpl.clips[look.clip];
    action = mixer.clipAction(clip);
    action.play();
    action.time = Math.random() * clip.duration;
    rate = look.clip === "stand" ? 1 : (speed / (CYCLE[look.clip] * look.height / clip.duration)) * look.stride;
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
    flash(k) { mats.forEach((m, i) => { m.emissiveIntensity = GLOW[i]! + 0.6 * k; }); },
  };
}
