/**
 * The player's avatar: continuous movement on the grid world, with jumping.
 * Pure logic, no graphics. Positions are in cells (x east, y south), z is height.
 *
 * The world is described by `HeightAt`: the standing height of each cell
 * (0 for snow, the deck height for walls, Infinity for things that can't be
 * climbed, like rocks and the ship). A cell only blocks the avatar if its top
 * is higher than the avatar's feet plus a small step, so from the ground a
 * wall is an obstacle, but a jump high enough clears it and you land on its deck.
 */

export type HeightAt = (cx: number, cy: number) => number;

export interface AvatarTuning {
  /** Top running speed, cells per second. */
  speed: number;
  /** How fast speed changes on the ground, cells per second squared. */
  accel: number;
  /** Share of `accel` available in the air (0 = no steering, 1 = full). */
  airControl: number;
  /** How fast the avatar turns to face where it runs, radians per second. */
  turnSpeed: number;
  /** Peak height of a jump above take-off, cells. */
  jumpHeight: number;
  /** Seconds from take-off to the top of the jump. */
  jumpRise: number;
  /** Half the width of the avatar's square footprint, cells. */
  radius: number;
  /** Highest ledge the avatar walks up without jumping. */
  stepUp: number;
}

/** Tuned by Erik in the movement playground (2026-09-25). */
export const defaultAvatarTuning = (): AvatarTuning => ({
  speed: 5,
  accel: 40,
  airControl: 0.5,
  turnSpeed: 20,
  jumpHeight: 0.9,
  jumpRise: 0.35,
  radius: 0.18,
  stepUp: 0.12,
});

export interface AvatarInput {
  /** Desired direction in world space (cells); length up to 1. */
  x: number;
  y: number;
  /** Jump pressed this tick. */
  jump: boolean;
}

const EPS = 1e-4;

export class Avatar {
  x: number; y: number; z = 0;
  vx = 0; vy = 0; vz = 0;
  /** Heading in radians; 0 faces +y (south), increasing toward +x (east). */
  facing = 0;
  grounded = true;
  /** True on the tick the avatar touched down. */
  landed = false;
  /** True on the tick the avatar left the ground by jumping. */
  jumped = false;
  /** State at the start of the last tick, so the renderer can draw in between ticks. */
  prevX: number; prevY: number; prevZ = 0; prevFacing = 0;

  constructor(x: number, y: number) { this.x = x; this.y = y; this.prevX = x; this.prevY = y; }

  /** Put the avatar somewhere, standing still. */
  place(x: number, y: number, z = 0): void {
    this.x = this.prevX = x; this.y = this.prevY = y; this.z = this.prevZ = z;
    this.vx = this.vy = this.vz = 0;
    this.grounded = true;
  }

  get speed(): number { return Math.hypot(this.vx, this.vy); }

  step(dt: number, input: AvatarInput, heightAt: HeightAt, t: AvatarTuning): void {
    this.landed = false;
    this.jumped = false;
    this.prevX = this.x; this.prevY = this.y; this.prevZ = this.z; this.prevFacing = this.facing;

    // Horizontal velocity eases toward the desired velocity.
    let ix = input.x, iy = input.y;
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }
    const wantX = ix * t.speed, wantY = iy * t.speed;
    const rate = t.accel * (this.grounded ? 1 : t.airControl) * dt;
    const dx = wantX - this.vx, dy = wantY - this.vy, dl = Math.hypot(dx, dy);
    if (dl <= rate) { this.vx = wantX; this.vy = wantY; }
    else { this.vx += (dx / dl) * rate; this.vy += (dy / dl) * rate; }

    // Jump and gravity.
    const g = (2 * t.jumpHeight) / (t.jumpRise * t.jumpRise);
    if (input.jump && this.grounded) {
      this.vz = (2 * t.jumpHeight) / t.jumpRise;
      this.grounded = false;
      this.jumped = true;
    }
    if (!this.grounded) { this.vz -= g * dt; this.z += this.vz * dt; }

    // Move each axis separately, pushing out of anything too tall to stand on.
    this.moveAxis("x", this.vx * dt, heightAt, t);
    this.moveAxis("y", this.vy * dt, heightAt, t);

    // Ground: the highest cell under the footprint that isn't above the feet.
    const support = this.supportHeight(heightAt, t);
    if (this.grounded) {
      if (support < this.z - t.stepUp) this.grounded = false; // walked off a ledge
      else this.z = support;
    }
    if (!this.grounded && this.vz <= 0 && this.z <= support) {
      this.z = support; this.vz = 0; this.grounded = true; this.landed = true;
    }

    // Face the direction of travel.
    if (this.speed > 0.2) {
      const want = Math.atan2(this.vx, this.vy);
      let d = want - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const turn = t.turnSpeed * dt;
      this.facing += Math.abs(d) <= turn ? d : Math.sign(d) * turn;
    }
  }

  /** Is the cell too tall to be inside of, at the current height? */
  private solid(cx: number, cy: number, heightAt: HeightAt, t: AvatarTuning): boolean {
    return heightAt(cx, cy) > this.z + t.stepUp;
  }

  private moveAxis(axis: "x" | "y", d: number, heightAt: HeightAt, t: AvatarTuning): void {
    if (d === 0) return;
    const r = t.radius;
    if (axis === "x") this.x += d; else this.y += d;
    const x0 = Math.floor(this.x - r), x1 = Math.floor(this.x + r - EPS);
    const y0 = Math.floor(this.y - r), y1 = Math.floor(this.y + r - EPS);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (!this.solid(cx, cy, heightAt, t)) continue;
      if (axis === "x") {
        this.x = d > 0 ? cx - r - EPS : cx + 1 + r + EPS;
        this.vx = 0;
      } else {
        this.y = d > 0 ? cy - r - EPS : cy + 1 + r + EPS;
        this.vy = 0;
      }
      return;
    }
  }

  private supportHeight(heightAt: HeightAt, t: AvatarTuning): number {
    const r = t.radius;
    let best = 0;
    for (let cy = Math.floor(this.y - r); cy <= Math.floor(this.y + r - EPS); cy++) {
      for (let cx = Math.floor(this.x - r); cx <= Math.floor(this.x + r - EPS); cx++) {
        const h = heightAt(cx, cy);
        if (h <= this.z + t.stepUp && h > best) best = h;
      }
    }
    return best;
  }
}
