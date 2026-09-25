import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EVENING } from "./models";
import { createOreNode, type NodeKind } from "./ore";

/**
 * Item icons rendered from the game's own models, so an icon always matches what
 * you see in the world. Rendered once, off screen, into PNG data URLs.
 */

let cache: Record<NodeKind, string> | undefined;

/** Ore icons: the last stage of a node (its core), seen from the game's camera angle. */
export function oreIcons(size = 96): Record<NodeKind, string> {
  if (cache) return cache;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // The world's evening light, with the sun brought round to the front so the facets read.
  scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * 1.3));
  const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity);
  sun.position.set(-2, 8, 7);
  scene.add(sun);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  // Metal has nothing to reflect in the evening scene, so at icon size it reads as flat grey.
  // A soft room to reflect gives it the bright, cool sheen of silver.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
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
    const r = box.getSize(new THREE.Vector3()).length() / 2 * 0.42;
    Object.assign(camera, { left: -r, right: r, top: r, bottom: -r });
    camera.updateProjectionMatrix();
    camera.position.copy(centre).add(new THREE.Vector3(20, 16.33, 20));
    camera.lookAt(centre);
    scene.environment = kind === "metal" ? room : null;
    scene.environmentIntensity = 0.45;
    renderer.render(scene, camera);
    out[kind] = renderer.domElement.toDataURL("image/png");
    scene.remove(node.object);
    node.object.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).geometry.dispose(); });
  }
  room.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return (cache = out);
}
