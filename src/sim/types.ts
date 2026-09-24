/** A grid cell. x runs east, y runs south (y maps to world z in the renderer). */
export type Cell = readonly [x: number, y: number];

export const cellKey = (x: number, y: number): string => `${x},${y}`;

export const parseKey = (k: string): Cell => {
  const i = k.indexOf(",");
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
};
