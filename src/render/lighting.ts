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
  /** Falling snowflakes' colour: under the bloom threshold, so they never glow. */
  flakes: string;
  /** Bloom on what glows (visors, cracks, windows, missiles): only what is brighter than `threshold`; null for none. */
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
    flakes: "#ffffff",
    bloom: null,
  },
  // Three dusks on the old pipeline (Erik: the old look beats the modern one), each later than Now.
  // A: late evening. Now with the sun lower and rosier and a lilac sky light. No bloom.
  A: {
    label: "A Late",
    colorManaged: false, toneMapping: THREE.NoToneMapping, exposure: 1,
    background: "#62588f",
    sky: null,
    hemi: { sky: "#bba6e2", ground: "#4a3f6a", intensity: 0.6 * Math.PI * 0.62 },
    sun: { color: "#ff7858", intensity: 0.78 * Math.PI * 0.8 },
    flakes: "#eef0fa",
    bloom: null,
  },
  // B: violet dusk. Darker than A, and what glows (visors, cracks, windows, shots) softly blooms.
  B: {
    label: "B Violet",
    colorManaged: false, toneMapping: THREE.NoToneMapping, exposure: 1,
    background: "#545488",
    sky: null,
    hemi: { sky: "#9488dc", ground: "#34305a", intensity: 0.52 * Math.PI * 0.62 },
    sun: { color: "#ff6a50", intensity: 0.5 * Math.PI * 0.8 },
    flakes: "#dfe2f2",
    bloom: { strength: 0.45, radius: 0.45, threshold: 0.93 },
  },
  // C: blue dusk. The sun a faint rose rim, a deep blue sky light, the colony's glows strongest.
  C: {
    label: "C Blue",
    colorManaged: false, toneMapping: THREE.NoToneMapping, exposure: 1,
    background: "#3a4a82",
    sky: null,
    hemi: { sky: "#7a98ec", ground: "#28345c", intensity: 0.55 * Math.PI * 0.62 },
    sun: { color: "#ffa878", intensity: 0.32 * Math.PI * 0.8 },
    flakes: "#cfdaf2",
    bloom: { strength: 0.7, radius: 0.55, threshold: 0.9 },
  },
};

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
    renderer.toneMappingExposure = L.exposure;
    scene.background = new THREE.Color(L.background);
    if (L.sky) {
      scene.environment = skyEnvironment(renderer, L.sky);
      scene.environmentIntensity = L.sky.intensity;
    }
    if (L.hemi) scene.add(new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity));
    this.sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity);
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
