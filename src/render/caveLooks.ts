import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng, roughBox } from "./terrain";

/**
 * Enemy spawners: cave exits where the aliens climb up out of the ground. Three
 * looks for Erik to pick from (mockups/caves). Each is centred on its cell, with
 * its mouth facing +z (toward the camera side), about 3 cells across.
 *   A: a rock arch, a cave mouth pushed up out of the snow, dark inside with a violet glow.
 *   B: a sinkhole, the ground collapsed into a dark pit ringed by heaved-up slabs.
 *   C: a burrow, a mound of torn earth and violet crystal around a sloping tunnel.
 */
export type CaveLook = "A" | "B" | "C";

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true, ...o });
let M: ReturnType<typeof palette> | undefined;
// Created on first use, after colour management is switched off.
const palette = () => ({
  rock: std("#5d6379"),
  rockDark: std("#4b5064"),
  rockLight: std("#707690"),
  earth: std("#4a3a5e"),
  earthDark: std("#34283f"),
  snow: std("#f1f4fa", { roughness: 1 }),
  void: new THREE.MeshBasicMaterial({ color: "#150d22" }),
  crystal: std("#8e5cff", { emissive: "#6a3ad8", emissiveIntensity: 0.6, roughness: 0.3 }),
  crystalPale: std("#c2a6ff", { emissive: "#8e5cff", emissiveIntensity: 0.5, roughness: 0.3 }),
});

/** A soft violet glow sprite, for light spilling out of the cave. */
function glowSprite(size: number, opacity: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(180,140,255,1)"); rg.addColorStop(0.35, "rgba(142,92,255,.45)"); rg.addColorStop(1, "rgba(142,92,255,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

/** A faceted lump. */
function lump(r: number, rand: () => number, jitter = 0.25): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(r, 0);
  const p = g.attributes.position!, moved = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = moved.get(k);
    if (!o) moved.set(k, o = [(rand() - 0.5) * r * jitter, (rand() - 0.5) * r * jitter, (rand() - 0.5) * r * jitter]);
    p.setXYZ(i, p.getX(i) + o[0]!, p.getY(i) + o[1]!, p.getZ(i) + o[2]!);
  }
  g.computeVertexNormals();
  return g;
}

/** A crystal spike leaning out from (x, z). */
function spike(h: number, r: number): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(1, h / (2 * r), 1);
  g.translate(0, h / 2, 0);
  return g;
}

export interface Cave { object: THREE.Group; update(t: number): void }

export function caveLook(look: CaveLook, seed = 1): Cave {
  M ??= palette();
  const m = M, rand = rng(seed);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (mat: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
    g.rotateX(rx); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z);
    const n = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(n.attributes)) if (a !== "position" && a !== "normal") n.deleteAttribute(a);
    let l = parts.get(mat); if (!l) parts.set(mat, l = []); l.push(n);
  };
  const rockMat = () => { const r = rand(); return r < 0.4 ? m.rock : r < 0.75 ? m.rockDark : m.rockLight; };
  const root = new THREE.Group();
  const glows: THREE.Sprite[] = [];

  if (look === "A") {
    // Rock arch: two slab pillars and a lintel of stacked slabs, pushed up out of the snow,
    // a dark mouth facing forward with a glow inside, snow settled on top.
    for (const side of [-1, 1]) {
      let y = 0;
      for (let i = 0; i < 4; i++) {
        const t = 0.28 + rand() * 0.1, w = 0.75 - i * 0.05 + rand() * 0.1;
        put(i % 2 ? m.rock : m.rockDark, roughBox(w, t, 1.3, rand, 0.1), side * (0.72 + (rand() - 0.5) * 0.1), y + t / 2, -0.1, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.12, side * (0.05 + rand() * 0.08));
        y += t * 0.94;
      }
    }
    let y = 1.1;
    for (let i = 0; i < 2; i++) {
      const t = 0.3 + rand() * 0.08;
      put(i ? m.rockLight : m.rock, roughBox(2.3 - i * 0.3, t, 1.45 - i * 0.15, rand, 0.12), (rand() - 0.5) * 0.1, y + t / 2, -0.1, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.08);
      y += t * 0.92;
    }
    put(m.snow, roughBox(1.9, 0.08, 1.2, rand, 0.03), 0, y + 0.02, -0.12, (rand() - 0.5) * 0.1);
    // The mound it rises from, and the dark mouth.
    const mound = lump(1.5, rand, 0.2); mound.scale(1.15, 0.28, 0.9);
    put(m.snow, mound, 0, 0.05, -0.8);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.62, 7), m.void);
    mouth.scale.set(1, 1.35, 1); mouth.position.set(0, 0.6, 0.45);
    root.add(mouth);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 8).rotateX(-Math.PI / 2), m.void);
    floor.scale.set(1, 1, 0.8); floor.position.set(0, 0.012, 0.2);
    root.add(floor);
    for (let i = 0; i < 5; i++) put(rand() < 0.5 ? m.crystal : m.crystalPale, spike(0.3 + rand() * 0.35, 0.07), (rand() - 0.5) * 2.2, 0, 0.55 + rand() * 0.45, rand() * 3, (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.6);
    for (let i = 0; i < 4; i++) put(rockMat(), lump(0.12 + rand() * 0.1, rand), (rand() - 0.5) * 2.4, 0.06, 0.6 + rand() * 0.6);
    const g = glowSprite(1.6, 0.7); g.position.set(0, 0.55, 0.5); glows.push(g);
  } else if (look === "B") {
    // Sinkhole: the ground has fallen into a dark pit; broken slabs lean outward around
    // the rim, the far side higher so the pit reads from the camera.
    const pit = new THREE.Mesh(new THREE.CircleGeometry(0.95, 9).rotateX(-Math.PI / 2), m.void);
    pit.position.y = 0.015;
    root.add(pit);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.2, far = -Math.sin(a) * 0.5 + 0.5; // 1 at the back (-z)
      const w = 0.55 + rand() * 0.25, h = 0.35 + far * 0.55 + rand() * 0.2, t = 0.22 + rand() * 0.08;
      const r = 1.05 + rand() * 0.1;
      // Tangent slabs, tipped outward like the ground heaved up as it gave way
      // (turned so their thin side faces the pit; a tilt about their long axis tips them out).
      put(rockMat(), roughBox(w, h, t, rand, 0.1), Math.cos(a) * r, h * 0.35, Math.sin(a) * r, Math.PI / 2 - a, 0.45);
      if (h > 0.6) put(m.snow, roughBox(w * 0.8, 0.06, t * 0.9, rand, 0.02), Math.cos(a) * (r + 0.2), h * 0.66, Math.sin(a) * (r + 0.2), Math.PI / 2 - a, 0.45);
    }
    const rim = lump(1.7, rand, 0.15); rim.scale(1.05, 0.12, 1.05);
    put(m.earth, rim, 0, 0.0, 0);
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2, r = 0.7 + rand() * 0.3;
      put(rand() < 0.5 ? m.crystal : m.crystalPale, spike(0.35 + rand() * 0.45, 0.08), Math.cos(a) * r, 0, Math.sin(a) * r, rand() * 3, Math.sin(a) * 0.5, -Math.cos(a) * 0.5);
    }
    const g = glowSprite(2.2, 0.8); g.position.set(0, 0.25, 0); glows.push(g);
  } else {
    // Burrow: a mound of torn, violet-stained earth with a tunnel sloping down into it,
    // clods thrown out around the mouth and crystal breaking through the top.
    const mound = lump(1.45, rand, 0.22); mound.scale(1.1, 0.5, 1.0);
    put(m.earth, mound, 0, 0.1, -0.35);
    const cap = lump(1.1, rand, 0.2); cap.scale(1.05, 0.25, 0.9);
    put(m.snow, cap, 0.05, 0.62, -0.55);
    // The tunnel: a dark sloped opening cut into the front of the mound, lipped with earth.
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.55, 8), m.void);
    mouth.rotation.x = -0.55; mouth.scale.set(1.25, 1, 1); mouth.position.set(0, 0.3, 0.55);
    root.add(mouth);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.05 + (i / 6) * 0.9);
      put(i % 2 ? m.earthDark : m.earth, lump(0.2 + rand() * 0.08, rand), Math.cos(a) * 0.72, 0.1 + Math.sin(a) * 0.55, 0.62 - Math.sin(a) * 0.15);
    }
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, r = 1.3 + rand() * 0.7;
      if (Math.sin(a) > 0.4 && Math.abs(Math.cos(a)) < 0.4) continue; // keep the way out clear
      put(rand() < 0.5 ? m.earth : m.earthDark, lump(0.09 + rand() * 0.1, rand), Math.cos(a) * r, 0.05, Math.sin(a) * r);
    }
    for (let i = 0; i < 6; i++) put(rand() < 0.5 ? m.crystal : m.crystalPale, spike(0.4 + rand() * 0.5, 0.09), (rand() - 0.5) * 1.6, 0.35, -0.5 - rand() * 0.6, rand() * 3, (rand() - 0.5) * 0.7, (rand() - 0.5) * 0.7);
    const g = glowSprite(1.5, 0.75); g.position.set(0, 0.35, 0.6); glows.push(g);
  }

  for (const [mat, list] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(list), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    for (const l of list) l.dispose();
  }
  const light = new THREE.PointLight("#9a6cff", 3, 4, 2);
  light.position.set(0, 0.5, look === "B" ? 0 : 0.6);
  root.add(light, ...glows);
  return {
    object: root,
    update(t: number) {
      const pulse = 0.8 + 0.2 * Math.sin(t * 2.2);
      light.intensity = 3 * pulse;
      for (const g of glows) g.material.opacity = 0.7 * pulse;
    },
  };
}
