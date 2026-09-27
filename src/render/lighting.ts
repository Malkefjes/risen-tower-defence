import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * How the world is lit and turned into pixels: colour management, tone mapping, the sky's
 * light (an environment map made from a gradient sky), the sun, and bloom on glowing parts.
 * "now" is the old pipeline (colour management off, no tone mapping, hemisphere light).
 */
export type LookName = "now" | "A" | "B" | "C";

export interface LightLook {
  label: string;
  /** Hex colours are read as sRGB and lit in linear space (the modern pipeline). */
  colorManaged: boolean;
  toneMapping: THREE.ToneMapping;
  exposure: number;
  background: string;
  /** Sky light from every direction: a gradient sky baked into an environment map. */
  sky: { zenith: string; horizon: string; ground: string; intensity: number } | null;
  hemi: { sky: string; ground: string; intensity: number } | null;
  sun: { color: string; intensity: number };
  /**
   * Bloom on what glows (visors, cracks, windows, missiles); null for none. With bloom the
   * lights are halved and the exposure doubled: the picture stays the same, but lit snow
   * stays under the threshold and only glowing parts (which no light dims) go over it.
   */
  bloom: { strength: number; radius: number; threshold: number } | null;
}

export const LOOKS: Record<LookName, LightLook> = {
  now: {
    label: "Now",
    colorManaged: false, toneMapping: THREE.NoToneMapping, exposure: 1,
    background: "#6c6b98",
    sky: null,
    hemi: { sky: "#b3acd9", ground: "#4a4769", intensity: 0.6 * Math.PI * 0.62 },
    sun: { color: "#ff9a62", intensity: 0.9 * Math.PI * 0.8 },
    bloom: null,
  },
  // A: clear evening. True colours (neutral tone mapping), light from the whole sky, no bloom.
  A: {
    label: "A Clear",
    colorManaged: true, toneMapping: THREE.NeutralToneMapping, exposure: 1.05,
    background: "#6c6b98",
    sky: { zenith: "#8a93d0", horizon: "#eadbe2", ground: "#f2f2f8", intensity: 1.0 },
    hemi: null,
    sun: { color: "#ffc09a", intensity: 2.2 },
    bloom: null,
  },
  // B: golden hour. Filmic (ACES), a stronger low warm sun, cool sky in the shadows, soft bloom.
  B: {
    label: "B Golden",
    colorManaged: true, toneMapping: THREE.ACESFilmicToneMapping, exposure: 1.0,
    background: "#6a6597",
    sky: { zenith: "#7280c8", horizon: "#f0d2c6", ground: "#ecebf5", intensity: 0.8 },
    hemi: null,
    sun: { color: "#ffa468", intensity: 3.0 },
    bloom: { strength: 0.35, radius: 0.5, threshold: 0.9 },
  },
  // C: dusk. The sun nearly gone, a deep blue sky light, and the colony's glows carry the scene.
  C: {
    label: "C Dusk",
    colorManaged: true, toneMapping: THREE.NeutralToneMapping, exposure: 1.0,
    background: "#3f4570",
    sky: { zenith: "#4a66b4", horizon: "#9fb0d4", ground: "#c4cfe4", intensity: 0.75 },
    hemi: null,
    sun: { color: "#ff9a58", intensity: 1.4 },
    bloom: { strength: 0.7, radius: 0.6, threshold: 0.9 },
  },
};

/** Light scale under bloom (see `LightLook.bloom`). */
const BLOOM_LIGHT = 0.5;

let current: LookName = "now";
THREE.ColorManagement.enabled = LOOKS[current].colorManaged;

/** Pick the look before anything builds materials (colour management changes how hex colours are read). */
export function setLook(name: LookName): void {
  current = name;
  THREE.ColorManagement.enabled = LOOKS[name].colorManaged;
}
export const activeLook = (): LightLook => LOOKS[current];
export const activeLookName = (): LookName => current;

/** A gradient sky (zenith, horizon, ground) baked into a prefiltered environment map. */
function skyEnvironment(renderer: THREE.WebGLRenderer, sky: NonNullable<LightLook["sky"]>): THREE.Texture {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { zenith: { value: new THREE.Color(sky.zenith) }, horizon: { value: new THREE.Color(sky.horizon) }, ground: { value: new THREE.Color(sky.ground) } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 c = y > 0.0 ? mix(horizon, zenith, pow(y, 0.6)) : mix(horizon, ground, pow(-y, 0.4));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0).texture;
  pmrem.dispose();
  mat.dispose();
  return tex;
}

/** Sets up the scene's light for the active look and renders frames through it. */
export class Lighting {
  readonly look = activeLook();
  readonly sun: THREE.DirectionalLight;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, camera: THREE.Camera) {
    const L = this.look;
    renderer.toneMapping = L.toneMapping;
    const k = L.bloom ? BLOOM_LIGHT : 1;
    renderer.toneMappingExposure = L.exposure / k;
    scene.background = new THREE.Color(L.background);
    if (L.sky) {
      scene.environment = skyEnvironment(renderer, L.sky);
      scene.environmentIntensity = L.sky.intensity * k;
    }
    if (L.hemi) scene.add(new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity));
    this.sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity * k);
    if (L.bloom) {
      const size = renderer.getSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(renderer, target);
      this.composer.addPass(new RenderPass(scene, camera));
      this.bloom = new UnrealBloomPass(size, L.bloom.strength, L.bloom.radius, L.bloom.threshold);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  resize(w: number, h: number): void {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(camera: THREE.Camera): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, camera);
  }
}
