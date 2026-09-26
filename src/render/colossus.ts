import * as THREE from "three";
import { GLB } from "./colossusData";
import type { Enemy } from "./leaper";

/**
 * The Colossus: Erik's 705-triangle rock golem. His mesh comes as one welded piece
 * without colours, so here it is cut into five parts that can move (body, two arms,
 * two legs, each triangle to the nearest bone of a rough skeleton) and coloured by
 * rule: rock on the sides, a second colour on faces that point up, dark underneath.
 * One material, colours in the vertices.
 */

type V3 = [number, number, number];
type Part = "body" | "armR" | "armL" | "legR" | "legL";

/** Colourings: sides (two close shades), faces pointing up, faces pointing down. */
export const COLOSSUS_PALETTES = {
  snow: { side: ["#5a5f70", "#555a6b"], top: "#f2f4fa", under: "#3a3d4a" },
  ice: { side: ["#3f4454", "#3b4050"], top: "#86cbe6", under: "#2a2d38" },
  earth: { side: ["#3d352f", "#413832"], top: "#a08c74", under: "#2a2420" },
} as const;
export type ColossusPalette = keyof typeof COLOSSUS_PALETTES;

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

/** The one mesh in a glTF binary, with its node's transform applied (enough for Erik's single-mesh models). */
function readGlb(base64: string): THREE.BufferGeometry {
  const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
  const view = new DataView(bytes.buffer), jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const accessor = (i: number) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], off = binStart + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const comps = a.type === "VEC3" ? 3 : 1;
    const Arr = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    return new Arr(bytes.buffer.slice(off, off + a.count * comps * Arr.BYTES_PER_ELEMENT));
  };
  const node = json.nodes.find((n: { mesh?: number }) => n.mesh !== undefined), prim = json.meshes[node.mesh].primitives[0];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(accessor(prim.attributes.POSITION), 3));
  if (prim.indices !== undefined) g.setIndex(new THREE.BufferAttribute(accessor(prim.indices), 1));
  // A node places its mesh either with a matrix or with translation, rotation and scale.
  const m = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
    new THREE.Vector3(...(node.translation ?? [0, 0, 0])), new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(node.scale ?? [1, 1, 1])));
  g.applyMatrix4(m);
  return g;
}

function segDist(p: THREE.Vector3, a: V3, b: V3): number {
  const A = new THREE.Vector3(...a), ab = new THREE.Vector3(...b).sub(A);
  const t = THREE.MathUtils.clamp(p.clone().sub(A).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(A.addScaledVector(ab, t));
}

/** Cut the mesh into parts around their pivots and colour it; each part's geometry is built around its pivot. */
function build(palette: ColossusPalette): Record<Part, THREE.BufferGeometry> {
  const src = readGlb(GLB).toNonIndexed(), p = src.attributes.position!, pal = COLOSSUS_PALETTES[palette];
  // The low evening sun barely lights faces that point up, so their colour is pushed past 1 to read as snow or ice.
  const sides = pal.side.map(h => new THREE.Color(h)), top = new THREE.Color(pal.top).multiplyScalar(1.6), under = new THREE.Color(pal.under);
  const out = {} as Record<Part, { pos: number[]; col: number[] }>;
  for (const k of Object.keys(PIVOTS) as Part[]) out[k] = { pos: [], col: [] };
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    for (let k = 0; k < 3; k++) tri[k]!.fromBufferAttribute(p, t + k);
    c.copy(tri[0]!).add(tri[1]!).add(tri[2]!).divideScalar(3);
    n.copy(tri[1]!).sub(tri[0]!).cross(tri[2]!.clone().sub(tri[0]!)).normalize();
    let best = BONES[0]!, bestD = Infinity;
    for (const bone of BONES) { const d = segDist(c, bone.a, bone.b) - bone.bonus; if (d < bestD) { bestD = d; best = bone; } }
    const col = n.y > 0.38 ? top : n.y < -0.35 ? under : sides[(t / 3) % 5 === 0 ? 1 : 0]!;
    const piv = PIVOTS[best.part], o = out[best.part];
    for (const v of tri) { o.pos.push((v.x - piv[0]) * SCALE, (v.y - piv[1]) * SCALE, (v.z - piv[2]) * SCALE); o.col.push(col.r, col.g, col.b); }
  }
  const parts = {} as Record<Part, THREE.BufferGeometry>;
  for (const k of Object.keys(PIVOTS) as Part[]) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(out[k].pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(out[k].col, 3));
    g.computeVertexNormals();
    parts[k] = g;
  }
  return parts;
}

const cache = new Map<ColossusPalette, Record<Part, THREE.BufferGeometry>>();

export interface ColossusOptions {
  palette: ColossusPalette;
  /** Size multiplier (1 = 0.8 cells tall). */
  scale: number;
  /** Strides per second of game time at the golem's walking speed. */
  strideRate: number;
  /**
   * Enemy marks, read every frame so they can be switched live: a red outline round
   * the body, and a red ring on the ground under it.
   */
  marks?: { outline: boolean; ring: boolean };
}

let outlineMat: THREE.MeshBasicMaterial | undefined, ringMat: THREE.MeshBasicMaterial | undefined, ringGeo: THREE.RingGeometry | undefined;

/** One golem. Its material is its own, so a hit flashes only the one that was hit. */
export function colossusModel(o: ColossusOptions): Enemy {
  let geo = cache.get(o.palette);
  if (!geo) cache.set(o.palette, geo = build(o.palette));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.05, emissive: "#ffffff", emissiveIntensity: 0 });
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt);
  root.scale.setScalar(o.scale);
  // The outline is the part again, a little bigger, drawn from the inside in red: an inverted hull.
  outlineMat ??= new THREE.MeshBasicMaterial({ color: "#d11f2a", side: THREE.BackSide });
  const outlines: THREE.Mesh[] = [];
  const mk = (k: Part) => {
    const m = new THREE.Mesh(geo![k], mat);
    const [x, y, z] = PIVOTS[k];
    m.position.set(x * SCALE, (y + LIFT) * SCALE, z * SCALE);
    m.castShadow = true;
    const hull = new THREE.Mesh(geo![k], outlineMat);
    hull.scale.setScalar(1.07);
    m.add(hull);
    outlines.push(hull);
    tilt.add(m);
    return m;
  };
  ringMat ??= new THREE.MeshBasicMaterial({ color: "#d11f2a", transparent: true, opacity: 0.75, depthWrite: false });
  ringGeo ??= new THREE.RingGeometry(0.34, 0.42, 24).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.02;
  root.add(ring);
  mk("body");
  const armR = mk("armR"), armL = mk("armL"), legR = mk("legR"), legL = mk("legL");
  let last = 0, phase = Math.random() * 6;
  return {
    object: root,
    update(t, walking) {
      const dt = Math.max(0, Math.min(0.1, t - last));
      last = t;
      // Heavy steps while walking; standing, the arms swing slowly as it pounds what it's attacking.
      phase += dt * Math.PI * 2 * o.strideRate * (walking ? 1 : 0.6);
      const marks = o.marks ?? { outline: false, ring: false };
      for (const h of outlines) h.visible = marks.outline;
      ring.visible = marks.ring;
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
