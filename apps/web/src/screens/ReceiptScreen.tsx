import type { OrderView } from "../api/client.ts";
import { formatCents } from "../money.ts";

export function ReceiptScreen({ order, onDone }: { order: OrderView; onDone: () => void }) {
  const due = order.status === "PAYMENT_PENDING";
  return (
    <main className="receipt">
      <p className="receipt__brand">Snack Counter</p>
      <p className="receipt__label">Your order</p>
      <p className="receipt__code">{order.code}</p>
      <p className="receipt__status">
        {due ? `Pay ${formatCents(order.totalCents)} at the counter` : "Paid by card"}
        {order.cardChargeUnconfirmed && " · if your card was charged, it will be refunded"}
      </p>
      <ul className="receipt__lines">
        {order.items.map((item) => (
          <li key={item.productId}>
            <span>
              {item.quantity}× {item.name}
            </span>
            <span>{formatCents(item.unitPriceCents * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="receipt__total">
        <span>Total</span>
        <strong>{formatCents(order.totalCents)}</strong>
      </p>
      <p className="receipt__print">Printing your receipt…</p>
      <button type="button" className="button button--primary" onClick={onDone}>
        Done
      </button>
    </main>
  );
}
