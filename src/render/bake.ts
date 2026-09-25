import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Merge every mesh in a group of scenery that never moves (and shares a material
 * and shadow settings) into one mesh: thousands of draw calls become a few dozen,
 * which is what keeps a zoomed-out view smooth. Replaces the group's children.
 */
export function bakeStatic(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  group.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [] });
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    // Only position and normal matter (no textures); dropping the rest lets every shape merge.
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    b.geos.push(g);
  });
  group.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
  group.clear();
  for (const b of buckets.values()) {
    const merged = new THREE.Mesh(mergeGeometries(b.geos), b.mat);
    merged.castShadow = b.cast; merged.receiveShadow = b.receive;
    group.add(merged);
    for (const g of b.geos) g.dispose();
  }
}

