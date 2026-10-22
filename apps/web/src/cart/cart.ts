import type { Product } from "../api/client.ts";

export type CartLine = {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  maxQuantity: number;
};

export type CartAction =
  | { type: "add"; product: Product }
  | { type: "addOne"; productId: string }
  | { type: "removeOne"; productId: string }
  | { type: "replace"; lines: CartLine[] }
  | { type: "clear" };

export function cartReducer(cart: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "add": {
      const { product } = action;
      const existing = cart.find((line) => line.productId === product.id);
      if (!existing) {
        if (product.maxQuantity < 1) return cart;
        return [
          ...cart,
          {
            productId: product.id,
            name: product.name,
            unitPriceCents: product.priceCents,
            quantity: 1,
            maxQuantity: product.maxQuantity,
          },
        ];
      }
      return cart.map((line) =>
        line.productId === product.id
          ? { ...line, maxQuantity: product.maxQuantity, quantity: Math.min(line.quantity + 1, product.maxQuantity) }
          : line,
      );
    }
    case "addOne":
      return cart.map((line) =>
        line.productId === action.productId
          ? { ...line, quantity: Math.min(line.quantity + 1, line.maxQuantity) }
          : line,
      );
    case "removeOne":
      return cart
        .map((line) => (line.productId === action.productId ? { ...line, quantity: line.quantity - 1 } : line))
        .filter((line) => line.quantity > 0);
    case "replace":
      return action.lines.filter((line) => line.quantity > 0);
    case "clear":
      return [];
  }
}

export function cartTotalCents(cart: CartLine[]) {
  return cart.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
}

export function quantityInCart(cart: CartLine[], productId: string) {
  return cart.find((line) => line.productId === productId)?.quantity ?? 0;
}
