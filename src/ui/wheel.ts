/**
 * Radial build wheel maths. Pure, no DOM, so it can be tested.
 *
 * The wheel is centred on the player's character. Items sit around it in equal
 * slices, the first at the top, going clockwise. Each slice is a cone that runs
 * out forever, so pointing past the wheel still picks the item in that direction;
 * pointing inside the centre picks nothing.
 */

/** Angle (radians) of item `i`'s centre, screen coordinates (y down), 0 = right. */
export function wheelAngle(i: number, count: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / count;
}

/**
 * Which item the cursor points at, or null inside the centre (`dead` pixels).
 * `dx`, `dy`: cursor minus wheel centre, in screen pixels (y down).
 */
export function wheelPick(dx: number, dy: number, count: number, dead: number): number | null {
  if (count <= 0 || Math.hypot(dx, dy) < dead) return null;
  const slice = (2 * Math.PI) / count;
  // Turn so the first item's slice starts at 0, then wrap into [0, 2π).
  const a = Math.atan2(dy, dx) + Math.PI / 2 + slice / 2;
  const t = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(count - 1, Math.floor(t / slice));
}
