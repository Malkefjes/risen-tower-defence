import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EVENING } from "../../src/render/models";
import { colonyOrange } from "../../src/render/palette";
import { createRig } from "../../src/render/rig";
import { GLB } from "./sentinelData";

// Erik's new avatar, the Neon Star Sentinel (a skinned model with walk and run clips),
// running circles on the snow in the game's evening light.
// Stand, walk, run and sprint play his clips; jump and the raised tool are added in
// code on top of them; the colours are the rig's palette, put on by rule.

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
(grid.material as THREE.Material).opacity = 0.3;
scene.add(grid);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
let zoom = 1, close = false;
const look = new THREE.Vector3(0, 0.4, 0);
function resize(): void {
  const w = container.clientWidth, h = container.clientHeight, aspect = w / h;
  renderer.setSize(w, h);
  const half = Math.max(3, 3.4 / aspect) / (close ? zoom * 2.2 : zoom);
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
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

/** The rig's palette on the model, face by face: which bone moves a face decides what it is. */
function colourByRule(): { coloured: THREE.Material[]; plain: THREE.Material } {
  const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone());
  geo.computeVertexNormals();
  const pos = geo.attributes.position!, nor = geo.attributes.normal!, si = geo.attributes.skinIndex!, sw = geo.attributes.skinWeight!;
  // Where each bone sits in the bind pose, in the mesh's own space.
  const bindPos = mesh.skeleton.boneInverses.map(inv => new THREE.Vector3().setFromMatrixPosition(inv.clone().invert()));
  const name = (i: number) => bones[i]!.name.toLowerCase();
  const white = new THREE.Color("#eef1f6"), steel = new THREE.Color("#3d4457"), dark = new THREE.Color("#2c3142"), orange = colonyOrange().color.clone();
  const n = pos.count / 3, colours = new Float32Array(pos.count * 3), visor: boolean[] = [];
  const near = (p: THREE.Vector3, part: string, d: number) => { const i = bones.indexOf(bone(part)); return i >= 0 && p.distanceTo(bindPos[i]!) < d; };
  const c = new THREE.Vector3(), nm = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    // The bone with the most weight over the face's three corners.
    const w = new Map<number, number>();
    c.set(0, 0, 0); nm.set(0, 0, 0);
    for (let v = f * 3; v < f * 3 + 3; v++) {
      for (let q = 0; q < 4; q++) { const j = si.getComponent(v, q), ww = sw.getComponent(v, q); if (ww > 0) w.set(j, (w.get(j) ?? 0) + ww); }
      c.x += pos.getX(v) / 3; c.y += pos.getY(v) / 3; c.z += pos.getZ(v) / 3;
      nm.x += nor.getX(v); nm.y += nor.getY(v); nm.z += nor.getZ(v);
    }
    nm.normalize();
    const top = [...w.entries()].sort((a, b) => b[1] - a[1])[0]![0], b = name(top);
    let col = white, isVisor = false;
    if (b.includes("head") || b.includes("neck")) {
      // The visor: the forward face of the helmet, at eye height.
      const head = bindPos[bones.indexOf(bone("Head"))]!;
      isVisor = nm.z > 0.45 && c.y > head.y + 0.02 && c.y < head.y + 0.16 && b.includes("head");
      col = b.includes("neck") ? dark : white;
    } else if (b.includes("hips")) col = c.y > bindPos[bones.indexOf(bone("Hips"))]!.y + 0.03 ? orange : steel;
    else if (b.endsWith("spine")) col = steel;
    else if (b.includes("spine")) col = white;
    else if (b.includes("hand")) col = dark;
    else if (b.includes("forearm")) col = near(c, "LeftForeArm", 0.06) || near(c, "RightForeArm", 0.06) ? orange : steel;
    else if (b.includes("shoulder") || b.endsWith("arm")) col = white;
    else if (b.includes("upleg")) col = steel;
    else if (b.endsWith("leg")) col = near(c, "LeftLeg", 0.07) || near(c, "RightLeg", 0.07) ? orange : white;
    else if (b.includes("foot") || b.includes("toe")) col = dark;
    visor.push(isVisor);
    for (let v = f * 3; v < f * 3 + 3; v++) colours.set([col.r, col.g, col.b], v * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  // Visor faces go in their own group, drawn with the glowing cyan.
  const order = [...Array(n).keys()].sort((a, b) => Number(visor[a]) - Number(visor[b]));
  const firstVisor = order.findIndex(f => visor[f]);
  const re = new THREE.BufferGeometry();
  for (const [key, attr] of Object.entries(geo.attributes)) {
    const a = attr as THREE.BufferAttribute, out = new (a.array.constructor as Float32ArrayConstructor)(a.array.length);
    order.forEach((f, i) => out.set(a.array.slice(f * 3 * a.itemSize, (f * 3 + 3) * a.itemSize), i * 3 * a.itemSize));
    re.setAttribute(key, new THREE.BufferAttribute(out, a.itemSize, a.normalized));
  }
  const split = firstVisor < 0 ? n : firstVisor;
  re.addGroup(0, split * 3, 0);
  re.addGroup(split * 3, (n - split) * 3, 1);
  mesh.geometry = re;
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.05 });
  const glow = new THREE.MeshStandardMaterial({ color: "#7ff5e6", emissive: "#4fdcca", emissiveIntensity: 0.8, roughness: 0.4, flatShading: true });
  const plainMat = new THREE.MeshStandardMaterial({ color: "#c9ccd6", flatShading: true, roughness: 0.7 });
  return { coloured: [body, glow], plain: plainMat };
}
const mats = colourByRule();
mesh.material = mats.coloured;

// The multitool, in the right hand: a dark block with a cyan tip.
const tool = new THREE.Group();
const toolBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.07), new THREE.MeshStandardMaterial({ color: "#2c3142", roughness: 0.6 }));
toolBody.position.y = 0.1;
const toolTip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.035), new THREE.MeshStandardMaterial({ color: "#7ff5e6", emissive: "#4fdcca", emissiveIntensity: 1 }));
toolTip.position.y = 0.215;
tool.add(toolBody, toolTip);
tool.traverse(o => { (o as THREE.Mesh).castShadow = true; });
tool.scale.setScalar(1 / k);
bone("RightHand").add(tool);

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
let mode: Mode = "run", toolUp = false, stride = 0.5, coloured = true;
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
button("Tool", () => toolUp, () => { toolUp = !toolUp; });
button("Close-up", () => close, () => { close = !close; resize(); });
button("Plain grey", () => !coloured, () => { coloured = !coloured; mesh.material = coloured ? mats.coloured : mats.plain; });
const sl = document.createElement("label");
sl.innerHTML = `Stride <input type="range" min="0.25" max="1.5" step="0.05" value="0.5"> <span>0.50</span>`;
sl.querySelector("input")!.addEventListener("input", e => {
  stride = Number((e.target as HTMLInputElement).value);
  sl.querySelector("span")!.textContent = stride.toFixed(2);
});
bar.appendChild(sl);

// ------------------------------------------------------------------ animation

let last = performance.now(), angle = 0, speed = SPEEDS.run, y = 0, vz = 0, grounded = true;
const R = 2.2, CENTRE = new THREE.Vector3();
const weights = { stand: 0, walk: 0, run: 1, sprint: 0 };
const q = new THREE.Quaternion(), v = new THREE.Vector3(), fwd = new THREE.Vector3();
const restFore = bone("RightForeArm").quaternion.clone();

const touched = new Map(["Spine2", "LeftUpLeg", "RightUpLeg", "RightArm", "RightForeArm"].map(n => [bone(n), bone(n).quaternion.clone()] as const));

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  speed += (SPEEDS[mode] - speed) * Math.min(1, dt * 6);
  angle += (speed / R) * dt;
  // A jump: the same arc for both.
  if (!grounded) { vz -= 14 * dt; y += vz * dt; if (y <= 0) { y = 0; vz = 0; grounded = true; } }

  const place = (o: THREE.Object3D) => {
    const c = CENTRE;
    o.position.set(c.x + Math.cos(angle) * R, y, c.z + Math.sin(angle) * R);
    o.rotation.y = Math.atan2(-Math.sin(angle), Math.cos(angle));
  };
  place(sentinel);

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
  // The tool: the right arm points ahead and a little down, the forearm straight.
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

  look.lerp(close ? sentinel.position.clone().setY(0.5) : new THREE.Vector3(0, 0.4, 0), Math.min(1, dt * 10));
  camera.position.copy(CAM_DIR).multiplyScalar(40).add(look);
  camera.lookAt(look);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener("wheel", e => { zoom = Math.min(3, Math.max(0.6, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); resize(); });
