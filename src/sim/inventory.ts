/**
 * Inventories: the hotbar (the player's only inventory) and the smelter's input and
 * output slots. Pure logic, no graphics. In the hotbar, slot 0 holds the multitool;
 * ore and alloy fill stacks in the other slots. "metal" is raw metal: it can only go
 * into a smelter, which turns it into alloy (what towers and plating cost).
 */

export type ItemKind = "multitool" | "stone" | "metal" | "alloy";
export type OreKind = "stone" | "metal";

export interface Stack { kind: ItemKind; count: number }

export const HOTBAR_SLOTS = 6;
/** Most of one kind a single slot holds. */
export const STACK_MAX: Record<ItemKind, number> = { multitool: 1, stone: 1000, metal: 1000, alloy: 1000 };

/** A row of stack slots. */
export class Inventory {
  readonly slots: (Stack | null)[];

  constructor(size: number) {
    this.slots = Array.from({ length: size }, () => null);
  }

  /** Total of one kind across all slots. */
  count(kind: ItemKind): number {
    return this.slots.reduce((n, s) => n + (s?.kind === kind ? s.count : 0), 0);
  }

  /** Room left for one kind: space in its stacks plus empty slots. */
  room(kind: ItemKind): number {
    return this.slots.reduce((n, s) => n + (!s ? STACK_MAX[kind] : s.kind === kind ? STACK_MAX[kind] - s.count : 0), 0);
  }

  /**
   * Add whole items: tops up existing stacks of the kind first (left to right),
   * then starts new stacks in empty slots. Returns how many fit.
   */
  add(kind: ItemKind, n: number): number {
    let left = Math.max(0, Math.floor(n));
    for (const s of this.slots) {
      if (!left) break;
      if (s?.kind !== kind) continue;
      const put = Math.min(left, STACK_MAX[kind] - s.count);
      s.count += put; left -= put;
    }
    for (let i = 0; i < this.slots.length && left; i++) {
      if (this.slots[i]) continue;
      const put = Math.min(left, STACK_MAX[kind]);
      this.slots[i] = { kind, count: put }; left -= put;
    }
    return Math.floor(n) - left;
  }

  /** Take items of a kind, from the rightmost stacks first; empty stacks free their slot. Returns how many were taken. */
  remove(kind: ItemKind, n: number): number {
    let left = Math.max(0, Math.floor(n));
    for (let i = this.slots.length - 1; i >= 0 && left; i--) {
      const s = this.slots[i];
      if (s?.kind !== kind) continue;
      const take = Math.min(left, s.count);
      s.count -= take; left -= take;
      if (!s.count) this.slots[i] = null;
    }
    return Math.floor(n) - left;
  }
}

/** The player's hotbar: slot 0 is the multitool; one slot is selected. */
export class Hotbar extends Inventory {
  selected = 0;

  constructor(size = HOTBAR_SLOTS) {
    super(size);
    this.slots[0] = { kind: "multitool", count: 1 };
  }

  get held(): ItemKind | null { return this.slots[this.selected]?.kind ?? null; }

  select(i: number): void {
    if (i >= 0 && i < this.slots.length) this.selected = i;
  }
}
