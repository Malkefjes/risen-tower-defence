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
  const pmrem = new THREE.PMREMGenerator(renderer);
  const shine = pmrem.fromScene(stripRoom(), 0.02).texture;
  const out = {} as Record<NodeKind, string>;
  for (const kind of ["stone", "metal"] as const) {
    const node = createOreNode(3, kind === "stone" ? 7 : 11, kind);
    node.setAmount(0.2); // only the core is left
    // Shine is contrast: polished metal mirrors a few bright strips in a dark room,
    // so some facets flash bright and the rest stay dark.
    if (kind === "metal") node.object.traverse(c => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.material = Object.assign((m.material as THREE.MeshStandardMaterial).clone(), { metalness: 1, roughness: 0.15, emissiveIntensity: 0.1 });
    });
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
    scene.environment = kind === "metal" ? shine : null;
    renderer.render(scene, camera);
    out[kind] = fadeEdges(renderer.domElement, size);
    scene.remove(node.object);
    node.object.traverse(c => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      if (kind === "metal") (m.material as THREE.Material).dispose();
    });
  }
  ground.geometry.dispose();
  shine.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return (cache = out);
}

/** What polished metal mirrors in an icon: a dark, cool room with a few bright light strips. */
function stripRoom(): THREE.Scene {
  const room = new THREE.Scene();
  room.background = new THREE.Color("#4a5063");
  const strip = (w: number, h: number, x: number, y: number, z: number, color: string) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  // The camera looks from +x +z, so facets facing it mirror what's on that side.
  strip(5, 1.4, 4, 4.5, 4, "#dfe6f2");    // high, behind the camera
  strip(1.2, 4, 5.5, 1, 1, "#e8f0ff");    // right of the camera
  strip(1.2, 4, 1, 1, 5.5, "#e8f0ff");    // left of the camera
  strip(6, 1.5, 0, 6, 0, "#f4f7ff");      // overhead
  strip(1, 3, 4, 2, -2, "#ffffff");       // small glints off to the sides
  strip(1, 3, -2, 2, 4, "#ffffff");
  return room;
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
