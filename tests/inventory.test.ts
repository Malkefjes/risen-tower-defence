import { describe, expect, it } from "vitest";
import { Hotbar, HOTBAR_SLOTS, STACK_MAX } from "../src/sim/inventory";

describe("hotbar", () => {
  it("starts with the multitool in the first slot, selected", () => {
    const h = new Hotbar();
    expect(h.slots).toHaveLength(HOTBAR_SLOTS);
    expect(h.slots[0]).toEqual({ kind: "multitool", count: 1 });
    expect(h.held).toBe("multitool");
    expect(h.slots.slice(1).every(s => s === null)).toBe(true);
  });

  it("ore stacks into the first free slot and tops up its own stack", () => {
    const h = new Hotbar();
    expect(h.add("stone", 300)).toBe(300);
    expect(h.add("metal", 50)).toBe(50);
    expect(h.add("stone", 200)).toBe(200);
    expect(h.slots[1]).toEqual({ kind: "stone", count: 500 });
    expect(h.slots[2]).toEqual({ kind: "metal", count: 50 });
  });

  it("starts a new stack when one is full", () => {
    const h = new Hotbar();
    h.add("stone", STACK_MAX.stone + 250);
    expect(h.slots[1]!.count).toBe(STACK_MAX.stone);
    expect(h.slots[2]).toEqual({ kind: "stone", count: 250 });
    expect(h.count("stone")).toBe(STACK_MAX.stone + 250);
  });

  it("only adds what fits when the hotbar is full", () => {
    const h = new Hotbar();
    const room = h.room("stone");
    expect(room).toBe((HOTBAR_SLOTS - 1) * STACK_MAX.stone);
    expect(h.add("stone", room + 40)).toBe(room);
    expect(h.room("stone")).toBe(0);
    expect(h.room("metal")).toBe(0);
    expect(h.add("metal", 10)).toBe(0);
  });

  it("removing empties stacks from the right and frees their slots", () => {
    const h = new Hotbar();
    h.add("stone", STACK_MAX.stone + 100);
    expect(h.remove("stone", 150)).toBe(150);
    expect(h.slots[2]).toBeNull();
    expect(h.slots[1]!.count).toBe(STACK_MAX.stone - 50);
    expect(h.remove("metal", 5)).toBe(0);
  });

  it("selects only real slots", () => {
    const h = new Hotbar();
    h.add("metal", 5);
    h.select(1);
    expect(h.held).toBe("metal");
    h.select(HOTBAR_SLOTS);
    expect(h.selected).toBe(1);
    h.select(3);
    expect(h.held).toBeNull();
  });
});
