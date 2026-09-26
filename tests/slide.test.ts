import { describe, expect, it } from "vitest";
import { Avatar, defaultAvatarTuning, type AvatarInput } from "../src/sim/avatar";

const DT = 1 / 60;
const T = defaultAvatarTuning();
const snow = () => 0;
const step = (a: Avatar, input: Partial<AvatarInput>) => a.step(DT, { x: 1, y: 0, jump: false, ...input }, snow, T);
const hold = (a: Avatar, input: Partial<AvatarInput>, seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) step(a, input); };
const sprinting = () => { const a = new Avatar(0.5, 0.5); hold(a, { sprint: true }, 1); return a; };

describe("sliding", () => {
  it("only starts from a sprint", () => {
    const a = new Avatar(0.5, 0.5);
    hold(a, {}, 1);
    step(a, { slide: true });
    expect(a.sliding).toBe(false);
    const b = sprinting();
    step(b, { sprint: true, slide: true });
    expect(b.sliding).toBe(true);
  });

  it("bursts ahead, then eases back to the sprint's top speed and ends", () => {
    const a = sprinting();
    const sprint = a.speed;
    step(a, { sprint: true, slide: true });
    expect(a.speed).toBeGreaterThan(sprint * 1.2);
    hold(a, { sprint: true }, T.slideTime + 0.05);
    expect(a.sliding).toBe(false);
    expect(a.speed).toBeCloseTo(sprint, 1);
  });

  it("can't steer while sliding", () => {
    const a = sprinting();
    step(a, { sprint: true, slide: true });
    hold(a, { x: 0, y: 1, sprint: true }, T.slideTime * 0.5);
    expect(Math.abs(a.vy)).toBeLessThan(1e-6);
  });

  it("a jump out of a slide carries extra speed through the air", () => {
    const plain = sprinting();
    step(plain, { sprint: true, jump: true });
    hold(plain, { sprint: true }, 0.3);
    const slid = sprinting();
    step(slid, { sprint: true, slide: true });
    hold(slid, { sprint: true }, 0.1);
    step(slid, { sprint: true, jump: true });
    expect(slid.sliding).toBe(false);
    hold(slid, { sprint: true }, 0.3);
    expect(slid.grounded).toBe(false);
    expect(slid.speed).toBeGreaterThan(plain.speed * 1.3);
  });

  it("waits a moment before the next slide", () => {
    const a = sprinting();
    step(a, { sprint: true, slide: true });
    hold(a, { sprint: true }, T.slideTime + 0.02);
    step(a, { sprint: true, slide: true });
    expect(a.sliding).toBe(false);
    hold(a, { sprint: true }, T.slideCooldown);
    step(a, { sprint: true, slide: true });
    expect(a.sliding).toBe(true);
  });
});
