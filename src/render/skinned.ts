import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Helpers for Erik's rigged Meshy models (the Sentinel, the enemy golem): same rig, same clips. */

export const bytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** A glb held as base64, parsed (async: three's loader works that way). */
export function parseGlb(b64: string): Promise<GLTF> {
  return new Promise((ok, fail) => new GLTFLoader().parse(bytes(b64).buffer, "", ok, fail));
}

/**
 * Meshy's clips don't loop cleanly: rotations are keyed at 30 fps from 0.067 s, positions at
 * 24 fps from 0.042 s, so played as they are each loop held a pose for a moment (a brief freeze
 * every stride). Every track is resampled at 30 fps over one period (the rotation keys' span
 * plus a frame), its keys taken as repeating, so the last frame leads straight into the first.
 */
export function loopable(clip: THREE.AnimationClip): THREE.AnimationClip {
  const FPS = 30;
  const main = clip.tracks.reduce((best, t) => (t.times.length > best.times.length ? t : best)).times;
  const t0 = main[0]!, period = main[main.length - 1]! - t0 + 1 / FPS, frames = Math.round(period * FPS);
  const tracks = clip.tracks.map(track => {
    const n = track.times.length, size = track.getValueSize(), quat = track instanceof THREE.QuaternionKeyframeTrack;
    // Keys on the loop: times from t0, wrapped into [0, period), in order.
    const keys = [...Array(n).keys()].map(i => ({ t: ((track.times[i]! - t0) % period + period) % period, i })).sort((x, y) => x.t - y.t);
    const times = new Float32Array(frames + 1), values = new Float32Array((frames + 1) * size);
    const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
    for (let f = 0; f <= frames; f++) {
      const t = (f / FPS) % period;
      let k = keys.findIndex(key => key.t > t);
      if (k < 0) k = keys.length;
      const next = keys[k % keys.length]!, prev = keys[(k - 1 + keys.length) % keys.length]!;
      const span = ((next.t - prev.t) % period + period) % period || period;
      const u = (((t - prev.t) % period + period) % period) / span;
      times[f] = f / FPS;
      if (quat) {
        qa.fromArray(track.values, prev.i * 4).slerp(qb.fromArray(track.values, next.i * 4), u).toArray(values, f * 4);
      } else {
        for (let c = 0; c < size; c++) values[f * size + c] = track.values[prev.i * size + c]! * (1 - u) + track.values[next.i * size + c]! * u;
      }
    }
    // The last frame is the first again: a seamless loop.
    values.copyWithin(frames * size, 0, size);
    const Track = track.constructor as new (name: string, times: Float32Array, values: Float32Array) => THREE.KeyframeTrack;
    return new Track(track.name, times, values);
  });
  return new THREE.AnimationClip(clip.name, period, tracks);
}

