---
status: accepted
---

# Order lifecycle driven by staff endpoints, without a screen

After the Customer leaves the Kiosk, an Order still moves through statuses: Payment Pending, Paid, Picked Up and Cancelled. Staff move it through API endpoints guarded by a staff key ([ADR-0008](./0008-kiosk-security-baseline.md)). They use those endpoints through the Swagger UI generated from the OpenAPI contract, and the tests use them too. A counter screen for staff is future work.

## Transitions

| From | To | Endpoint | Meaning |
| --- | --- | --- | --- |
| Payment Pending | Paid | `POST /orders/:id/mark-paid` | The Customer paid at the counter |
| Payment Pending | Cancelled | `POST /orders/:id/cancel` | The Customer never paid |
| Paid | Picked Up | `POST /orders/:id/pick-up` | Handed to the Customer |
| Paid | Cancelled | `POST /orders/:id/cancel` | Cancelled after payment |

Picked Up and Cancelled are final. There is no direct move from Payment Pending to Picked Up, so an Order cannot be handed over unpaid. Any other transition gets `409`.

## Rules

- **Only staff cancel an Order.** At the Kiosk, "Cancel" exists only while the purchase is still a Checkout. Once the Order exists, the Customer has left the screen, and the next person must not be able to cancel it.
- **Cancelling returns every unit to Stock.** This assumes the snack bar sells ready-made Products (canned drinks, packaged snacks) that can go back on sale.
- **Cancelling an Order paid by card requests a Refund** ([ADR-0012](./0012-card-payment-retry-unknown-refund.md)). Cash paid at the counter is returned at the counter.
- **Payment Pending Orders are never cancelled automatically.** The food may already be waiting on the counter, and how long to wait is a business rule the snack bar has to define.

## Considered options

- **Statuses in the model with no way to reach them.** Rejected. Dead statuses invite the question "who sets this?" with no answer.
- **A counter screen now.** Deferred. It costs a second frontend for a flow nobody will look at during the evaluation.

## Consequences

- **Waste is not modeled.** If a cancelled Product was prepared to order, it cannot really go back on sale, and returning it to Stock overstates what can be sold. Telling ready-made Products from prepared-to-order ones, and recording prepared ones as waste on cancellation, is future work.
- **Forgotten Payment Pending Orders hold their Stock** until staff cancel them.
