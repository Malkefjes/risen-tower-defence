import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BLASTER } from "./blasterData";
import { colonyOrange } from "./palette";
import { GLB } from "./sentinelData";

/**
 * The player's avatar: Erik's Neon Star Sentinel, a skinned model with stand, walk, run and
 * sprint clips, holding his Starforge Blaster. Jumping, aiming and the torso twist are added
 * in code on top of the clips. The model is fixed up here where the file falls short: a block
 * on the chest plate pressed flat, the backpack made rigid, the wrist locked to the forearm,
 * and the colours (dark steel, cyan visor, orange pads, forearm guards and chest piece)
 * picked face by face. Try it alone in `mockups/avatar`.
 */

/** Height in cells (the old rig's, which the game's reach and camera were tuned to). */
export const AVATAR_HEIGHT = 1.33;
/** The blaster's length, as a share of his height. */
const GUN_LENGTH = 0.3 * AVATAR_HEIGHT;
/** Where he grips the blaster, in the blaster model's units (muzzle at -x, top +y). */
const GRIP = new THREE.Vector3(0.58, -0.07, 0);
/** The middle of the muzzle, in the blaster model's units. */
const MUZZLE_Y = 0.45;

/** The clips, and the ground speed (cells/s) each is shown at. */
type Clip = "stand" | "walk" | "run" | "sprint";
const CLIPS: Clip[] = ["stand", "walk", "run", "sprint"];
const CLIP_NAME: Record<Clip, string> = { stand: "restpose", walk: "Walking", run: "Running", sprint: "Run_03" };
const CLIP_SPEED: Record<Clip, number> = { stand: 0, walk: 1.8, run: 5, sprint: 7 };
/** Ground covered by one cycle of each clip at this size (cells), and Erik's stride pick. */
const CYCLE: Record<Clip, number> = { stand: 1, walk: 1.5 * 0.55, run: 2.8 * 0.55, sprint: 3.4 * 0.55 };
const STRIDE = 0.5;

// Faces of the model, by their index in the file (found by shape, see the mockup's history).
/** The visor: the three flat faces across the front of the helmet, below the ridge. */
const VISOR = [1115, 1233, 1642, 1651, 1689, 1779, 1809];
/** The shoulder pads: each grown from its big outer face across the block's outward folds. */
const PADS = [37, 42, 52, 65, 69, 77, 81, 96, 100, 101, 106, 109, 114, 116, 120, 122, 124, 131, 137, 140, 141, 151, 154, 159, 166, 169, 182, 194, 204, 215, 220, 222, 233, 250, 282, 286, 311, 319, 321, 333, 335, 336, 339, 342, 349, 368, 371, 386, 401, 408, 409, 418, 420, 426, 433, 435, 438, 448, 453, 464, 473, 477, 481, 483, 498, 2544, 2550, 2551, 2556, 2561, 2564, 2565, 2571, 2577, 2586, 2590, 2614, 2615, 2618, 2621, 2627, 2635, 2647, 2648, 2651, 2662, 2667, 2674, 2691, 2693, 2706, 2707, 2709, 2739, 2746, 2772, 2812, 2817, 2820, 2825, 2846, 2851, 2870, 2872, 2884, 2886, 2894, 2897, 2904, 2909, 2916, 2921, 2929, 2932, 2934, 2940, 2943, 2947, 2950, 2952, 2953, 2957, 2960, 2972, 2981, 2991, 2992, 2999, 3005, 3012];
/** The forearm guards, elbow to wrist cuff (the fist stays dark). */
const GUARDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 22, 24, 25, 27, 28, 30, 31, 32, 33, 34, 38, 40, 43, 44, 46, 47, 48, 50, 51, 53, 54, 56, 61, 62, 64, 67, 68, 71, 72, 75, 76, 82, 85, 86, 89, 90, 94, 97, 98, 102, 105, 108, 110, 112, 135, 136, 142, 156, 157, 167, 170, 176, 193, 195, 197, 199, 209, 213, 221, 237, 247, 249, 253, 254, 271, 272, 279, 287, 290, 291, 302, 315, 341, 347, 363, 382, 388, 390, 395, 400, 404, 416, 422, 430, 434, 2611, 2612, 2629, 2641, 2655, 2666, 2669, 2677, 2689, 2697, 2704, 2713, 2727, 2760, 2779, 2784, 2786, 2787, 2802, 2803, 2816, 2818, 2829, 2830, 2832, 2835, 2837, 2840, 2841, 2842, 2844, 2847, 2849, 2856, 2861, 2879, 2882, 2901, 2914, 2923, 2926, 2931, 2938, 2941, 2945, 2951, 2954, 2963, 2965, 2967, 2968, 2969, 2974, 2975, 2977, 2978, 2984, 2990, 2996, 2997, 2998, 3000, 3001, 3002, 3003, 3004, 3006, 3007, 3008, 3010, 3011, 3013, 3016, 3017, 3018, 3021, 3022, 3024, 3026, 3027, 3028, 3029, 3031, 3032, 3033, 3034, 3035, 3036, 3037, 3038, 3039, 3040, 3041, 3042, 3043, 3044, 3045, 3046, 3047];
/**
 * The chest piece: the front plate, over both shoulders under the pads, down the back to the
 * backpack, and the band round his sides below the armpits. The crevice between helmet and
 * chest piece and the right shoulder under its pad stay dark.
 */
const CHEST = [490, 500, 511, 521, 522, 533, 538, 542, 548, 553, 560, 562, 566, 568, 571, 575, 577, 578, 579, 583, 584, 587, 590, 593, 595, 596, 598, 599, 602, 607, 609, 611, 612, 615, 616, 618, 623, 627, 628, 637, 638, 639, 640, 641, 643, 644, 655, 658, 661, 671, 672, 675, 677, 681, 684, 687, 688, 692, 695, 698, 703, 704, 712, 713, 714, 715, 726, 727, 730, 732, 734, 738, 740, 742, 747, 748, 749, 759, 762, 763, 769, 771, 772, 773, 774, 779, 781, 782, 789, 790, 792, 796, 798, 799, 806, 810, 811, 812, 823, 830, 838, 850, 857, 861, 871, 882, 886, 893, 916, 926, 943, 962, 987, 1016, 1052, 1059, 1060, 1062, 1063, 1093, 1118, 1141, 1154, 1189, 1228, 1312, 1330, 1375, 1393, 1428, 1456, 1464, 1488, 1491, 1551, 1561, 1604, 1623, 1634, 1647, 1683, 1802, 1821, 1836, 1852, 1859, 1875, 1884, 1895, 1900, 1902, 1909, 1921, 1936, 1937, 1960, 1962, 1993, 2012, 2030, 2059, 2071, 2080, 2109, 2147, 2159, 2165, 2176, 2177, 2197, 2199, 2201, 2216, 2223, 2233, 2240, 2241, 2243, 2250, 2252, 2254, 2256, 2259, 2265, 2267, 2270, 2272, 2277, 2281, 2282, 2286, 2288, 2289, 2291, 2295, 2306, 2310, 2311, 2313, 2316, 2319, 2321, 2322, 2323, 2325, 2327, 2328, 2335, 2339, 2340, 2341, 2343, 2345, 2347, 2348, 2351, 2352, 2353, 2362, 2364, 2365, 2373, 2374, 2379, 2381, 2383, 2390, 2391, 2393, 2397, 2399, 2410, 2412, 2413, 2416, 2421, 2427, 2431, 2435, 2436, 2442, 2443, 2444, 2449, 2452, 2453, 2454, 2457, 2458, 2462, 2469, 2474, 2479, 2481, 2482, 2484, 2487, 2490];

const bytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

interface Mats { steel: THREE.MeshStandardMaterial; visor: THREE.MeshStandardMaterial; orange: THREE.MeshStandardMaterial }
let MATS: Mats | undefined;
/** Made on first use (see the colour-management gotcha in CLAUDE.md). */
function mats(): Mats {
  return MATS ??= {
    steel: new THREE.MeshStandardMaterial({ color: "#2c3142", flatShading: true, roughness: 0.6, metalness: 0.05 }),
    visor: new THREE.MeshStandardMaterial({ color: "#7ff5e6", emissive: "#4fdcca", emissiveIntensity: 0.8, roughness: 0.4, flatShading: true }),
    orange: colonyOrange(),
  };
}

// ------------------------------------------------------------------ the blaster

let blasterGeo: { geo: THREE.BufferGeometry; box: THREE.Box3 } | undefined;
/**
 * The blaster's shape, read straight from its glb (one mesh, no material), so it is there at
 * once: the hotbar icon needs it before anything async could finish. Muzzle at -x, top +y.
 */
function blasterGeometry(): { geo: THREE.BufferGeometry; box: THREE.Box3 } {
  if (blasterGeo) return blasterGeo;
  const b = bytes(BLASTER), view = new DataView(b.buffer);
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + jsonLen))) as {
    nodes: { mesh?: number; rotation?: number[] }[];
    meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[];
    accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
  };
  const bin = 20 + jsonLen + 8;
  const read = (i: number) => {
    const a = json.accessors[i]!, bv = json.bufferViews[a.bufferView]!;
    const n = a.count * (a.type === "VEC3" ? 3 : 1), at = b.byteOffset + bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    return new C(b.buffer.slice(at, at + n * C.BYTES_PER_ELEMENT));
  };
  const node = json.nodes.find(n => n.mesh !== undefined)!, prim = json.meshes[node.mesh!]!.primitives[0]!;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(read(prim.attributes.POSITION), 3));
  geo.setIndex(new THREE.BufferAttribute(read(prim.indices), 1));
  if (node.rotation) geo.applyQuaternion(new THREE.Quaternion().fromArray(node.rotation));
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  flat.computeBoundingBox();
  return blasterGeo = { geo: flat, box: flat.boundingBox! };
}

/** The blaster on its own (its hotbar icon): muzzle along +z, top +y, grip at the origin, length 1. */
export function createBlaster(): THREE.Group {
  const { geo, box } = blasterGeometry();
  const m = new THREE.Mesh(geo, mats().steel);
  const s = 1 / (box.max.x - box.min.x);
  m.scale.setScalar(s);
  m.position.copy(GRIP).multiplyScalar(-s);
  const g = new THREE.Group();
  g.add(m);
  g.rotation.y = Math.PI / 2;
  const out = new THREE.Group();
  out.add(g);
  return out;
}

// ------------------------------------------------------------------ the Sentinel

/** What the avatar is doing this frame. */
export interface AvatarMotion {
  /** Ground speed, cells per second. */
  speed: number;
  grounded: boolean;
  /** Blaster raised (mining or building). */
  aiming: boolean;
  /** How far the upper body turns from the legs toward the aim (radians, about the vertical). */
  twist: number;
}

interface Loaded {
  mixer: THREE.AnimationMixer;
  actions: Record<Clip, THREE.AnimationAction>;
  bone: (part: string) => THREE.Bone;
  /** Bones this code poses on top of the clips, with their clip pose. */
  touched: Map<THREE.Bone, THREE.Quaternion>;
  restFore: THREE.Quaternion;
  restHand: THREE.Quaternion;
  /** The aiming arm, relative to the avatar: the rest arm turned to point ahead. */
  aimArm: THREE.Quaternion;
}

export class Sentinel {
  /** Place this in the world: position and heading. Faces +z. */
  readonly object = new THREE.Group();
  /** The blaster's muzzle: where the mining beam starts. */
  readonly muzzle = new THREE.Object3D();
  private rig: Loaded | null = null;
  private weights: Record<Clip, number> = { stand: 1, walk: 0, run: 0, sprint: 0 };
  private clock = 0;
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();

  constructor() {
    // The muzzle sits in his hand until the model is in.
    this.muzzle.position.set(0, AVATAR_HEIGHT * 0.5, 0.3);
    this.object.add(this.muzzle);
    new GLTFLoader().parse(bytes(GLB).buffer, "", gltf => this.build(gltf), e => console.error("avatar", e));
  }

  private build(gltf: GLTF): void {
    const model = gltf.scene;
    let mesh: THREE.SkinnedMesh | undefined;
    model.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
    if (!mesh) return;
    const skin = mesh;
    skin.castShadow = true;
    skin.frustumCulled = false;
    const bones = skin.skeleton.bones;
    const bone = (part: string) => bones.find(b => b.name.toLowerCase().endsWith(part.toLowerCase()))!;
    model.updateMatrixWorld(true);
    model.scale.setScalar(AVATAR_HEIGHT / new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y);
    this.object.add(model);
    fixMesh(skin, bones.indexOf(bone("Spine2")));

    // The blaster, fixed to the right hand as set up in the bind pose (arms hanging): the grip
    // at the middle of the hand, the barrel along the forearm, the top on the thumb side.
    model.updateMatrixWorld(true);
    const { geo, box } = blasterGeometry();
    const gunMesh = new THREE.Mesh(geo, mats().steel);
    gunMesh.castShadow = true;
    const gun = new THREE.Group();
    gun.add(gunMesh);
    this.object.remove(this.muzzle);
    this.muzzle.position.set(box.min.x, MUZZLE_Y, 0);
    gunMesh.add(this.muzzle);
    const hi = bones.indexOf(bone("RightHand")), fi = bones.indexOf(bone("RightForeArm"));
    const bindAt = (i: number) => new THREE.Vector3().setFromMatrixPosition(skin.skeleton.boneInverses[i]!.clone().invert());
    const handAt = bindAt(hi), elbowAt = bindAt(fi);
    const along = handAt.clone().sub(elbowAt).normalize();
    const top = new THREE.Vector3(0, 0, 1).addScaledVector(along, -along.z).normalize();
    const x = along.clone().negate(), z = new THREE.Vector3().crossVectors(x, top);
    const scale = GUN_LENGTH / skin.getWorldScale(new THREE.Vector3()).x / (box.max.x - box.min.x);
    const inBind = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, top, z)), new THREE.Vector3(scale, scale, scale));
    inBind.setPosition(palmOf(skin, bones).sub(GRIP.clone().applyMatrix4(inBind)));
    skin.skeleton.boneInverses[hi]!.clone().multiply(inBind).decompose(gun.position, gun.quaternion, gun.scale);
    bone("RightHand").add(gun);

    const mixer = new THREE.AnimationMixer(model);
    const actions = Object.fromEntries(CLIPS.map(c => {
      const a = mixer.clipAction(gltf.animations.find(an => an.name === CLIP_NAME[c])!);
      a.play();
      a.setEffectiveWeight(c === "stand" ? 1 : 0);
      return [c, a];
    })) as Record<Clip, THREE.AnimationAction>;

    this.object.updateMatrixWorld(true);
    const rootInv = this.object.getWorldQuaternion(new THREE.Quaternion()).invert();
    const arm = bone("RightArm"), fore = bone("RightForeArm");
    const restDir = fore.getWorldPosition(new THREE.Vector3()).sub(arm.getWorldPosition(new THREE.Vector3())).normalize().applyQuaternion(rootInv);
    const aimArm = new THREE.Quaternion().setFromUnitVectors(restDir, new THREE.Vector3(0, -0.25, 1).normalize())
      .multiply(rootInv.clone().multiply(arm.getWorldQuaternion(new THREE.Quaternion())));
    const touched = new Map(["Spine", "Spine2", "LeftUpLeg", "RightUpLeg", "RightArm", "RightForeArm", "RightHand"].map(n => [bone(n), bone(n).quaternion.clone()] as const));
    this.rig = { mixer, actions, bone, touched, restFore: fore.quaternion.clone(), restHand: bone("RightHand").quaternion.clone(), aimArm };
  }

  update(dt: number, m: AvatarMotion): void {
    const r = this.rig;
    if (!r) return;
    this.clock += dt;
    // The clips blend by ground speed, each played at the rate that keeps the feet planted.
    const s = Math.max(0, m.speed);
    let lo = 0;
    while (lo < CLIPS.length - 2 && s > CLIP_SPEED[CLIPS[lo + 1]!]) lo++;
    const a = CLIPS[lo]!, b = CLIPS[lo + 1]!;
    const t = Math.min(1, (s - CLIP_SPEED[a]) / (CLIP_SPEED[b] - CLIP_SPEED[a]));
    for (const c of CLIPS) {
      const want = c === a ? 1 - t : c === b ? t : 0;
      this.weights[c] += (want - this.weights[c]) * Math.min(1, dt * 8);
      const act = r.actions[c];
      act.setEffectiveWeight(this.weights[c]);
      act.setEffectiveTimeScale(c === "stand" ? 1 : Math.max(0.2, (s / (CYCLE[c] / act.getClip().duration)) * STRIDE) * (m.grounded ? 1 : 0.3));
    }
    // The mixer skips bones whose pose hasn't changed (a still clip), so bones posed below get
    // their clip pose back first; otherwise the touches would pile up frame on frame.
    for (const [bn, pose] of r.touched) bn.quaternion.copy(pose);
    r.mixer.update(dt);
    for (const [bn, pose] of r.touched) pose.copy(bn.quaternion);

    // Standing: a slow breath through the chest (the file has no idle yet).
    if (this.weights.stand > 0.5) r.bone("Spine2").rotateX(Math.sin(this.clock * 1.1) * 0.03 * this.weights.stand);
    // In the air: knees up.
    if (!m.grounded) for (const leg of ["LeftUpLeg", "RightUpLeg"]) r.bone(leg).rotateX(-0.6);
    this.object.updateMatrixWorld(true);
    // The upper body turns toward the aim, about the vertical.
    const yaw = this.q2.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, m.twist);
    if (m.twist) turnWorld(r.bone("Spine"), yaw, this.q);
    // The wrist never bends on its own: the hand stays in line with the forearm.
    r.bone("RightHand").quaternion.copy(r.restHand);
    // Aiming: the whole arm in one fixed pose, pointing ahead and a little down.
    if (m.aiming) {
      const arm = r.bone("RightArm");
      r.bone("RightForeArm").quaternion.copy(r.restFore);
      arm.parent!.updateMatrixWorld(true);
      const want = this.object.getWorldQuaternion(new THREE.Quaternion()).multiply(yaw).multiply(r.aimArm);
      arm.quaternion.copy(arm.parent!.getWorldQuaternion(this.q).invert().multiply(want));
    }
    this.object.updateMatrixWorld(true);
  }
}

/** Turn a bone by a rotation given in world space. */
function turnWorld(b: THREE.Object3D, worldTurn: THREE.Quaternion, tmp: THREE.Quaternion): void {
  const parentQ = b.parent!.getWorldQuaternion(tmp);
  const worldQ = parentQ.clone().multiply(b.quaternion);
  b.quaternion.copy(parentQ.invert().multiply(worldTurn.clone().multiply(worldQ)));
}

/** The middle of the right hand in bind space: vertices moved mostly by the hand or its fingers. */
function palmOf(skin: THREE.SkinnedMesh, bones: THREE.Bone[]): THREE.Vector3 {
  const pos = skin.geometry.attributes.position!, si = skin.geometry.attributes.skinIndex!, sw = skin.geometry.attributes.skinWeight!;
  const palm = new THREE.Vector3();
  let count = 0;
  for (let v = 0; v < pos.count; v++) {
    let best = 0, bi = -1;
    for (let q = 0; q < 4; q++) if (sw.getComponent(v, q) > best) { best = sw.getComponent(v, q); bi = si.getComponent(v, q); }
    if (bi >= 0 && bones[bi]!.name.toLowerCase().includes("righthand")) { palm.x += pos.getX(v); palm.y += pos.getY(v); palm.z += pos.getZ(v); count++; }
  }
  return palm.divideScalar(Math.max(1, count));
}

/** The fixes to the file's mesh: chest block flattened, colours by face, backpack rigid. */
function fixMesh(skin: THREE.SkinnedMesh, spine2: number): void {
  const g = skin.geometry, pos = g.attributes.position!;
  // The small block that stuck out of the middle of the chest plate, pressed back into it.
  for (let v = 0; v < pos.count; v++) {
    if (Math.abs(pos.getX(v)) <= 0.2 && pos.getY(v) >= 1.0 && pos.getY(v) <= 1.14 && pos.getZ(v) > 0.343) pos.setZ(v, 0.34);
  }
  pos.needsUpdate = true;
  // Faces sorted into groups: dark steel, cyan visor, orange armour.
  const index = g.index!, tris = index.count / 3, visor = new Set(VISOR), orange = new Set([...PADS, ...GUARDS, ...CHEST]);
  const parts = [...Array(tris).keys()].map(f => (visor.has(f) ? 1 : orange.has(f) ? 2 : 0));
  const order = [0, 1, 2].flatMap(p => [...Array(tris).keys()].filter(f => parts[f] === p));
  const out = new (index.array.constructor as Uint32ArrayConstructor)(index.count);
  order.forEach((f, i) => out.set(index.array.subarray(f * 3, f * 3 + 3), i * 3));
  g.setIndex(new THREE.BufferAttribute(out, 1));
  g.clearGroups();
  let start = 0;
  for (const p of [0, 1, 2]) { const n = parts.filter(x => x === p).length * 3; g.addGroup(start, n, p); start += n; }
  const m = mats();
  skin.material = [m.steel, m.visor, m.orange];
  // The backpack is skinned to the head and both shoulders in the file, so it stretched:
  // everything behind his back now moves with the upper spine alone.
  const si = g.attributes.skinIndex!, sw = g.attributes.skinWeight!;
  for (let v = 0; v < pos.count; v++) {
    if (pos.getZ(v) > -0.13 || pos.getY(v) < 0.8) continue;
    si.setXYZW(v, spine2, 0, 0, 0);
    sw.setXYZW(v, 1, 0, 0, 0);
  }
  si.needsUpdate = true;
  sw.needsUpdate = true;
}
