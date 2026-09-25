import { describe, expect, it } from "vitest";
import { wheelAngle, wheelPick } from "../src/ui/wheel";

describe("build wheel", () => {
  it("picks nothing inside the centre", () => {
    expect(wheelPick(0, 0, 7, 50)).toBeNull();
    expect(wheelPick(30, -30, 7, 50)).toBeNull();
  });

  it("first item is at the top, then clockwise", () => {
    expect(wheelPick(0, -100, 7, 50)).toBe(0);
    const a1 = wheelAngle(1, 7);
    expect(wheelPick(Math.cos(a1) * 100, Math.sin(a1) * 100, 7, 50)).toBe(1);
    expect(wheelPick(-10, -100, 7, 50)).toBe(0);
    const a6 = wheelAngle(6, 7);
    expect(wheelPick(Math.cos(a6) * 100, Math.sin(a6) * 100, 7, 50)).toBe(6);
  });

  it("each slice is a cone: far outside the wheel still picks by direction", () => {
    for (let i = 0; i < 7; i++) {
      const a = wheelAngle(i, 7);
      expect(wheelPick(Math.cos(a) * 2000, Math.sin(a) * 2000, 7, 50)).toBe(i);
    }
  });

  it("splits slices halfway between neighbours", () => {
    const edge = (wheelAngle(0, 2) + wheelAngle(1, 2)) / 2; // two items: top and bottom, edge at the right
    expect(wheelPick(Math.cos(edge - 0.01) * 100, Math.sin(edge - 0.01) * 100, 2, 10)).toBe(0);
    expect(wheelPick(Math.cos(edge + 0.01) * 100, Math.sin(edge + 0.01) * 100, 2, 10)).toBe(1);
  });
});
