import * as THREE from "three";
import { EVENING } from "./models";
import { createOreNode, type NodeKind } from "./ore";

/**
 * Item icons rendered from the game's own models, lit exactly like the world
 * (the same evening sky, the same low sun, real shadows on the snow), so an icon
 * matches what you see. Rendered once, off screen, into PNG data URLs.
 */

let cache: Record<NodeKind, string> | undefined;
/** How much brighter than the world the icons are lit: mostly the sun, so the facets contrast. */
const ICON_BOOST = { sky: 1.05, sun: 1.9 };

/** Ore icons: the last stage of a node (its core), seen from the game's camera angle. */
export function oreIcons(size = 96): Record<NodeKind, string> {
  if (cache) return cache;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  // The world's lights, as set up in the view and the playgrounds, turned up so
  // the icons pop against the dark hotbar.
  scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62 * ICON_BOOST.sky));
  const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8 * ICON_BOOST.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 40 });
  scene.add(sun, sun.target);
  // Snow that only shows the shadow, so the icon background stays clear.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ color: "#16142a", opacity: 0.8 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const out = {} as Record<NodeKind, string>;
  for (const kind of ["stone", "metal"] as const) {
    const node = createOreNode(3, kind === "stone" ? 7 : 11, kind);
    node.setAmount(0.2); // only the core is left
    scene.add(node.object);
    // Frame what's still there (Box3.setFromObject counts hidden layers too).
    node.object.updateMatrixWorld(true);
    const box = new THREE.Box3();
    node.object.traverseVisible(c => { if ((c as THREE.Mesh).isMesh) box.expandByObject(c); });
    const centre = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2 * 0.5;
    Object.assign(camera, { left: -r, right: r, top: r, bottom: -r });
    camera.updateProjectionMatrix();
    camera.position.copy(centre).add(new THREE.Vector3(20, 16.33, 20));
    camera.lookAt(centre);
    sun.target.position.copy(centre);
    sun.position.copy(centre).add(new THREE.Vector3(...EVENING.sunOffset));
    renderer.render(scene, camera);
    out[kind] = fadeEdges(renderer.domElement, size);
    scene.remove(node.object);
    node.object.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose(); });
  }
  ground.geometry.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return (cache = out);
}

/** The low sun throws a long shadow; fade it out toward the icon's edge instead of cutting it off. */
function fadeEdges(src: HTMLCanvasElement, size: number): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  const m = g.createRadialGradient(size / 2, size / 2, size * 0.36, size / 2, size / 2, size * 0.5);
  m.addColorStop(0, "#000");
  m.addColorStop(1, "rgba(0,0,0,0)");
  g.globalCompositeOperation = "destination-in";
  g.fillStyle = m;
  g.fillRect(0, 0, size, size);
  return c.toDataURL("image/png");
}
