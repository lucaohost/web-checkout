import type { PaymentProblem } from "../api/client.ts";

function copy(problem: PaymentProblem) {
  if (problem.error === "PAYMENT_UNCONFIRMED") {
    return {
      title: "Couldn't confirm your card payment",
      body: "If your card was charged, it will be refunded automatically. Pay at pickup, or cancel.",
    };
  }
  if (problem.error === "PAYMENT_DECLINED") {
    return { title: "Your card was declined", body: problem.message ?? "Try another card, or pay at pickup." };
  }
  return { title: "The card payment did not go through", body: problem.message ?? "Nothing was charged. Try again, or pay at pickup." };
}

export function PaymentProblemScreen({
  problem,
  busy,
  onTryCard,
  onPayAtPickup,
  onCancel,
}: {
  problem: PaymentProblem;
  busy: boolean;
  onTryCard: () => void;
  onPayAtPickup: () => void;
  onCancel: () => void;
}) {
  const { title, body } = copy(problem);
  return (
    <main className="notice">
      <h1 className="notice__title">{title}</h1>
      <p className="notice__body">{body}</p>
      <div className="notice__actions">
        {problem.options.includes("TRY_ANOTHER_CARD") && (
          <button type="button" className="button button--primary" disabled={busy} onClick={onTryCard}>
            Try another card
          </button>
        )}
        {problem.options.includes("PAY_AT_PICKUP") && (
          <button type="button" className="button button--primary" disabled={busy} onClick={onPayAtPickup}>
            Pay at pickup
          </button>
        )}
        {problem.options.includes("CANCEL") && (
          <button type="button" className="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </main>
  );
}
