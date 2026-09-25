import { describe, expect, it } from "vitest";
import { cellBounds, pieceOutline } from "../src/render/pieceShape";
import { pieceCells } from "../src/sim/pieces";

describe("piece outline", () => {
  it("an I piece fuses along its length and is open at the ends and sides", () => {
    const o = pieceOutline(pieceCells("I", 0, [0, 0])); // (-1,0) (0,0) (1,0) (2,0)
    const mid = o.find(c => c.x === 0)!;
    expect(mid.open).toEqual({ n: true, s: true, w: false, e: false });
    const end = o.find(c => c.x === -1)!;
    expect(end.open.w).toBe(true);
    expect(end.open.e).toBe(false);
  });

  it("an O piece has no open sides between its cells", () => {
    const o = pieceOutline(pieceCells("O", 0, [0, 0]));
    const openSides = o.reduce((n, c) => n + Object.values(c.open).filter(Boolean).length, 0);
    expect(openSides).toBe(8);
  });

  it("bounds are inset only on open sides, so fused cells touch", () => {
    const [a, b] = pieceOutline([[0, 0], [1, 0]]);
    const ba = cellBounds(a!, 0.1), bb = cellBounds(b!, 0.1);
    expect(ba.x1).toBe(1);
    expect(bb.x0).toBe(1);
    expect(ba.x0).toBeCloseTo(0.1);
    expect(ba.z0).toBeCloseTo(0.1);
    expect(bb.x1).toBeCloseTo(1.9);
  });

  it("a separate piece next door keeps a seam", () => {
    const [left] = pieceOutline([[0, 0]]);
    const [right] = pieceOutline([[1, 0]]);
    expect(cellBounds(right!, 0.05).x0 - cellBounds(left!, 0.05).x1).toBeCloseTo(0.1);
  });
});
