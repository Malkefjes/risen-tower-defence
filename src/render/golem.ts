import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { EnemyKind } from "../sim/enemies";
import { GLB } from "./golemData";
import { loopable, parseGlb } from "./skinned";

/**
 * Every enemy is Erik's Stonebound Colossus, a rigged stone golem (the same Meshy rig and
 * clips as the Sentinel). The types differ by size, colour, and which clip they move with,
 * played at the rate that keeps their feet on the ground at their speed. Faceted, each
 * face its own small shift in shade, in stone or (being tried) one of three ice skins. Each enemy has
 * its own material, so a hit flashes and Heavy tints only that one. Try them in
 * `mockups/golem`.
 */

export type GolemClip = "stand" | "walk" | "walk2" | "run";
export const GOLEM_CLIPS: GolemClip[] = ["stand", "walk", "walk2", "run"];
const CLIP_NAME: Record<GolemClip, string> = { stand: "restpose", walk: "Walking", walk2: "walking_2", run: "Running" };
/** Ground covered by one cycle of each clip, per cell of height (the Sentinel's clips, which these are, scaled by his height). */
const CYCLE: Record<GolemClip, number> = { stand: 1, walk: 0.62, walk2: 0.72, run: 1.16 };

export interface GolemLook {
  /** Height in cells. */
  height: number;
  /** The stone's colour. */
  color: string;
  /** How it moves. */
  clip: GolemClip;
  /** Width of its HP bar (1 = the normal half-cell bar). */
  bar: number;
  /** How fast the clip plays for its speed (lower: slower, longer strides; the Sentinel's is 0.5). */
  stride: number;
  /** Its ice colour, for the ice skins. */
  ice: string;
}

/**
 * What the golems are made of. Stone is the game's for now; the three ice skins are being
 * tried in `mockups/golem` (A glacier, B clear ice, C frost).
 */
export type GolemSkin = "stone" | "glacier" | "clear" | "frost";
export const GOLEM_SKINS: GolemSkin[] = ["stone", "glacier", "clear", "frost"];
let skin: GolemSkin = "stone";
/** Golems made after this use the skin. */
export function setGolemSkin(s: GolemSkin): void { skin = s; }

/** How each enemy type looks. */
export const GOLEM_LOOKS: Record<EnemyKind, GolemLook> = {
  // Erik (2026-09-26): a Grunt as tall as the player, a Runner 1.4 times, the Brute bigger still.
  grunt: { height: 1.35, color: "#6b7080", clip: "walk", bar: 0.5, stride: 0.2, ice: "#b9dff0" },
  runner: { height: 1.86, color: "#3e4657", clip: "run", bar: 0.6, stride: 0.4, ice: "#7cb9d8" },
  brute: { height: 2.5, color: "#4a4f5c", clip: "walk2", bar: 1, stride: 0.5, ice: "#5689b0" },
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
    separateArmsFromLegs(mesh!);
    const clips = Object.fromEntries(GOLEM_CLIPS.map(c => [c, loopable(gltf.animations.find(a => a.name === CLIP_NAME[c])!)])) as Record<GolemClip, THREE.AnimationClip>;
    gltf.scene.updateMatrixWorld(true);
    const height = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
    return { scene: gltf.scene, height, clips, geometry: mesh!.geometry };
  });
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

const coloured = new Map<string, THREE.BufferGeometry>();
/** A face's own steady random number, 0 to 1. */
const grain = (f: number, k = 7919) => ((f * k) % 97) / 97;
/**
 * The golem's geometry coloured for a skin (shared by every golem of that skin and colour):
 * faceted, each face its own small shift in shade. Frost puts white on the faces that look up
 * and sends a few faces to a second group, drawn glowing.
 */
function skinGeometry(src: THREE.BufferGeometry, s: GolemSkin, color: string): THREE.BufferGeometry {
  const key = `${s}|${color}`;
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
    let lit = false;
    if (s === "stone") c2.copy(base).multiplyScalar((ny > 0.38 ? 1.12 : ny < -0.35 ? 0.72 : 1) * (0.9 + r * 0.2));
    else if (s === "glacier") c2.copy(base).multiplyScalar((ny > 0.38 ? 1.2 : ny < -0.35 ? 0.62 : 1) * (0.82 + r * 0.3));
    else if (s === "clear") c2.copy(base).multiplyScalar(0.92 + r * 0.16);
    else {
      // Frost on what looks up; the rest deep ice; about one face in fourteen lit from inside.
      lit = grain(f, 4099) < 0.07 && ny < 0.3;
      if (ny > 0.35) c2.copy(frost).multiplyScalar(0.92 + r * 0.08);
      else c2.copy(base).multiplyScalar(0.55 + r * 0.25);
    }
    glow.push(lit);
    for (let k = 0; k < 3; k++) col.set([Math.min(1, c2.r), Math.min(1, c2.g), Math.min(1, c2.b)], (v + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (glow.some(x => x)) {
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
    g = re;
  }
  coloured.set(key, g);
  return g;
}

/** A golem's own materials for a skin (its own, for the hit flash and the Heavy tint), with each one's resting glow. */
function skinMaterials(s: GolemSkin): { mats: THREE.MeshStandardMaterial[]; glow: number[] } {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0, ...o });
  switch (s) {
    // Matte stone: fully rough, no metal.
    case "stone": return { mats: [std({ roughness: 1, emissive: "#ffffff", emissiveIntensity: 0 })], glow: [0] };
    // Solid ice: a gentle shine on the facets and a faint cold light inside.
    case "glacier": return { mats: [std({ roughness: 0.28, metalness: 0.05, emissive: "#9fd6ff", emissiveIntensity: 0.14 })], glow: [0.14] };
    // Clear ice: see-through and glassy.
    case "clear": return { mats: [std({ roughness: 0.12, transparent: true, opacity: 0.68, emissive: "#bfeaff", emissiveIntensity: 0.12 })], glow: [0.12] };
    // Frost over deep ice, and a few faces lit from inside.
    case "frost": return {
      mats: [std({ roughness: 0.55, emissive: "#9fd6ff", emissiveIntensity: 0.05 }), new THREE.MeshStandardMaterial({ color: "#bfeaff", flatShading: true, roughness: 0.3, emissive: "#8fd0ff", emissiveIntensity: 0.9 })],
      glow: [0.05, 0.9],
    };
  }
}

/**
 * A golem walking at `speed` cells per second. Its model arrives a moment after the game
 * starts (the loader is async); until then the enemy is an empty group.
 */
export function golemEnemy(look: GolemLook, speed: number): Enemy {
  const object = new THREE.Group();
  const s = skin, { mats, glow } = skinMaterials(s);
  let mixer: THREE.AnimationMixer | null = null, action: THREE.AnimationAction | null = null, last: number | null = null, rate = 1;
  golemTemplate().then(tpl => {
    const model = cloneSkinned(tpl.scene);
    model.scale.setScalar(look.height / tpl.height);
    model.traverse(o => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.geometry = skinGeometry(tpl.geometry, s, s === "stone" ? look.color : look.ice);
      m.material = m.geometry.groups.length ? mats : mats[0]!;
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
    flash(k) { mats.forEach((m, i) => { m.emissiveIntensity = glow[i]! + 0.6 * k; }); },
  };
}
