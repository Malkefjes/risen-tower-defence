import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EVENING } from "../../src/render/models";
import { createRig } from "../../src/render/rig";
import { BLASTER } from "./blasterData";
import { GLB } from "./sentinelData";

// Erik's new avatar, the Neon Star Sentinel (a skinned model with walk and run clips),
// running in place on the snow in the game's evening light.
// Stand, walk, run and sprint play his clips; jump and aiming the gun are added in
// code on top of them; both in one dark steel for now.

THREE.ColorManagement.enabled = false;

// ------------------------------------------------------------------ scene

const CAM_DIR = new THREE.Vector3(20, 16.33, 20).normalize();
const container = document.getElementById("view")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(EVENING.background);
scene.add(new THREE.HemisphereLight(EVENING.sky, EVENING.ground, EVENING.hemi * Math.PI * 0.62));
const sun = new THREE.DirectionalLight(EVENING.sun, EVENING.sunIntensity * Math.PI * 0.8);
sun.position.set(...EVENING.sunOffset);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 60 });
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: EVENING.snow, roughness: 1, emissive: "#d8cfe6", emissiveIntensity: 0.45 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0xb9bfd6, 0xb9bfd6);
grid.position.set(0.5, 0.004, 0.5);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.55;
scene.add(grid);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
let zoom = 1;
const lookAt = new THREE.Vector3(0, 0.5, 0);
function resize(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  renderer.setSize(w, h);
  const half = Math.max(3, 3.4 / aspect) / (zoom * 2.2);
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
  camera.position.copy(CAM_DIR).multiplyScalar(40).add(lookAt);
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ------------------------------------------------------------------ scale

// Only measured, for the size: the Sentinel is shown alone.
const rig = createRig();
const rigHeight = new THREE.Box3().setFromObject(rig.object).getSize(new THREE.Vector3()).y;

// ------------------------------------------------------------------ the Sentinel

const bytes = Uint8Array.from(atob(GLB), c => c.charCodeAt(0)).buffer;
const gltf = await new Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF>((ok, fail) => new GLTFLoader().parse(bytes, "", ok, fail));
const sentinel = new THREE.Group(), model = gltf.scene;
sentinel.add(model);
scene.add(sentinel);
let skinned: THREE.SkinnedMesh | undefined;
model.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
const mesh = skinned!;
mesh.castShadow = true;
mesh.frustumCulled = false;
const bones = mesh.skeleton.bones, bone = (part: string) => bones.find(b => b.name.toLowerCase().endsWith(part.toLowerCase()))!;
// Sized to today's rig.
model.updateMatrixWorld(true);
const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
const k = rigHeight / size.y;
model.scale.setScalar(k);

/** One colour for the Sentinel and his gun, the dark steel of his hands and feet; the colour scheme comes later. */
const GREY = new THREE.MeshStandardMaterial({ color: "#2c3142", flatShading: true, roughness: 0.6, metalness: 0.05 });
mesh.material = GREY;

// The gun, Erik's Starforge Blaster, held in the right fist: fixed to the hand bone, so it
// follows the wrist. Set up once in the bind pose (arms out, palms down): the grip at the
// middle of the hand, the barrel along the arm, the top toward his front (the thumb side).
// The model's muzzle is its -x end, its top +y.
const GUN_LENGTH = 0.3 * rigHeight, GRIP = new THREE.Vector3(0.58, -0.07, 0);
// The wrist: carried, the barrel points ahead and a little down; aimed, along the arm.
const gunTune = { along: 0, up: 0, side: 0, roll: 0, carry: -1.35, aimed: 0 };
const gun = new THREE.Group();
let placeGun = (_pitch: number) => {};
{
  const g = await new Promise<import("three/examples/jsm/loaders/GLTFLoader.js").GLTF>((ok, fail) =>
    new GLTFLoader().parse(Uint8Array.from(atob(BLASTER), c => c.charCodeAt(0)).buffer, "", ok, fail));
  g.scene.updateMatrixWorld(true);
  const src = g.scene.getObjectByProperty("isMesh", true) as THREE.Mesh;
  const geo = (src.geometry.index ? src.geometry.toNonIndexed() : src.geometry.clone()).applyMatrix4(src.matrixWorld);
  geo.deleteAttribute("normal");
  geo.computeVertexNormals();
  const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
  const m = new THREE.Mesh(geo, GREY.clone());
  m.castShadow = true;
  gun.add(m);
  (window as unknown as { gunMesh: THREE.Mesh }).gunMesh = m;

  // All in the mesh's bind space (where the vertices are): +y up, +z his front.
  model.updateMatrixWorld(true);
  const meshScale = mesh.getWorldScale(new THREE.Vector3()).x;
  const hi = bones.indexOf(bone("RightHand")), fi = bones.indexOf(bone("RightForeArm"));
  const bindOf = (i: number) => mesh.skeleton.boneInverses[i]!.clone().invert();
  const handAt = new THREE.Vector3().setFromMatrixPosition(bindOf(hi)), elbowAt = new THREE.Vector3().setFromMatrixPosition(bindOf(fi));
  // The middle of the hand: vertices moved mostly by the hand or its fingers.
  const pos = mesh.geometry.attributes.position!, si = mesh.geometry.attributes.skinIndex!, sw = mesh.geometry.attributes.skinWeight!;
  const palm = new THREE.Vector3(); let count = 0;
  for (let v = 0; v < pos.count; v++) {
    let best = 0, bi = -1;
    for (let q = 0; q < 4; q++) if (sw.getComponent(v, q) > best) { best = sw.getComponent(v, q); bi = si.getComponent(v, q); }
    if (bi >= 0 && bones[bi]!.name.toLowerCase().includes("righthand")) { palm.x += pos.getX(v); palm.y += pos.getY(v); palm.z += pos.getZ(v); count++; }
  }
  if (count) palm.divideScalar(count); else palm.copy(handAt);
  placeGun = (pitch: number) => {
    const along = handAt.clone().sub(elbowAt).normalize();
    const top = new THREE.Vector3(0, 0, 1).addScaledVector(along, -along.z).normalize();
    const x = along.clone().negate(), z = new THREE.Vector3().crossVectors(x, top);
    const rot = new THREE.Matrix4().makeBasis(x, top, z)
      .multiply(new THREE.Matrix4().makeRotationX(gunTune.roll)).multiply(new THREE.Matrix4().makeRotationZ(pitch));
    const scale = GUN_LENGTH / meshScale / (box.max.x - box.min.x);
    const at = palm.clone().addScaledVector(along, gunTune.along * rigHeight / meshScale)
      .addScaledVector(top, gunTune.up * rigHeight / meshScale).addScaledVector(z, gunTune.side * rigHeight / meshScale);
    const inBind = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromRotationMatrix(rot), new THREE.Vector3(scale, scale, scale));
    const grip = GRIP.clone().applyMatrix4(inBind);
    inBind.setPosition(at.clone().sub(grip));
    // Hand space = the bone's inverse bind times bind space.
    const local = mesh.skeleton.boneInverses[hi]!.clone().multiply(inBind);
    local.decompose(gun.position, gun.quaternion, gun.scale);
  };
  placeGun(gunTune.carry);
  bone("RightHand").add(gun);
}
(window as unknown as { gunTune: typeof gunTune }).gunTune = gunTune;
(window as unknown as { gripAt: () => number[] }).gripAt = () => gun.localToWorld(GRIP.clone()).toArray();

// Clips.
const mixer = new THREE.AnimationMixer(model);
const clip = (n: string) => mixer.clipAction(gltf.animations.find(a => a.name === n)!);
const actions = { stand: clip("restpose"), walk: clip("Walking"), run: clip("Running"), sprint: clip("Run_03") };
for (const a of Object.values(actions)) { a.play(); a.setEffectiveWeight(0); }
/** Distance one cycle of each clip covers at this size (cells), so the feet match the ground. */
const CYCLE = { stand: 1, walk: 1.5 * 0.55, run: 2.8 * 0.55, sprint: 3.4 * 0.55 };

// ------------------------------------------------------------------ controls

type Mode = "stand" | "walk" | "run" | "sprint";
const SPEEDS: Record<Mode, number> = { stand: 0, walk: 1.8, run: 5, sprint: 7 };
let mode: Mode = "run", toolUp = false, stride = 0.5;
const bar = document.getElementById("bar")!;
const button = (label: string, on: () => boolean, click: () => void) => {
  const b = document.createElement("button");
  b.textContent = label;
  const sync = () => b.setAttribute("aria-pressed", String(on()));
  b.onclick = () => { click(); for (const s of syncs) s(); };
  syncs.push(sync);
  sync();
  bar.appendChild(b);
};
const syncs: (() => void)[] = [];
for (const m of ["stand", "walk", "run", "sprint"] as Mode[]) button(m[0]!.toUpperCase() + m.slice(1), () => mode === m, () => { mode = m; });
button("Jump", () => false, () => { if (grounded) { vz = 4.2; grounded = false; } });
button("Aim", () => toolUp, () => { toolUp = !toolUp; });
const sl = document.createElement("label");
sl.innerHTML = `Stride <input type="range" min="0.25" max="1.5" step="0.05" value="0.5"> <span>0.50</span>`;
sl.querySelector("input")!.addEventListener("input", e => {
  stride = Number((e.target as HTMLInputElement).value);
  sl.querySelector("span")!.textContent = stride.toFixed(2);
});
bar.appendChild(sl);

// ------------------------------------------------------------------ animation

let last = performance.now(), speed = SPEEDS.run, y = 0, vz = 0, grounded = true;
// He runs in place, turned by dragging with the left button; the grid slides under his feet.
let heading = Math.PI / 4 + 0.7, dragX: number | null = null;
const slide = new THREE.Vector2();
renderer.domElement.addEventListener("pointerdown", e => { if (e.button === 0) { dragX = e.clientX; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener("pointermove", e => { if (dragX !== null) { heading += (e.clientX - dragX) * 0.012; dragX = e.clientX; } });
renderer.domElement.addEventListener("pointerup", () => { dragX = null; });
// Test hooks (headless checks): face a heading, zoom on a point.
(window as unknown as { mockCam: (h: number, z: number, at: number[]) => void }).mockCam = (h, z, at) => { heading = h; zoom = z; lookAt.fromArray(at); resize(); };
const weights = { stand: 0, walk: 0, run: 1, sprint: 0 };
const q = new THREE.Quaternion(), v = new THREE.Vector3(), fwd = new THREE.Vector3();
const restFore = bone("RightForeArm").quaternion.clone();

const touched = new Map(["Spine2", "LeftUpLeg", "RightUpLeg", "RightArm", "RightForeArm"].map(n => [bone(n), bone(n).quaternion.clone()] as const));

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  speed += (SPEEDS[mode] - speed) * Math.min(1, dt * 6);
  // A jump: the same arc for both.
  if (!grounded) { vz -= 14 * dt; y += vz * dt; if (y <= 0) { y = 0; vz = 0; grounded = true; } }

  sentinel.position.set(0, y, 0);
  sentinel.rotation.y = heading;
  slide.x = (slide.x - Math.sin(heading) * speed * dt) % 1;
  slide.y = (slide.y - Math.cos(heading) * speed * dt) % 1;
  grid.position.set(0.5 + slide.x, 0.004, 0.5 + slide.y);

  // The Sentinel: blend its clips by mode, each at the speed that keeps the feet planted.
  for (const m of Object.keys(weights) as Mode[]) {
    weights[m] += ((m === mode ? 1 : 0) - weights[m]) * Math.min(1, dt * 8);
    const a = actions[m];
    a.setEffectiveWeight(weights[m]);
    a.setEffectiveTimeScale(m === "stand" ? 1 : Math.max(0.2, (speed / (CYCLE[m] / a.getClip().duration)) * stride) * (grounded ? 1 : 0.3));
  }
  // The mixer skips bones whose pose hasn't changed (a still clip), so the bones touched
  // below get their clip pose back first; otherwise the touches pile up frame on frame.
  for (const [b, pose] of touched) b.quaternion.copy(pose);
  mixer.update(dt);
  for (const [b, pose] of touched) pose.copy(b.quaternion);
  // Standing: a slow breath through the chest (the file has no idle yet).
  if (weights.stand > 0.5) bone("Spine2").rotateX(Math.sin(now / 900) * 0.03 * weights.stand);
  // In the air: knees up.
  if (!grounded) for (const s of ["LeftUpLeg", "RightUpLeg"]) bone(s).rotateX(-0.6);
  // Aiming: the right arm points ahead and a little down, the forearm straight.
  placeGun(toolUp ? gunTune.aimed : gunTune.carry);
  if (toolUp) {
    sentinel.updateMatrixWorld(true);
    const arm = bone("RightArm"), fore = bone("RightForeArm");
    fore.quaternion.copy(restFore);
    arm.updateMatrixWorld(true);
    const from = fore.getWorldPosition(new THREE.Vector3()).sub(arm.getWorldPosition(v)).normalize();
    fwd.set(0, 0, 1).applyQuaternion(sentinel.quaternion).add(new THREE.Vector3(0, -0.25, 0)).normalize();
    const delta = q.setFromUnitVectors(from, fwd);
    const parentQ = arm.parent!.getWorldQuaternion(new THREE.Quaternion()), worldQ = arm.getWorldQuaternion(new THREE.Quaternion());
    arm.quaternion.copy(parentQ.invert().multiply(delta.multiply(worldQ)));
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener("wheel", e => { zoom = Math.min(3, Math.max(0.6, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); resize(); });
