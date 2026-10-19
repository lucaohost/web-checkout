import type { Conflict } from "../api/client.ts";
import type { CartLine } from "./cart.ts";

/** The Cart as the server can honour it: short Products reduced or removed, prices brought up to date. */
export function applyConflicts(cart: CartLine[], conflicts: Conflict[]): CartLine[] {
  const byProduct = new Map(conflicts.map((conflict) => [conflict.productId, conflict]));
  return cart.flatMap((line) => {
    const conflict = byProduct.get(line.productId);
    if (!conflict) return [line];
    if (conflict.availableQuantity <= 0) return [];
    const short = conflict.reasons.includes("NOT_ENOUGH_STOCK");
    return [
      {
        ...line,
        quantity: conflict.availableQuantity,
        unitPriceCents: conflict.currentUnitPriceCents,
        maxQuantity: short ? conflict.availableQuantity : line.maxQuantity,
      },
    ];
  });
}
