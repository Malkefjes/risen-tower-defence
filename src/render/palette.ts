import * as THREE from "three";

/** The colony orange Erik picked (walls, towers, ship, rig). */
export const COLONY_ORANGE = "#d9573a";

/**
 * The one orange material look: the base colour with a soft warm glow, as on the
 * walls. Every orange part uses this so all oranges in the base match.
 */
export function colonyOrange(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: COLONY_ORANGE, roughness: 0.85, metalness: 0, flatShading: true,
    emissive: "#ff8a4a", emissiveIntensity: 0.17,
  });
}
