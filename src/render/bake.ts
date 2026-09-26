import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Where one tagged object ended up in the merged meshes: a run of vertices in each. */
export type BakedPart = { mesh: THREE.Mesh; start: number; count: number }[];

/**
 * Merge every mesh in a group of scenery that never moves (and shares a material
 * and shadow settings) into one mesh: thousands of draw calls become a few dozen,
 * which is what keeps a zoomed-out view smooth. Replaces the group's children.
 * Objects tagged with `userData.bakeKey` are remembered in `parts`, so they can be
 * hidden later (a tree that's cut down) without baking again.
 */
export function bakeStatic(group: THREE.Group, parts?: Map<string, BakedPart>): void {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[]; keys: (string | undefined)[] }>();
  const keyOf = (o: THREE.Object3D | null): string | undefined => {
    for (; o && o !== group; o = o.parent) if (o.userData.bakeKey) return o.userData.bakeKey as string;
    return undefined;
  };
  group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [], keys: [] });
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    // Only position and normal matter (no textures); dropping the rest lets every shape merge.
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    b.geos.push(g);
    b.keys.push(keyOf(m));
  });
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
  group.clear();
  for (const b of buckets.values()) {
    const merged = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    merged.castShadow = b.cast; merged.receiveShadow = b.receive;
    group.add(merged);
    if (parts) {
      let start = 0;
      b.geos.forEach((g, i) => {
        const count = g.attributes.position!.count, k = b.keys[i];
        if (k) { let p = parts.get(k); if (!p) parts.set(k, p = []); p.push({ mesh: merged, start, count }); }
        start += count;
      });
    }
    for (const g of b.geos) g.dispose();
  }
}

