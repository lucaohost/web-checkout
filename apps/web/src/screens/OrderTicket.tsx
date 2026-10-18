import type { ReactNode } from "react";
import { type CartLine, cartTotalCents } from "../cart/cart.ts";
import { formatCents } from "../money.ts";

export function OrderTicket({
  cart,
  onAddOne,
  onRemoveOne,
  footer,
}: {
  cart: CartLine[];
  onAddOne: (productId: string) => void;
  onRemoveOne: (productId: string) => void;
  footer?: ReactNode;
}) {
  return (
    <aside aria-label="Your order" className="ticket">
      <h2 className="ticket__title">Your order</h2>
      {cart.length === 0 ? (
        <p className="ticket__empty">Tap + on anything you fancy and it lands here.</p>
      ) : (
        <ul className="ticket__lines">
          {cart.map((line) => (
            <li key={line.productId} className="ticket__line">
              <span className="ticket__line-name">
                <span aria-hidden="true">{line.emoji}</span> {line.name}
              </span>
              <span className="ticket__line-price">{formatCents(line.unitPriceCents * line.quantity)}</span>
              <span className="ticket__stepper">
                <button type="button" aria-label={`Remove one ${line.name}`} onClick={() => onRemoveOne(line.productId)}>
                  −
                </button>
                <span className="ticket__quantity" aria-label={`${line.quantity} ${line.name}`}>
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Add one ${line.name}`}
                  disabled={line.quantity >= line.maxQuantity}
                  onClick={() => onAddOne(line.productId)}
                >
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="ticket__total-row">
        <span>Total</span>
        <output aria-label="Total" className="ticket__total">
          {formatCents(cartTotalCents(cart))}
        </output>
      </div>
      {footer}
    </aside>
  );
}
