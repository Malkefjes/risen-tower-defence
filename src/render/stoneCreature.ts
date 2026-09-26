import * as THREE from "three";

/**
 * Erik's stone creatures (the Brute's Colossus, the Swarm's wolves): each is one welded
 * low-poly mesh without colours. Here a mesh is cut into parts that can move (each
 * triangle to the part `assign` picks for it) and coloured as the stone you mine,
 * with a red outline to mark it as an enemy. One material per creature, colours in
 * the vertices.
 */

export type V3 = [number, number, number];

/** The grey of the stone you mine (render/ore.ts): two shades on the sides, a lighter top, a dark underside. */
const STONE = { side: ["#4a4f5c", "#555a67"], top: "#5b606d", under: "#383c47" } as const;

/** The one mesh in a glTF binary, with its node's transform applied (enough for Erik's single-mesh models). */
export function readGlb(base64: string): THREE.BufferGeometry {
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

/** Distance from a point to a line segment (for picking the nearest bone). */
export function segDist(p: THREE.Vector3, a: V3, b: V3): number {
  const A = new THREE.Vector3(...a), ab = new THREE.Vector3(...b).sub(A);
  const t = THREE.MathUtils.clamp(p.clone().sub(A).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(A.addScaledVector(ab, t));
}

/**
 * Cut a mesh into parts and colour it as stone. `assign` picks a part for each
 * triangle from its centre (in the model's own units); each part comes back built
 * around its pivot and scaled by `scale`.
 */
export function cutStone<P extends string>(glb: string, pivots: Record<P, V3>, assign: (c: THREE.Vector3) => P, scale: number): Record<P, THREE.BufferGeometry> {
  const src = readGlb(glb).toNonIndexed(), p = src.attributes.position!;
  const sides = STONE.side.map(h => new THREE.Color(h)), top = new THREE.Color(STONE.top), under = new THREE.Color(STONE.under);
  const names = Object.keys(pivots) as P[], out = {} as Record<P, { pos: number[]; col: number[] }>;
  for (const k of names) out[k] = { pos: [], col: [] };
  const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], n = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    for (let k = 0; k < 3; k++) tri[k]!.fromBufferAttribute(p, t + k);
    c.copy(tri[0]!).add(tri[1]!).add(tri[2]!).divideScalar(3);
    n.copy(tri[1]!).sub(tri[0]!).cross(tri[2]!.clone().sub(tri[0]!)).normalize();
    const part = assign(c);
    // The two side shades half and half, and every face its own small shift in shade, like the grain of rough stone.
    const f = t / 3, base = n.y > 0.38 ? top : n.y < -0.35 ? under : sides[((f * 2654435761) % 1000) / 1000 < 0.5 ? 1 : 0]!;
    const col = base.clone().multiplyScalar(0.9 + ((f * 7919) % 97) / 97 * 0.2);
    const piv = pivots[part], o = out[part];
    for (const v of tri) { o.pos.push((v.x - piv[0]) * scale, (v.y - piv[1]) * scale, (v.z - piv[2]) * scale); o.col.push(col.r, col.g, col.b); }
  }
  const parts = {} as Record<P, THREE.BufferGeometry>;
  for (const k of names) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(out[k].pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(out[k].col, 3));
    g.computeVertexNormals();
    parts[k] = g;
  }
  return parts;
}

/** Enemy marks, read every frame so they can be switched live. */
export interface Marks { outline: boolean; ring: boolean }

/**
 * The outline shell for a part: the part pushed out a fixed distance along its
 * smoothed normals (so it hugs thin tails and ears as closely as broad backs; scaling
 * the part up instead shifts pieces far from its pivot off the body).
 */
function hullOf(g: THREE.BufferGeometry, width: number): THREE.BufferGeometry {
  let h = g.userData.hull as THREE.BufferGeometry | undefined;
  if (h) return h;
  const p = g.attributes.position!, n = new Map<string, THREE.Vector3>(), key = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map(v => Math.round(v * 1e4)).join();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const f = b.clone().sub(a).cross(c.clone().sub(a));
    for (let k = 0; k < 3; k++) { const kk = key(i + k); n.set(kk, (n.get(kk) ?? new THREE.Vector3()).add(f)); }
  }
  h = g.clone();
  const q = h.attributes.position!;
  for (let i = 0; i < q.count; i++) {
    const d = n.get(key(i))!.clone().normalize().multiplyScalar(width);
    q.setXYZ(i, q.getX(i) + d.x, q.getY(i) + d.y, q.getZ(i) + d.z);
  }
  g.userData.hull = h;
  return h;
}

let outlineMat: THREE.MeshBasicMaterial | undefined, ringMat: THREE.MeshBasicMaterial | undefined, ringGeo: THREE.RingGeometry | undefined;

/**
 * A creature built from cut parts: one matte stone material of its own (so a hit
 * flashes only the one that was hit), a red outline on every part, a red ground ring.
 * `place(name)` gives where each part's pivot sits on the creature.
 */
export function assemble<P extends string>(geo: Record<P, THREE.BufferGeometry>, place: (k: P) => V3, ringRadius: number) {
  // Matte stone: fully rough, no metal, so faces never catch a shine.
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0, emissive: "#ffffff", emissiveIntensity: 0 });
  const root = new THREE.Group(), tilt = new THREE.Group();
  root.add(tilt);
  // The outline is the part again, a little bigger, drawn from the inside in red: an inverted hull.
  outlineMat ??= new THREE.MeshBasicMaterial({ color: "#d11f2a", side: THREE.BackSide });
  const outlines: THREE.Mesh[] = [], parts = {} as Record<P, THREE.Mesh>;
  for (const k of Object.keys(geo) as P[]) {
    const m = new THREE.Mesh(geo[k], mat);
    m.position.set(...place(k));
    m.castShadow = true;
    const hull = new THREE.Mesh(hullOf(geo[k], 0.008), outlineMat);
    m.add(hull);
    outlines.push(hull);
    tilt.add(m);
    parts[k] = m;
  }
  ringMat ??= new THREE.MeshBasicMaterial({ color: "#d11f2a", transparent: true, opacity: 0.75, depthWrite: false });
  ringGeo ??= new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.scale.setScalar(ringRadius);
  ring.position.y = 0.02;
  root.add(ring);
  return {
    root, tilt, mat, parts,
    showMarks(m: Marks | undefined) {
      for (const h of outlines) h.visible = !!m?.outline;
      ring.visible = !!m?.ring;
    },
  };
}
