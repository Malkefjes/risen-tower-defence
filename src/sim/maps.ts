import type { MapDef } from "./world";

/** First world: a snowy clearing. The rift is northwest, the nexus sits in open ground. */
export const FROSTFALL: MapDef = {
  name: "Frostfall",
  spawners: [[0, 1]],
  nexus: [[11, 5], [12, 5], [11, 6], [12, 6]],
  rocks: [
    { x: 5, y: 8, h: 14 }, { x: 6, y: 8, h: 11 }, { x: 6, y: 9, h: 16 },
    { x: 8, y: 0, h: 12 }, { x: 9, y: 0, h: 15 }, { x: 3, y: 5, h: 13 },
    { x: 16, y: 11, h: 12 }, { x: 2, y: 10, h: 11 }, { x: 18, y: 3, h: 12 },
    { x: 14, y: 1, h: 10 },
  ],
  trees: [
    { x: 0, y: 6, s: 1.0 }, { x: -1, y: 7, s: 0.9 }, { x: 2, y: 8, s: 1.1 }, { x: 16, y: 0, s: 1.0 },
    { x: 17, y: 1, s: 0.9 }, { x: 18, y: 8, s: 1.15 }, { x: 19, y: 9, s: 0.95 }, { x: 4, y: 11, s: 1.0 },
    { x: 10, y: 11, s: 1.1 }, { x: -2, y: 1, s: 0.9 }, { x: 20, y: 5, s: 1.0 }, { x: 12, y: -2, s: 1.05 },
    { x: 13, y: -1, s: 0.9 }, { x: 7, y: -2, s: 1.0 }, { x: 15, y: 13, s: 1.1 }, { x: -3, y: 4, s: 0.95 },
    { x: 1, y: -2, s: 1.0 }, { x: 21, y: 10, s: 0.9 }, { x: 8, y: 13, s: 1.05 }, { x: -1, y: 11, s: 1.0 },
  ],
};
